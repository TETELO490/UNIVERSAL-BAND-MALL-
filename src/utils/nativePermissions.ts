import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type PermissionCategory =
  | 'camera'
  | 'microphone'
  | 'photos'
  | 'files'
  | 'contacts'
  | 'location'
  | 'bluetooth'
  | 'notifications'
  | 'sms'
  | 'phoneState';

export interface PermissionCheckResult {
  granted: boolean;
  denied?: boolean;
  message?: string;
}

export interface BiometricAvailabilityResult {
  available: boolean;
  hasHardware: boolean;
  hasEnrolled: boolean;
  statusCode?: number;
  message: string;
}

export interface BiometricAuthResult {
  authenticated: boolean;
  errorCode?: number;
  errorMessage?: string;
  message?: string;
}

export interface SmsInboxMessage {
  id: string;
  sender: string;
  body: string;
  dateMs: number;
}

interface NativePermissionsBridge {
  checkPermission(options: { type: PermissionCategory }): Promise<{ granted: boolean; status: string }>;
  requestPermission(options: { type: PermissionCategory }): Promise<{ granted: boolean; status: string }>;
  readSmsInbox(options?: { limit?: number; sinceMs?: number }): Promise<{
    granted: boolean;
    messages: SmsInboxMessage[];
  }>;
  startSmsListener(): Promise<{ listening: boolean; granted: boolean }>;
  stopSmsListener(): Promise<{ listening: boolean }>;
  addListener(
    eventName: 'smsReceived',
    listenerFunc: (msg: SmsInboxMessage) => void
  ): Promise<PluginListenerHandle>;
  checkBiometricAvailability(): Promise<BiometricAvailabilityResult>;
  authenticateBiometric(options: {
    title?: string;
    subtitle?: string;
    description?: string;
  }): Promise<BiometricAuthResult>;
  openAppSettings(): Promise<{ opened: boolean }>;
  pickContact(): Promise<{ granted: boolean; cancelled?: boolean; name?: string; phone?: string }>;
}

const NativePermissions = registerPlugin<NativePermissionsBridge>('NativePermissions');

export const PERMISSION_DENIED_EVENT = 'ub-permission-denied';

export interface PermissionDeniedDetail {
  category: PermissionCategory;
  title: string;
  message: string;
  isNative: boolean;
}

const CATEGORY_LABELS: Record<PermissionCategory, { title: string; message: string }> = {
  camera: {
    title: 'Permission needed: Camera',
    message: 'Camera permission was denied. Please allow Camera in App Settings to scan QR codes or take photos.',
  },
  microphone: {
    title: 'Permission needed: Microphone',
    message: 'Microphone permission was denied. Please allow Microphone in App Settings to record audio.',
  },
  photos: {
    title: 'Permission needed: Photos & Gallery',
    message: 'Photos & Videos permission was denied. Please allow Photos access in App Settings to attach images.',
  },
  files: {
    title: 'Permission needed: Files & Media',
    message: 'Files / Media permission was denied. Please allow Files access in App Settings to pick audio or files.',
  },
  contacts: {
    title: 'Permission needed: Contacts',
    message: 'Contacts permission was denied. Please allow Contacts in App Settings to pick a contact.',
  },
  location: {
    title: 'Permission needed: Location',
    message: 'Location permission was denied. Please allow Location in App Settings to use GPS features.',
  },
  bluetooth: {
    title: 'Permission needed: Nearby Devices / Bluetooth',
    message: 'Bluetooth permission was denied. Please allow Nearby Devices / Bluetooth in App Settings.',
  },
  notifications: {
    title: 'Permission needed: Notifications',
    message: 'Notification permission was denied. Please allow Notifications in App Settings to receive order alerts.',
  },
  sms: {
    title: 'Permission needed: SMS Messages',
    message: 'SMS permission was denied. Please allow SMS in App Settings for PayShap auto-confirmation.',
  },
  phoneState: {
    title: 'Permission needed: Phone Status',
    message: 'Phone permission was denied. Please allow Phone permission in App Settings.',
  },
};

