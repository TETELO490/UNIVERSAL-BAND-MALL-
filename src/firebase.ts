// ============================================================================
// MAIN APP FIREBASE CONFIGURATION
// Connects both Authentication and Firestore to the MAIN app project
// ============================================================================
export const SUPPORT_EMAIL = 'Tetelophokwane90@gmail.com';
export const SUPPORT_PHONE = '0763046653';

import defaultFirebaseConfig from '../firebase-applet-config.json';

export const firebaseConfig = {
  apiKey: defaultFirebaseConfig.apiKey || "AIzaSyBLAMVNQhG1ncEh3utupnFhfwL2kaSrzwo",
  authDomain: defaultFirebaseConfig.authDomain || "lunar-idiom-zggh3.firebaseapp.com",
  projectId: defaultFirebaseConfig.projectId || "lunar-idiom-zggh3",
  storageBucket: defaultFirebaseConfig.storageBucket || "lunar-idiom-zggh3.firebasestorage.app",
  messagingSenderId: defaultFirebaseConfig.messagingSenderId || "186057622178",
  appId: defaultFirebaseConfig.appId || "1:186057622178:web:29b87f9e55636047554dfb",
  firestoreDatabaseId: defaultFirebaseConfig.firestoreDatabaseId || "ai-studio-remixuniversalba-8a305cb4-0ee6-4427-917e-7d94b2b174e3",
  oAuthClientId: (defaultFirebaseConfig as any).oAuthClientId || "186057622178-i320v89cavabi40htj1m5kutknbcf2j9.apps.googleusercontent.com",
};
export const customFirebaseConfig = firebaseConfig;

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Initialize a SINGLE unified app instance so Auth and Firestore are ALWAYS in sync
export const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);

// Initialize Firestore on the exact database associated with the project
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Universal ActionCodeSettings helper for continue URL (email verification, password reset, etc.)
 * Always returns window.location.origin so users are returned to the correct domain without invalid-continue-uri error.
 */
export const getActionCodeSettings = (): { url: string; handleCodeInApp: boolean } | undefined => {
  if (typeof window === 'undefined') return undefined;
  const origin = window.location.origin;
  // If running inside mobile APK, localhost, or non-http protocol, omit custom action settings
  // so Firebase automatically uses its standard, reliable web action handler without invalid action errors
  if (!origin || origin.includes('localhost') || origin.includes('capacitor:') || origin.includes('file:')) {
    return undefined;
  }
  return {
    url: origin,
    handleCodeInApp: false,
  };
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Error Handled: ', JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firestore connection verified');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
