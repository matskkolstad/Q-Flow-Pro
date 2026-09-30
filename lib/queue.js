// Pure queue logic shared by the socket handlers and the unit tests.

export const TICKET_STATUS = {
  WAITING: 'WAITING',
  SERVING: 'SERVING',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
};

export const FINISHED_STATUSES = new Set([TICKET_STATUS.COMPLETED, TICKET_STATUS.NO_SHOW, TICKET_STATUS.CANCELLED]);

const priorityOf = (services, serviceId) => {
  const service = services.find((s) => s.id === serviceId);
  const priority = Number(service?.priority);
  return Number.isFinite(priority) ? priority : 1;
};

// Waiting tickets in the order they will be called: higher service priority first, then oldest first.
export const orderWaiting = (tickets = [], services = []) => tickets
  .filter((t) => t.status === TICKET_STATUS.WAITING)
  .sort((a, b) => {
    const pa = priorityOf(services, a.serviceId);
    const pb = priorityOf(services, b.serviceId);
    if (pa !== pb) return pb - pa;
    return a.createdAt - b.createdAt;
  });

// Services a counter handles. A counter without (valid) services handles all of them.
export const counterServiceIds = (counter, services = []) => {
  const valid = (counter?.activeServiceIds || []).filter((id) => services.some((s) => s.id === id));
  return valid.length > 0 ? valid : services.map((s) => s.id);
};

export const nextTicketForCounter = (state, counterId) => {
  const counter = (state.counters || []).find((c) => c.id === counterId);
  if (!counter) return null;
  const scope = counterServiceIds(counter, state.services || []);
  return orderWaiting(state.tickets, state.services).find((t) => scope.includes(t.serviceId)) || null;
};

// Next number for a service. Numbers are counted per service and reset by the daily reset,
// so they stay unique for the day even after finished tickets are archived.
export const MAX_TICKET_NUMBER = 999;
export const nextTicketNumber = (ticketCounters = {}, service) => {
  const last = Number(ticketCounters[service.id]) || 0;
  const next = last >= MAX_TICKET_NUMBER ? 1 : last + 1;
  return { value: next, number: `${service.prefix}${String(next).padStart(3, '0')}` };
};

// Estimated wait in minutes for a new ticket in a service: people ahead times the per-person
// estimate, shared between the online counters that serve the service.
export const estimateWaitMinutes = (state, serviceId, peopleAhead = null) => {
  const service = (state.services || []).find((s) => s.id === serviceId);
  if (!service) return 0;
  const ahead = peopleAhead ?? (state.tickets || []).filter((t) => t.serviceId === serviceId && t.status === TICKET_STATUS.WAITING).length;
  if (ahead === 0) return 0;
  const counters = (state.counters || []).filter((c) => c.isOnline !== false && counterServiceIds(c, state.services).includes(serviceId));
  const perPerson = Number(service.estimatedTimePerPersonMinutes) || 1;
  return Math.ceil((ahead * perPerson) / Math.max(1, counters.length));
};

// Position of a waiting ticket among the tickets of its own service (0 = next).
export const peopleAheadOf = (state, ticket) => orderWaiting(state.tickets, state.services)
  .filter((t) => t.serviceId === ticket.serviceId)
  .findIndex((t) => t.id === ticket.id);

export const fillTemplate = (template, values) => String(template || '')
  .replace(/\{(\w+)\}/g, (match, key) => (values[key] !== undefined ? String(values[key]) : match));

export const DEFAULT_ANNOUNCEMENTS = {
  no: 'Nummer {number}, til {counter}',
  en: 'Ticket {number}, please go to {counter}',
};

// --- Opening hours / scheduling (local server time; set TZ for your time zone) ---

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const toMinutes = (hhmm) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

export const isValidTime = (hhmm) => toMinutes(hhmm) !== null;

// Returns true (open), false (closed) or null (schedule disabled).
export const isOpenAt = (schedule, date = new Date()) => {
  if (!schedule?.enabled) return null;
  const day = schedule.days?.[WEEKDAYS[date.getDay()]];
  if (!day?.enabled) return false;
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (open === null || close === null) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return open <= close ? now >= open && now < close : now >= open || now < close;
};

export const localDay = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// True when a daily job at `time` (HH:MM) is due and has not run for today's date yet.
export const isDailyJobDue = (time, lastRunDay, date = new Date()) => {
  const at = toMinutes(time);
  if (at === null) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return now >= at && lastRunDay !== localDay(date);
};

export const DEFAULT_SCHEDULE = {
  enabled: false,
  days: {
    mon: { enabled: true, open: '08:00', close: '16:00' },
    tue: { enabled: true, open: '08:00', close: '16:00' },
    wed: { enabled: true, open: '08:00', close: '16:00' },
    thu: { enabled: true, open: '08:00', close: '16:00' },
    fri: { enabled: true, open: '08:00', close: '16:00' },
    sat: { enabled: false, open: '10:00', close: '14:00' },
    sun: { enabled: false, open: '10:00', close: '14:00' },
  },
};