export function notifyPermissionDenied(category: PermissionCategory, customMessage?: string) {
  if (typeof window === 'undefined') return;
  const meta = CATEGORY_LABELS[category];
  const detail: PermissionDeniedDetail = {
    category,
    title: 'Permission needed',
    message: customMessage || meta.message,
    isNative: Capacitor.isNativePlatform(),
  };
  window.dispatchEvent(new CustomEvent<PermissionDeniedDetail>(PERMISSION_DENIED_EVENT, { detail }));
}

export async function openAppSettings(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NativePermissions.openAppSettings();
      return Boolean(res?.opened);
    } catch (err) {
      console.warn('Could not open native App Settings:', err);
    }
  }
  return false;
}

async function requestNativeAndroidPermission(
  category: PermissionCategory,
  fallbackMessage?: string
): Promise<PermissionCheckResult> {
  try {
    const res = await NativePermissions.requestPermission({ type: category });
    if (res?.granted) {
      return { granted: true };
    }
    const msg = fallbackMessage || CATEGORY_LABELS[category].message;
    notifyPermissionDenied(category, msg);
    return { granted: false, denied: true, message: msg };
  } catch (err) {
    console.warn(`Native permission request error (${category}):`, err);
    const msg = fallbackMessage || CATEGORY_LABELS[category].message;
    notifyPermissionDenied(category, msg);
    return { granted: false, denied: true, message: msg };
  }
}

/**
 * Ensures REAL Camera permission (Android CAMERA via ActivityResultLauncher / Web getUserMedia).
 */
export async function ensureCameraPermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Camera is unavailable in this environment.' };
  }

  if (Capacitor.isNativePlatform()) {
    return requestNativeAndroidPermission('camera');
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = 'Camera API is not supported on this device or browser.';
    notifyPermissionDenied('camera', msg);
    return { granted: false, denied: true, message: msg };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true };
  } catch (err: any) {
    console.warn('Camera permission denied or unavailable:', err);
    const msg =
      err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError'
        ? 'No camera hardware found on this device.'
        : CATEGORY_LABELS.camera.message;
    notifyPermissionDenied('camera', msg);
    return { granted: false, denied: true, message: msg };
  }
}

/**
 * Ensures REAL Microphone permission (Android RECORD_AUDIO via ActivityResultLauncher / Web getUserMedia).
 */
export async function ensureMicrophonePermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Microphone is unavailable.' };
  }

  if (Capacitor.isNativePlatform()) {
    return requestNativeAndroidPermission('microphone');
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = 'Microphone API is not supported on this device or browser.';
    notifyPermissionDenied('microphone', msg);
    return { granted: false, denied: true, message: msg };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (err: any) {
    console.warn('Microphone permission denied or unavailable:', err);
    const msg = CATEGORY_LABELS.microphone.message;
    notifyPermissionDenied('microphone', msg);
    return { granted: false, denied: true, message: msg };
  }
}

/**
 * Ensures REAL Photos / Gallery permission (Android READ_MEDIA_IMAGES & READ_MEDIA_VIDEO / READ_EXTERNAL_STORAGE).
 */
export async function ensurePhotosPermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Photos are unavailable in this environment.' };
  }

  if (Capacitor.isNativePlatform()) {
    return requestNativeAndroidPermission('photos');
  }

  return { granted: true };
}

/**
 * Ensures REAL Files / Media permission (Android READ_MEDIA_IMAGES / READ_MEDIA_VIDEO / READ_MEDIA_AUDIO / READ_EXTERNAL_STORAGE).
 */
export async function ensureFilesPermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Files are unavailable in this environment.' };
  }

  if (Capacitor.isNativePlatform()) {
    return requestNativeAndroidPermission('files');
  }

  return { granted: true };
}

/**
 * Ensures REAL Contacts permission (Android READ_CONTACTS via ActivityResultLauncher).
 */
export async function ensureContactsPermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Contacts are unavailable in this environment.' };
  }

  if (Capacitor.isNativePlatform()) {
    return requestNativeAndroidPermission('contacts');
  }

  const nav = navigator as any;
  if (nav.contacts && typeof nav.contacts.select === 'function') {
    return { granted: true };
  }

  const msg = 'Contact picker requires Android app or a supported mobile browser.';
  notifyPermissionDenied('contacts', msg);
  return { granted: false, denied: true, message: msg };
}

/**
 * Requests Contacts permission FIRST, and only if granted opens the real phone Contacts picker.
 */
