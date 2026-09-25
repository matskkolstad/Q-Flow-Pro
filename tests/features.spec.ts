import { randomBytes } from 'crypto';
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  apiGet,
  apiPost,
  loginAdmin,
  login,
  connect,
  connectOperator,
  addUsers,
  waitForEvent,
  waitForState,
  emitWithAck,
  uniqueName,
} from './helpers';

// Smallest valid PNG (1x1 pixel)
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// A service + counter pair that only this test uses, so parallel queue state from other tests does not interfere.
const createServiceWithCounters = async (admin: any, counterCount = 1) => {
  // Prefixes are max 3 characters; retry on the (rare) collision with an existing service.
  let serviceRes: any = { ok: false };
  for (let attempt = 0; attempt < 30 && !serviceRes.ok; attempt++) {
    const prefix = `Q${randomBytes(1).toString('hex').toUpperCase()}`;
    serviceRes = await emitWithAck(admin.socket, 'service:save', { service: { name: uniqueName('Tjeneste '), prefix, color: '#0891b2' } });
  }
  expect(serviceRes.ok).toBe(true);
  const counters = [];
  for (let i = 0; i < counterCount; i++) {
    const res = await emitWithAck(admin.socket, 'counter:save', { counter: { name: uniqueName('Skranke '), activeServiceIds: [serviceRes.service.id], isOnline: true } });
    expect(res.ok).toBe(true);
    counters.push(res.counter);
  }
  return { service: serviceRes.service, counters };
};

test.describe('server-side queue commands', () => {
  test('two counters calling "next" at the same time never get the same ticket', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const { service, counters } = await createServiceWithCounters(admin, 2);
    const opA = await connectOperator(admin);
    const opB = await connectOperator(admin);
    const mobile = await connect();
    const first = await emitWithAck(mobile.socket, 'add-ticket', { serviceId: service.id });
    const second = await emitWithAck(mobile.socket, 'add-ticket', { serviceId: service.id });
    expect(first.ticket.number).toBe(`${service.prefix}001`);
    expect(second.ticket.number).toBe(`${service.prefix}002`);

    const [a, b] = await Promise.all([
      emitWithAck(opA.socket, 'ticket:call-next', { counterId: counters[0].id }),
      emitWithAck(opB.socket, 'ticket:call-next', { counterId: counters[1].id }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(new Set([a.ticket.id, b.ticket.id]).size).toBe(2);

    // Nothing left: calling next completes the current ticket and returns no new one
    const third = await emitWithAck(opA.socket, 'ticket:call-next', { counterId: counters[0].id });
    expect(third).toMatchObject({ ok: true, ticket: null, completed: a.ticket.number });

    [admin, opA, opB, mobile].forEach((c) => c.socket.disconnect());
  });

  test('recall announces again; no-show, requeue and transfer update the ticket', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const { service, counters } = await createServiceWithCounters(admin, 1);
    const other = await createServiceWithCounters(admin, 1);
    const operator = await connectOperator(admin);
    const display = await connect();
    const counterId = counters[0].id;

    const drawn = await emitWithAck(display.socket, 'add-ticket', { serviceId: service.id });
    const called = waitForEvent(display.socket, 'play-sound', (p: any) => p.number === drawn.ticket.number);
    await emitWithAck(operator.socket, 'ticket:call-next', { counterId });
    const sound = await called;
    expect(sound.textNo).toContain(drawn.ticket.number);
    expect(sound.textEn).toContain(counters[0].name);

    const recalled = waitForEvent(display.socket, 'play-sound', (p: any) => p.number === drawn.ticket.number);
    expect((await emitWithAck(operator.socket, 'ticket:recall', { counterId })).ticket.recallCount).toBe(1);
    await recalled;

    const requeued = await emitWithAck(operator.socket, 'ticket:requeue', { counterId });
    expect(requeued.ticket.status).toBe('WAITING');
    await emitWithAck(operator.socket, 'ticket:call-next', { counterId });

    const transferred = await emitWithAck(operator.socket, 'ticket:transfer', { counterId, serviceId: other.service.id });
    expect(transferred.ticket).toMatchObject({ status: 'WAITING', serviceId: other.service.id, transferredFrom: service.id });

    const next = await emitWithAck(operator.socket, 'ticket:call-next', { counterId: other.counters[0].id });
    expect(next.ticket.id).toBe(drawn.ticket.id);
    expect((await emitWithAck(operator.socket, 'ticket:no-show', { counterId: other.counters[0].id })).ticket.status).toBe('NO_SHOW');
    expect(await emitWithAck(operator.socket, 'ticket:complete', { counterId: other.counters[0].id })).toEqual({ ok: false, error: 'no_current_ticket' });

    [admin, operator, display].forEach((c) => c.socket.disconnect());
  });

  test('a customer can cancel their own ticket with the owner key only', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const { service } = await createServiceWithCounters(admin, 1);
    const phone = await connect();
    const other = await connect();
    const drawn = await emitWithAck(phone.socket, 'add-ticket', { serviceId: service.id });
    expect(await emitWithAck(other.socket, 'ticket:cancel-own', { ticketId: drawn.ticket.id, key: 'guess' })).toEqual({ ok: false, error: 'unknown_ticket' });
    const cancelled = await emitWithAck(phone.socket, 'ticket:cancel-own', { ticketId: drawn.ticket.id, key: drawn.ownerKey });
    expect(cancelled.ticket.status).toBe('CANCELLED');
    [admin, phone, other].forEach((c) => c.socket.disconnect());
  });
});

