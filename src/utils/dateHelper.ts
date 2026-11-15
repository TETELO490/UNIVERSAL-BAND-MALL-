const SHORT_MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Generates a dynamic future event date string formatted as "DD MMM YYYY, HH:mm"
 * so new events never accidentally default to a hardcoded past date.
 */
export function getDefaultFutureEventDate(daysAhead: number = 1, hour: number = 18, minute: number = 0): string {
  const target = new Date();
  target.setDate(target.getDate() + daysAhead);
  const dd = String(target.getDate()).padStart(2, '0');
  const mmm = SHORT_MONTH_NAMES[target.getMonth()];
  const yyyy = target.getFullYear();
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${dd} ${mmm} ${yyyy}, ${hh}:${mm}`;
}

/**
 * Explicitly parses "DD MMM YYYY(, HH:mm)" or "MMM DD, YYYY(, HH:mm)" strings
 * without relying on locale/WebView-specific Date constructor quirks.
 */
function parseNamedMonthDate(raw: string, fallbackYear: number): Date | null {
  const cleaned = raw.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*/i, '').trim();

  // Match "24 Oct 2026, 18:00" or "24 Oct 2026 18:00" or "24 Oct 2026" or "24 Oct"
  const dmyMatch = cleaned.match(
    /^(\d{1,2})\s+([a-zA-Z]{3,9})(?:\s+(\d{4}))?(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?$/i
  );
  if (dmyMatch) {
    const [, dayStr, monStr, yearStr, hhStr, mmStr, ssStr, ampm] = dmyMatch;
    const monIdx = SHORT_MONTH_MAP[monStr.toLowerCase()];
    if (monIdx !== undefined) {
      const year = yearStr ? Number(yearStr) : fallbackYear;
      const day = Number(dayStr);
      let hh = hhStr !== undefined ? Number(hhStr) : 0;
      const mm = mmStr !== undefined ? Number(mmStr) : 0;
      const ss = ssStr !== undefined ? Number(ssStr) : 0;
      if (ampm) {
        const lowerAmPm = ampm.toLowerCase();
        if (lowerAmPm === 'pm' && hh < 12) hh += 12;
        if (lowerAmPm === 'am' && hh === 12) hh = 0;
      }
      const d = new Date(year, monIdx, day, hh, mm, ss, 0);
      if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === monIdx) {
        return d;
      }
    }
  }

  return null;
}

/**
 * Helper to normalize date strings (e.g., "2026-10-04", "Sat, 03 Oct", "03 Oct 2026, 18:00", "2026-10-04T18:00")
 * to compare whether two events are scheduled on the same calendar day.
 */
export function normalizeDateKey(dateStr: string): string {
  if (!dateStr) return '';

  const parsed = parseEventDate(dateStr);
  if (parsed instanceof Date && !isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Fallback for custom non-calendar strings
  return dateStr
    .toLowerCase()
    .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Check if two dates refer to the exact same calendar day
 */
export function isSameDay(date1: string, date2: string): boolean {
  if (!date1 || !date2) return false;
  const k1 = normalizeDateKey(date1);
  const k2 = normalizeDateKey(date2);
  return k1 === k2 && k1.length > 0;
}

export interface EventArrivalCheckResult {
  arrived: boolean;
  message: string;
  eventDateDisplay: string;
  isFuture: boolean;
}

/**
 * Checks whether an event's date has arrived (today or already in the past).
 * If the event date has NOT yet arrived (scheduled for a future day):
 * returns arrived: false and an informative message.
 */
export function hasEventDateArrived(
  eventDateInput: string | any,
  currentDate: Date = new Date()
): EventArrivalCheckResult {
  if (!eventDateInput) {
    return {
      arrived: true,
      isFuture: false,
      message: 'Event date verified.',
      eventDateDisplay: 'Current',
    };
  }

  // Start of today's calendar day at 00:00:00 local time
  const todayStart = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
    0,
    0,
    0,
    0
  );

  let rawStr = '';
  let parsedDate: Date | null = null;

  if (typeof eventDateInput === 'string') {
    rawStr = eventDateInput.trim();
    const lower = rawStr.toLowerCase();

    // Check special relative keywords
    if (lower.includes('today') || lower.includes('daily') || lower.includes('now') || lower.includes('happy hour')) {
      return {
        arrived: true,
        isFuture: false,
        message: 'Event is today / active.',
        eventDateDisplay: rawStr,
      };
    }

    if (lower.startsWith('in ') && (lower.includes('day') || lower.includes('week') || lower.includes('month'))) {
      return {
        arrived: false,
        isFuture: true,
        message: `The date for this event has not yet arrived (${rawStr}).`,
        eventDateDisplay: rawStr,
      };
    }

    const explicit = parseNamedMonthDate(rawStr, currentDate.getFullYear());
    if (explicit) {
      parsedDate = explicit;
    } else {
      const d = new Date(rawStr);
      if (!isNaN(d.getTime())) {
        parsedDate = d;
      } else {
        const d2 = new Date(`${rawStr} ${currentDate.getFullYear()}`);
        if (!isNaN(d2.getTime())) {
          parsedDate = d2;
        }
      }
    }
  } else if (eventDateInput && typeof eventDateInput.toDate === 'function') {
    parsedDate = eventDateInput.toDate();
    rawStr = parsedDate ? parsedDate.toLocaleDateString() : '';
  } else if (eventDateInput && eventDateInput.seconds) {
    parsedDate = new Date(eventDateInput.seconds * 1000);
    rawStr = parsedDate.toLocaleDateString();
  } else if (eventDateInput instanceof Date) {
    parsedDate = eventDateInput;
    rawStr = parsedDate.toLocaleDateString();
  }

  if (parsedDate && !isNaN(parsedDate.getTime())) {
    // Start of the event's calendar day at 00:00:00 local time
    const eventDayStart = new Date(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      0,
      0,
      0,
      0
    );

    // If event is scheduled on a day strictly AFTER today:
    if (eventDayStart.getTime() > todayStart.getTime()) {
      const display = rawStr || parsedDate.toLocaleDateString('en-ZA', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      return {
        arrived: false,
        isFuture: true,
        message: `The date for this event has not yet arrived (${display}). Gates open on the event date.`,
        eventDateDisplay: display,
      };
    }
  }

  return {
    arrived: true,
    isFuture: false,
    message: 'Event date has arrived.',
    eventDateDisplay: rawStr || 'Event Day',
  };
}

/**
 * Format event date to ensure the full year is always displayed (e.g., Sat, 24 Oct 2026)
 */
export function formatEventDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const currentYear = new Date().getFullYear();
  const hasYear = /\b20\d{2}\b/.test(trimmed);
  if (hasYear) return trimmed;

  const parsed = parseNamedMonthDate(trimmed, currentYear) || new Date(`${trimmed} ${currentYear}`);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-ZA', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return `${trimmed} ${currentYear}`;
}

/**
 * Parse an event date input (string, EventItem, Date, or Firestore Timestamp) into a valid Date object.
 */
export function parseEventDate(input: any): Date | null | 'ONGOING' {
  if (!input) return null;

  // Handle EventItem or object containing date / event_date / seconds
  if (typeof input === 'object') {
    if (typeof input.toDate === 'function') {
      try {
        return input.toDate();
      } catch (e) {
        return null;
      }
    }
    if (typeof input.seconds === 'number') {
      return new Date(input.seconds * 1000);
    }
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }
    // If it's an EventItem object, prefer event_date (which includes time), then date
    if (input.event_date || input.date) {
      return parseEventDate(input.event_date || input.date);
    }
  }

  if (typeof input !== 'string') return null;

  const raw = input.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (
    lower.includes('today') ||
    lower.includes('daily') ||
    lower.includes('now') ||
    lower.includes('happy hour')
  ) {
    return 'ONGOING';
  }

  // 1. Check for YYYY-MM-DD or YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch) {
    const [, y, m, d, hh, mm, ss] = isoMatch;
    if (hh !== undefined) {
      return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss || 0));
    }
    // Date only: evaluate in local calendar time
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  }

  // 2. Deterministic named-month parse ("14 Nov 2026, 18:00", "Sat, 14 Nov 2026", etc.)
  const currentYear = new Date().getFullYear();
  const explicit = parseNamedMonthDate(raw, currentYear);
  if (explicit) {
    return explicit;
  }

  // 3. Strip weekday prefix and try native fallback parse
  const cleaned = raw.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*/i, '').trim();
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return d;
  }

  // 4. Try appending current year if year is omitted (e.g. "28 Nov")
  const dWithYear = new Date(`${cleaned} ${currentYear}`);
  if (!isNaN(dWithYear.getTime())) {
    return dWithYear;
  }

  return null;
}

/**
 * Check if an event's date has passed (expired).
 * 
 * Rules:
 * 1. If today is the 10th, any event that came before the 10th (calendar date < today) is expired.
 * 2. If the event is today:
 *    - If a specific time was specified (e.g. 14:00) and that time has passed, the event has expired.
 *    - If no specific time was specified, it expires at the end of the event day (23:59:59.999).
 * 3. Events with status === 'Closed' are treated as expired.
 * 4. Ongoing / daily events are not expired.
 */
export function isEventExpired(eventDateInput: any, currentDate: Date = new Date()): boolean {
  if (!eventDateInput) return false;

  // If passed an event object with status Closed
  if (typeof eventDateInput === 'object' && eventDateInput !== null) {
    if (eventDateInput.status === 'Closed') {
      return true;
    }
  }

  const parsed = parseEventDate(eventDateInput);
  if (parsed === 'ONGOING') return false;
  if (!parsed || !(parsed instanceof Date) || isNaN(parsed.getTime())) return false;

  const rawStr = typeof eventDateInput === 'string'
    ? eventDateInput
    : String(eventDateInput?.event_date || eventDateInput?.date || '');

  const hasSpecificTime =
    /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(rawStr) ||
    /am|pm/i.test(rawStr) ||
    /T\d{2}:\d{2}/.test(rawStr);

  const now = currentDate;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const eventDayStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);

  // 1. Any event whose calendar date came before today (e.g. before the 10th) has passed
  if (eventDayStart.getTime() < todayStart.getTime()) {
    return true;
  }

  // 2. If event is scheduled for today:
  if (eventDayStart.getTime() === todayStart.getTime()) {
    if (hasSpecificTime) {
      // Check if specific time today has passed
      return parsed.getTime() < now.getTime();
    }
    // If no specific time, it expires at midnight concluding the day
    const eventEnd = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      23,
      59,
      59,
      999
    );
    return eventEnd.getTime() < now.getTime();
  }

  // 3. Event is in the future
  return false;
}

/**
 * Alias for isEventExpired to ensure semantic clarity across ticket purchase and discovery.
 */
export const isEventPast = isEventExpired;