export async function pickRealContact(): Promise<{
  granted: boolean;
  cancelled?: boolean;
  name?: string;
  phone?: string;
  message?: string;
}> {
  const perm = await ensureContactsPermission();
  if (!perm.granted) {
    return { granted: false, message: perm.message };
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NativePermissions.pickContact();
      if (!res.granted) {
        notifyPermissionDenied('contacts');
        return { granted: false, message: CATEGORY_LABELS.contacts.message };
      }
      return {
        granted: true,
        cancelled: Boolean(res.cancelled),
        name: res.name || '',
        phone: res.phone || '',
      };
    } catch (err: any) {
      return { granted: true, cancelled: true, message: err?.message };
    }
  }

  const nav = navigator as any;
  if (nav.contacts && typeof nav.contacts.select === 'function') {
    try {
      const selected = await nav.contacts.select(['name', 'tel'], { multiple: false });
      if (!Array.isArray(selected) || selected.length === 0) {
        return { granted: true, cancelled: true };
      }
      const contact = selected[0];
      const name = Array.isArray(contact.name) ? contact.name[0] || '' : String(contact.name || '');
      const phone = Array.isArray(contact.tel) ? contact.tel[0] || '' : String(contact.tel || '');
      return { granted: true, cancelled: false, name, phone };
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        notifyPermissionDenied('contacts');
        return { granted: false, message: CATEGORY_LABELS.contacts.message };
      }
      return { granted: true, cancelled: true };
    }
  }

  return { granted: false, message: CATEGORY_LABELS.contacts.message };
}

/**
 * Ensures REAL Location permission (Android ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION via ActivityResultLauncher).
 */
export async function ensureLocationPermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Location is unavailable in this environment.' };
  }

  if (Capacitor.isNativePlatform()) {
    return requestNativeAndroidPermission('location');
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    const msg = 'GPS is not supported on this device/browser.';
    notifyPermissionDenied('location', msg);
    return { granted: false, denied: true, message: msg };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve({ granted: true }),
      (err) => {
        if (err.code === 1) {
          notifyPermissionDenied('location');
          resolve({ granted: false, denied: true, message: CATEGORY_LABELS.location.message });
        } else {
          // Position unavailable / timeout means permission was allowed
          resolve({ granted: true });
        }
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
    );
  });
}

/**
 * Ensures REAL Notifications permission (Android POST_NOTIFICATIONS via ActivityResultLauncher / Web Notification API).
 */
export async function ensureNotificationsPermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Notifications are unavailable.' };
  }

  if (Capacitor.isNativePlatform()) {
    const nativeRes = await requestNativeAndroidPermission('notifications');
    if (!nativeRes.granted) {
      return nativeRes;
    }
    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
    } catch {}
    return { granted: true };
  }

  if (!('Notification' in window)) {
    const msg = 'Notifications are not supported in this browser.';
    notifyPermissionDenied('notifications', msg);
    return { granted: false, denied: true, message: msg };
  }

  try {
    if (Notification.permission === 'granted') {
      return { granted: true };
    }
    const res = await Notification.requestPermission();
    if (res === 'granted') {
      return { granted: true };
    }
    notifyPermissionDenied('notifications');
    return { granted: false, denied: true, message: CATEGORY_LABELS.notifications.message };
  } catch {
    notifyPermissionDenied('notifications');
    return { granted: false, denied: true, message: CATEGORY_LABELS.notifications.message };
  }
}

export async function checkNotificationsPermissionGranted(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NativePermissions.checkPermission({ type: 'notifications' });
      return Boolean(res?.granted);
    } catch {
      return false;
    }
  }
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Checks whether Android READ_SMS / RECEIVE_SMS permission is currently granted.
 */
export async function checkSmsPermissionGranted(): Promise<boolean> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return false;
  try {
    const res = await NativePermissions.checkPermission({ type: 'sms' });
    const granted = Boolean(res?.granted);
    localStorage.setItem('tymebank_sms_permission', granted ? 'true' : 'false');
    return granted;
  } catch {
    return false;
  }
}

/**
 * Ensures REAL Android SMS permission (READ_SMS, RECEIVE_SMS via ActivityResultLauncher).
 */
