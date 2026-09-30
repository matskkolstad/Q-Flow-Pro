import { recordTicket, buildStats } from './history.js';
import {
  TICKET_STATUS,
  FINISHED_STATUSES,
  nextTicketForCounter,
  nextTicketNumber,
  fillTemplate,
  DEFAULT_ANNOUNCEMENTS,
  localDay,
} from './queue.js';
import { generateToken, hashToken, safeEqual } from './security.js';

// Finished tickets stay in the live state this long (for "recently called" and mobile status),
// then only the history table keeps them.
export const FINISHED_TICKET_TTL_MS = 30 * 60 * 1000;

/**
 * All ticket state changes go through this service, so the server alone decides which ticket a
 * counter gets. That removes the race where two counters could call the same ticket.
 * ctx: { state (getter), io, addLog, save, broadcastState, maxWaitingTickets }
 */
export const createQueueService = (ctx) => {
  const st = () => ctx.state;
  const now = () => Date.now();
  const ok = (extra = {}) => ({ ok: true, ...extra });
  const fail = (error) => ({ ok: false, error });

  const counterById = (id) => (st().counters || []).find((c) => c.id === id);
  const servingAt = (counterId) => st().tickets.find((t) => t.status === TICKET_STATUS.SERVING && t.counterId === counterId);

  // Keeps counter.currentTicketId in line with the tickets (clients read it).
  const syncCounters = () => {
    (st().counters || []).forEach((c) => {
      c.currentTicketId = servingAt(c.id)?.id;
    });
  };

  const refreshTodaySummary = () => {
    try {
      const today = localDay();
      st().todaySummary = buildStats(today, today, st().tickets).totals;
    } catch (err) {
      console.warn('Could not compute today summary', err?.message || err);
    }
  };

  const changed = ({ finished = false } = {}) => {
    syncCounters();
    if (finished) refreshTodaySummary();
    ctx.save();
    ctx.broadcastState();
  };

  const finish = (ticket, status) => {
    ticket.status = status;
    ticket.finishedAt = now();
    if (status === TICKET_STATUS.COMPLETED) ticket.completedAt = ticket.finishedAt;
    try {
      recordTicket(ticket, st());
    } catch (err) {
      ctx.addLog(`Kunne ikke lagre billett ${ticket.number} i historikken: ${err?.message || err}`, 'ALERT');
    }
  };

  const announce = (ticket, counter) => {
    const templates = { ...DEFAULT_ANNOUNCEMENTS, ...(st().settings?.announcements || {}) };
    const values = { number: ticket.number, counter: counter?.name || '' };
    ctx.io.emit('play-sound', {
      type: 'ding',
      ticketId: ticket.id,
      number: ticket.number,
      counterName: counter?.name || '',
      textNo: fillTemplate(templates.no, values),
      textEn: fillTemplate(templates.en, values),
    });
  };

  const serve = (ticket, counter, userId) => {
    ticket.status = TICKET_STATUS.SERVING;
    ticket.calledAt = now();
    ticket.counterId = counter.id;
    ticket.servedBy = userId || ticket.servedBy;
    announce(ticket, counter);
    ctx.addLog(`${counter.name} kaller inn ${ticket.number}`, 'ACTION');
  };

  const requireCounter = (counterId) => {
    const counter = counterById(counterId);
    if (!counter) return { error: 'unknown_counter' };
    if (counter.isOnline === false) return { error: 'counter_closed' };
    return { counter };
  };

  const withCurrent = (counterId, fn) => {
    const counter = counterById(counterId);
    if (!counter) return fail('unknown_counter');
    const current = servingAt(counterId);
    if (!current) return fail('no_current_ticket');
    return fn(current, counter);
  };

  return {
    syncCounters,
    refreshTodaySummary,

    addTicket({ serviceId, source }) {
      const state = st();
      if (state.isClosed) return fail('closed');
      const service = (state.services || []).find((s) => s.id === serviceId && s.isOpen !== false);
      if (!service) return fail('service_unavailable');
      const waitingCount = state.tickets.filter((t) => t.status === TICKET_STATUS.WAITING).length;
      if (waitingCount >= ctx.maxWaitingTickets) return fail('queue_full');

      state.ticketCounters = state.ticketCounters || {};
      const { value, number } = nextTicketNumber(state.ticketCounters, service);
      state.ticketCounters[service.id] = value;

      // The owner key lets the person who drew the ticket follow and cancel it (mobile / QR).
      const ownerKey = generateToken(16);
      const ticket = {
        id: generateToken(6),
        number,
        serviceId: service.id,
        status: TICKET_STATUS.WAITING,
        createdAt: now(),
        source: ['kiosk', 'mobile', 'staff'].includes(source) ? source : 'mobile',
        recallCount: 0,
        ownerKeyHash: hashToken(ownerKey),
      };
      state.tickets.push(ticket);
      ctx.addLog(`Ny billett trukket: ${ticket.number} (${service.name}, ${ticket.source})`, 'ACTION');
      changed();
      return ok({ ticket, ownerKey, service });
    },

    callNext(counterId, userId) {
      const { counter, error } = requireCounter(counterId);
      if (error) return fail(error);
      const current = servingAt(counterId);
      if (current) finish(current, TICKET_STATUS.COMPLETED);
      const next = nextTicketForCounter(st(), counterId);
      if (next) serve(next, counter, userId);
      changed({ finished: !!current });
      return ok({ ticket: next || null, completed: current?.number || null });
    },

    callTicket(ticketId, counterId, userId) {
      const { counter, error } = requireCounter(counterId);
      if (error) return fail(error);
      const ticket = st().tickets.find((t) => t.id === ticketId);
      if (!ticket) return fail('unknown_ticket');
      if (ticket.status !== TICKET_STATUS.WAITING) return fail('not_waiting');
      const current = servingAt(counterId);
      if (current) finish(current, TICKET_STATUS.COMPLETED);
      serve(ticket, counter, userId);
      changed({ finished: !!current });
      return ok({ ticket });
    },

    recall(counterId) {
      return withCurrent(counterId, (current, counter) => {
        current.recallCount = (current.recallCount || 0) + 1;
        announce(current, counter);
        ctx.addLog(`${counter.name} roper opp ${current.number} på nytt`, 'ACTION');
        changed();
        return ok({ ticket: current });
      });
    },

    complete(counterId) {
      return withCurrent(counterId, (current, counter) => {
        finish(current, TICKET_STATUS.COMPLETED);
        ctx.addLog(`${counter.name} fullførte ${current.number}`, 'ACTION');
        changed({ finished: true });
        return ok({ ticket: current });
      });
    },

    noShow(counterId) {
      return withCurrent(counterId, (current, counter) => {
        finish(current, TICKET_STATUS.NO_SHOW);
        ctx.addLog(`${counter.name}: ${current.number} møtte ikke`, 'ACTION');
        changed({ finished: true });
        return ok({ ticket: current });
      });
    },

    // Puts the current ticket back at the front of its queue (it keeps its original time).
    requeue(counterId) {
      return withCurrent(counterId, (current, counter) => {
        current.status = TICKET_STATUS.WAITING;
        current.counterId = undefined;
        current.calledAt = undefined;
        ctx.addLog(`${counter.name} satte ${current.number} tilbake i køen`, 'ACTION');
        changed();
        return ok({ ticket: current });
      });
    },

    transfer(counterId, serviceId) {
      const service = (st().services || []).find((s) => s.id === serviceId);
      if (!service) return fail('unknown_service');
      return withCurrent(counterId, (current, counter) => {
        if (current.serviceId === serviceId) return fail('same_service');
        current.transferredFrom = current.serviceId;
        current.serviceId = serviceId;
        current.status = TICKET_STATUS.WAITING;
        current.counterId = undefined;
        current.calledAt = undefined;
        ctx.addLog(`${counter.name} overførte ${current.number} til ${service.name}`, 'ACTION');
        changed();
        return ok({ ticket: current });
      });
    },

    cancel(ticketId, actor) {
      const ticket = st().tickets.find((t) => t.id === ticketId);
      if (!ticket) return fail('unknown_ticket');
      if (FINISHED_STATUSES.has(ticket.status)) return fail('already_finished');
      finish(ticket, TICKET_STATUS.CANCELLED);
      ctx.addLog(`Billett ${ticket.number} kansellert av ${actor}`, 'ACTION');
      changed({ finished: true });
      return ok({ ticket });
    },

    cancelOwn(ticketId, key) {
      const ticket = st().tickets.find((t) => t.id === ticketId);
      if (!ticket || typeof key !== 'string' || !ticket.ownerKeyHash || !safeEqual(hashToken(key), ticket.ownerKeyHash)) {
        return fail('unknown_ticket');
      }
      if (ticket.status !== TICKET_STATUS.WAITING) return fail('not_waiting');
      finish(ticket, TICKET_STATUS.CANCELLED);
      ctx.addLog(`Billett ${ticket.number} avbestilt av kunden`, 'ACTION');
      changed({ finished: true });
      return ok({ ticket });
    },

    // Cancels everything still open, clears the queue and restarts numbering.
    reset(reason) {
      const state = st();
      state.tickets.filter((t) => !FINISHED_STATUSES.has(t.status)).forEach((t) => finish(t, TICKET_STATUS.CANCELLED));
      state.tickets = [];
      state.ticketCounters = {};
      state.jobs = { ...(state.jobs || {}), lastResetDay: localDay() };
      ctx.addLog(`Køen ble nullstilt (${reason})`, 'ALERT');
      changed({ finished: true });
    },

    // Removes finished tickets from the live state once they are old enough (they are in history).
    archiveFinished(maxAgeMs = FINISHED_TICKET_TTL_MS) {
      const cutoff = now() - maxAgeMs;
      const before = st().tickets.length;
      st().tickets = st().tickets.filter((t) => !(FINISHED_STATUSES.has(t.status) && (t.finishedAt || t.completedAt || t.createdAt) < cutoff));
      if (st().tickets.length !== before) changed();
    },

    // One-time upgrade of tickets from older versions: record finished ones in the history
    // and seed the per-service number counters so numbering continues where it was.
    migrateLegacyTickets() {
      const state = st();
      state.ticketCounters = state.ticketCounters || {};
      state.tickets.forEach((t) => {
        if (FINISHED_STATUSES.has(t.status) && !t.finishedAt) {
          t.finishedAt = t.completedAt || t.calledAt || t.createdAt;
          try { recordTicket(t, state); } catch { /* ignore */ }
        }
        const service = (state.services || []).find((s) => s.id === t.serviceId);
        const num = service ? parseInt(String(t.number).replace(service.prefix, ''), 10) : NaN;
        if (service && Number.isFinite(num) && num > (state.ticketCounters[service.id] || 0)) {
          state.ticketCounters[service.id] = num;
        }
      });
      syncCounters();
    },
  };
};
