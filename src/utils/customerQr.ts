export const DYNAMIC_QR_INTERVAL_SECONDS = 300;
export const DYNAMIC_QR_INTERVAL_MS = DYNAMIC_QR_INTERVAL_SECONDS * 1000;
export const DYNAMIC_QR_MAX_AGE_MS = 315_000;
export const DYNAMIC_QR_MAX_FUTURE_SKEW_MS = 15_000;

export interface CustomerQrSubject {
  id?: string;
  customerQrId?: string;
  phone?: string;
  email?: string;
  name?: string;
  fullName?: string;
}

export type DynamicQrErrorCode =
  | ''
  | 'EXPIRED_SCREENSHOT'
  | 'INVALID_SIGNATURE'
  | 'STATIC_QR_BLOCKED';

export interface ParsedCustomerQrScan {
  raw: string;
  customerQrId: string;
  userId: string;
  customerId: string;
  phone: string;
  name: string;
  ticketId: string;
  bandCode: string;
  orderId: string;
  reservationId: string;
  code: string;
  pin: string;
  isDynamicQr: boolean;
  isDynamicValid: boolean;
  isLegacyStaticQr: boolean;
  dynamicError: DynamicQrErrorCode;
  dynamicErrorMessage: string;
  iat?: number;
  exp?: number;
  slot?: number;
  nonce?: string;
}

const STORAGE_PREFIX = 'ub_customer_qr_id_';
const QR_SIGNING_SALT = 'UB::DYN_ONE_QR::v2::94f7c2a8e1d63b05';

// Synchronous compact SHA-256 (FIPS 180-4) for offline-safe dynamic QR signatures
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Hex(message: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < message.length; i++) {
    let code = message.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < message.length) {
      const next = message.charCodeAt(++i);
      code = 0x10000 + (((code & 0x3ff) << 10) | (next & 0x3ff));
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }
  const hiBits = Math.floor(bitLen / 0x100000000);
  const loBits = bitLen >>> 0;
  bytes.push(
    (hiBits >>> 24) & 0xff,
    (hiBits >>> 16) & 0xff,
    (hiBits >>> 8) & 0xff,
    hiBits & 0xff,
    (loBits >>> 24) & 0xff,
    (loBits >>> 16) & 0xff,
    (loBits >>> 8) & 0xff,
    loBits & 0xff
  );

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      W[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H)
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
}

export function generateDynamicQrNonce(): string {
  const bytes = new Uint8Array(4);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function computeDynamicQrSignature(params: {
  customerQrId: string;
  userId: string;
  slot: number;
  iat: number;
  nonce: string;
}): string {
  const canonical = [
    QR_SIGNING_SALT,
    params.customerQrId.trim().toUpperCase(),
    params.userId.trim(),
    String(params.slot),
    String(params.iat),
    params.nonce.trim().toUpperCase(),
  ].join('|');
  return sha256Hex(canonical).slice(0, 16);
}

export function getDynamicQrWindowState(
  nowMs: number = Date.now(),
  issuedAtMs?: number
): {
  slot: number;
  secondsRemaining: number;
  formattedRemaining: string;
  progressPct: number;
  isRotationDue: boolean;
} {
  const slot = Math.floor(nowMs / DYNAMIC_QR_INTERVAL_MS);
  const elapsed =
    typeof issuedAtMs === 'number' && Number.isFinite(issuedAtMs)
      ? Math.max(0, nowMs - issuedAtMs)
      : nowMs % DYNAMIC_QR_INTERVAL_MS;
  const remainingMs = Math.max(0, DYNAMIC_QR_INTERVAL_MS - elapsed);
  const secondsRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const formattedRemaining = `${mins}:${String(secs).padStart(2, '0')}`;
  const progressPct = Math.max(0, Math.min(100, (remainingMs / DYNAMIC_QR_INTERVAL_MS) * 100));
  const isRotationDue =
    typeof issuedAtMs === 'number' && Number.isFinite(issuedAtMs)
      ? elapsed >= DYNAMIC_QR_INTERVAL_MS
      : false;
  return { slot, secondsRemaining, formattedRemaining, progressPct, isRotationDue };
}

export function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}

/**
 * Resolves ONE permanent customerQrId for a registered user.
 * Never regenerates or duplicates if an existing ID is already assigned.
 */
