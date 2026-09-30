import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderWaiting,
  nextTicketForCounter,
  nextTicketNumber,
  estimateWaitMinutes,
  peopleAheadOf,
  isOpenAt,
  isDailyJobDue,
  fillTemplate,
  localDay,
  DEFAULT_SCHEDULE,
} from '../../lib/queue.js';

const services = [
  { id: 's1', prefix: 'K', priority: 1, estimatedTimePerPersonMinutes: 5 },
  { id: 's2', prefix: 'V', priority: 5, estimatedTimePerPersonMinutes: 10 },
];
const ticket = (id, serviceId, createdAt, status = 'WAITING') => ({ id, serviceId, createdAt, status, number: id });

test('orderWaiting sorts by service priority, then age', () => {
  const tickets = [ticket('a', 's1', 1), ticket('b', 's2', 3), ticket('c', 's1', 2), ticket('d', 's2', 4, 'SERVING')];
  assert.deepEqual(orderWaiting(tickets, services).map((t) => t.id), ['b', 'a', 'c']);
});

test('nextTicketForCounter respects the counter services (empty = all)', () => {
  const state = {
    services,
    counters: [{ id: 'c1', activeServiceIds: ['s1'] }, { id: 'c2', activeServiceIds: [] }],
    tickets: [ticket('a', 's1', 1), ticket('b', 's2', 2)],
  };
  assert.equal(nextTicketForCounter(state, 'c1').id, 'a');
  assert.equal(nextTicketForCounter(state, 'c2').id, 'b');
  assert.equal(nextTicketForCounter(state, 'missing'), null);
});

test('nextTicketNumber counts per service and wraps after 999', () => {
  assert.deepEqual(nextTicketNumber({}, services[0]), { value: 1, number: 'K001' });
  assert.deepEqual(nextTicketNumber({ s1: 41 }, services[0]), { value: 42, number: 'K042' });
  assert.deepEqual(nextTicketNumber({ s1: 999 }, services[0]), { value: 1, number: 'K001' });
});

test('estimateWaitMinutes shares the queue between online counters', () => {
  const state = {
    services,
    counters: [{ id: 'c1', activeServiceIds: ['s1'], isOnline: true }, { id: 'c2', activeServiceIds: ['s1'], isOnline: true }, { id: 'c3', activeServiceIds: ['s1'], isOnline: false }],
    tickets: [ticket('a', 's1', 1), ticket('b', 's1', 2), ticket('c', 's1', 3)],
  };
  assert.equal(estimateWaitMinutes(state, 's1'), Math.ceil((3 * 5) / 2));
  assert.equal(estimateWaitMinutes(state, 's1', 0), 0);
  assert.equal(peopleAheadOf(state, state.tickets[2]), 2);
});

test('isOpenAt follows the weekly schedule', () => {
  const schedule = { ...DEFAULT_SCHEDULE, enabled: true };
  const monday10 = new Date(2026, 8, 21, 10, 0); // Monday
  const monday17 = new Date(2026, 8, 21, 17, 0);
  const saturday = new Date(2026, 8, 26, 11, 0);
  assert.equal(isOpenAt(schedule, monday10), true);
  assert.equal(isOpenAt(schedule, monday17), false);
  assert.equal(isOpenAt(schedule, saturday), false);
  assert.equal(isOpenAt({ ...schedule, enabled: false }, monday10), null);
});

test('isDailyJobDue runs once per day after the given time', () => {
  const at = new Date(2026, 8, 21, 4, 30);
  assert.equal(isDailyJobDue('04:00', undefined, at), true);
  assert.equal(isDailyJobDue('04:00', localDay(at), at), false);
  assert.equal(isDailyJobDue('05:00', undefined, at), false);
  assert.equal(isDailyJobDue('bad', undefined, at), false);
});

test('fillTemplate replaces known placeholders only', () => {
  assert.equal(fillTemplate('Nummer {number}, til {counter} {x}', { number: 'K001', counter: 'Skranke 1' }), 'Nummer K001, til Skranke 1 {x}');
});
