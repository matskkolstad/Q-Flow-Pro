import { test, expect } from '@playwright/test';
import { TicketStatus } from '../types';
import {
  BASE_URL,
  apiGet,
  apiPost,
  loginAdmin,
  connect,
  waitForState,
  emitWithAck,
  connectOperator,
} from './helpers';

test.describe('Q-Flow happy paths', () => {
  test('health endpoint is ok', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('SPA is served for client-side routes', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/login`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/<div id="root">/i);
  });

  test('admin auth and backup endpoints', async () => {
    const token = await loginAdmin();
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    const backupRes = await apiPost('/api/admin/backup', {}, token);
    expect(backupRes.status).toBe(200);
    const backupBody = await backupRes.json();
    expect(backupBody.ok).toBe(true);
    // Only the file name is returned, not the server path
    expect(backupBody.file).toMatch(/^qflow-manual-.*\.db$/);

    const listRes = await apiGet('/api/admin/backups', token);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.backups.length).toBeGreaterThan(0);
    expect(listBody.backups[0].path).toBeUndefined();

    const downloadRes = await apiGet(`/api/admin/backup/${encodeURIComponent(listBody.backups[0].file)}`, token);
    expect(downloadRes.status).toBe(200);
    expect((await downloadRes.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test('queue flow via sockets (ticket -> call -> complete) and close toggle', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const operator = await connectOperator(admin);
    expect(operator.session.role).toBe('OPERATOR');

    const service = operator.state.services.find((s: any) => s.isOpen !== false);
    expect(service).toBeTruthy();
    const counter = operator.state.counters.find((c: any) => c.isOnline && (c.activeServiceIds.length === 0 || c.activeServiceIds.includes(service.id)));
    expect(counter).toBeTruthy();

    // A public client (mobile) draws a ticket and gets the exact ticket back
    const mobile = await connect();
    const added = await emitWithAck(mobile.socket, 'add-ticket', { serviceId: service.id });
    expect(added.ok).toBe(true);
    expect(added.ticket.number.startsWith(service.prefix)).toBe(true);
    expect(added.ticket.status).toBe(TicketStatus.WAITING);
    expect(typeof added.ownerKey).toBe('string');
    const ticket = added.ticket;

    // Listen before sending: the broadcast can arrive before the acknowledgement.
    const servingP = waitForState(operator.socket, (s) => s.tickets.some((t: any) => t.id === ticket.id && t.status === TicketStatus.SERVING));
    const called = await emitWithAck(operator.socket, 'ticket:call', { ticketId: ticket.id, counterId: counter.id });
    expect(called.ok).toBe(true);
    const servingState = await servingP;
    expect(servingState.tickets.find((t: any) => t.id === ticket.id).counterId).toBe(counter.id);
    expect(servingState.counters.find((c: any) => c.id === counter.id).currentTicketId).toBe(ticket.id);

    const completedP = waitForState(operator.socket, (s) => s.tickets.some((t: any) => t.id === ticket.id && t.status === TicketStatus.COMPLETED));
    const completed = await emitWithAck(operator.socket, 'ticket:complete', { counterId: counter.id });
    expect(completed.ok).toBe(true);
    const completedState = await completedP;
    expect(completedState.counters.find((c: any) => c.id === counter.id).currentTicketId).toBeUndefined();
    expect(completedState.todaySummary.completed).toBeGreaterThan(0);

    // Public clients cannot call tickets
    expect(await emitWithAck(mobile.socket, 'ticket:call-next', { counterId: counter.id })).toEqual({ ok: false, error: 'unauthorized' });

    // Start listening before sending: the broadcast can arrive before the acknowledgement.
    const closed = waitForState(mobile.socket, (s) => s.isClosed === true);
    await emitWithAck(admin.socket, 'update-settings', { isClosed: true });
    await closed;
    const whileClosed = await emitWithAck(mobile.socket, 'add-ticket', { serviceId: service.id });
    expect(whileClosed).toEqual({ ok: false, error: 'closed' });
    const reopenedP = waitForState(mobile.socket, (s) => s.isClosed === false);
    await emitWithAck(admin.socket, 'update-settings', { isClosed: false });
    const reopened = await reopenedP;
    expect(reopened.tickets.find((t: any) => t.id === ticket.id).status).toBe(TicketStatus.COMPLETED);

    [admin, operator, mobile].forEach((c) => c.socket.disconnect());
  });
});
