import { EventItem, Ticket } from '../types';
import { isTicketPaid } from './ticketStatus';

export interface TicketTierInfo {
  id: string;
  name: string;
  shortName: string;
  price: number;
  formattedPrice: string;
  badge: string;
  soldCount: number;
  maxLimit: number;
  remaining: number;
  isSoldOut: boolean;
  isVisible: boolean;
}

export interface EventTicketStats {
  soldCount: number;
  maxLimit: number | null;
  remaining: number | null;
  hasLimit: boolean;
  isSoldOut: boolean;
  tiers: TicketTierInfo[];
  availableTiers: TicketTierInfo[];
}

export function parsePriceNum(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return !isNaN(n) && n > 0 ? n : 0;
}

export function parseLimitNum(val: any, defaultLimit: number = 100): number {
  if (val === undefined || val === null || val === '') return defaultLimit;
  const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
  return !isNaN(n) && n > 0 ? n : defaultLimit;
}

export function getTicketQuantity(t?: Pick<Ticket, 'quantity'> | null): number {
  const q = Number(t?.quantity || 1);
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
}

export function getEventTierStats(event: EventItem | null | undefined, tickets: Ticket[] = []) {
  if (!event) {
    return {
      earlyBird: null,
      general: null,
      earlyBirdVip: null,
      vip: null,
      allTiers: [],
      availableTiers: [],
      totalSold: 0,
      isCompletelySoldOut: false,
    };
  }

  const eventTickets = tickets.filter((t) => t.eventId === event.id && isTicketPaid(t));

  const explicitLimit =
    event.ticketsAvailable !== undefined &&
    event.ticketsAvailable !== null &&
    String(event.ticketsAvailable).trim() !== ''
      ? Math.max(1, Math.floor(Number(event.ticketsAvailable)))
      : null;
  const hasExplicitLimit = explicitLimit !== null && Number.isFinite(explicitLimit);

  // Prices (empty = does not exist)
  const ebPrice = parsePriceNum(event.earlyBirdPrice);
  const genPrice = parsePriceNum(event.generalPrice || event.price);
  const ebVipPrice = parsePriceNum(event.earlyBirdVipPrice);
  const vipPrice = parsePriceNum(event.vipPrice);

  const capByEventLimit = (val: number) =>
    hasExplicitLimit ? Math.min(val, explicitLimit as number) : val;

  const ebLimit = capByEventLimit(
    parseLimitNum(event.earlyBirdLimit, hasExplicitLimit ? Math.min(50, explicitLimit as number) : 50)
  );
  const genLimit = capByEventLimit(
    parseLimitNum(event.generalLimit || event.ticketsAvailable, hasExplicitLimit ? (explicitLimit as number) : 200)
  );
  const ebVipLimit = capByEventLimit(
    parseLimitNum(event.earlyBirdVipLimit, hasExplicitLimit ? Math.min(20, explicitLimit as number) : 20)
  );
  const vipLimit = capByEventLimit(
    parseLimitNum(event.vipLimit, hasExplicitLimit ? (explicitLimit as number) : 100)
  );

  // Sold counts per tier (summing quantity on each approved paid ticket)
  const getTierLower = (t: Ticket) =>
    String(t.ticketTier || t.tierName || '').trim().toLowerCase();

  const ebSold = eventTickets
    .filter((t) => getTierLower(t) === 'early bird')
    .reduce((sum, t) => sum + getTicketQuantity(t), 0);
  const ebVipSold = eventTickets
    .filter((t) => getTierLower(t) === 'early bird vip')
    .reduce((sum, t) => sum + getTicketQuantity(t), 0);
  const vipSold = eventTickets
    .filter((t) => {
      const tl = getTierLower(t);
      return tl === 'vip' || tl === 'vvip';
    })
    .reduce((sum, t) => sum + getTicketQuantity(t), 0);
  const genSold = eventTickets
    .filter((t) => {
      const tl = getTierLower(t);
      return tl !== 'early bird' && tl !== 'early bird vip' && tl !== 'vip' && tl !== 'vvip';
    })
    .reduce((sum, t) => sum + getTicketQuantity(t), 0);

  const totalSold = ebSold + genSold + ebVipSold + vipSold;
  const overallRemaining = hasExplicitLimit
    ? Math.max(0, (explicitLimit as number) - totalSold)
    : Number.MAX_SAFE_INTEGER;

  // Normal Side Sequential Logic:
  let showEb = false;
  let showGen = false;

  if (ebPrice > 0 && genPrice > 0) {
    if (ebSold < ebLimit) {
      showEb = true;
    } else {
      showGen = true;
    }
  } else if (ebPrice > 0 && genPrice === 0) {
    showEb = true;
  } else if (ebPrice === 0 && genPrice > 0) {
    showGen = true;
  }

  // VIP Side Sequential Logic:
  let showEbVip = false;
  let showVip = false;

  if (ebVipPrice > 0 || vipPrice > 0) {
    if (ebVipPrice > 0 && vipPrice > 0) {
      if (ebVipSold < ebVipLimit) {
        showEbVip = true;
      } else {
        showVip = true;
      }
    } else if (ebVipPrice > 0 && vipPrice === 0) {
      showEbVip = true;
    } else if (ebVipPrice === 0 && vipPrice > 0) {
      showVip = true;
    }
  }

  const ebRem = Math.min(overallRemaining, Math.max(0, ebLimit - ebSold));
  const genRem = Math.min(overallRemaining, Math.max(0, genLimit - genSold));
  const ebVipRem = Math.min(overallRemaining, Math.max(0, ebVipLimit - ebVipSold));
  const vipRem = Math.min(overallRemaining, Math.max(0, vipLimit - vipSold));

  const earlyBirdTier: TicketTierInfo | null =
    ebPrice > 0
      ? {
          id: 'early_bird',
          name: 'Early Bird',
          shortName: 'EARLYBIRD',
          price: ebPrice,
          formattedPrice: `R${ebPrice}`,
          badge: '🌅 Early Bird',
          soldCount: ebSold,
          maxLimit: ebLimit,
          remaining: ebRem,
          isSoldOut: overallRemaining <= 0 || ebRem <= 0,
          isVisible: showEb,
        }
      : null;

  const generalTier: TicketTierInfo | null =
    genPrice > 0
      ? {
          id: 'general',
          name: 'General',
          shortName: 'GENERAL',
          price: genPrice,
          formattedPrice: `R${genPrice}`,
          badge: '🎟️ General',
          soldCount: genSold,
          maxLimit: genLimit,
          remaining: genRem,
          isSoldOut: overallRemaining <= 0 || genRem <= 0,
          isVisible: showGen,
        }
      : null;

  const earlyBirdVipTier: TicketTierInfo | null =
    ebVipPrice > 0
      ? {
          id: 'early_bird_vip',
          name: 'Early Bird VIP',
          shortName: 'EB-VIP',
          price: ebVipPrice,
          formattedPrice: `R${ebVipPrice}`,
          badge: '⭐ Early Bird VIP',
          soldCount: ebVipSold,
          maxLimit: ebVipLimit,
          remaining: ebVipRem,
          isSoldOut: overallRemaining <= 0 || ebVipRem <= 0,
          isVisible: showEbVip,
        }
      : null;

  const vipTier: TicketTierInfo | null =
    vipPrice > 0
      ? {
          id: 'vip',
          name: 'VIP',
          shortName: 'VIP',
          price: vipPrice,
          formattedPrice: `R${vipPrice}`,
          badge: '👑 VIP',
          soldCount: vipSold,
          maxLimit: vipLimit,
          remaining: vipRem,
          isSoldOut: overallRemaining <= 0 || vipRem <= 0,
          isVisible: showVip,
        }
      : null;

  const allTiers = [earlyBirdTier, generalTier, earlyBirdVipTier, vipTier].filter(Boolean) as TicketTierInfo[];
  const availableTiers = allTiers.filter((t) => t.isVisible && !t.isSoldOut);

  return {
    earlyBird: earlyBirdTier,
    general: generalTier,
    earlyBirdVip: earlyBirdVipTier,
    vip: vipTier,
    allTiers,
    availableTiers,
    totalSold,
    isCompletelySoldOut:
      (hasExplicitLimit && overallRemaining <= 0) ||
      (allTiers.length > 0 && allTiers.every((t) => t.isSoldOut || (t.id === 'general' && ebPrice > 0 && ebRem > 0))),
  };
}

export function getEventTicketStats(
  event: EventItem | null | undefined,
  tickets: Ticket[] = []
): EventTicketStats {
  const stats = getEventTierStats(event, tickets);
  const explicitLimit =
    event?.ticketsAvailable !== undefined &&
    event?.ticketsAvailable !== null &&
    String(event.ticketsAvailable).trim() !== ''
      ? Number(event.ticketsAvailable)
      : null;
  const tierMax = stats.allTiers.reduce((max, t) => Math.max(max, t.maxLimit), 0);
  const maxLimit =
    explicitLimit !== null && Number.isFinite(explicitLimit) && explicitLimit > 0
      ? Math.floor(explicitLimit)
      : tierMax > 0
      ? tierMax
      : 200;
  const remaining = Math.max(0, maxLimit - stats.totalSold);

  return {
    soldCount: stats.totalSold,
    maxLimit,
    remaining,
    hasLimit: true,
    isSoldOut: stats.totalSold >= maxLimit,
    tiers: stats.allTiers,
    availableTiers: stats.availableTiers,
  };
}
