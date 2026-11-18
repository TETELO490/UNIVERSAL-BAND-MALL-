import { EventItem, MallOrder, ReservationDoc, Store, Ticket, UserProfile } from '../types';
import { normalizePhoneDigits, resolveCustomerQrId } from './customerQr';
import { isEventExpired } from './dateHelper';
import { isAuthorizedAdminEmail } from './cryptoHelper';

export const LEGACY_SEED_STORE_IDS = new Set([
  'florence-palm',
  'mphela-resort',
]);

export const LEGACY_SEED_EVENT_IDS = new Set([
  'event-all-white-summer',
  'event-spring-splash-fest',
  'event-amapiano-street-fest',
  'event-kasi-food-culture',
  'event-nye-golden-countdown',
  'event-deep-house-sunset',
]);

export const LEGACY_SEED_PROMOTER_IDS = new Set([
  'promoter-florence',
  'promoter-mphela',
]);

const LEGACY_TEST_TICKET_CODES = new Set(['ub-84730', 'ub-92144']);
const LEGACY_TEST_ATTENDEE_NAMES = new Set(['thabo molefe', 'kagiso mokoena']);

/**
 * Returns true if a ticket record is a known pre-launch testing/seed artifact
 * that should be purged before going live and never surfaced to live users.
 */
export function isLegacyTestTicket(ticket: Partial<Ticket> | null | undefined, activeEventIds?: Set<string>): boolean {
  if (!ticket) return true;

  const idLower = String(ticket.id || '').trim().toLowerCase();
  const ticketIdLower = String(ticket.ticketId || '').trim().toLowerCase();
  const bandCodeLower = String(ticket.bandCode || '').trim().toLowerCase();

  if (
    LEGACY_TEST_TICKET_CODES.has(idLower) ||
    LEGACY_TEST_TICKET_CODES.has(ticketIdLower) ||
    LEGACY_TEST_TICKET_CODES.has(bandCodeLower)
  ) {
    return true;
  }

  const attendeeLower = String(ticket.attendeeName || ticket.customerName || '').trim().toLowerCase();
  if (LEGACY_TEST_ATTENDEE_NAMES.has(attendeeLower)) {
    return true;
  }

  const eventTitleLower = String(ticket.eventTitle || ticket.eventName || '').trim().toLowerCase();
  const storeNameLower = String(ticket.storeName || '').trim().toLowerCase();
  const storeIdLower = String(ticket.storeId || '').trim().toLowerCase();
  const eventIdLower = String(ticket.eventId || '').trim().toLowerCase();
  const eventDateLower = String(ticket.eventDate || ticket.event_date || '').trim().toLowerCase();

  if (
    eventTitleLower === 'all white' &&
    (storeNameLower.includes('florence palm') || eventDateLower.includes('30 sep'))
  ) {
    return true;
  }

  if (LEGACY_SEED_STORE_IDS.has(storeIdLower) || LEGACY_SEED_EVENT_IDS.has(eventIdLower)) {
    return true;
  }

  // Expired orphaned tickets (e.g. from pre-launch testing whose event no longer exists in active events)
  const statusLower = String(ticket.status || '').trim().toLowerCase();
  if (statusLower === 'binned' || (ticket as any).isBinned === true) {
    return true;
  }
  if (statusLower === 'expired') {
    if (!activeEventIds || !ticket.eventId || !activeEventIds.has(ticket.eventId)) {
      return true;
    }
  }
  if (activeEventIds && ticket.eventId && !activeEventIds.has(ticket.eventId) && isEventExpired(ticket)) {
    return true;
  }

  return false;
}

export function isOrganizerOrVenueStaffRole(role?: string): boolean {
  const roleLower = (role || '').toLowerCase();
  return (
    roleLower === 'promoter' ||
    roleLower === 'event organiser' ||
    roleLower === 'organizer' ||
    roleLower === 'seller' ||
    roleLower === 'vendor' ||
    roleLower === 'store manager' ||
    roleLower === 'manager' ||
    roleLower === 'owner'
  );
}

/**
 * Resolves the store IDs explicitly owned or managed by a user (never falls back to stores[0]).
 */
