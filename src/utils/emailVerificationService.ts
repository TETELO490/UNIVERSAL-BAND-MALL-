// ============================================================================
// FIREBASE AUTH EMAIL VERIFICATION SERVICE (ONLY FIREBASE - NO EMAILJS / NO FAKE OTP)
// ============================================================================

import { User, sendEmailVerification, reload, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, getActionCodeSettings } from '../firebase';

export const SUPPORT_EMAIL = 'Tetelophokwane90@gmail.com';
export const SUPPORT_PHONE = '0763046653';

/**
 * Sends a standard Firebase Authentication email verification link
 */
export async function sendFirebaseVerificationLink(
  targetUserOrEmail?: User | string | null,
  password?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const actionSettings = getActionCodeSettings();

    if (typeof targetUserOrEmail !== 'string' && targetUserOrEmail?.email) {
      await sendEmailVerification(targetUserOrEmail, actionSettings);
      return { success: true };
    }

    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser, actionSettings);
      return { success: true };
    }

    const email = typeof targetUserOrEmail === 'string' ? targetUserOrEmail.trim() : '';
    if (email && password) {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user, actionSettings);
      await signOut(auth);
      return { success: true };
    }

    if (email && auth.currentUser) {
      await sendEmailVerification(auth.currentUser, actionSettings);
      return { success: true };
    }

    return { success: false, error: 'Please enter your password above and click "Resend Verification Email".' };
  } catch (err: any) {
    console.warn('Firebase sendEmailVerification error:', err);
    if (err?.code === 'auth/too-many-requests') {
      return { success: false, error: 'Too many requests. Please wait a minute before requesting another verification email.' };
    }
    return { success: false, error: err?.message || 'Failed to send verification email. Please try again.' };
  }
}

/**
 * Checks if the user has clicked the verification link by reloading the Firebase Auth user or checking storage
 */
export async function checkFirebaseEmailVerified(
  targetUser?: User | null,
  fallbackEmail?: string
): Promise<{ verified: boolean; error?: string }> {
  let user = targetUser || auth.currentUser;
  
  if (user) {
    try {
      await reload(user);
      if (user.emailVerified) {
        const cleanEmail = (user.email || '').toLowerCase();
        try {
          await setDoc(doc(db, 'users', user.uid), { emailVerified: true }, { merge: true });
          localStorage.setItem(`ub_email_verified_${cleanEmail}`, 'true');
        } catch (e) {}
        return { verified: true };
      }
    } catch (err: any) {
      console.warn('Reload user verification check notice:', err);
    }
  }

  const cleanEmail = (fallbackEmail || user?.email || '').trim().toLowerCase();
  if (cleanEmail) {
    if (localStorage.getItem(`ub_email_verified_${cleanEmail}`) === 'true') {
      return { verified: true };
    }
    // Whitelisted admin/owner emails
    if (isUserVerified(cleanEmail, user)) {
      return { verified: true };
    }
  }

  if (!user && !cleanEmail) {
    return { verified: false, error: 'No user session found to check.' };
  }

  return { verified: false };
}

/**
 * Universal verification checker: Checks Firebase Auth status, storage & whitelist
 */
export function isUserVerified(email?: string | null, firebaseUser?: User | null): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();

  // Whitelist Master Admin & Owner emails
  if (
    cleanEmail === 'tetelophokwane98@gmail.com'
  ) {
    return true;
  }

  if (localStorage.getItem(`ub_email_verified_${cleanEmail}`) === 'true') {
    return true;
  }

  if (firebaseUser && firebaseUser.emailVerified) {
    return true;
  }
  if (auth.currentUser && auth.currentUser.email?.toLowerCase() === cleanEmail && auth.currentUser.emailVerified) {
    return true;
  }

  return false;
}
