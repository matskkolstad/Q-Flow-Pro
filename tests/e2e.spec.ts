import { test, expect } from '@playwright/test';
import { io, Socket } from 'socket.io-client';
import { TicketStatus } from '../types';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

const waitForState = (socket: Socket, predicate: (state: any) => boolean, timeoutMs = 8000) => {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for state'));
    }, timeoutMs);

    const handler = (state: any) => {
      if (predicate(state)) {
        cleanup();
        resolve(state);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('state-update', handler);
      socket.off('init-state', handler);
    };

    socket.on('state-update', handler);
    socket.on('init-state', handler);
  });
};

const connectSocket = (token: string) => new Promise<Socket>((resolve, reject) => {
  const s = io(BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
    timeout: 8000,
  });

  const onError = (err: any) => {
    cleanup();
    reject(err);
  };

  const onConnect = () => {
    cleanup();
    resolve(s);
  };

  const cleanup = () => {
    s.off('connect_error', onError);
    s.off('error', onError);
    s.off('connect', onConnect);
  };

  s.once('connect', onConnect);
  s.once('connect_error', onError);
  s.once('error', onError);
});

test.describe('Q-Flow happy paths', () => {
  test('health endpoint is ok', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('public display route alias resolves', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/#/public`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<!doctype html');
  });

  test('admin auth and backup endpoints', async ({ request }) => {
    const loginRes = await request.post(`${BASE_URL}/api/login`, {
      data: { username: 'admin', password: 'Admin123!' },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();
    expect(token).toBeTruthy();

    const backupRes = await request.post(`${BASE_URL}/api/admin/backup`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(backupRes.status()).toBe(200);
    const backupBody = await backupRes.json();
    expect(backupBody.ok).toBe(true);
    expect(typeof backupBody.file).toBe('string');

    const listRes = await request.get(`${BASE_URL}/api/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.backups)).toBe(true);
    expect(listBody.backups.length).toBeGreaterThan(0);
    const first = listBody.backups[0];

    const downloadRes = await request.get(`${BASE_URL}/api/admin/backup/${encodeURIComponent(first.file)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(downloadRes.status()).toBe(200);
    const buf = await downloadRes.body();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  test('queue flow via sockets (ticket -> serve -> complete) and close toggle', async () => {
    const adminLogin = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123!' }),
    });
    expect(adminLogin.ok).toBeTruthy();
    const adminPayload = await adminLogin.json();
    const adminToken = adminPayload.token as string;

    const operatorLogin = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'operator', password: 'Operator123!' }),
    });
    expect(operatorLogin.ok).toBeTruthy();
    const operatorPayload = await operatorLogin.json();
    const operatorToken = operatorPayload.token as string;

    const operatorSocket = await connectSocket(operatorToken);
    const adminSocket = await connectSocket(adminToken);

    operatorSocket.emit('request-state');
    adminSocket.emit('request-state');

    const initial = await waitForState(operatorSocket, (s) => Array.isArray(s.services) && s.services.length > 0);
    const service = initial.services.find((s: any) => s.isOpen !== false) || initial.services[0];
    expect(service).toBeTruthy();
    const counter = initial.counters.find((c: any) => c.isOnline && c.activeServiceIds.includes(service.id)) || initial.counters[0];
    expect(counter).toBeTruthy();

    const addStarted = Date.now();
    operatorSocket.emit('add-ticket', { serviceId: service.id });
    const afterAdd = await waitForState(operatorSocket, (s) => s.tickets.some((t: any) => t.serviceId === service.id && t.createdAt >= addStarted - 2000));
    const ticket = afterAdd.tickets.filter((t: any) => t.serviceId === service.id).sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
    expect(ticket.status).toBe(TicketStatus.WAITING);

    operatorSocket.emit('update-ticket-status', { ticketId: ticket.id, status: TicketStatus.SERVING, counterId: counter.id });
    const servingState = await waitForState(operatorSocket, (s) => s.tickets.some((t: any) => t.id === ticket.id && t.status === TicketStatus.SERVING));
    const servingTicket = servingState.tickets.find((t: any) => t.id === ticket.id);
    const servingCounter = servingState.counters.find((c: any) => c.id === counter.id);
    expect(servingTicket.counterId).toBe(counter.id);
    expect(servingCounter.currentTicketId).toBe(ticket.id);

    operatorSocket.emit('update-ticket-status', { ticketId: ticket.id, status: TicketStatus.COMPLETED, counterId: counter.id });
    const completedState = await waitForState(operatorSocket, (s) => s.tickets.some((t: any) => t.id === ticket.id && t.status === TicketStatus.COMPLETED));
    const completedCounter = completedState.counters.find((c: any) => c.id === counter.id);
    expect(completedCounter.currentTicketId).toBeUndefined();

    adminSocket.emit('update-settings', { isClosed: true });
    await waitForState(operatorSocket, (s) => s.isClosed === true);
    adminSocket.emit('update-settings', { isClosed: false });
    await waitForState(operatorSocket, (s) => s.isClosed === false);

    operatorSocket.disconnect();
    adminSocket.disconnect();
  });
});