export async function ensureSmsPermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'SMS is unavailable in this environment.' };
  }

  if (Capacitor.isNativePlatform()) {
    const nativeRes = await requestNativeAndroidPermission(
      'sms',
      'SMS permission denied. You can still top-up manually, but auto-confirm will not work.'
    );
    if (nativeRes.granted) {
      localStorage.setItem('tymebank_sms_permission', 'true');
      try {
        await NativePermissions.startSmsListener();
      } catch {}
    } else {
      localStorage.setItem('tymebank_sms_permission', 'false');
    }
    return nativeRes;
  }

  const msg = 'SMS inbox reading requires the Android app with SMS permission allowed in Settings.';
  notifyPermissionDenied('sms', msg);
  return { granted: false, denied: true, message: msg };
}

/**
 * Ensures REAL Android READ_PHONE_STATE permission.
 */
export async function ensurePhoneStatePermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Phone state is unavailable.' };
  }
  if (Capacitor.isNativePlatform()) {
    return requestNativeAndroidPermission('phoneState');
  }
  return { granted: true };
}

/**
 * Reads REAL SMS messages directly from Android's SMS Inbox (content://sms/inbox).
 * Never returns mock data; requires READ_SMS permission.
 */
export async function readRealSmsInbox(options?: {
  limit?: number;
  sinceMs?: number;
}): Promise<{ granted: boolean; messages: SmsInboxMessage[] }> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
    return { granted: false, messages: [] };
  }
  try {
    const res = await NativePermissions.readSmsInbox(options);
    return {
      granted: Boolean(res?.granted),
      messages: Array.isArray(res?.messages) ? res.messages : [],
    };
  } catch (err) {
    console.warn('readRealSmsInbox error:', err);
    return { granted: false, messages: [] };
  }
}

/**
 * Subscribes to live incoming Android SMS broadcasts (Telephony.Sms.Intents.SMS_RECEIVED).
 */
export async function startNativeSmsListener(
  onSms: (msg: SmsInboxMessage) => void
): Promise<() => void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
    return () => {};
  }
  let handle: PluginListenerHandle | null = null;
  try {
    const status = await NativePermissions.startSmsListener();
    if (!status?.granted) {
      return () => {};
    }
    handle = await NativePermissions.addListener('smsReceived', (msg) => {
      if (msg && msg.body) {
        onSms(msg);
      }
    });
  } catch (err) {
    console.warn('startNativeSmsListener error:', err);
  }
  return () => {
    try {
      if (handle) void handle.remove();
      void NativePermissions.stopSmsListener();
    } catch {}
  };
}

/**
 * Ensures REAL Android Bluetooth permissions (BLUETOOTH_SCAN & BLUETOOTH_CONNECT).
 */
export async function ensureBluetoothPermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { granted: false, denied: true, message: 'Bluetooth is unavailable in this environment.' };
  }
  if (Capacitor.isNativePlatform()) {
    return requestNativeAndroidPermission('bluetooth');
  }
  return { granted: true };
}

/**
 * Checks Android BiometricPrompt hardware & enrolled fingerprint status via native Java bridge.
 */
export async function checkNativeBiometricAvailability(): Promise<BiometricAvailabilityResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      hasHardware: false,
      hasEnrolled: false,
      message: 'Native Android BiometricPrompt is only used in the Android app.',
    };
  }
  try {
    return await NativePermissions.checkBiometricAvailability();
  } catch (err: any) {
    return {
      available: false,
      hasHardware: false,
      hasEnrolled: false,
      message: err?.message || 'Could not inspect Android fingerprint hardware.',
    };
  }
}

/**
 * Opens the REAL Android BiometricPrompt hardware fingerprint scanner dialog.
 */
export async function authenticateNativeBiometric(options?: {
  title?: string;
  subtitle?: string;
  description?: string;
}): Promise<BiometricAuthResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      authenticated: false,
      errorMessage: 'Native Android BiometricPrompt is unavailable outside Android app.',
    };
  }
  try {
    return await NativePermissions.authenticateBiometric({
      title: options?.title || 'Unlock Universal Band with fingerprint',
      subtitle: options?.subtitle || 'Universal Band Security',
      description: options?.description || 'Touch your fingerprint sensor to continue.',
    });
  } catch (err: any) {
    return {
      authenticated: false,
      errorMessage: err?.message || 'Fingerprint prompt failed to open.',
    };
  }
}

