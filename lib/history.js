import { getDb } from './stateStore.js';
import { localDay } from './queue.js';

// Every finished ticket (completed, no-show, cancelled) is written here for statistics.
// The live state only keeps finished tickets for a short while.

export const recordTicket = (ticket, state) => {
  const service = (state.services || []).find((s) => s.id === ticket.serviceId);
  const counter = (state.counters || []).find((c) => c.id === ticket.counterId);
  getDb().prepare(`
    INSERT OR REPLACE INTO ticket_history
      (id, number, service_id, service_name, counter_id, counter_name, status, source, day,
       created_at, called_at, finished_at, recall_count, transferred_from, served_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticket.id,
    ticket.number,
    ticket.serviceId || null,
    service?.name || null,
    ticket.counterId || null,
    counter?.name || null,
    ticket.status,
    ticket.source || null,
    localDay(new Date(ticket.createdAt)),
    ticket.createdAt,
    ticket.calledAt || null,
    ticket.finishedAt || ticket.completedAt || Date.now(),
    ticket.recallCount || 0,
    ticket.transferredFrom || null,
    ticket.servedBy || null,
  );
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isValidDay = (day) => typeof day === 'string' && DAY_RE.test(day);

export const historyRows = (from, to) => getDb()
  .prepare('SELECT * FROM ticket_history WHERE day >= ? AND day <= ? ORDER BY created_at')
  .all(from, to);

const avgMinutes = (values) => {
  const list = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (list.length === 0) return null;
  return Math.round((list.reduce((a, b) => a + b, 0) / list.length / 60000) * 10) / 10;
};

const summarize = (rows) => ({
  total: rows.length,
  completed: rows.filter((r) => r.status === 'COMPLETED').length,
  noShow: rows.filter((r) => r.status === 'NO_SHOW').length,
  cancelled: rows.filter((r) => r.status === 'CANCELLED').length,
  avgWaitMinutes: avgMinutes(rows.filter((r) => r.called_at).map((r) => r.called_at - r.created_at)),
  avgServiceMinutes: avgMinutes(rows.filter((r) => r.status === 'COMPLETED' && r.called_at && r.finished_at).map((r) => r.finished_at - r.called_at)),
});

const groupBy = (rows, keyFn, labelFn) => {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, { key, label: labelFn(row), rows: [] });
    groups.get(key).rows.push(row);
  });
  return [...groups.values()].map(({ key, label, rows: list }) => ({ key, label, ...summarize(list) }));
};

/**
 * Statistics for finished tickets between two local dates (inclusive), plus
 * the tickets that are still waiting/being served right now when the range includes today.
 */
export const buildStats = (from, to, liveTickets = []) => {
  const rows = historyRows(from, to);
  const today = localDay();
  const live = today >= from && today <= to ? liveTickets : [];
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, tickets: 0 }));
  rows.forEach((r) => { byHour[new Date(r.created_at).getHours()].tickets += 1; });
  live.forEach((t) => { byHour[new Date(t.createdAt).getHours()].tickets += 1; });

  return {
    from,
    to,
    totals: {
      ...summarize(rows),
      waitingNow: live.filter((t) => t.status === 'WAITING').length,
      servingNow: live.filter((t) => t.status === 'SERVING').length,
    },
    byService: groupBy(rows, (r) => r.service_id || '-', (r) => r.service_name || r.service_id || '-'),
    byCounter: groupBy(rows.filter((r) => r.counter_id), (r) => r.counter_id, (r) => r.counter_name || r.counter_id),
    byDay: groupBy(rows, (r) => r.day, (r) => r.day).sort((a, b) => a.key.localeCompare(b.key)),
    byHour,
  };
};

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Prevent formula injection when the file is opened in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const iso = (ms) => (ms ? new Date(ms).toISOString() : '');

export const historyCsv = (from, to) => {
  const header = ['number', 'service', 'counter', 'status', 'source', 'created_at', 'called_at', 'finished_at', 'wait_minutes', 'service_minutes', 'recalls', 'transferred_from'];
  const lines = historyRows(from, to).map((r) => [
    r.number,
    r.service_name,
    r.counter_name,
    r.status,
    r.source,
    iso(r.created_at),
    iso(r.called_at),
    iso(r.finished_at),
    r.called_at ? ((r.called_at - r.created_at) / 60000).toFixed(1) : '',
    r.called_at && r.finished_at && r.status === 'COMPLETED' ? ((r.finished_at - r.called_at) / 60000).toFixed(1) : '',
    r.recall_count || 0,
    r.transferred_from,
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\n') + '\n';
};
