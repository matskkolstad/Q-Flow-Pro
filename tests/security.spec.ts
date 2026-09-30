import { test, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import {
  apiGet,
  apiPost,
  loginAdmin,
  login,
  connect,
  addUsers,
  waitForEvent,
  waitForState,
  emitWithAck,
  uniqueName,
} from './helpers';

// Keys/values that must never reach a browser.
const SENSITIVE = ['"passwordHash"', '"pinCode"', '"sessions"', '"devices"', '"kioskExitPin"', '"kioskExitPinHash"', '"clientSecret"', '$2a$', '$2b$'];
const expectNoSecrets = (state: unknown) => {
  const json = JSON.stringify(state);
  SENSITIVE.forEach((needle) => expect(json, `state leaks ${needle}`).not.toContain(needle));
};

// Session tokens that were committed to the repository in db.json before this fix.
const LEAKED_TOKENS = ['31e453fcf8bffb0d0e766cb84fb0a9f4', '7d8575af6f0694816a758edd27655716'];

test.describe('state is filtered per role', () => {
  test('anonymous clients only receive public data', async () => {
    const anon = await connect();
    expect(anon.session.role).toBe('PUBLIC');
    expect(Object.keys(anon.state).sort()).toEqual([
      'branding', 'counterDisplays', 'counters', 'isClosed', 'publicMessage', 'services', 'settings', 'soundSettings', 'tickets',
    ]);
    expectNoSecrets(anon.state);
    anon.socket.disconnect();
  });

  test('admin state has sanitized users and write-only OAuth secrets', async () => {
    const admin = await connect({ token: await loginAdmin() });
    expect(admin.session.role).toBe('ADMIN');
    expect(admin.state.users.length).toBeGreaterThan(0);
    expectNoSecrets(admin.state);

    const secret = uniqueName('google-secret-');
    // Start listening before sending: the broadcast can arrive before the acknowledgement.
    const updatedP = waitForState(admin.socket, (s) => s.authProviders?.google?.clientSecretSet === true);
    await emitWithAck(admin.socket, 'update-settings', { authProviders: { google: { clientSecret: secret } } });
    const updated = await updatedP;
    expect(JSON.stringify(updated)).not.toContain(secret);
    expectNoSecrets(updated);

    // An empty secret keeps the stored one (the admin panel never receives it back)
    admin.socket.emit('update-settings', { authProviders: { google: { clientSecret: '', clientId: 'x.apps.googleusercontent.com' } } });
    const kept = await waitForState(admin.socket, (s) => s.authProviders?.google?.clientId === 'x.apps.googleusercontent.com');
    expect(kept.authProviders.google.clientSecretSet).toBe(true);
    admin.socket.disconnect();
  });

  test('operators get queue data and logs but no users or auth settings', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const name = uniqueName('op');
    await addUsers(admin, [{ username: name, role: 'OPERATOR', password: 'Operator-Pass1' }]);
    const operator = await connect({ token: (await login(name, 'Operator-Pass1')).token });
    expect(operator.session.role).toBe('OPERATOR');
    expect(operator.state.users).toBeUndefined();
    expect(operator.state.authProviders).toBeUndefined();
    expect(Array.isArray(operator.state.logs)).toBe(true);
    expectNoSecrets(operator.state);

    // Operators cannot change settings or users
    expect(await emitWithAck(operator.socket, 'update-settings', { publicMessage: 'nope' })).toEqual({ ok: false, error: 'unauthorized' });
    expect(await emitWithAck(operator.socket, 'user:save', { user: { username: 'x', password: 'Valid-Pass1', role: 'ADMIN' } })).toEqual({ ok: false, error: 'unauthorized' });
    [admin, operator].forEach((c) => c.socket.disconnect());
  });
});

