import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { BinnedItem, Ticket, ReservationDoc } from '../types';
import { moveTicketToBill } from './billingService';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Checks if a given event date string or timestamp has reached or passed 00:00 midnight following the event day.
 */
export function isEventDayPassed(eventDateStr: string | any): boolean {
  if (!eventDateStr) return false;

  let eventDate: Date;
  if (typeof eventDateStr === 'string') {
    eventDate = new Date(eventDateStr);
  } else if (eventDateStr.toDate) {
    eventDate = eventDateStr.toDate();
  } else {
    eventDate = new Date(eventDateStr);
  }

  if (isNaN(eventDate.getTime())) {
    return false;
  }

  // 00:00:00 of the day AFTER the event day (i.e. Midnight concluding the event)
  const eventConcludedMidnight = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate() + 1,
    0,
    0,
    0
  );

  return Date.now() >= eventConcludedMidnight.getTime();
}

/**
 * Sweeps all tickets and reservations:
 * Any USED tickets whose event day has reached 00:00 midnight are moved to 'Bill' (transactions/EveryCent).
 * Any UNUSED tickets whose event day has reached 00:00 midnight are moved to 'binned_items'.
 * Any binned items older than 60 days are permanently purged.
 */
export async function runAutoBinCheck(): Promise<{
  binnedTicketsCount: number;
  binnedReservationsCount: number;
  purgedItemsCount: number;
}> {
  let binnedTicketsCount = 0;
  let binnedReservationsCount = 0;
  let purgedItemsCount = 0;

  try {
    // 1. Process Tickets
    const ticketsSnap = await getDocs(collection(db, 'tickets'));
    for (const docSnap of ticketsSnap.docs) {
      const ticket = { id: docSnap.id, ...docSnap.data() } as Ticket;

      // Skip already binned or already billed tickets
      if (
        ticket.status === 'expired' ||
        ticket.status === 'billed' ||
        (ticket.status as string) === 'binned' ||
        ticket.isBilled
      ) {
        continue;
      }

      const shouldProcess = isEventDayPassed(ticket.eventDate || ticket.createdAt);
      if (shouldProcess) {
        // RULE FROM OWNER: After event is over & hits midnight, all USED tickets MUST go to bill!
        const isUsed = ticket.status === 'used' || (ticket.status as string) === 'Used';
        if (isUsed) {
          await moveTicketToBill(ticket);
          continue;
        }

        // Unused tickets that expired without gate check-in go to the bin
        const binId = `bin-ticket-${ticket.id}`;
        const deleteAtDate = new Date(Date.now() + SIXTY_DAYS_MS);

        const binnedRecord: BinnedItem = {
          id: binId,
          originalCollection: 'tickets',
          originalId: ticket.id,
          itemType: 'ticket',
          title: ticket.eventTitle || ticket.eventName || 'Event Ticket',
          storeId: ticket.storeId,
          storeName: ticket.storeName,
          eventId: ticket.eventId,
          eventName: ticket.eventTitle || ticket.eventName,
          eventDate: ticket.eventDate,
          customerName: ticket.attendeeName || ticket.customerName,
          attendeePhone: ticket.attendeePhone || ticket.customerPhone,
          amount: ticket.price,
          binnedAt: serverTimestamp(),
          binnedReason: 'Auto-binned at 00:00 midnight on event day (unused pass)',
          deleteAt: deleteAtDate.toISOString(),
          daysRemaining: 60,
          originalData: ticket,
          status: 'binned',
        };

        // Write to binned_items collection
        await setDoc(doc(db, 'binned_items', binId), binnedRecord);

        // Mark ticket status as expired
        await updateDoc(doc(db, 'tickets', ticket.id), {
          status: 'expired',
          isBinned: true,
          binnedAt: serverTimestamp(),
        });

        binnedTicketsCount++;
      }
    }

    // 2. Process Reservations (Food & Alcohol)
    const resSnap = await getDocs(collection(db, 'reservations'));
    for (const docSnap of resSnap.docs) {
      const res = { id: docSnap.id, ...docSnap.data() } as ReservationDoc & { id: string };

      if (res.status === 'cancelled' || res.status === 'refunded' || (res.status as string) === 'binned') {
        continue;
      }

      // Check if reservation is tied to an event day or creation date that passed midnight
      const refDate = res.eventDate || res.paidAt;
      const shouldBin = isEventDayPassed(refDate);

      if (shouldBin) {
        const binId = `bin-res-${res.id}`;
        const deleteAtDate = new Date(Date.now() + SIXTY_DAYS_MS);

        const binnedRecord: BinnedItem = {
          id: binId,
          originalCollection: 'reservations',
          originalId: res.id,
          itemType: res.isAlcohol ? 'alcohol' : res.category === 'drink' ? 'drink' : 'food',
          title: res.itemName || 'Food/Drink Item',
          storeId: res.storeId,
          storeName: res.storeName,
          customerName: res.customerName || res.beneficiaryName || 'Customer',
          customerIdNumber: res.customerId || res.walletId,
          amount: res.total || res.price || 0,
          binnedAt: serverTimestamp(),
          binnedReason: 'Auto-binned at 00:00 midnight on event day',
          deleteAt: deleteAtDate.toISOString(),
          daysRemaining: 60,
          originalData: res,
          status: 'binned',
        };

        await setDoc(doc(db, 'binned_items', binId), binnedRecord);

        // Mark reservation as binned
        await updateDoc(doc(db, 'reservations', res.id), {
          status: 'cancelled',
          isBinned: true,
          binnedAt: serverTimestamp(),
        });

        binnedReservationsCount++;
      }
    }

    // 3. Auto-Purge items older than 60 days
    const binSnap = await getDocs(collection(db, 'binned_items'));
    const now = Date.now();
    for (const binDoc of binSnap.docs) {
      const data = binDoc.data() as BinnedItem;
      const deleteAtTime = new Date(data.deleteAt).getTime();
      if (!isNaN(deleteAtTime) && now >= deleteAtTime) {
        await deleteDoc(doc(db, 'binned_items', binDoc.id));
        purgedItemsCount++;
      }
    }
  } catch (err) {
    console.warn('Auto-bin execution error:', err);
  }

  return { binnedTicketsCount, binnedReservationsCount, purgedItemsCount };
}

/**
 * Restores a binned item back to active status
 */
export async function restoreBinnedItem(binnedItem: BinnedItem): Promise<boolean> {
  try {
    if (binnedItem.originalCollection === 'tickets') {
      await updateDoc(doc(db, 'tickets', binnedItem.originalId), {
        status: 'valid',
        isBinned: false,
      });
    } else if (binnedItem.originalCollection === 'reservations') {
      await updateDoc(doc(db, 'reservations', binnedItem.originalId), {
        status: 'paid',
        isBinned: false,
      });
    }

    // Remove from binned_items
    await deleteDoc(doc(db, 'binned_items', binnedItem.id));
    return true;
  } catch (err) {
    console.error('Error restoring binned item:', err);
    return false;
  }
}

/**
 * Permanently deletes a single item from the bin
 */
export async function permanentlyDeleteBinnedItem(binId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'binned_items', binId));
    return true;
  } catch (err) {
    console.error('Error deleting binned item:', err);
    return false;
  }
}

/**
 * Empties all binned items permanently
 */
export async function emptyRecycleBin(items: BinnedItem[]): Promise<boolean> {
  try {
    for (const item of items) {
      await deleteDoc(doc(db, 'binned_items', item.id));
    }
    return true;
  } catch (err) {
    console.error('Error emptying recycle bin:', err);
    return false;
  }
}
