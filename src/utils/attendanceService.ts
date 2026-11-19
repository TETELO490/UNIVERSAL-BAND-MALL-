import { Ticket, AttendanceStatus, AttendanceLog } from '../types';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

import { isTicketPaid } from './ticketStatus';

import { isAuthorizedAdminEmail } from './cryptoHelper';

/**
 * Normalizes phone number into clean digits (e.g., "+27 82 123 4567" -> "0821234567" or "27821234567")
 */
export const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  return phone.replace(/[\s\-\(\)\+\.]/g, '');
};

/**
 * Masks phone number for privacy display: e.g. "082 *** 4567"
 */
export const maskPhoneNumber = (phone: string): string => {
  if (!phone) return '082 *** 0000';
  const clean = normalizePhone(phone);
  if (clean.length >= 7) {
    const prefix = clean.slice(0, 3);
    const suffix = clean.slice(-4);
    return `${prefix} *** ${suffix}`;
  }
  return clean.replace(/\d(?=\d{2})/g, '*');
};

/**
 * Formats phone number based on viewer role.
 * Admins see the full uncovered phone number in their account.
 * For any other role, the phone number is covered/masked for privacy.
 */
export const formatPhoneForViewer = (
  phone: string | undefined | null,
  viewer?: { role?: string; email?: string } | null,
  forceIsAdmin?: boolean
): string => {
  if (!phone) return 'Not provided';
  const clean = phone.trim();
  if (!clean) return 'Not provided';

  const roleLower = (viewer?.role || '').toLowerCase();
  const isAdmin = Boolean(
    forceIsAdmin ||
    roleLower === 'admin' ||
    (viewer?.email && isAuthorizedAdminEmail(viewer.email)) ||
    (typeof window !== 'undefined' && localStorage.getItem('ub_admin_session') === 'true')
  );

  if (isAdmin) {
    return clean;
  }
  return maskPhoneNumber(clean);
};

/**
 * Formats time in HH:mm (e.g. "14:32")
 */
export const formatMovementTime = (date: Date = new Date()): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

/**
 * Search tickets by full phone or last 4 digits
 */
export const filterTicketsByPhone = (tickets: Ticket[], query: string): Ticket[] => {
  const cleanQuery = normalizePhone(query).toLowerCase().trim();
  if (!cleanQuery) return [];

  return tickets.filter((t) => {
    const phone = normalizePhone(t.attendeePhone || t.customerPhone || '');
    const name = (t.attendeeName || t.customerName || '').toLowerCase();
    
    // Match full or partial phone (e.g. last 4 digits "4567")
    const phoneMatches =
      phone === cleanQuery ||
      phone.endsWith(cleanQuery) ||
      phone.includes(cleanQuery);

    const nameMatches = name.includes(cleanQuery);
    const ticketIdMatches = (t.ticketId || t.id).toLowerCase().includes(cleanQuery);

    return phoneMatches || nameMatches || ticketIdMatches;
  });
};

/**
 * Groups tickets by attendee phone number
 */
export interface AttendeeTicketGroup {
  phone: string;
  maskedPhone: string;
  name: string;
  tickets: Ticket[];
  totalTickets: number;
  insideCount: number;
  outsideCount: number;
  exitedCount: number;
}