test.describe('admin management', () => {
  test('services: duplicate prefixes are rejected and deleting cancels open tickets', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const { service } = await createServiceWithCounters(admin, 1);
    expect(await emitWithAck(admin.socket, 'service:save', { service: { name: 'Kopi', prefix: service.prefix } })).toEqual({ ok: false, error: 'duplicate_prefix' });

    const renamed = await emitWithAck(admin.socket, 'service:save', { service: { ...service, name: 'Nytt navn', color: '#ea580c' } });
    expect(renamed.service).toMatchObject({ id: service.id, name: 'Nytt navn', color: '#ea580c' });

    const mobile = await connect();
    const drawn = await emitWithAck(mobile.socket, 'add-ticket', { serviceId: service.id });
    const afterP = waitForState(mobile.socket, (s) => !s.services.some((x: any) => x.id === service.id));
    expect((await emitWithAck(admin.socket, 'service:delete', { id: service.id })).ok).toBe(true);
    const after = await afterP;
    expect(after.tickets.find((t: any) => t.id === drawn.ticket.id)?.status ?? 'CANCELLED').toBe('CANCELLED');
    [admin, mobile].forEach((c) => c.socket.disconnect());
  });

  test('users: last admin and own account are protected; password change signs the user out', async () => {
    const adminLogin = await login(process.env.QFLOW_ADMIN_USERNAME || 'admin', process.env.QFLOW_ADMIN_PASSWORD || 'CiAdmin123!');
    const admin = await connect({ token: adminLogin.token });
    expect(await emitWithAck(admin.socket, 'user:delete', { id: adminLogin.user.id })).toEqual({ ok: false, error: 'cannot_delete_self' });

    const name = uniqueName('temp');
    const state = await addUsers(admin, [{ username: name, role: 'OPERATOR', password: 'Temp-Pass1' }]);
    const user = state.users.find((u: any) => u.username === name);
    const { token } = await login(name, 'Temp-Pass1');
    expect((await apiGet('/api/me', token)).status).toBe(200);
    expect((await emitWithAck(admin.socket, 'user:save', { user: { id: user.id, username: name, password: 'Other-Pass2' } })).ok).toBe(true);
    expect((await apiGet('/api/me', token)).status).toBe(401);
    expect((await emitWithAck(admin.socket, 'user:delete', { id: user.id })).ok).toBe(true);
    admin.socket.disconnect();
  });

  test('settings are validated and public settings reach the screens', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const screen = await connect();
    expect(await emitWithAck(admin.socket, 'update-settings', { settings: { autoReset: { time: '25:99' } } })).toEqual({ ok: false, error: 'invalid_time' });
    expect(await emitWithAck(admin.socket, 'update-settings', { branding: { primaryColor: 'red' } })).toEqual({ ok: false, error: 'invalid_color' });
    // Start listening before sending: the broadcast can arrive before the acknowledgement.
    const updatedP = waitForState(screen.socket, (s) => s.settings?.kiosk?.autoReturnSeconds === 42);
    expect((await emitWithAck(admin.socket, 'update-settings', { settings: { kiosk: { autoReturnSeconds: 42 } }, branding: { primaryColor: '#059669', ticketFooter: 'Takk!' } })).ok).toBe(true);
    const updated = await updatedP;
    expect(updated.branding).toMatchObject({ primaryColor: '#059669', ticketFooter: 'Takk!' });
    expect(updated.settings.autoReset).toBeUndefined();
    await emitWithAck(admin.socket, 'update-settings', { settings: { kiosk: { autoReturnSeconds: 15 } }, branding: { primaryColor: '', ticketFooter: '' } });
    [admin, screen].forEach((c) => c.socket.disconnect());
  });
});

