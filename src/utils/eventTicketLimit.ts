import { EventItem, Ticket } from '../types';

export interface EventTicketStats {
  soldCount: number;
  maxLimit: number | null;
  remaining: number | null;
  hasLimit: boolean;
  isSoldOut: boolean;
}

export function getEventTicketStats(
  event: EventItem | null | undefined,
  tickets: Ticket[] = []
): EventTicketStats {
  if (!event) {
    return {
      soldCount: 0,
      maxLimit: null,
      remaining: null,
      hasLimit: false,
      isSoldOut: false,
    };
  }

  const soldFromTickets = tickets.filter((t) => t.eventId === event.id).length;
  const soldFromDoc =
    typeof event.ticketsSold === 'number' && Number.isFinite(event.ticketsSold)
      ? Math.max(0, event.ticketsSold)
      : 0;
  const soldCount = Math.max(soldFromDoc, soldFromTickets);

  const rawLimit = event.ticketsAvailable;
  const parsedLimit =
    rawLimit !== undefined && rawLimit !== null ? Number(rawLimit) : NaN;
  const hasLimit = Number.isFinite(parsedLimit) && parsedLimit >= 0;

  if (!hasLimit) {
    return {
      soldCount,
      maxLimit: null,
      remaining: null,
      hasLimit: false,
      isSoldOut: false,
    };
  }

  const maxLimit = Math.floor(parsedLimit);
  const remaining = Math.max(0, maxLimit - soldCount);

  return {
    soldCount,
    maxLimit,
    remaining,
    hasLimit: true,
    isSoldOut: remaining <= 0,
  };
}
