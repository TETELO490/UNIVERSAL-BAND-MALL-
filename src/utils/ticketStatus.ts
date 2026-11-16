import { Ticket } from '../types';

export const isTicketWaitingPayment = (
  ticket?: Pick<Ticket, 'paymentStatus'> | null
): boolean => {
  if (!ticket) return false;
  return (
    ticket.paymentStatus === 'WAITING FOR PAYMENT' ||
    ticket.paymentStatus === 'PENDING_PAYMENT'
  );
};

export const isTicketPaid = (
  ticket?: Pick<Ticket, 'paymentStatus'> | null
): boolean => {
  if (!ticket) return false;
  return ticket.paymentStatus === 'PAID' || ticket.paymentStatus === 'VERIFIED';
};

export const parsePriceNumber = (val?: string | number | null): number => {
  if (val === undefined || val === null) return 0;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface ExtractedTymebankSms {
  valid: boolean;
  reason?: string;
  paidAmount: number;
  senderName: string;
  reference: string;
  rawText: string;
}

export const splitBankMessageTerms = (bankMessage: string = 'TymeBank'): string[] => {
  return String(bankMessage || 'TymeBank')
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
};

export const doesSmsMatchBankMessage = (
  smsText: string,
  sender: string = '',
  bankMessage: string = 'TymeBank'
): string | null => {
  const haystack = `${sender || ''} ${smsText || ''}`.toLowerCase();
  const terms = splitBankMessageTerms(bankMessage);
  if (terms.length === 0) return null;
  for (const term of terms) {
    if (haystack.includes(term.toLowerCase())) {
      return term;
    }
  }
  return null;
};

export const extractReferenceByFormat = (
  smsText: string,
  referenceFormat: string = 'UB-'
): string => {
  const prefix = String(referenceFormat || 'UB-').trim();
  if (!prefix) return '';
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|[^A-Za-z0-9])(${escaped}[A-Za-z0-9_-]+)`, 'i');
  const match = String(smsText || '').match(regex);
  return match && match[1] ? match[1].trim() : '';
};

export interface PaymentAlertSmsDetails {
  isPayment: boolean;
  amount: string;
  numericAmount: number;
  senderName: string;
  rawText: string;
}

/**
 * Checks if SMS is from GoTyme Bank / TymeBank AND contains "You received" and "from".
 * Triggers for ANY amount (R1, R5, R50, R100, R1000, etc.).
 */
export const checkIsTymeBankPaymentAlertSms = (
  smsText: string,
  sender: string = ''
): PaymentAlertSmsDetails => {
  const text = String(smsText || '').trim();
  const lowerHaystack = ((sender || '') + ' ' + text).toLowerCase();

  const isTymeBank =
    lowerHaystack.includes('gotyme') ||
    lowerHaystack.includes('tymebank') ||
    lowerHaystack.includes('tyme bank') ||
    lowerHaystack.includes('tyme');

  const hasReceived = lowerHaystack.includes('you received');
  const hasFrom = lowerHaystack.includes('from');

  if (!isTymeBank || !hasReceived || !hasFrom) {
    return {
      isPayment: false,
      amount: '',
      numericAmount: 0,
      senderName: '',
      rawText: text,
    };
  }

  // Extract amount: e.g. "received R1.00" or "received R 1.00" or "R50"
  const amountMatch =
    text.match(/received\s+([A-Za-z$€£]*\s*[\d,]+(?:\.\d+)?)/i) ||
    text.match(/(R\s*[\d,]+(?:\.\d+)?)/i);

  const amountStr = amountMatch ? amountMatch[1].trim() : 'Payment';
  const numMatch = amountStr.match(/[\d,]+(?:\.\d+)?/);
  const numericAmount = numMatch ? parseFloat(numMatch[0].replace(/,/g, '')) || 0 : 0;

  // Extract sender: e.g. "from T. PHOKWANE." or "from T. PHOKWANE. Your available"
  const senderMatch = text.match(
    /\bfrom\s+([^.]+?)(?=\s*(?:\.|\bYour available\b|\bYour balance\b|\bRef\b|\bAvailable\b|$))/i
  );
  const senderName = senderMatch ? senderMatch[1].trim() : 'Customer';

  return {
    isPayment: true,
    amount: amountStr.startsWith('R') || amountStr.startsWith('r') ? amountStr : `R${amountStr}`,
    numericAmount,
    senderName,
    rawText: text,
  };
};

export interface LivePaymentSmsExtraction extends ExtractedTymebankSms {
  matchedBankWord: string;
  formattedOrderRef: string;
}

export const extractLivePaymentSmsDetails = (
  smsText: string,
  sender: string = '',
  options?: { bankMessage?: string; referenceFormat?: string }
): LivePaymentSmsExtraction => {
  const bankMessage = (options?.bankMessage || 'TymeBank').trim() || 'TymeBank';
  const referenceFormat = (options?.referenceFormat || 'UB-').trim() || 'UB-';
  const text = String(smsText || '').trim();

  if (!text) {
    return {
      valid: false,
      reason: 'Ignored: Empty SMS body.',
      paidAmount: 0,
      senderName: '',
      reference: '',
      rawText: text,
      matchedBankWord: '',
      formattedOrderRef: '',
    };
  }

  const matchedBankWord = doesSmsMatchBankMessage(text, sender, bankMessage);
  if (!matchedBankWord) {
    return {
      valid: false,
      reason: `Ignored: SMS does not contain configured Bank Message "${bankMessage}".`,
      paidAmount: 0,
      senderName: '',
      reference: '',
      rawText: text,
      matchedBankWord: '',
      formattedOrderRef: '',
    };
  }

  const amountMatch = text.match(/R\s*([\d,]+\.?\d*)/i);
  const paidAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) || 0 : 0;

  const formattedOrderRef = extractReferenceByFormat(text, referenceFormat);
  const refHeaderMatch =
    text.match(/Reference:\s*([^\r\n.]+)/i) ||
    text.match(/Ref:\s*([^\r\n.]+)/i) ||
    text.match(/Reference\s+([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*)/i);

  const explicitRef = refHeaderMatch ? refHeaderMatch[1].trim() : '';
  const resolvedRef = formattedOrderRef || explicitRef;

  const senderMatch = text.match(
    /\bfrom\s+([A-Za-z][A-Za-z\s.'-]{1,50}?)(?=\s*(?:\.|,|;|\bReference\b|\bRef\b|$))/i
  );
  const senderName = senderMatch ? senderMatch[1].trim() : '';

  if (!resolvedRef) {
    return {
      valid: false,
      reason: `Ignored: SMS matched Bank Message "${matchedBankWord}" but no "${referenceFormat}..." order reference or payment reference was found.`,
      paidAmount,
      senderName,
      reference: '',
      rawText: text,
      matchedBankWord,
      formattedOrderRef: '',
    };
  }

  return {
    valid: true,
    paidAmount,
    senderName,
    reference: resolvedRef,
    rawText: text,
    matchedBankWord,
    formattedOrderRef,
  };
};

export const extractTymebankSmsDetails = (
  smsText: string,
  sender: string = 'TYMEBANK'
): ExtractedTymebankSms => {
  const upperSender = (sender || 'TYMEBANK').toUpperCase();
  if (!upperSender.includes('TYMEBANK') && !upperSender.includes('TYME')) {
    return {
      valid: false,
      reason: `Ignored: SMS sender is not TYMEBANK (Sender was "${sender}"). Ignored all non-TymeBank senders.`,
      paidAmount: 0,
      senderName: '',
      reference: '',
      rawText: smsText,
    };
  }

  const text = smsText.trim();
  if (!text.toLowerCase().includes('you received')) {
    return {
      valid: false,
      reason: 'Ignored: SMS does not contain "You received". Only incoming receipts are processed.',
      paidAmount: 0,
      senderName: '',
      reference: '',
      rawText: text,
    };
  }

  if (!text.includes('R') || !text.toLowerCase().includes('reference')) {
    return {
      valid: false,
      reason: 'Ignored: SMS does not contain "R" amount and "Reference".',
      paidAmount: 0,
      senderName: '',
      reference: '',
      rawText: text,
    };
  }

  const amountMatch = text.match(/R\s*([\d,]+\.?\d*)/i);
  if (!amountMatch) {
    return {
      valid: false,
      reason: 'Could not extract paid amount from TymeBank SMS.',
      paidAmount: 0,
      senderName: '',
      reference: '',
      rawText: text,
    };
  }
  const paidAmount = parseFloat(amountMatch[1].replace(/,/g, ''));

  const refMatch =
    text.match(/Reference:\s*([^\r\n.]+)/i) ||
    text.match(/Ref:\s*([^\r\n.]+)/i) ||
    text.match(/Reference\s+([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*)/i);

  if (!refMatch) {
    return {
      valid: false,
      reason: 'Could not extract Reference from TymeBank SMS.',
      paidAmount,
      senderName: '',
      reference: '',
      rawText: text,
    };
  }
  const reference = refMatch[1].trim();

  // Extract sender name from phrases like "You received R80.00 from Sipho Nkosi. Reference: ..."
  const senderMatch = text.match(
    /\bfrom\s+([A-Za-z][A-Za-z\s.'-]{1,50}?)(?=\s*(?:\.|,|;|\bReference\b|\bRef\b|$))/i
  );
  const senderName = senderMatch ? senderMatch[1].trim() : '';

  return {
    valid: true,
    paidAmount,
    senderName,
    reference,
    rawText: text,
  };
};

const normalizeNameTokens = (name?: string): string[] => {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2);
};

const namesOverlap = (a?: string, b?: string): boolean => {
  const tokensA = normalizeNameTokens(a);
  const tokensB = normalizeNameTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const fullA = tokensA.join(' ');
  const fullB = tokensB.join(' ');
  if (fullA === fullB || fullA.includes(fullB) || fullB.includes(fullA)) return true;
  return tokensA.some((tok) => tokensB.includes(tok));
};

export const TOPUP_PAYSHAP_REFERENCE = 'Universal Band Top Up';

export const getTopUpPayshapReference = (): string => TOPUP_PAYSHAP_REFERENCE;

export const getEventPayshapReference = (eventTitle?: string | null): string => {
  const cleanTitle = String(eventTitle || '').trim();
  return cleanTitle ? `Universal Band - ${cleanTitle}` : 'Universal Band - Event';
};

export const extractEventNameFromPayshapRef = (reference?: string | null): string | null => {
  const clean = String(reference || '').trim();
  const match = clean.match(/^universal\s+band\s*-\s*(.+)$/i);
  return match && match[1] ? match[1].trim() : null;
};

export const isTopUpPayshapReference = (reference?: string | null): boolean => {
  const clean = String(reference || '').trim().toLowerCase();
  if (!clean) return false;
  if (extractEventNameFromPayshapRef(clean)) return false;
  if (clean === TOPUP_PAYSHAP_REFERENCE.toLowerCase()) return true;
  if (clean.includes('universal band top up') || clean.includes('universal band topup')) {
    return true;
  }
  const parts = clean.split(/\s+/);
  const lastUpper = (parts[parts.length - 1] || '').toUpperCase();
  const isTierSuffix =
    lastUpper === 'GENERAL' ||
    lastUpper === 'VIP' ||
    lastUpper === 'KIDS' ||
    lastUpper === 'EARLYBIRD' ||
    lastUpper === 'EARLY' ||
    lastUpper === 'VVIP';
  return !isTierSuffix && parts.length >= 2 && (parts[1] === 'topup' || clean === 'top up' || clean === 'topup');
};

export const findMatchingWaitingTicket = (
  tickets: Ticket[],
  details: { paidAmount: number; senderName: string; reference: string }
): Ticket | null => {
  const waitingTickets = tickets.filter(isTicketWaitingPayment);
  if (waitingTickets.length === 0) return null;

  const refLower = details.reference.trim().toLowerCase();
  const refTokens = normalizeNameTokens(details.reference);
  const refDigits = details.reference.replace(/\D/g, '');
  const refEventTitle = extractEventNameFromPayshapRef(details.reference);

  // Priority 1: Exact payshapReference match + amount matches ticket total (prefer sender match if multiple)
  const exactRefMatches = waitingTickets.filter((t) => {
    const ticketAmount = parsePriceNumber(t.price);
    const amountMatches =
      ticketAmount <= 0 || Math.abs(ticketAmount - details.paidAmount) < 1;
    return (
      amountMatches &&
      Boolean(t.payshapReference) &&
      t.payshapReference!.trim().toLowerCase() === refLower
    );
  });
  if (exactRefMatches.length === 1) {
    return exactRefMatches[0];
  }
  if (exactRefMatches.length > 1) {
    if (details.senderName) {
      const senderExact = exactRefMatches.find((t) =>
        namesOverlap(details.senderName, t.attendeeName || t.customerName || '')
      );
      if (senderExact) return senderExact;
    }
    return exactRefMatches[0];
  }

  // Priority 2: Reference includes ticketId / bandCode + amount matches
  for (const t of waitingTickets) {
    const ticketAmount = parsePriceNumber(t.price);
    const amountMatches =
      ticketAmount <= 0 || Math.abs(ticketAmount - details.paidAmount) < 1;
    const code = (t.ticketId || t.bandCode || t.id || '').toLowerCase();
    if (amountMatches && code && refLower.includes(code)) {
      return t;
    }
  }

  // Priority 2.5: Reference uses "Universal Band - <Event Name>" format + matching event title & amount
  if (refEventTitle) {
    const eventMatches = waitingTickets.filter((t) => {
      const ticketAmount = parsePriceNumber(t.price);
      const amountMatches =
        ticketAmount <= 0 || Math.abs(ticketAmount - details.paidAmount) < 1;
      const evTitle = String(t.eventTitle || t.eventName || '').trim().toLowerCase();
      const refEvLower = refEventTitle.toLowerCase();
      return (
        amountMatches &&
        Boolean(evTitle) &&
        (evTitle === refEvLower || evTitle.includes(refEvLower) || refEvLower.includes(evTitle))
      );
    });
    if (eventMatches.length === 1) {
      return eventMatches[0];
    }
    if (eventMatches.length > 1) {
      if (details.senderName) {
        const senderEvMatch = eventMatches.find((t) =>
          namesOverlap(details.senderName, t.attendeeName || t.customerName || '')
        );
        if (senderEvMatch) return senderEvMatch;
      }
      return eventMatches[0];
    }
  }

  // Priority 3: Amount matches ticket price + senderName, phone digits, or reference overlaps attendee/customer name
  for (const t of waitingTickets) {
    const ticketAmount = parsePriceNumber(t.price);
    if (ticketAmount <= 0 || Math.abs(ticketAmount - details.paidAmount) >= 1) {
      continue;
    }
    const custName = t.attendeeName || t.customerName || '';
    const custPhoneDigits = String(t.attendeePhone || t.customerPhone || '').replace(/\D/g, '');

    const senderMatchesCustomer =
      Boolean(details.senderName) && namesOverlap(details.senderName, custName);
    const refMatchesCustomerName =
      refTokens.length > 0 && namesOverlap(details.reference, custName);
    const refMatchesPhone =
      custPhoneDigits.length >= 6 &&
      refDigits.length >= 6 &&
      (refDigits.includes(custPhoneDigits.slice(-9)) ||
        custPhoneDigits.includes(refDigits.slice(-9)));

    if (senderMatchesCustomer || refMatchesCustomerName || refMatchesPhone) {
      return t;
    }
  }

  return null;
};