test.describe('branding logo', () => {
  test('uploaded logos are served from their own URL, not inside the state', async () => {
    const token = await loginAdmin();
    const screen = await connect();
    expect((await apiPost('/api/admin/branding/logo', { dataUrl: 'data:text/html;base64,PGgxPmhpPC9oMT4=' }, token)).status).toBe(400);
    expect((await apiPost('/api/admin/branding/logo', { dataUrl: PNG_1PX })).status).toBe(401);
    const stateP = waitForState(screen.socket, (s) => s.branding.brandLogoUrl.startsWith('/api/branding/logo?v='));
    expect((await apiPost('/api/admin/branding/logo', { dataUrl: PNG_1PX }, token)).status).toBe(200);
    const state = await stateP;
    expect(JSON.stringify(state)).not.toContain('base64');
    const logo = await fetch(`${BASE_URL}${state.branding.brandLogoUrl}`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get('content-type')).toBe('image/png');
    expect(logo.headers.get('content-security-policy')).toContain("default-src 'none'");

    const removed = waitForState(screen.socket, (s) => s.branding.brandLogoUrl === '');
    const res = await fetch(`${BASE_URL}/api/admin/branding/logo`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    await removed;
    screen.socket.disconnect();
  });
});

test.describe('statistics', () => {
  test('stats are available to staff and exportable by admins', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const operator = await connectOperator(admin);
    const adminToken = await loginAdmin();
    const opName = uniqueName('statsop');
    await addUsers(admin, [{ username: opName, role: 'OPERATOR', password: 'Operator-Pass1' }]);
    const opToken = (await login(opName, 'Operator-Pass1')).token;

    expect((await apiGet('/api/stats')).status).toBe(401);
    const res = await apiGet('/api/stats', opToken);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.totals.completed).toBeGreaterThan(0);
    expect(stats.byHour).toHaveLength(24);
    expect(Array.isArray(stats.byService)).toBe(true);

    expect((await apiGet('/api/stats/export.csv', opToken)).status).toBe(403);
    const csv = await apiGet(`/api/stats/export.csv?from=${stats.from}&to=${stats.to}`, adminToken);
    expect(csv.status).toBe(200);
    const bytes = Buffer.from(await csv.arrayBuffer());
    // UTF-8 BOM so spreadsheets show æøå correctly
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.subarray(3).toString('utf8').startsWith('number,service,counter,status')).toBe(true);
    [admin, operator].forEach((c) => c.socket.disconnect());
  });
});

test.describe('backups', () => {
  test('restore brings back old data and keeps the admin signed in', async () => {
    const token = await loginAdmin();
    const admin = await connect({ token });
    const marker = uniqueName('before-backup-');
    await emitWithAck(admin.socket, 'update-settings', { publicMessage: marker });
    const created = await (await apiPost('/api/admin/backup', {}, token)).json();
    expect(created.file).toMatch(/^qflow-manual-.*\.db$/);

    await emitWithAck(admin.socket, 'update-settings', { publicMessage: 'after backup' });
    const restoredP = waitForState(admin.socket, (s) => s.publicMessage === marker);
    const restore = await apiPost(`/api/admin/backup/${encodeURIComponent(created.file)}/restore`, {}, token);
    expect(restore.status).toBe(200);
    expect((await restore.json()).safetyBackup).toMatch(/^qflow-pre-restore-/);
    await restoredP;
    expect((await apiGet('/api/me', token)).status).toBe(200);

    const bogus = await fetch(`${BASE_URL}/api/admin/backups/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('this is not a database'),
    });
    expect(bogus.status).toBe(400);

    const list = await (await apiGet('/api/admin/backups', token)).json();
    expect(list.backups.some((b: any) => b.file === created.file)).toBe(true);
    await emitWithAck(admin.socket, 'update-settings', { publicMessage: '' });
    admin.socket.disconnect();
  });
});
