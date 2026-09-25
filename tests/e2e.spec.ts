import { test, expect } from '@playwright/test';
import { TicketStatus } from '../types';
import {
  BASE_URL,
  apiGet,
  apiPost,
  loginAdmin,
  login,
  connect,
  addUsers,
  waitForState,
  emitWithAck,
  uniqueName,
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
    expect(backupBody.file).toMatch(/^qflow-backup-.*\.db$/);

    const listRes = await apiGet('/api/admin/backups', token);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.backups.length).toBeGreaterThan(0);
    expect(listBody.backups[0].path).toBeUndefined();

    const downloadRes = await apiGet(`/api/admin/backup/${encodeURIComponent(listBody.backups[0].file)}`, token);
    expect(downloadRes.status).toBe(200);
    expect((await downloadRes.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test('queue flow via sockets (ticket -> serve -> complete) and close toggle', async () => {
    const admin = await connect({ token: await loginAdmin() });
    const operatorName = uniqueName('op');
    await addUsers(admin, [{ username: operatorName, name: 'Operator', role: 'OPERATOR', password: 'Operator-Pass1' }]);
    const operator = await connect({ token: (await login(operatorName, 'Operator-Pass1')).token });
    expect(operator.session.role).toBe('OPERATOR');

    const service = operator.state.services.find((s: any) => s.isOpen !== false);
    expect(service).toBeTruthy();
    const counter = operator.state.counters.find((c: any) => c.activeServiceIds.includes(service.id)) || operator.state.counters[0];

    // A public client (mobile) draws a ticket and gets the exact ticket back
    const mobile = await connect();
    const added = await emitWithAck(mobile.socket, 'add-ticket', { serviceId: service.id });
    expect(added.ok).toBe(true);
    expect(added.ticket.number.startsWith(service.prefix)).toBe(true);
    expect(added.ticket.status).toBe(TicketStatus.WAITING);
    const ticket = added.ticket;

    operator.socket.emit('update-ticket-status', { ticketId: ticket.id, status: TicketStatus.SERVING, counterId: counter.id });
    const servingState = await waitForState(operator.socket, (s) => s.tickets.some((t: any) => t.id === ticket.id && t.status === TicketStatus.SERVING));
    expect(servingState.tickets.find((t: any) => t.id === ticket.id).counterId).toBe(counter.id);
    expect(servingState.counters.find((c: any) => c.id === counter.id).currentTicketId).toBe(ticket.id);

    operator.socket.emit('update-ticket-status', { ticketId: ticket.id, status: TicketStatus.COMPLETED, counterId: counter.id });
    const completedState = await waitForState(operator.socket, (s) => s.tickets.some((t: any) => t.id === ticket.id && t.status === TicketStatus.COMPLETED));
    expect(completedState.counters.find((c: any) => c.id === counter.id).currentTicketId).toBeUndefined();

    // Invalid status values are ignored
    operator.socket.emit('update-ticket-status', { ticketId: ticket.id, status: 'HACKED', counterId: counter.id });

    admin.socket.emit('update-settings', { isClosed: true });
    await waitForState(mobile.socket, (s) => s.isClosed === true);
    const whileClosed = await emitWithAck(mobile.socket, 'add-ticket', { serviceId: service.id });
    expect(whileClosed).toEqual({ ok: false, error: 'closed' });
    admin.socket.emit('update-settings', { isClosed: false });
    const reopened = await waitForState(mobile.socket, (s) => s.isClosed === false);
    expect(reopened.tickets.find((t: any) => t.id === ticket.id).status).toBe(TicketStatus.COMPLETED);

    [admin, operator, mobile].forEach((c) => c.socket.disconnect());
  });
});
