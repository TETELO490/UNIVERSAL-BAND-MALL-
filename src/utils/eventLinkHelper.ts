import { EventItem } from '../types';

const DEFAULT_PUBLIC_WEB_URL =
  'https://ais-pre-qg6ueutevpurrokkvgbhp2-930625502633.europe-west2.run.app';

const BASE_URL_STORAGE_KEY = 'ub_app_base_url';

let configuredBaseUrl = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return (window.localStorage.getItem(BASE_URL_STORAGE_KEY) || '').trim().replace(/\/+$/, '');
    }
  } catch {}
  return '';
})();

export function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function setConfiguredBaseUrl(url: string): void {
  configuredBaseUrl = normalizeBaseUrl(url);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (configuredBaseUrl) {
        window.localStorage.setItem(BASE_URL_STORAGE_KEY, configuredBaseUrl);
      } else {
        window.localStorage.removeItem(BASE_URL_STORAGE_KEY);
      }
    }
  } catch {}
}

export function getConfiguredBaseUrl(): string {
  return configuredBaseUrl;
}

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
 * Resolves the public HTTPS website URL so QR codes ALWAYS open via the configured
 * custom domain (app_settings/config.baseUrl) first, falling back to the Google AI Studio URL.
 */
export function getPublicWebOrigin(): string {
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

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
  const filename = `event-${slug}-QR.png`;

  try {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        document.body.removeChild(link);
      } catch {}
    }, 250);
  } catch {
    // Fallback below if direct download is blocked
  }

  // On iOS Safari / restricted mobile WebViews where <a download> is ignored,
  // also open the PNG image in a new tab so the organiser can long-press > Save Image.
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const isIOS = /iPad|iPhone|iPod/i.test(ua);
    if (isIOS) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch {}
      }, 250);
    }
  } catch {}

  return true;
}

/**
 * Shares the event QR PNG image (or link fallback) via navigator.share for WhatsApp / Facebook.
 */
export async function shareEventQrPng(
  qrCanvas: HTMLCanvasElement | null,
  event: EventItem,
  eventUrl: string,
  allEvents: EventItem[] = []
): Promise<{ shared: boolean; fallbackCopied?: boolean; error?: string }> {
  const slug = resolveEventSlug(event, allEvents);
  const filename = `event-${slug}-QR.png`;
  const shareTitle = `${event.title || 'Event'} — Universal Band Mall`;
  const shareText = `Scan QR or tap the link to buy tickets for ${event.title || 'this event'}: ${eventUrl}`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      if (qrCanvas) {
        const dataUrl = qrCanvas.toDataURL('image/png');
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], filename, { type: 'image/png' });
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            files: [file],
          });
          return { shared: true };
        }
      }
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: eventUrl,
      });
      return { shared: true };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { shared: false };
      }
    }
  }

  const copied = await copyTextToClipboard(eventUrl);
  return { shared: false, fallbackCopied: copied };
}

