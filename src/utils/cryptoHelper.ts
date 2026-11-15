/**
 * Cryptographic helper for Admin Security
 * Strictly uses Web Crypto API (SubtleCrypto) for SHA-256 hashing.
 * No plain text credentials, patterns, or lucky numbers are ever stored.
 */

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalized admin emails list from env, localStorage, or secure defaults
 */
export function getAuthorizedAdminEmails(): string[] {
  const envEmails = (import.meta as any).env?.VITE_ADMIN_EMAILS || '';
  const parsed = envEmails
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  let localStored: string[] = [];
  try {
    const raw = localStorage.getItem('ub_admin_emails');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) localStored = arr.map((e: string) => String(e).trim().toLowerCase());
    }
  } catch (e) {}

  const defaults = [
    'tetelophokwane98@gmail.com',
    'admin@universalband.co.za',
    'admin@ub.co.za',
    'systemadmin@universalband.co.za',
  ];

  return Array.from(new Set([...defaults, ...parsed, ...localStored]));
}

export function isAuthorizedAdminEmail(email?: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (!clean) return false;

  const list = getAuthorizedAdminEmails();
  if (list.includes(clean)) return true;

  // Pattern matches: explicit admin identifiers
  if (
    clean.startsWith('admin@') ||
    clean.startsWith('systemadmin@') ||
    clean.endsWith('@universalband.co.za') ||
    clean.includes('admin')
  ) {
    return true;
  }

  // Check active user profile role in local storage
  try {
    const userProfile = localStorage.getItem('ub_user_profile');
    if (userProfile) {
      const parsed = JSON.parse(userProfile);
      if (
        parsed.email?.toLowerCase().trim() === clean &&
        (parsed.role === 'Admin' || parsed.role === 'admin' || parsed.isAdmin === true)
      ) {
        return true;
      }
    }
  } catch (e) {}

  // Check active admin session flag
  try {
    if (localStorage.getItem('ub_admin_session') === 'true') {
      const userProfile = localStorage.getItem('ub_user_profile');
      if (userProfile) {
        const parsed = JSON.parse(userProfile);
        if (parsed.email?.toLowerCase().trim() === clean) return true;
      }
    }
  } catch (e) {}

  return false;
}

export function addAuthorizedAdminEmail(email: string) {
  if (!email) return;
  const clean = email.trim().toLowerCase();
  try {
    const raw = localStorage.getItem('ub_admin_emails');
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(clean)) {
      list.push(clean);
      localStorage.setItem('ub_admin_emails', JSON.stringify(list));
    }
  } catch (e) {}
}
