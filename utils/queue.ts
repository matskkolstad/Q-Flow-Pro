import { Counter, Service, Ticket, TicketStatus } from '../types';

// Client mirror of lib/queue.js, so screens show the same order and estimates as the server uses.

const priorityOf = (services: Service[], serviceId: string) => {
  const priority = Number(services.find((s) => s.id === serviceId)?.priority);
  return Number.isFinite(priority) ? priority : 1;
};

export const orderWaiting = (tickets: Ticket[], services: Service[]) => tickets
  .filter((t) => t.status === TicketStatus.WAITING)
  .sort((a, b) => {
    const pa = priorityOf(services, a.serviceId);
    const pb = priorityOf(services, b.serviceId);
    if (pa !== pb) return pb - pa;
    return a.createdAt - b.createdAt;
  });

export const counterServiceIds = (counter: Counter | undefined, services: Service[]) => {
  const valid = (counter?.activeServiceIds || []).filter((id) => services.some((s) => s.id === id));
  return valid.length > 0 ? valid : services.map((s) => s.id);
};

export const estimateWaitMinutes = (tickets: Ticket[], services: Service[], counters: Counter[], serviceId: string, peopleAhead?: number) => {
  const service = services.find((s) => s.id === serviceId);
  if (!service) return 0;
  const ahead = peopleAhead ?? tickets.filter((t) => t.serviceId === serviceId && t.status === TicketStatus.WAITING).length;
  if (ahead <= 0) return 0;
  const serving = counters.filter((c) => c.isOnline !== false && counterServiceIds(c, services).includes(serviceId));
  const perPerson = Number(service.estimatedTimePerPersonMinutes) || 1;
  return Math.ceil((ahead * perPerson) / Math.max(1, serving.length));
};

// How many tickets of the same service will be called before this one.
export const peopleAheadOf = (tickets: Ticket[], services: Service[], ticket: Ticket) => {
  const index = orderWaiting(tickets, services).filter((t) => t.serviceId === ticket.serviceId).findIndex((t) => t.id === ticket.id);
  return Math.max(0, index);
};

export const FINISHED_STATUSES: TicketStatus[] = [TicketStatus.COMPLETED, TicketStatus.NO_SHOW, TicketStatus.CANCELLED];
