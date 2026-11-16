import { Capacitor } from '@capacitor/core';
import { sha256, isAuthorizedAdminEmail } from './cryptoHelper';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  checkNativeBiometricAvailability,
  authenticateNativeBiometric,
} from './nativePermissions';

export type UnlockMethod = 'pin' | 'fingerprint' | 'password' | 'pattern';

export interface MultiLockConfig {
  pinEnabled: boolean;
  fingerprintEnabled: boolean;
  passwordEnabled: boolean;
  patternEnabled: boolean;
  primaryMethod: UnlockMethod;
  passwordHash?: string;
  patternHash?: string;
  patternLength?: number;
  fingerprintEnrolled?: boolean;
  fingerprintCredentialId?: string;
}

const STORAGE_KEY = 'ub_multi_lock_config';

const DEFAULT_CONFIG: MultiLockConfig = {
  pinEnabled: true,
  fingerprintEnabled: true,
  passwordEnabled: true,
  patternEnabled: true,
  primaryMethod: 'pin',
  fingerprintEnrolled: false,
  fingerprintCredentialId: '',
};

export function isRealCredentialId(id?: string | null): id is string {
  return Boolean(
    id &&
      typeof id === 'string' &&
      id.trim().length > 8 &&
      !id.startsWith('ub_sim_') &&
      !id.startsWith('ub_bio_')
  );
}

export function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBuffer(b64url: string): Uint8Array {
  const normalized = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getValidRpId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = (window.location.hostname || '').trim();
  if (!host || host === '127.0.0.1' || host === '::1') return undefined;
  return host;
}

function sanitizeConfig(rawCfg: Partial<MultiLockConfig> & Record<string, any>): MultiLockConfig {
  const merged: MultiLockConfig = {
    pinEnabled: rawCfg.pinEnabled ?? DEFAULT_CONFIG.pinEnabled,
    fingerprintEnabled: rawCfg.fingerprintEnabled ?? DEFAULT_CONFIG.fingerprintEnabled,
    passwordEnabled: rawCfg.passwordEnabled ?? DEFAULT_CONFIG.passwordEnabled,
    patternEnabled: rawCfg.patternEnabled ?? DEFAULT_CONFIG.patternEnabled,
    primaryMethod:
      rawCfg.primaryMethod === 'pin' ||
      rawCfg.primaryMethod === 'fingerprint' ||
      rawCfg.primaryMethod === 'password' ||
      rawCfg.primaryMethod === 'pattern'
        ? rawCfg.primaryMethod
        : 'pin',
    passwordHash: rawCfg.passwordHash,
    patternHash: rawCfg.patternHash,
    patternLength: rawCfg.patternLength,
    fingerprintEnrolled: isRealCredentialId(rawCfg.fingerprintCredentialId)
      ? Boolean(rawCfg.fingerprintEnrolled ?? true)
      : false,
    fingerprintCredentialId: isRealCredentialId(rawCfg.fingerprintCredentialId)
      ? rawCfg.fingerprintCredentialId
      : '',
  };
  return merged;
}