export function resolveCustomerQrId(userId?: string, existingQrId?: string): string {
  const cleanExisting = typeof existingQrId === 'string' ? existingQrId.trim() : '';
  if (cleanExisting && !cleanExisting.toUpperCase().startsWith('UBQR-GUEST')) {
    if (userId && userId !== 'guest_user' && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${userId}`, cleanExisting);
      } catch {}
    }
    return cleanExisting;
  }

  const cleanUid = typeof userId === 'string' ? userId.trim() : '';
  if (!cleanUid || cleanUid === 'guest_user') {
    return '';
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`${STORAGE_PREFIX}${cleanUid}`);
      if (cached && cached.trim() && !cached.toUpperCase().startsWith('UBQR-GUEST')) {
        return cached.trim();
      }
    } catch {}
  }

  const normalized = cleanUid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const deterministicId = `UBQR-${normalized || 'USER'}`;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${cleanUid}`, deterministicId);
    } catch {}
  }

  return deterministicId;
}

/**
 * Encodes the customer's dynamic rotating anti-screenshot ONE QR payload.
 * Rotates automatically every 15s and expires after 30s so screenshots cannot be reused.
 */
export function encodeCustomerOneQr(
  user: CustomerQrSubject | null | undefined,
  nowMs: number = Date.now(),
  nonceOverride?: string
): string {
  const customerQrId = resolveCustomerQrId(user?.id, user?.customerQrId);
  const userId = (user?.id || '').trim();
  const slot = Math.floor(nowMs / DYNAMIC_QR_INTERVAL_MS);
  const iat = nowMs;
  const exp = nowMs + DYNAMIC_QR_MAX_AGE_MS;
  const nonce = (nonceOverride || generateDynamicQrNonce()).trim().toUpperCase();
  const sig = computeDynamicQrSignature({
    customerQrId,
    userId,
    slot,
    iat,
    nonce,
  });

  return JSON.stringify({
    app: 'UniversalBand',
    type: 'CUSTOMER_ONE_QR',
    v: 2,
    customerQrId,
    userId,
    phone: (user?.phone || '').trim(),
    name: (user?.fullName || user?.name || 'Customer').trim(),
    slot,
    iat,
    exp,
    nonce,
    sig,
  });
}

function getDynamicErrorMessage(code: DynamicQrErrorCode): string {
  if (code === 'EXPIRED_SCREENSHOT') {
    return 'QR EXPIRED / SCREENSHOT BLOCKED — Dynamic QR expired after 5 minutes. Ask customer to open their live Profile QR.';
  }
  if (code === 'INVALID_SIGNATURE') {
    return 'INVALID / TAMPERED QR — Security signature failed. Ask customer to open their live Profile QR.';
  }
  if (code === 'STATIC_QR_BLOCKED') {
    return 'STATIC QR BLOCKED — Screenshots and static QR copies are disabled. Ask customer to show live Profile QR.';
  }
  return '';
}

/**
 * Parses and validates any scanned string:
 * - Dynamic Customer ONE QR v2 JSON (validates signature + 30s expiry window)
 * - Blocks expired screenshots, tampered dynamic QR JSON, static CUSTOMER_ONE_QR JSON, and raw UBQR- codes
 * - Still supports legitimate fallback manual lookups (phone number, ticket ID, band code, 6-digit PIN)
 */