test.describe('sessions and passwords', () => {
  test('tokens that were committed in db.json are not accepted', async () => {
    for (const token of LEAKED_TOKENS) {
      const res = await apiGet('/api/me', token);
      expect(res.status).toBe(401);
      const client = await connect({ token });
      expect(client.session.role).toBe('PUBLIC');
      expect(await emitWithAck(client.socket, 'update-settings', { publicMessage: 'pwned' })).toEqual({ ok: false, error: 'unauthorized' });
      client.socket.disconnect();
    }
  });

  test('logout invalidates the session token', async () => {
    const token = await loginAdmin();
    expect((await apiGet('/api/me', token)).status).toBe(200);
    expect((await apiPost('/api/logout', {}, token)).status).toBe(200);
    expect((await apiGet('/api/me', token)).status).toBe(401);
  });

  test('password change is enforced by the server, not only in the browser', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const name = uniqueName('newadmin');
    await addUsers(admin, [{ username: name, role: 'ADMIN', password: 'First-Pass1', mustChangePassword: true }]);

    const { token, user } = await login(name, 'First-Pass1');
    expect(user.mustChangePassword).toBe(true);
    expect((await apiGet('/api/admin/backups', token)).status).toBe(403);

    const pending = await connect({ token });
    expect(pending.session).toMatchObject({ role: 'ADMIN', mustChangePassword: true });
    expect(pending.state.users).toBeUndefined();
    expect(await emitWithAck(pending.socket, 'update-settings', { publicMessage: 'too early' })).toEqual({ ok: false, error: 'password_change_required' });

    const sessionChanged = waitForEvent(pending.socket, 'session-info', (info: any) => info.mustChangePassword === false);
    const change = await apiPost('/api/user/password', { oldPassword: 'First-Pass1', newPassword: 'Second-Pass2' }, token);
    expect(change.status).toBe(200);
    await sessionChanged;
    expect((await apiGet('/api/admin/backups', token)).status).toBe(200);
    [admin, pending].forEach((c) => c.socket.disconnect());
  });

  test('password hashes sent by a client are ignored', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const name = uniqueName('hashprobe');
    const state = await addUsers(admin, [{ username: name, role: 'OPERATOR', password: 'Real-Pass1' }]);
    const target = state.users.find((u: any) => u.username === name);
    const res = await emitWithAck(admin.socket, 'user:save', { user: { ...target, passwordHash: bcrypt.hashSync('Injected-Pass1', 4) } });
    expect(res.ok).toBe(true);

    expect((await apiPost('/api/login', { username: name, password: 'Injected-Pass1' })).status).toBe(401);
    expect((await apiPost('/api/login', { username: name, password: 'Real-Pass1' })).status).toBe(200);
    admin.socket.disconnect();
  });

  test('login lockout cannot be bypassed with a spoofed X-Forwarded-For', async () => {
    const username = uniqueName('lockout');
    for (let i = 0; i < 10; i++) {
      const res = await apiPost('/api/login', { username, password: 'wrong' }, undefined, { 'X-Forwarded-For': `203.0.113.${i + 1}` });
      expect(res.status).toBe(401);
    }
    const blocked = await apiPost('/api/login', { username, password: 'wrong' }, undefined, { 'X-Forwarded-For': '198.51.100.77' });
    expect(blocked.status).toBe(429);
  });
});

test.describe('printing endpoint', () => {
  test('requires an admin session or API key and only accepts configured printers', async () => {
    const anonymous = await apiPost('/api/print-ticket', { ipAddress: '127.0.0.1', port: 22, ticket: { number: 'X1' } });
    expect(anonymous.status).toBe(401);

    const token = await loginAdmin();
    const arbitrary = await apiPost('/api/print-ticket', { ipAddress: '127.0.0.1', port: 22, ticket: { number: 'X1' } }, token);
    expect(arbitrary.status).toBe(400);
    expect((await arbitrary.json()).error).toBe('unknown_printer');
  });

  test('printer addresses are validated', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const res = await emitWithAck(admin.socket, 'printer:save', { printer: { name: 'bad', ipAddress: 'http://169.254.169.254/latest', port: 80 } });
    expect(res).toEqual({ ok: false, error: 'invalid_printer' });
    admin.socket.disconnect();
  });
});

test.describe('abuse protection for public sockets', () => {
  test('anonymous ticket spam is rate limited', async () => {
    const anon = await connect();
    const service = anon.state.services.find((s: any) => s.isOpen !== false);
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await emitWithAck(anon.socket, 'add-ticket', { serviceId: service.id }));
    }
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, error: 'rate_limited' });
    anon.socket.disconnect();
  });

  test('anonymous clients cannot register kiosks or change display assignments', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const anon = await connect();
    anon.socket.emit('register-kiosk', { id: 'kiosk_evil', name: 'Evil', assignedPrinterId: 'x', extra: 'junk' });

    const displayId = uniqueName('cd_');
    const counterId = admin.state.counters[0].id;
    anon.socket.emit('register-counter-display', { id: displayId, name: 'Skjerm', counterId });
    await waitForState(admin.socket, (s) => s.counterDisplays.some((d: any) => d.id === displayId));
    // A heartbeat from anyone must not move an existing display to another counter
    anon.socket.emit('register-counter-display', { id: displayId, name: 'Skjerm', counterId: admin.state.counters[1]?.id });
    const after = await waitForState(admin.socket, (s) => s.counterDisplays.some((d: any) => d.id === displayId));
    expect(after.counterDisplays.find((d: any) => d.id === displayId).counterId).toBe(counterId);
    expect(after.kiosks.some((k: any) => k.id === 'kiosk_evil')).toBe(false);

    admin.socket.emit('delete-counter-display', { displayId });
    [admin, anon].forEach((c) => c.socket.disconnect());
  });

  test('secrets in URLs never end up in the logs', async () => {
    const marker = uniqueName('SECRETMARKER');
    await apiGet(`/login?token=${marker}&code=${marker}`);
    const admin = await connect({ token: await loginAdmin() });
    expect(JSON.stringify(admin.state.logs)).not.toContain(marker);
    admin.socket.disconnect();
  });
});