export const groupTicketsByPhone = (tickets: Ticket[]): AttendeeTicketGroup[] => {
  const map = new Map<string, AttendeeTicketGroup>();

  tickets.forEach((t) => {
    const phone = normalizePhone(t.attendeePhone || t.customerPhone || '0000000000');
    const name = t.attendeeName || t.customerName || 'Guest';

    if (!map.has(phone)) {
      map.set(phone, {
        phone,
        maskedPhone: maskPhoneNumber(phone),
        name,
        tickets: [],
        totalTickets: 0,
        insideCount: 0,
        outsideCount: 0,
        exitedCount: 0,
      });
    }

    const group = map.get(phone)!;
    group.tickets.push(t);
    group.totalTickets++;

    const status: AttendanceStatus = t.attendanceStatus || (t.status === 'used' || (t.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
    if (status === 'INSIDE') {
      group.insideCount++;
    } else if (status === 'EXITED') {
      group.exitedCount++;
    } else {
      group.outsideCount++;
    }
  });

  return Array.from(map.values());
};

/**
 * Computes event attendance statistics for Admin & Promoter dashboards
 */
export interface EventAttendanceStats {
  eventId: string;
  eventTitle: string;
  totalTickets: number;
  insideCount: number;
  outsideCount: number;
  exitedCount: number;
  peakInsideCount: number;
}

export const calculateEventAttendanceStats = (
  eventId: string,
  eventTitle: string,
  tickets: Ticket[]
): EventAttendanceStats => {
  const eventTickets = tickets.filter((t) => t.eventId === eventId && isTicketPaid(t));
  let totalTickets = 0;
  let insideCount = 0;
  let outsideCount = 0;
  let exitedCount = 0;

  eventTickets.forEach((t) => {
    const qty = Math.max(1, Math.floor(Number(t.quantity || 1) || 1));
    totalTickets += qty;
    const status: AttendanceStatus = t.attendanceStatus || (t.status === 'used' || (t.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
    if (status === 'INSIDE') {
      insideCount += qty;
    } else if (status === 'EXITED') {
      exitedCount += qty;
    } else {
      outsideCount += qty;
    }
  });

  return {
    eventId,
    eventTitle,
    totalTickets,
    insideCount,
    outsideCount,
    exitedCount,
    peakInsideCount: insideCount,
  };
};

// =========================================================================
// OFFLINE CACHING & SYNC ENGINE
// =========================================================================

const OFFLINE_EVENT_PREFIX = 'ub_offline_event_';
const PENDING_SYNC_KEY = 'ub_pending_attendance_sync';

export interface PendingMovementSync {
  ticketId: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  newStatus: AttendanceStatus;
  timestamp: string;
  timeFormatted: string;
  bouncerName: string;
  bouncerRole: string;
}

/**
 * Downloads and caches all event tickets locally for full offline operation
 */
export const downloadEventTicketsLocally = (
  eventId: string,
  eventTitle: string,
  allTickets: Ticket[]
): { success: boolean; count: number; downloadedAt: string } => {
  const eventTickets = allTickets.filter((t) => t.eventId === eventId);
  const payload = {
    eventId,
    eventTitle,
    downloadedAt: new Date().toISOString(),
    tickets: eventTickets,
  };

  try {
    localStorage.setItem(`${OFFLINE_EVENT_PREFIX}${eventId}`, JSON.stringify(payload));
    return {
      success: true,
      count: eventTickets.length,
      downloadedAt: payload.downloadedAt,
    };
  } catch (err) {
    console.warn('Failed to cache event tickets locally:', err);
    return { success: false, count: 0, downloadedAt: '' };
  }
};

/**
 * Retrieves locally cached tickets for an event
 */
export const getLocalCachedEventTickets = (eventId: string): Ticket[] | null => {
  try {
    const raw = localStorage.getItem(`${OFFLINE_EVENT_PREFIX}${eventId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.tickets || null;
    }
  } catch (e) {
    console.warn('Error reading offline tickets cache:', e);
  }
  return null;
};

/**
 * Queues an offline movement for subsequent sync
 */
export const queueOfflineMovement = (movement: PendingMovementSync): void => {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const queue: PendingMovementSync[] = raw ? JSON.parse(raw) : [];
    queue.push(movement);
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Failed to queue offline movement:', e);
  }
};

/**
 * Retrieves the count of pending offline movements
 */
export const getPendingSyncCount = (): number => {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return 0;
    const queue = JSON.parse(raw);
    return Array.isArray(queue) ? queue.length : 0;
  } catch {
    return 0;
  }
};

/**
 * Syncs pending offline movements with Firestore
 */
export const syncPendingMovementsWithFirestore = async (
  onProgress?: (synced: number, total: number) => void
): Promise<{ success: boolean; synced: number; error?: string }> => {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return { success: true, synced: 0 };
    const queue: PendingMovementSync[] = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return { success: true, synced: 0 };

    let syncedCount = 0;
    const remaining: PendingMovementSync[] = [];

    for (const item of queue) {
      try {
        const ticketRef = doc(db, 'tickets', item.ticketId);
        const logEntry: AttendanceLog = {
          action: item.action,
          timestamp: item.timestamp,
          timeFormatted: item.timeFormatted,
          bouncerName: item.bouncerName,
          bouncerRole: item.bouncerRole,
          notes: 'Synced from offline cache',
        };

        const updateData: Partial<Ticket> = {
          attendanceStatus: item.newStatus,
          lastMovementAt: item.timeFormatted,
          checkedAt: item.timestamp,
          checkedBy: item.bouncerName,
        };

        if (item.action === 'CHECK_IN') {
          updateData.insideSince = item.timeFormatted;
          updateData.status = 'used';
        } else {
          updateData.exitedAt = item.timeFormatted;
        }

        await setDoc(ticketRef, updateData, { merge: true });
        syncedCount++;
        if (onProgress) onProgress(syncedCount, queue.length);
      } catch (err) {
        console.warn('Failed to sync item:', item.ticketId, err);
        remaining.push(item);
      }
    }

    if (remaining.length > 0) {
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(PENDING_SYNC_KEY);
    }

    return { success: true, synced: syncedCount };
  } catch (err: any) {
    console.error('Offline sync error:', err);
    return { success: false, synced: 0, error: err?.message || 'Sync failed' };
  }
};
