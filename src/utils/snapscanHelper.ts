import { arrayUnion, collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface SnapScanOrderRecord {
  id: string;
  orderNumber: string;
  sequenceNumber: number;
  totalRands: number;
  pressedPayTime: string;
  pressedPayLabel: string;
  attempts?: string[];
  status: 'Waiting for payment' | 'Paid';
  storeId?: string;
  storeName?: string;
  customerName?: string;
  customerPhone?: string;
  createdAt: string;
  paidAt?: string;
}

let cachedPublicSnapCode: string | null = null;

/**
 * Clears the cached SnapCode (called when Admin saves new SnapScan settings).
 */
export function setCachedPublicSnapCode(snapCode: string): void {
  cachedPublicSnapCode = snapCode.trim();
}

/**
 * Fetches ONLY the public Online Merchant ID / SnapCode saved by Admin Settings
 * from Firestore (`app_settings/snapscan_public`). Never reads private API keys.
 */
export async function getPublicSnapCode(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedPublicSnapCode) {
    return cachedPublicSnapCode;
  }
  try {
    const snap = await getDoc(doc(db, 'app_settings', 'snapscan_public'));
    if (snap.exists()) {
      const code = String(snap.data()?.snapCode || '').trim();
      if (code) {
        cachedPublicSnapCode = code;
        return code;
      }
    }
  } catch (e) {
    console.warn('Could not load public SnapCode from Firestore:', e);
  }
  return cachedPublicSnapCode || '';
}

/**
 * Formats current local time as HH:MM (e.g. "14:31").
 */
export function formatTimeHHMM(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Generates a unique Order ID for SnapScan payments.
 */
export function generateSnapScanOrderId(prefix = 'UB'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Converts Rands to cents (Total x 100) and builds the strict SnapScan payment URL
 * using the Online Merchant ID / SnapCode saved in Admin Settings.
 * Example: R18 -> amount=1800
 */
export function buildSnapScanUrl(
  amountInRands: number,
  orderId: string,
  snapCode: string
): string {
  const cleanCode = snapCode.trim();
  const safeRands = Number.isFinite(amountInRands) && amountInRands > 0 ? amountInRands : 0;
  const amountInCents = Math.round(safeRands * 100);
  return `https://pos.snapscan.io/qr/${encodeURIComponent(cleanCode)}?origin=snapstore&source=link&strict=true&amount=${amountInCents}&id=${encodeURIComponent(orderId)}`;
}

/**
 * Opens the SnapScan link in the browser / SnapScan app without using window.open.
 */
export function openSnapScanLink(url: string): void {
  if (typeof document === 'undefined' || !url) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {}
  }, 250);
}

/**
 * Allocates the next sequential ORDER #001, #002... and saves the SnapScan order
 * with exact "Pressed PAY at HH:MM" time, attempts array, and status "Waiting for payment".
 */
export async function recordSnapScanOrder(params: {
  totalRands: number;
  storeId?: string;
  storeName?: string;
  customerName?: string;
  customerPhone?: string;
}): Promise<SnapScanOrderRecord> {
  const now = new Date();
  const hhmm = formatTimeHHMM(now);
  const pressedPayLabel = `Pressed PAY at ${hhmm}`;

  let nextSeq = 1;
  try {
    const snap = await getDocs(collection(db, 'snapscan_orders'));
    let maxSeq = 0;
    snap.forEach((d) => {
      const data = d.data() as any;
      const seq = Number(data?.sequenceNumber || 0);
      if (seq > maxSeq) maxSeq = seq;
    });
    nextSeq = maxSeq > 0 ? maxSeq + 1 : snap.size + 1;
  } catch {
    const localSeq = Number(localStorage.getItem('ub_snapscan_seq') || '0') + 1;
    nextSeq = localSeq;
  }

  try {
    localStorage.setItem('ub_snapscan_seq', String(nextSeq));
  } catch {}

  const padded = String(nextSeq).padStart(3, '0');
  const orderNumber = `ORDER #${padded}`;
  const docId = `snap_${padded}_${Date.now()}`;

  const record: SnapScanOrderRecord = {
    id: docId,
    orderNumber,
    sequenceNumber: nextSeq,
    totalRands: Number(params.totalRands) || 0,
    pressedPayTime: hhmm,
    pressedPayLabel,
    attempts: [hhmm],
    status: 'Waiting for payment',
    storeId: params.storeId || '',
    storeName: params.storeName || '',
    customerName: params.customerName || 'Customer',
    customerPhone: params.customerPhone || '',
    createdAt: now.toISOString(),
  };

  try {
    await setDoc(doc(db, 'snapscan_orders', docId), record, { merge: true });
  } catch (e) {
    console.warn('Could not save snapscan_orders record to Firestore:', e);
  }

  return record;
}

/**
 * Records a retry ("PAY AGAIN") attempt timestamp on an existing SnapScan order.
 */
export async function recordSnapScanRetryAttempt(orderDocId: string): Promise<string> {
  const hhmm = formatTimeHHMM(new Date());
  try {
    await updateDoc(doc(db, 'snapscan_orders', orderDocId), {
      pressedPayTime: hhmm,
      pressedPayLabel: `Pressed PAY at ${hhmm}`,
      attempts: arrayUnion(hhmm),
    });
  } catch (e) {
    console.warn('Could not record SnapScan retry attempt:', e);
  }
  return hhmm;
}

/**
 * Toggles a SnapScan order status between "Waiting for payment" and "Paid".
 */
export async function toggleSnapScanOrderPaid(
  orderId: string,
  markPaid: boolean
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'snapscan_orders', orderId), {
      status: markPaid ? 'Paid' : 'Waiting for payment',
      paidAt: markPaid ? new Date().toISOString() : '',
    });
    return true;
  } catch (e) {
    console.warn('Could not update snapscan_orders status:', e);
    return false;
  }
}