test.describe('kiosk devices', () => {
  test('an admin activates a kiosk; it gets its own token and leaves with the PIN', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const activation = await emitWithAck(admin.socket, 'activate-kiosk', { kioskId: 'kiosk_e2etest' });
    expect(activation.ok).toBe(true);
    expect(activation.kioskId).toBe('kiosk_e2etest');
    expect(activation.deviceToken).toMatch(/^[a-f0-9]{64}$/);

    const kiosk = await connect({ deviceToken: activation.deviceToken });
    expect(kiosk.session).toMatchObject({ role: 'KIOSK', kioskId: 'kiosk_e2etest' });
    expectNoSecrets(kiosk.state);
    kiosk.socket.emit('register-kiosk');
    await waitForState(admin.socket, (s) => s.kiosks.some((k: any) => k.id === 'kiosk_e2etest'));

    // Kiosk tickets are not subject to the anonymous rate limit
    const service = kiosk.state.services.find((s: any) => s.isOpen !== false);
    for (let i = 0; i < 6; i++) {
      const drawn = await emitWithAck(kiosk.socket, 'add-ticket', { serviceId: service.id });
      expect(drawn.ok).toBe(true);
      // No printer is assigned, so the kiosk must not tell the customer to take a printout
      expect(drawn.printing).toBe(false);
    }

    // A kiosk cannot change settings or call tickets
    expect(await emitWithAck(kiosk.socket, 'update-settings', { publicMessage: 'kiosk' })).toEqual({ ok: false, error: 'unauthorized' });
    expect(await emitWithAck(kiosk.socket, 'ticket:call-next', { counterId: 'c1' })).toEqual({ ok: false, error: 'unauthorized' });

    const pinSet = waitForState(admin.socket, (s) => s.kioskExitPinSet === true);
    await emitWithAck(admin.socket, 'update-settings', { kioskExitPin: '4821' });
    await pinSet;
    expect(await emitWithAck(kiosk.socket, 'verify-kiosk-pin', { pin: '0000' })).toEqual({ ok: false, error: 'invalid_pin' });
    expect(await emitWithAck(kiosk.socket, 'verify-kiosk-pin', { pin: '4821' })).toEqual({ ok: true });

    // The device token is revoked after leaving kiosk mode
    const again = await connect({ deviceToken: activation.deviceToken });
    expect(again.session.role).toBe('PUBLIC');
    [admin, kiosk, again].forEach((c) => c.socket.disconnect());
  });

  test('removing a kiosk in the admin panel deactivates the device', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const activation = await emitWithAck(admin.socket, 'activate-kiosk', { kioskId: 'kiosk_e2eremove' });
    const kiosk = await connect({ deviceToken: activation.deviceToken });
    expect(kiosk.session.role).toBe('KIOSK');

    const demoted = waitForEvent(kiosk.socket, 'session-info', (info: any) => info.role === 'PUBLIC');
    admin.socket.emit('delete-kiosk', { kioskId: 'kiosk_e2eremove' });
    await demoted;
    [admin, kiosk].forEach((c) => c.socket.disconnect());
  });

  test('only admins can activate kiosks', async () => {
    const anon = await connect();
    const res = await emitWithAck(anon.socket, 'activate-kiosk', {});
    expect(res).toEqual({ ok: false, error: 'unauthorized' });
    anon.socket.disconnect();
  });
});

test.describe('OAuth helpers', () => {
  test('unknown login codes are rejected and unconfigured providers refuse to start', async () => {
    expect((await apiPost('/api/auth/exchange', { code: 'not-a-real-code' })).status).toBe(400);
    const res = await fetch(`${process.env.E2E_BASE_URL || 'http://localhost:3000'}/auth/oidc`, { redirect: 'manual' });
    expect(res.status).toBe(400);
  });
});
