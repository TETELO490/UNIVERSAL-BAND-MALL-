import { EventItem, Ticket } from '../types';

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

  const eventTickets = tickets.filter((t) => t.eventId === event.id);

  // Prices (empty = does not exist)
  const ebPrice = parsePriceNum(event.earlyBirdPrice);
  const genPrice = parsePriceNum(event.generalPrice || event.price);
  const ebVipPrice = parsePriceNum(event.earlyBirdVipPrice);
  const vipPrice = parsePriceNum(event.vipPrice);

  const ebLimit = parseLimitNum(event.earlyBirdLimit, 50);
  const genLimit = parseLimitNum(event.generalLimit || event.ticketsAvailable, 200);
  const ebVipLimit = parseLimitNum(event.earlyBirdVipLimit, 20);
  const vipLimit = parseLimitNum(event.vipLimit, 100);

  // Sold counts per tier
  const ebSold = eventTickets.filter(
    (t) => t.ticketTier === 'Early Bird' || t.tierName === 'Early Bird'
  ).length;
  const genSold = eventTickets.filter(
    (t) =>
      t.ticketTier === 'General' ||
      t.tierName === 'General' ||
      (!t.ticketTier && ebPrice === 0)
  ).length;
  const ebVipSold = eventTickets.filter(
    (t) => t.ticketTier === 'Early Bird VIP' || t.tierName === 'Early Bird VIP'
  ).length;
  const vipSold = eventTickets.filter(
    (t) => t.ticketTier === 'VIP' || t.tierName === 'VIP'
  ).length;

  // Normal Side Sequential Logic:
  // - If BOTH Early Bird + General prices exist: At start show ONLY Early Bird.
  // - When Early Bird sold = limit (50/50), Early Bird automatically disappears, then show General.
  // - When General sold = limit (200/200), General disappears / shows SOLD OUT.
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
  // - If NO VIP price AND NO Early Bird VIP price entered -> Do NOT show VIP section at all.
  // - If BOTH Early Bird VIP + VIP prices exist: At start show ONLY Early Bird VIP.
  // - When Early Bird VIP sold = limit (20/20), Early Bird VIP automatically disappears, then show VIP.
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

  const ebRem = Math.max(0, ebLimit - ebSold);
  const genRem = Math.max(0, genLimit - genSold);
  const ebVipRem = Math.max(0, ebVipLimit - ebVipSold);
  const vipRem = Math.max(0, vipLimit - vipSold);

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
          isSoldOut: ebRem <= 0,
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
          isSoldOut: genRem <= 0,
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
          isSoldOut: ebVipRem <= 0,
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
          isSoldOut: vipRem <= 0,
          isVisible: showVip,
        }
      : null;

  const allTiers = [earlyBirdTier, generalTier, earlyBirdVipTier, vipTier].filter(Boolean) as TicketTierInfo[];
  const availableTiers = allTiers.filter((t) => t.isVisible && !t.isSoldOut);
  const totalSold = ebSold + genSold + ebVipSold + vipSold;

  return {
    earlyBird: earlyBirdTier,
    general: generalTier,
    earlyBirdVip: earlyBirdVipTier,
    vip: vipTier,
    allTiers,
    availableTiers,
    totalSold,
    isCompletelySoldOut: allTiers.length > 0 && allTiers.every((t) => t.isSoldOut || (t.id === 'general' && ebPrice > 0 && ebRem > 0)),
  };
}

export function getEventTicketStats(
  event: EventItem | null | undefined,
  tickets: Ticket[] = []
): EventTicketStats {
  const stats = getEventTierStats(event, tickets);
  const totalMaxLimit = stats.allTiers.reduce((acc, t) => acc + t.maxLimit, 0);
  const remaining = stats.allTiers.reduce((acc, t) => acc + t.remaining, 0);

  return {
    soldCount: stats.totalSold,
    maxLimit: totalMaxLimit > 0 ? totalMaxLimit : (event?.ticketsAvailable ? Number(event.ticketsAvailable) : null),
    remaining: totalMaxLimit > 0 ? remaining : null,
    hasLimit: stats.allTiers.length > 0 || (event?.ticketsAvailable !== undefined),
    isSoldOut: stats.allTiers.length > 0 ? stats.allTiers.every((t) => t.isSoldOut) : false,
    tiers: stats.allTiers,
    availableTiers: stats.availableTiers,
  };
}