export function parseCustomerQrScan(
  rawText: string,
  nowMs: number = Date.now()
): ParsedCustomerQrScan {
  const raw = typeof rawText === 'string' ? rawText.trim() : '';
  const result: ParsedCustomerQrScan = {
    raw,
    customerQrId: '',
    userId: '',
    customerId: '',
    phone: '',
    name: '',
    ticketId: '',
    bandCode: '',
    orderId: '',
    reservationId: '',
    code: '',
    pin: '',
    isDynamicQr: false,
    isDynamicValid: false,
    isLegacyStaticQr: false,
    dynamicError: '',
    dynamicErrorMessage: '',
  };

  if (!raw) return result;

  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const data = JSON.parse(raw);
      const codeStr = typeof data.code === 'string' ? data.code.trim() : '';
      const parsedCustQrId = String(
        data.customerQrId ||
          data.qrId ||
          (codeStr.toUpperCase().startsWith('UBQR-') ? codeStr : '')
      ).trim();
      const parsedUserId = String(data.userId || data.uid || '').trim();
      const parsedCustomerId = String(data.customerId || data.userId || data.uid || '').trim();
      const parsedPhone = String(data.phone || data.customerPhone || data.attendeePhone || '').trim();
      const parsedName = String(data.name || data.fullName || data.customerName || '').trim();

      result.ticketId = String(data.ticketId || data.id || '').trim();
      result.bandCode = String(data.bandCode || '').trim();
      result.orderId = String(data.orderId || '').trim();
      result.reservationId = String(data.reservationId || '').trim();
      result.code = codeStr;
      result.pin = String(data.pin || data.pickupPin || data.deliveryPin || '').trim();

      const claimsCustomerOneQr =
        data.type === 'CUSTOMER_ONE_QR' ||
        data.v === 2 ||
        Boolean(parsedCustQrId) ||
        Boolean(data.sig);

      // Leave non-customer driver/pickup QRs untouched
      if (!claimsCustomerOneQr || data.type === 'DRIVER_STORE_PICKUP') {
        result.customerQrId = parsedCustQrId;
        result.userId = parsedUserId;
        result.customerId = parsedCustomerId;
        result.phone = parsedPhone;
        result.name = parsedName;
        return result;
      }

      const version = Number(data.v || 0);
      const slot = Number(data.slot);
      const iat = Number(data.iat);
      const exp = Number(data.exp);
      const nonce = typeof data.nonce === 'string' ? data.nonce.trim() : '';
      const sig = typeof data.sig === 'string' ? data.sig.trim().toUpperCase() : '';

      // Old static CUSTOMER_ONE_QR JSON without dynamic v2 fields
      if (version !== 2 || !sig || !nonce || !Number.isFinite(iat) || !Number.isFinite(slot)) {
        result.isLegacyStaticQr = true;
        result.dynamicError = 'STATIC_QR_BLOCKED';
        result.dynamicErrorMessage = getDynamicErrorMessage('STATIC_QR_BLOCKED');
        return result;
      }

      result.isDynamicQr = true;
      result.iat = iat;
      result.exp = Number.isFinite(exp) ? exp : iat + DYNAMIC_QR_MAX_AGE_MS;
      result.slot = slot;
      result.nonce = nonce;

      // 1. Verify HMAC/SHA-256 signature
      const expectedSig = computeDynamicQrSignature({
        customerQrId: parsedCustQrId,
        userId: parsedUserId,
        slot,
        iat,
        nonce,
      });

      if (sig !== expectedSig) {
        result.dynamicError = 'INVALID_SIGNATURE';
        result.dynamicErrorMessage = getDynamicErrorMessage('INVALID_SIGNATURE');
        return result;
      }

      // 2. Verify freshness (blocks screenshots > 30s old and rejects future-forged timestamps)
      const ageMs = nowMs - iat;
      const effectiveExp = Math.min(
        iat + DYNAMIC_QR_MAX_AGE_MS,
        Number.isFinite(exp) ? exp : iat + DYNAMIC_QR_MAX_AGE_MS
      );

      if (ageMs < -DYNAMIC_QR_MAX_FUTURE_SKEW_MS) {
        result.dynamicError = 'INVALID_SIGNATURE';
        result.dynamicErrorMessage = getDynamicErrorMessage('INVALID_SIGNATURE');
        return result;
      }

      if (nowMs > effectiveExp || ageMs > DYNAMIC_QR_MAX_AGE_MS) {
        result.dynamicError = 'EXPIRED_SCREENSHOT';
        result.dynamicErrorMessage = getDynamicErrorMessage('EXPIRED_SCREENSHOT');
        return result;
      }

      // Valid live Dynamic ONE QR
      result.isDynamicValid = true;
      result.customerQrId = parsedCustQrId;
      result.userId = parsedUserId;
      result.customerId = parsedCustomerId;
      result.phone = parsedPhone;
      result.name = parsedName;
      return result;
    } catch {}
  }

  // Raw bare UBQR-... string scanned as a static QR -> block screenshot/static reuse
  if (raw.toUpperCase().startsWith('UBQR-')) {
    result.isLegacyStaticQr = true;
    result.dynamicError = 'STATIC_QR_BLOCKED';
    result.dynamicErrorMessage = getDynamicErrorMessage('STATIC_QR_BLOCKED');
    return result;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      const qrParam = url.searchParams.get('qr') || url.searchParams.get('customerQrId');
      if (qrParam) {
        result.isLegacyStaticQr = true;
        result.dynamicError = 'STATIC_QR_BLOCKED';
        result.dynamicErrorMessage = getDynamicErrorMessage('STATIC_QR_BLOCKED');
        return result;
      }
      const idMatch = url.pathname.match(/\/id\/([^/?#]+)/);
      if (idMatch?.[1]) {
        result.customerId = decodeURIComponent(idMatch[1]);
        result.userId = result.customerId;
      }
    } catch {}
  }

  return result;
}

export function doesTicketMatchCustomerQr(
  ticket: {
    id?: string;
    ticketId?: string;
    bandCode?: string;
    qrCode?: string;
    customerQrId?: string;
    userId?: string;
    user_id?: string;
    customerPhone?: string;
    attendeePhone?: string;
  },
  scan: ParsedCustomerQrScan
): boolean {
  if (!ticket || scan.dynamicError) return false;
  const rawUpper = scan.raw.toUpperCase();

  if (
    scan.customerQrId &&
    ticket.customerQrId &&
    ticket.customerQrId.toUpperCase() === scan.customerQrId.toUpperCase()
  ) {
    return true;
  }

  const scanUid = scan.userId || scan.customerId;
  if (scanUid && (ticket.userId === scanUid || ticket.user_id === scanUid)) {
    return true;
  }

  const scanPhoneNorm = normalizePhoneDigits(scan.phone || scan.raw);
  if (scanPhoneNorm.length >= 9) {
    const tPhone = normalizePhoneDigits(ticket.customerPhone || ticket.attendeePhone);
    if (tPhone && tPhone === scanPhoneNorm) {
      return true;
    }
  }

  const candidates = [
    ticket.id,
    ticket.ticketId,
    ticket.bandCode,
    ticket.qrCode,
    ticket.customerQrId,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase());

  const scanKeys = [
    scan.ticketId,
    scan.bandCode,
    scan.code,
    scan.customerQrId,
    rawUpper,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase());

  return candidates.some((c) => scanKeys.includes(c));
}

export function doesOrderMatchCustomerQr(
  order: {
    id?: string;
    orderNumber?: string;
    storeId?: string;
    customerQrId?: string;
    customerId?: string;
    customerPhone?: string;
    deliveryPhone?: string;
    collectionCode?: string;
    pickupPin?: string;
    deliveryPin?: string;
    pickupQrCode?: string;
    deliveryQrCode?: string;
  },
  scan: ParsedCustomerQrScan,
  storeIdFilter?: string
): boolean {
  if (!order || scan.dynamicError) return false;
  if (storeIdFilter && order.storeId !== storeIdFilter) return false;

  if (
    scan.customerQrId &&
    order.customerQrId &&
    order.customerQrId.toUpperCase() === scan.customerQrId.toUpperCase()
  ) {
    return true;
  }

  const scanUid = scan.userId || scan.customerId;
  if (scanUid && order.customerId === scanUid) {
    return true;
  }

  const scanPhoneNorm = normalizePhoneDigits(scan.phone || scan.raw);
  if (scanPhoneNorm.length >= 9) {
    const oPhone1 = normalizePhoneDigits(order.customerPhone);
    const oPhone2 = normalizePhoneDigits(order.deliveryPhone);
    if ((oPhone1 && oPhone1 === scanPhoneNorm) || (oPhone2 && oPhone2 === scanPhoneNorm)) {
      return true;
    }
  }

  if (/^\d{4}$/.test(scan.raw)) {
    const d1 = (order.customerPhone || '').replace(/\D/g, '').slice(-4);
    const d2 = (order.deliveryPhone || '').replace(/\D/g, '').slice(-4);
    if (d1 === scan.raw || d2 === scan.raw) return true;
  }

  const candidates = [
    order.id,
    order.orderNumber,
    order.collectionCode,
    order.pickupPin,
    order.deliveryPin,
    order.pickupQrCode,
    order.deliveryQrCode,
    order.customerQrId,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase());

  const scanKeys = [
    scan.orderId,
    scan.pin,
    scan.code,
    scan.customerQrId,
    scan.raw,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase());

  return candidates.some((c) => scanKeys.includes(c));
}

export function doesReservationMatchCustomerQr(
  reservation: {
    id?: string;
    customerQrId?: string;
    walletId?: string;
    customerId?: string;
    customerPhone?: string;
    collectionCode?: string;
  },
  scan: ParsedCustomerQrScan
): boolean {
  if (!reservation || scan.dynamicError) return false;

  if (
    scan.customerQrId &&
    reservation.customerQrId &&
    reservation.customerQrId.toUpperCase() === scan.customerQrId.toUpperCase()
  ) {
    return true;
  }

  const scanUid = scan.userId || scan.customerId;
  if (
    scanUid &&
    (reservation.walletId === scanUid || reservation.customerId === scanUid)
  ) {
    return true;
  }

  const scanPhoneNorm = normalizePhoneDigits(scan.phone || scan.raw);
  if (scanPhoneNorm.length >= 9) {
    const rPhone = normalizePhoneDigits(reservation.customerPhone);
    if (rPhone && rPhone === scanPhoneNorm) {
      return true;
    }
  }

  const candidates = [reservation.id, reservation.collectionCode, reservation.customerQrId]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase());
  const scanKeys = [scan.reservationId, scan.code, scan.customerQrId, scan.raw]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase());

  return candidates.some((c) => scanKeys.includes(c));
}
