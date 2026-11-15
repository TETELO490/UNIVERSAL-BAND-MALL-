import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Ticket, SpendingTransaction } from '../types';

/**
 * Checks if an event is concluded and midnight (00:00 after event day) has arrived.
 */
export function isEventConcluded(eventDateStr: string | any): boolean {
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

  // 00:00:00 of the day AFTER the event day (i.e. Midnight when event has concluded)
  const midnightAfterEvent = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate() + 1,
    0,
    0,
    0
  );

  return Date.now() >= midnightAfterEvent.getTime();
}

/**
 * Moves a used ticket to the official EveryCent Bill statement.
 */
export async function moveTicketToBill(ticket: Ticket, fallbackWalletId: string = ''): Promise<Ticket> {
  const billedTimestamp = new Date().toISOString();
  const updatedTicket: Ticket = {
    ...ticket,
    status: 'billed',
    isBilled: true,
    billedAt: billedTimestamp,
    isEventOver: true,
  };

  const targetUserId = ticket.attendeePhone || ticket.customerPhone || ticket.userId || fallbackWalletId;
  const priceNum = parseFloat(String(ticket.price || '0').replace(/[^\d.]/g, '')) || 0;
  const transactionId = `tx-ticket-bill-${ticket.id}`;

  try {
    // 1. Update ticket in Firestore
    await updateDoc(doc(db, 'tickets', ticket.id), {
      status: 'billed',
      isBilled: true,
      billedAt: billedTimestamp,
      isEventOver: true,
    });

    // 2. Write billing ledger entry to transactions collection
    const billRecord: Partial<SpendingTransaction> & {
      ticketId: string;
      isSettledBill: boolean;
      eventDate?: string;
    } = {
      id: transactionId,
      userId: targetUserId,
      customerId: ticket.attendeePhone || ticket.customerPhone,
      customerName: ticket.attendeeName || ticket.customerName,
      type: 'ticket',
      description: `Concluded Event Pass: ${ticket.eventTitle || ticket.eventName}`,
      amount: priceNum,
      storeId: ticket.storeId,
      storeName: ticket.storeName,
      paymentMethod: 'Universal Band Wristband',
      status: 'Billed',
      reference: ticket.bandCode || ticket.ticketId,
      createdAt: billedTimestamp,
      ticketId: ticket.id,
      isSettledBill: true,
      eventDate: ticket.eventDate,
    };

    await setDoc(doc(db, 'transactions', transactionId), billRecord, { merge: true });
  } catch (err) {
    console.warn('Could not persist billed ticket to Firestore:', err);
  }

  return updatedTicket;
}

/**
 * Sweeps all used tickets that have passed event midnight and moves them to Bill.
 */
export async function sweepConcludedTicketsToBill(
  currentTickets: Ticket[],
  fallbackWalletId: string = ''
): Promise<{ billedCount: number; updatedTickets: Ticket[] }> {
  let billedCount = 0;
  const updatedList: Ticket[] = [];

  for (const t of currentTickets) {
    // If ticket was used and event is over (or already marked billed)
    const isUsed = t.status === 'used' || (t.status as string) === 'Used';
    const isConcluded = isEventConcluded(t.eventDate || t.createdAt);

    if (isUsed && (isConcluded || t.isBilled)) {
      if (!t.isBilled) {
        const billed = await moveTicketToBill(t, fallbackWalletId);
        updatedList.push(billed);
        billedCount++;
      } else {
        updatedList.push(t);
      }
    } else {
      updatedList.push(t);
    }
  }

  return { billedCount, updatedTickets: updatedList };
}