export function getUserOwnedStoreIds(user: Partial<UserProfile> | null | undefined, stores: Store[]): Set<string> {
  const owned = new Set<string>();
  const uid = user?.id && user.id !== 'guest_user' ? user.id : '';
  if (user?.assignedStoreId && user.assignedStoreId.trim() !== '') {
    owned.add(user.assignedStoreId.trim());
  }
  if (uid) {
    owned.add(`org_${uid}`);
    for (const s of stores) {
      if (s.ownerId === uid || s.promoterId === uid) {
        owned.add(s.id);
      }
    }
  }
  return owned;
}

/**
 * Resolves event IDs created/owned by a user (or hosted by their explicit store).
 */
export function getUserOwnedEventIds(
  user: Partial<UserProfile> | null | undefined,
  events: EventItem[],
  stores: Store[]
): Set<string> {
  const ownedEvents = new Set<string>();
  const uid = user?.id && user.id !== 'guest_user' ? user.id : '';
  const ownedStores = getUserOwnedStoreIds(user, stores);

  for (const ev of events) {
    if (uid && (ev.creatorId === uid || ev.organizerId === uid)) {
      ownedEvents.add(ev.id);
    } else if (ev.storeId && ownedStores.has(ev.storeId)) {
      ownedEvents.add(ev.id);
    }
  }
  return ownedEvents;
}

export function isUserVerifiedAdminSession(user: Partial<UserProfile> | null | undefined): boolean {
  if (!user || !user.isRegistered || !user.id || user.id === 'guest_user') return false;
  const roleLower = (user.role || '').toLowerCase();
  const hasSession =
    typeof window !== 'undefined' &&
    localStorage.getItem('ub_admin_session') === 'true' &&
    sessionStorage.getItem('ub_admin_5locks_passed') === 'true';
  return Boolean(
    hasSession && (roleLower === 'admin' || isAuthorizedAdminEmail(user.email))
  );
}

/**
 * Checks whether a single ticket was personally purchased by the given user.
 */
export function doesUserPersonallyOwnTicket(
  ticket: Ticket,
  user: Partial<UserProfile> | null | undefined
): boolean {
  const uid = user?.id && user.id !== 'guest_user' ? user.id : '';
  if (!uid) return false;

  if (ticket.userId === uid || ticket.user_id === uid) return true;

  const userQr = resolveCustomerQrId(uid, user?.customerQrId);
  if (userQr && ticket.customerQrId && ticket.customerQrId === userQr) return true;

  const userPhone = normalizePhoneDigits(user?.phone || '');
  const tPhone = normalizePhoneDigits(ticket.attendeePhone || ticket.customerPhone || '');
  if (userPhone.length >= 7 && tPhone.length >= 7 && userPhone === tPhone) return true;

  return false;
}

/**
 * Checks whether a food/drink reservation belongs exclusively to the given logged-in user.
 */
export function doesUserOwnReservation(
  res: Partial<ReservationDoc> | null | undefined,
  user: Partial<UserProfile> | null | undefined
): boolean {
  if (!res) return false;
  const uid = user?.id && user.id !== 'guest_user' ? user.id : '';
  if (!uid) return false;

  if (res.walletId === uid || res.customerId === uid || res.beneficiaryId === uid) return true;

  const idNum = (user?.idNumber || '').trim();
  if (idNum && res.customerId === idNum) return true;

  const userQr = resolveCustomerQrId(uid, user?.customerQrId);
  if (userQr && res.customerQrId && res.customerQrId === userQr) return true;

  const userPhone = normalizePhoneDigits(user?.phone || '');
  const rPhone = normalizePhoneDigits(res.customerPhone || '');
  if (userPhone.length >= 7 && rPhone.length >= 7 && userPhone === rPhone) return true;

  return false;
}

/**
 * Checks whether a Mall Order / Event Pre-Order belongs personally to the given logged-in user.
 */