export function getMultiLockConfig(emailOrUid?: string): MultiLockConfig {
  try {
    if (emailOrUid) {
      const cleanKey = `${STORAGE_KEY}_${emailOrUid.trim().toLowerCase()}`;
      const userRaw = localStorage.getItem(cleanKey);
      if (userRaw) {
        return sanitizeConfig(JSON.parse(userRaw));
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return sanitizeConfig(JSON.parse(raw));
    }
  } catch (e) {
    console.warn('Failed to parse multi-lock config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveMultiLockConfig(
  config: Partial<MultiLockConfig>,
  emailOrUid?: string,
  userId?: string
): MultiLockConfig {
  const current = getMultiLockConfig(emailOrUid);
  const updated = sanitizeConfig({ ...current, ...config });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (emailOrUid) {
      const cleanKey = `${STORAGE_KEY}_${emailOrUid.trim().toLowerCase()}`;
      localStorage.setItem(cleanKey, JSON.stringify(updated));
    }

    if (userId && userId !== 'guest_user') {
      setDoc(
        doc(db, 'users', userId),
        {
          securitySettings: {
            ...updated,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      ).catch((err) => console.warn('Could not save securitySettings to users collection:', err));
    }

  } catch (e) {
    console.warn('Failed to save multi-lock config:', e);
  }
  return updated;
}

export async function setPasswordLock(
  plainPassword: string,
  emailOrUid?: string,
  userId?: string
): Promise<boolean> {
  if (!plainPassword || plainPassword.length < 4) return false;
  const hash = await sha256(plainPassword.trim());
  saveMultiLockConfig(
    {
      passwordHash: hash,
      passwordEnabled: true,
    },
    emailOrUid,
    userId
  );
  return true;
}

export async function verifyPasswordLock(
  inputPassword: string,
  emailOrUid?: string,
  explicitHash?: string
): Promise<boolean> {
  const hash = explicitHash || getMultiLockConfig(emailOrUid).passwordHash;
  if (!hash) return false;
  const inputHash = await sha256(inputPassword.trim());
  return inputHash === hash;
}

export async function setPatternLock(
  dots: number[],
  emailOrUid?: string,
  userId?: string
): Promise<boolean> {
  if (!dots || dots.length < 4) return false;
  const str = dots.join('-');
  const hash = await sha256(str);
  saveMultiLockConfig(
    {
      patternHash: hash,
      patternLength: dots.length,
      patternEnabled: true,
    },
    emailOrUid,
    userId
  );
  return true;
}

export async function verifyPatternLock(
  dots: number[],
  emailOrUid?: string,
  explicitHash?: string
): Promise<boolean> {
  const hash = explicitHash || getMultiLockConfig(emailOrUid).patternHash;
  if (!hash) return false;
  const str = dots.join('-');
  const hashVal = await sha256(str);
  return hashVal === hash;
}

export function isAccountSecurityRequired(
  email?: string,
  role?: string,
  userDocData?: any
): boolean {
  if (!email && !role) return false;
  const cleanEmail = (email || '').trim().toLowerCase();

  if (role === 'Admin' || role === 'Promoter') return true;
  if (userDocData?.role === 'Admin' || userDocData?.role === 'Promoter' || userDocData?.isAdmin === true) return true;
  if (cleanEmail === 'tetelophokwane98@gmail.com' || cleanEmail === 'admin@universalband.co.za') return true;
  if (isAuthorizedAdminEmail(cleanEmail)) return true;

  const fsSec = userDocData?.securitySettings;
  if (
    fsSec &&
    (fsSec.fingerprintEnabled ||
      fsSec.patternEnabled ||
      fsSec.passwordEnabled ||
      fsSec.patternHash ||
      fsSec.passwordHash ||
      isRealCredentialId(fsSec.fingerprintCredentialId))
  ) {
    return true;
  }

  const cfg = getMultiLockConfig(cleanEmail);
  if ((cfg.fingerprintEnrolled && isRealCredentialId(cfg.fingerprintCredentialId)) || cfg.patternHash || cfg.passwordHash) {
    return true;
  }

  return false;
}

function formatWebAuthnError(err: any, action: 'enroll' | 'verify'): string {
  const msg = String(err?.message || err || '');
  const name = String(err?.name || '');

  if (
    msg.includes('publickey-credentials') ||
    msg.includes('Permissions Policy') ||
    msg.includes('cross-origin child frames')
  ) {
    return 'Hardware fingerprint access is blocked inside this embedded preview iframe. Open the app directly over HTTPS or inside the Android app to use your real fingerprint sensor.';
  }

  if (name === 'NotAllowedError') {
    return action === 'enroll'
      ? 'Fingerprint enrollment was cancelled or timed out before completion.'
      : 'Fingerprint verification was cancelled or timed out.';
  }

  if (name === 'InvalidStateError') {
    return 'A passkey for this credential already exists on this authenticator.';
  }

  if (name === 'SecurityError') {
    return 'Biometric authentication requires a valid HTTPS origin or localhost environment.';
  }

  return msg || (action === 'enroll' ? 'Biometric enrollment failed.' : 'Fingerprint verification failed.');
}

/**
 * Real Hardware Fingerprint Enrollment via WebAuthn Platform Authenticator.
 * Never simulates or bypasses hardware verification.
 */
export async function enrollFingerprintBiometrics(
  userEmail?: string,
  userName?: string,
  userId?: string
): Promise<{ success: boolean; credentialId?: string; message: string }> {
  try {
    if (Capacitor.isNativePlatform()) {
      const bioStatus = await checkNativeBiometricAvailability();
      if (!bioStatus.available) {
        return {
          success: false,
          message:
            bioStatus.message ||
            'Fingerprint hardware is unavailable or no fingerprint is enrolled in Android Settings > Security.',
        };
      }

      const authRes = await authenticateNativeBiometric({
        title: 'Enroll Fingerprint',
        subtitle: 'Universal Band Security',
        description: 'Touch your phone fingerprint sensor to enroll biometric unlock.',
      });

      if (!authRes.authenticated) {
        return {
          success: false,
          message: authRes.errorMessage || 'Fingerprint enrollment was cancelled or did not verify.',
        };
      }

      const randBytes = new Uint8Array(16);
      window.crypto.getRandomValues(randBytes);
      const nativeCredId = `android_hw_${bufferToBase64Url(randBytes.buffer)}`;

      localStorage.setItem('ub_biometric_enrolled', 'true');
      localStorage.setItem('ub_biometric_id', nativeCredId);

      saveMultiLockConfig(
        {
          fingerprintEnabled: true,
          fingerprintEnrolled: true,
          fingerprintCredentialId: nativeCredId,
        },
        userEmail,
        userId
      );

      return {
        success: true,
        credentialId: nativeCredId,
        message: 'Hardware fingerprint enrolled successfully.',
      };
    }

    if (typeof window === 'undefined' || !navigator.credentials?.create || !window.PublicKeyCredential) {
      return {
        success: false,
        message: 'Hardware WebAuthn biometric credentials are not supported on this device or browser.',
      };
    }

    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      return {
        success: false,
        message: 'No hardware fingerprint or platform biometric sensor detected on this device.',
      };
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const userIdBytes = new Uint8Array(16);
    window.crypto.getRandomValues(userIdBytes);

    const email = (userEmail || '').trim() || 'user@universalband.co.za';
    const name = (userName || '').trim() || email.split('@')[0] || 'Universal Band User';
    const rpId = getValidRpId();

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Universal Band',
          ...(rpId ? { id: rpId } : {}),
        },
        user: {
          id: userIdBytes,
          name: email,
          displayName: name,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (!credential || !credential.rawId || credential.rawId.byteLength === 0) {
      return {
        success: false,
        message: 'Hardware sensor did not return a valid biometric credential.',
      };
    }

    const rawIdB64 = bufferToBase64Url(credential.rawId);
    if (!isRealCredentialId(rawIdB64)) {
      return {
        success: false,
        message: 'Invalid biometric credential received from hardware sensor.',
      };
    }

    localStorage.setItem('ub_biometric_enrolled', 'true');
    localStorage.setItem('ub_biometric_id', rawIdB64);

    saveMultiLockConfig(
      {
        fingerprintEnabled: true,
        fingerprintEnrolled: true,
        fingerprintCredentialId: rawIdB64,
      },
      userEmail,
      userId
    );

    return {
      success: true,
      credentialId: rawIdB64,
      message: 'Hardware fingerprint enrolled successfully.',
    };
  } catch (err: any) {
    console.error('Fingerprint enrollment error:', err);
    return {
      success: false,
      message: formatWebAuthnError(err, 'enroll'),
    };
  }
}

/**
 * Real Hardware Fingerprint Verification via WebAuthn Platform Authenticator.
 * Requires an enrolled hardware credentialId (`allowCredentials`) and userVerification: 'required'.
 * Never simulates or bypasses hardware verification.
 */
export async function authenticateWithBiometrics(
  expectedCredentialId?: string | string[],
  emailOrUid?: string
): Promise<{ success: boolean; credentialId?: string; message: string }> {
  try {
    const cfgCred = getMultiLockConfig(emailOrUid).fingerprintCredentialId;
    const localCred = localStorage.getItem('ub_biometric_id');
    const expectedArray = Array.isArray(expectedCredentialId)
      ? expectedCredentialId
      : expectedCredentialId
      ? [expectedCredentialId]
      : [];
    const candidateIds = Array.from(
      new Set(
        [...expectedArray, cfgCred, localCred].filter((c): c is string => isRealCredentialId(c))
      )
    );
    const resolvedCredId = candidateIds[0] || '';

    if (Capacitor.isNativePlatform()) {
      if (!resolvedCredId) {
        return {
          success: false,
          message: 'No hardware fingerprint is enrolled on this device yet. Enroll your fingerprint first.',
        };
      }

      const bioStatus = await checkNativeBiometricAvailability();
      if (!bioStatus.available) {
        return {
          success: false,
          message:
            bioStatus.message ||
            'Fingerprint hardware is unavailable or no fingerprint is enrolled in Android Settings > Security.',
        };
      }

      const authRes = await authenticateNativeBiometric({
        title: 'Fingerprint Unlock',
        subtitle: 'Universal Band Security',
        description: 'Touch your phone fingerprint sensor to unlock.',
      });

      if (!authRes.authenticated) {
        return {
          success: false,
          message: authRes.errorMessage || 'Fingerprint verification was cancelled or failed.',
        };
      }

      return {
        success: true,
        credentialId: resolvedCredId,
        message: 'Hardware fingerprint verified! Access granted.',
      };
    }

    if (typeof window === 'undefined' || !navigator.credentials?.get || !window.PublicKeyCredential) {
      return {
        success: false,
        message: 'Hardware WebAuthn biometric credentials are not supported on this device or browser.',
      };
    }

    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      return {
        success: false,
        message: 'No hardware fingerprint or platform biometric sensor detected on this device.',
      };
    }

    if (candidateIds.length === 0) {
      return {
        success: false,
        message: 'No hardware fingerprint is enrolled on this device yet. Enroll your fingerprint first.',
      };
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const rpId = getValidRpId();

    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: 'required',
        ...(rpId ? { rpId } : {}),
        allowCredentials: candidateIds.map((credId) => ({
          type: 'public-key' as const,
          id: base64UrlToBuffer(credId) as BufferSource,
          transports: ['internal'] as AuthenticatorTransport[],
        })),
      },
    })) as PublicKeyCredential | null;

    if (!credential || !credential.rawId) {
      return {
        success: false,
        message: 'No biometric assertion returned from hardware sensor.',
      };
    }

    const returnedId = bufferToBase64Url(credential.rawId);
    if (!candidateIds.includes(returnedId)) {
      return {
        success: false,
        message: 'Scanned fingerprint credential does not match the enrolled admin/account key.',
      };
    }

    return {
      success: true,
      credentialId: returnedId,
      message: 'Hardware fingerprint verified! Access granted.',
    };
  } catch (err: any) {
    console.error('Fingerprint verification error:', err);
    return {
      success: false,
      message: formatWebAuthnError(err, 'verify'),
    };
  }
}
