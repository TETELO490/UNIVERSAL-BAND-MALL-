import { EventItem } from '../types';

const DEFAULT_PUBLIC_WEB_URL =
  'https://ais-pre-qg6ueutevpurrokkvgbhp2-930625502633.europe-west2.run.app';

export function slugifyEventTitle(title: string): string {
  const normalized = (title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'event';
}

export function getShortEventSuffix(eventId: string): string {
  const clean = (eventId || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!clean) return '0001';
  return clean.slice(-4);
}

/**
 * Resolves the public HTTPS website URL so QR codes ALWAYS open the web app in a browser,
 * even when an organiser generates or copies the QR code from inside a native Capacitor APK.
 */
export function getPublicWebOrigin(): string {
  const envUrl =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PUBLIC_APP_URL
      ? String((import.meta as any).env.VITE_PUBLIC_APP_URL).replace(/\/+$/, '')
      : '';

  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, origin } = window.location;
    const isLocalHost =
      !hostname ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0';
    const isWebProtocol = protocol === 'https:' || protocol === 'http:';

    if (isWebProtocol && !isLocalHost && origin && origin !== 'null') {
      return origin.replace(/\/+$/, '');
    }
  }

  return envUrl || DEFAULT_PUBLIC_WEB_URL;
}

/**
 * Generates a unique URL slug for an event (e.g. "Soweto Fest 2026" -> "soweto-fest-2026").
 * Guarantees that no two events ever receive the same slug or QR code.
 */
export function generateUniqueEventSlug(
  title: string,
  eventId: string,
  existingEvents: EventItem[] = []
): string {
  const baseSlug = slugifyEventTitle(title) || slugifyEventTitle(eventId) || 'event';
  const suffix = getShortEventSuffix(eventId);

  const takenSlugs = new Set<string>();
  for (const ev of existingEvents) {
    if (!ev || ev.id === eventId) continue;
    if (ev.eventSlug && ev.eventSlug.trim()) {
      takenSlugs.add(ev.eventSlug.trim().toLowerCase());
    } else {
      const legacyBase = slugifyEventTitle(ev.title);
      if (!takenSlugs.has(legacyBase)) {
        takenSlugs.add(legacyBase);
      } else {
        takenSlugs.add(`${legacyBase}-${getShortEventSuffix(ev.id)}`);
      }
    }
  }

  if (!takenSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let candidate = `${baseSlug}-${suffix}`;
  let counter = 2;
  while (takenSlugs.has(candidate)) {
    candidate = `${baseSlug}-${suffix}-${counter}`;
    counter++;
  }
  return candidate;
}

/**
 * Returns the deterministic unique slug for any event, including older events created
 * before `eventSlug` was persisted.
 */
export function resolveEventSlug(event: EventItem, allEvents: EventItem[] = []): string {
  if (event.eventSlug && event.eventSlug.trim()) {
    const clean = event.eventSlug.trim().toLowerCase();
    const hasCollision = allEvents.some(
      (other) =>
        other.id !== event.id &&
        (other.eventSlug || '').trim().toLowerCase() === clean
    );
    if (!hasCollision) {
      return clean;
    }
  }

  const index = allEvents.findIndex((e) => e.id === event.id);
  const earlierEvents = index > 0 ? allEvents.slice(0, index) : [];
  return generateUniqueEventSlug(event.title, event.id, earlierEvents);
}

/**
 * Returns the full unique shareable web URL for a specific event.
 * Example: https://universalbandmall.com/event/soweto-fest-2026
 */
export function getEventShareUrl(event: EventItem, allEvents: EventItem[] = []): string {
  const slug = resolveEventSlug(event, allEvents);
  return `${getPublicWebOrigin()}/event/${slug}`;
}

export function getEventRoutePath(event: EventItem, allEvents: EventItem[] = []): string {
  const slug = resolveEventSlug(event, allEvents);
  return `/event/${slug}`;
}

/**
 * Finds an event matching a URL slug or ID (from /event/:slugOrId or /events/:slugOrId).
 */
export function findEventBySlugOrId(
  events: EventItem[],
  slugOrId: string
): EventItem | undefined {
  if (!slugOrId || !events || events.length === 0) return undefined;
  const cleanRaw = decodeURIComponent(slugOrId)
    .split('?')[0]
    .split('#')[0]
    .replace(/^\/+|\/+$/g, '')
    .trim();
  if (!cleanRaw) return undefined;
  const target = cleanRaw.toLowerCase();

  // 1. Exact ID match
  const byId = events.find((e) => e.id.toLowerCase() === target);
  if (byId) return byId;

  // 2. Exact persisted eventSlug match
  const byStoredSlug = events.find(
    (e) => (e.eventSlug || '').trim().toLowerCase() === target
  );
  if (byStoredSlug) return byStoredSlug;

  // 3. Deterministic resolved slug match (handles collisions cleanly)
  const byResolvedSlug = events.find(
    (e) => resolveEventSlug(e, events).toLowerCase() === target
  );
  if (byResolvedSlug) return byResolvedSlug;

  // 4. Legacy base title slug match
  const byTitleSlug = events.find((e) => slugifyEventTitle(e.title) === target);
  if (byTitleSlug) return byTitleSlug;

  return undefined;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Exports a crisp, high-resolution, poster-ready PNG file for the given event QR canvas.
 */
export function downloadEventQrPng(
  qrCanvas: HTMLCanvasElement | null,
  event: EventItem,
  eventUrl: string,
  allEvents: EventItem[] = []
): boolean {
  if (!qrCanvas) return false;

  const slug = resolveEventSlug(event, allEvents);
  const width = 900;
  const height = 1080;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return false;

  // Pure white flyer-ready background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Dark header strip
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(0, 0, width, 130);

  // Gold accent bar
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(0, 122, width, 8);

  // Brand title
  ctx.fillStyle = '#FACC15';
  ctx.font = '900 32px Inter, system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('UNIVERSAL BAND MALL', width / 2, 62);

  ctx.fillStyle = '#E5E7EB';
  ctx.font = '700 20px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillText('SCAN QR TO BUY EVENT TICKETS', width / 2, 100);

  // Draw crisp sharp QR code centered
  const qrSize = 620;
  const qrX = (width - qrSize) / 2;
  const qrY = 175;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;

  // Event Title (wrapped cleanly if long)
  ctx.fillStyle = '#0A0A0A';
  ctx.font = '900 36px Inter, system-ui, -apple-system, sans-serif';
  const words = (event.title || 'Event').split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  for (const w of words) {
    const test = currentLine ? `${currentLine} ${w}` : w;
    if (ctx.measureText(test).width > width - 100 && currentLine) {
      lines.push(currentLine);
      currentLine = w;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  let textY = 855;
  for (const line of lines.slice(0, 2)) {
    ctx.fillText(line, width / 2, textY);
    textY += 44;
  }

  // Event Date & Price
  ctx.fillStyle = '#374151';
  ctx.font = '700 24px Inter, system-ui, -apple-system, sans-serif';
  const metaText = `${event.date || ''}${event.price ? `  •  ${event.price}` : ''}`;
  ctx.fillText(metaText, width / 2, textY + 8);

  // Event Link Footer
  ctx.fillStyle = '#6B7280';
  ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
  const shortUrl = eventUrl.length > 68 ? `${eventUrl.slice(0, 65)}...` : eventUrl;
  ctx.fillText(shortUrl, width / 2, height - 42);

  const dataUrl = out.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${slug}-qr-universal-band-mall.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