export function doesUserOwnMallOrder(
  order: Partial<MallOrder> | null | undefined,
  user: Partial<UserProfile> | null | undefined
): boolean {
  if (!order) return false;
  const uid = user?.id && user.id !== 'guest_user' ? user.id : '';
  if (!uid) return false;

  if (order.customerId === uid) return true;

  const userQr = resolveCustomerQrId(uid, user?.customerQrId);
  if (userQr && order.customerQrId && order.customerQrId === userQr) return true;

  const userPhone = normalizePhoneDigits(user?.phone || '');
  const oPhone = normalizePhoneDigits(order.customerPhone || '');
  if (userPhone.length >= 7 && oPhone.length >= 7 && userPhone === oPhone) return true;

  return false;
}

/**
 * Strictly scopes tickets for the current user's role:
 * - Admin (verified session): all live non-legacy tickets
 * - Organizer / Promoter / Seller / Manager: ONLY tickets for their own events/stores + personal purchases
 * - Customer / Driver / Worker: ONLY tickets personally purchased by them
 * - Guest: []
 */
export function getRoleScopedTickets(params: {
  tickets: Ticket[];
  currentUser: Partial<UserProfile> | null | undefined;
  events: EventItem[];
  stores: Store[];
}): Ticket[] {
  const { tickets, currentUser, events, stores } = params;
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  const activeEventIds = new Set(events.map((e) => e.id));

  const nonLegacyTickets = safeTickets.filter((t) => !isLegacyTestTicket(t, activeEventIds));

  if (!currentUser || !currentUser.id || currentUser.id === 'guest_user') {
    return [];
  }

  if (isUserVerifiedAdminSession(currentUser)) {
    return nonLegacyTickets;
  }

  if (isOrganizerOrVenueStaffRole(currentUser.role)) {
    const ownedEventIds = getUserOwnedEventIds(currentUser, events, stores);
    const ownedStoreIds = getUserOwnedStoreIds(currentUser, stores);

    return nonLegacyTickets.filter((t) => {
      if (doesUserPersonallyOwnTicket(t, currentUser)) return true;
      if (t.eventId && ownedEventIds.has(t.eventId)) return true;
      if (t.storeId && ownedStoreIds.has(t.storeId)) return true;
      return false;
    });
  }

  return nonLegacyTickets.filter((t) => doesUserPersonallyOwnTicket(t, currentUser));
}

/**
 * Strictly scopes Mall Orders & Event Food Pre-Orders by role:
 * - Admin (verified session): all orders
 * - Organizer / Promoter / Seller / Manager: orders for their owned events or owned stores + personal orders
 * - Customer / Worker / Driver: ONLY personal orders belonging to that user
 * - Guest: []
 */
export function getRoleScopedMallOrders(params: {
  mallOrders: MallOrder[];
  currentUser: Partial<UserProfile> | null | undefined;
  events: EventItem[];
  stores: Store[];
}): MallOrder[] {
  const { mallOrders, currentUser, events, stores } = params;
  const safeOrders = Array.isArray(mallOrders) ? mallOrders : [];

  if (!currentUser || !currentUser.id || currentUser.id === 'guest_user') {
    return [];
  }

  if (isUserVerifiedAdminSession(currentUser)) {
    return safeOrders;
  }

  if (isOrganizerOrVenueStaffRole(currentUser.role)) {
    const ownedEventIds = getUserOwnedEventIds(currentUser, events, stores);
    const ownedStoreIds = getUserOwnedStoreIds(currentUser, stores);

    return safeOrders.filter((o) => {
      if (doesUserOwnMallOrder(o, currentUser)) return true;
      if (o.eventId && ownedEventIds.has(o.eventId)) return true;
      if (o.storeId && ownedStoreIds.has(o.storeId)) return true;
      if (o.storeOwnerId && o.storeOwnerId === currentUser.id) return true;
      return false;
    });
  }

  return safeOrders.filter((o) => doesUserOwnMallOrder(o, currentUser));
}

/**
 * Removes user-scoped localStorage caches on logout or account switch so User B
 * on the same device can never inherit User A's cached tickets, spending, or orders.
 */
export function clearUserLocalCaches(): void {
  if (typeof window === 'undefined') return;
  const keys = [
    'ub_spending_history',
    'ub_wallet_transactions',
    'ub_mall_orders',
    'ub_user_tickets',
    'ub_mall_carts',
    'ub_guest_support_chat_id',
  ];
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
}
