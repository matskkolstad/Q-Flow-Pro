import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Each test file runs in its own process; point the database at a temporary directory.
process.env.QFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qflow-unit-'));
const { createQueueService } = await import('../../lib/queueService.js');
const { buildStats } = await import('../../lib/history.js');
const { localDay } = await import('../../lib/queue.js');

const makeCtx = () => {
  const events = [];
  const ctx = {
    state: {
      isClosed: false,
      services: [
        { id: 's1', name: 'Kundeservice', prefix: 'K', priority: 1, isOpen: true, estimatedTimePerPersonMinutes: 5 },
        { id: 's2', name: 'Support', prefix: 'T', priority: 1, isOpen: true, estimatedTimePerPersonMinutes: 5 },
      ],
      counters: [
        { id: 'c1', name: 'Skranke 1', activeServiceIds: ['s1'], isOnline: true },
        { id: 'c2', name: 'Skranke 2', activeServiceIds: [], isOnline: true },
        { id: 'c3', name: 'Stengt', activeServiceIds: [], isOnline: false },
      ],
      tickets: [],
      settings: {},
    },
    io: { emit: (event, payload) => events.push({ event, payload }) },
    addLog: () => {},
    save: () => {},
    broadcastState: () => {},
    maxWaitingTickets: 3,
  };
  return { ctx, events, queue: createQueueService(ctx) };
};

let env;
before(() => { env = makeCtx(); });

test('tickets get per-service numbers, an owner key, and the queue has a cap', () => {
  const { queue, ctx } = env;
  const a = queue.addTicket({ serviceId: 's1', source: 'kiosk' });
  const b = queue.addTicket({ serviceId: 's1' });
  const c = queue.addTicket({ serviceId: 's2' });
  assert.equal(a.ticket.number, 'K001');
  assert.equal(b.ticket.number, 'K002');
  assert.equal(c.ticket.number, 'T001');
  assert.equal(typeof a.ownerKey, 'string');
  assert.notEqual(a.ticket.ownerKeyHash, a.ownerKey);
  assert.deepEqual(queue.addTicket({ serviceId: 's1' }), { ok: false, error: 'queue_full' });
  ctx.state.isClosed = true;
  assert.deepEqual(queue.addTicket({ serviceId: 's1' }), { ok: false, error: 'closed' });
  ctx.state.isClosed = false;
});

test('two counters calling next never get the same ticket', () => {
  const { queue, ctx, events } = env;
  const first = queue.callNext('c1', 'u1');
  const second = queue.callNext('c2', 'u2');
  assert.equal(first.ticket.number, 'K001');
  assert.equal(second.ticket.number, 'K002');
  assert.equal(ctx.state.counters[0].currentTicketId, first.ticket.id);
  assert.equal(events.filter((e) => e.event === 'play-sound').length, 2);
  assert.match(events[0].payload.textNo, /K001.*Skranke 1/);
  assert.deepEqual(queue.callNext('c3', 'u3'), { ok: false, error: 'counter_closed' });
});

test('recall, transfer, requeue and no-show work on the current ticket', () => {
  const { queue, ctx } = env;
  assert.equal(queue.recall('c1').ticket.recallCount, 1);
  const moved = queue.transfer('c2', 's2');
  assert.equal(moved.ticket.serviceId, 's2');
  assert.equal(moved.ticket.status, 'WAITING');
  assert.equal(moved.ticket.transferredFrom, 's1');
  assert.equal(queue.requeue('c2').error, 'no_current_ticket');
  const next = queue.callNext('c2', 'u2');
  // The transferred ticket keeps its original time, so it comes before the newer T001
  assert.equal(next.ticket.number, 'K002');
  assert.equal(queue.noShow('c2').ticket.status, 'NO_SHOW');
  assert.equal(ctx.state.counters[1].currentTicketId, undefined);
});

test('customers can only cancel their own waiting ticket', () => {
  const { queue } = env;
  const drawn = queue.addTicket({ serviceId: 's1' });
  assert.equal(queue.cancelOwn(drawn.ticket.id, 'wrong-key').error, 'unknown_ticket');
  assert.equal(queue.cancelOwn(drawn.ticket.id, drawn.ownerKey).ticket.status, 'CANCELLED');
});

test('finished tickets end up in the statistics and are archived from the live state', () => {
  const { queue, ctx } = env;
  queue.complete('c1');
  const today = localDay();
  const stats = buildStats(today, today, ctx.state.tickets);
  assert.equal(stats.totals.completed, 1);
  assert.equal(stats.totals.noShow, 1);
  assert.equal(stats.totals.cancelled, 1);
  // K002 was transferred to s2 before it was marked as no-show
  assert.equal(stats.byService.find((s) => s.key === 's1').total, 2);
  assert.equal(stats.byService.find((s) => s.key === 's2').total, 1);
  queue.archiveFinished(-1);
  assert.equal(ctx.state.tickets.every((t) => t.status === 'WAITING' || t.status === 'SERVING'), true);
});

test('reset cancels open tickets and restarts numbering', () => {
  const { queue, ctx } = env;
  queue.reset('test');
  assert.equal(ctx.state.tickets.length, 0);
  assert.equal(queue.addTicket({ serviceId: 's1' }).ticket.number, 'K001');
});
