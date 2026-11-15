import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { db, auth } from '../../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { sha256 } from '../../utils/cryptoHelper';
import {
  enrollFingerprintBiometrics,
  authenticateWithBiometrics,
  isRealCredentialId,
} from '../../utils/multiLockSecurity';
import {
  ShieldCheck,
  X,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  HelpCircle,
  Fingerprint,
  Grid3X3,
  Check,
  RefreshCw,
  Lock,
} from 'lucide-react';

interface AdminSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export type LockType = 'PIN' | 'PASSWORD' | 'LUCKY' | 'PATTERN' | 'FINGERPRINT';

interface AdminLocksVault {
  pin: string;
  pinHash: string;
  passwordHash: string;
  luckyNumber: string;
  luckyNumberHash: string;
  pattern: number[];
  patternHash: string;
  fingerprintCredentialId?: string;
  fingerprintEnrolled?: boolean;
  recoveryEmail: string;
  isSetupComplete: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'ub_admin_security_vault_v5';
const RESET_FLAG_KEY = 'ub_admin_locks_v5_reset_applied_v1';

export const AdminSecurityModal: React.FC<AdminSecurityModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useApp();

  const [modalMode, setModalMode] = useState<
    'SETUP' | 'VERIFY' | 'FINGERPRINT_EMAIL_VERIFY'
  >('VERIFY');
  const [activeLockTab, setActiveLockTab] = useState<LockType>('PIN');

  const [vault, setVault] = useState<AdminLocksVault | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);

  // 5-Lock Verification State (ALL 5 must be unlocked one-by-one)
  const [verifiedLocks, setVerifiedLocks] = useState<{
    PIN: boolean;
    PASSWORD: boolean;
    LUCKY: boolean;
    PATTERN: boolean;
    FINGERPRINT: boolean;
  }>({
    PIN: false,
    PASSWORD: false,
    LUCKY: false,
    PATTERN: false,
    FINGERPRINT: false,
  });

  const [failCounts, setFailCounts] = useState<{
    PIN: number;
    PASSWORD: number;
    LUCKY: number;
    PATTERN: number;
    FINGERPRINT: number;
  }>({
    PIN: 0,
    PASSWORD: 0,
    LUCKY: 0,
    PATTERN: 0,
    FINGERPRINT: 0,
  });

  // Verification Inputs
  const [verifyPin, setVerifyPin] = useState<string>('');
  const [verifyPassword, setVerifyPassword] = useState<string>('');
  const [showVerifyPassword, setShowVerifyPassword] = useState<boolean>(false);
  const [verifyLuckyNumber, setVerifyLuckyNumber] = useState<string>('');
  const [verifyPattern, setVerifyPattern] = useState<number[]>([]);
  const [isVerifyingFingerprint, setIsVerifyingFingerprint] = useState<boolean>(false);

  // Setup Wizard Inputs (All 5 Locks)
  const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [setupPin, setSetupPin] = useState<string>('');
  const [setupConfirmPin, setSetupConfirmPin] = useState<string>('');
  const [setupPassword, setSetupPassword] = useState<string>('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState<string>('');
  const [showSetupPassword, setShowSetupPassword] = useState<boolean>(false);
  const [setupLuckyNumber, setSetupLuckyNumber] = useState<string>('');
  const [setupConfirmLuckyNumber, setSetupConfirmLuckyNumber] = useState<string>('');
  const [setupRecoveryEmail, setSetupRecoveryEmail] = useState<string>(
    'tetelophokwane98@gmail.com'
  );
  const [setupPattern, setSetupPattern] = useState<number[]>([]);
  const [setupConfirmPattern, setSetupConfirmPattern] = useState<number[]>([]);
  const [isConfirmingPattern, setIsConfirmingPattern] = useState<boolean>(false);
  const [setupFingerprintCredId, setSetupFingerprintCredId] = useState<string>('');
  const [isEnrollingFingerprint, setIsEnrollingFingerprint] = useState<boolean>(false);
  const [setupEmailLinkSent, setSetupEmailLinkSent] = useState<boolean>(false);
  const [setupEmailLinkVerified, setSetupEmailLinkVerified] = useState<boolean>(false);

  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const patternGridRef = useRef<HTMLDivElement>(null);

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setIsShaking(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch (_) {}
    setTimeout(() => setIsShaking(false), 500);
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Load / Reset Vault on modal open
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage('');
    setSuccessMessage('');
    setVerifyPin('');
    setVerifyPassword('');
    setVerifyLuckyNumber('');
    setVerifyPattern([]);
    setIsVerifyingFingerprint(false);
    setVerifiedLocks({
      PIN: false,
      PASSWORD: false,
      LUCKY: false,
      PATTERN: false,
      FINGERPRINT: false,
    });
    setFailCounts({
      PIN: 0,
      PASSWORD: 0,
      LUCKY: 0,
      PATTERN: 0,
      FINGERPRINT: 0,
    });
    setLoading(true);

    const initVault = async () => {
      try {
        // PART 1 REQUIREMENT: RESET ALL 5 ADMIN LOCKS
        const resetDone = localStorage.getItem(RESET_FLAG_KEY);
        if (!resetDone) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem('ub_admin_security_vault_v4');
          localStorage.removeItem('ub_admin_session');

          try {
            await setDoc(
              doc(db, 'adminSecurity', 'admin_security_root'),
              {
                isSetupComplete: false,
                pin: '',
                pinHash: '',
                passwordHash: '',
                luckyNumber: '',
                luckyNumberHash: '',
                pattern: [],
                patternHash: '',
                fingerprintCredentialId: '',
                fingerprintEnrolled: false,
                recoveryEmail: 'tetelophokwane98@gmail.com',
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (resetErr) {
            console.warn('Firestore admin reset notice:', resetErr);
          }

          localStorage.setItem(RESET_FLAG_KEY, 'true');
        }

        // Try to load existing vault
        const localRaw = localStorage.getItem(STORAGE_KEY);
        let loadedVault: AdminLocksVault | null = null;

        if (localRaw) {
          try {
            const parsed = JSON.parse(localRaw);
            if (parsed && parsed.isSetupComplete) {
              loadedVault = parsed;
            }
          } catch (_) {}
        }

        if (!loadedVault) {
          try {
            const snap = await getDoc(doc(db, 'adminSecurity', 'admin_security_root'));
            if (snap.exists()) {
              const data = snap.data();
              if (data.isSetupComplete && data.pinHash && data.passwordHash) {
                loadedVault = {
                  pin: data.pin || '',
                  pinHash: data.pinHash || '',
                  passwordHash: data.passwordHash || '',
                  luckyNumber: data.luckyNumber || '',
                  luckyNumberHash: data.luckyNumberHash || '',
                  pattern: data.pattern || [],
                  patternHash: data.patternHash || '',
                  fingerprintCredentialId: data.fingerprintCredentialId || '',
                  fingerprintEnrolled: Boolean(data.fingerprintCredentialId),
                  recoveryEmail: data.recoveryEmail || 'tetelophokwane98@gmail.com',
                  isSetupComplete: true,
                  updatedAt: new Date().toISOString(),
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedVault));
              }
            }
          } catch (fsErr) {
            console.warn('Firestore fetch notice:', fsErr);
          }
        }

        if (loadedVault && loadedVault.isSetupComplete) {
          setVault(loadedVault);
          setModalMode('VERIFY');
          setActiveLockTab('PIN');
        } else {
          setVault(null);
          setModalMode('SETUP');
          setSetupStep(1);
          setSetupPin('');
          setSetupConfirmPin('');
          setSetupPassword('');
          setSetupConfirmPassword('');
          setSetupLuckyNumber('');
          setSetupConfirmLuckyNumber('');
          setSetupPattern([]);
          setSetupConfirmPattern([]);
          setSetupFingerprintCredId('');
          setSetupRecoveryEmail(currentUser?.email || 'tetelophokwane98@gmail.com');
        }
      } catch (e) {
        console.warn('Error loading admin locks vault:', e);
        setModalMode('SETUP');
      } finally {
        setLoading(false);
      }
    };

    initVault();
  }, [isOpen, currentUser?.email]);

  if (!isOpen) return null;

  // Helper: check if all 5 locks are verified
  const checkAllLocksPassed = (updated: typeof verifiedLocks) => {
    return (
      updated.PIN &&
      updated.PASSWORD &&
      updated.LUCKY &&
      updated.PATTERN &&
      updated.FINGERPRINT
    );
  };

  const getNextUnverifiedLock = (
    current: LockType,
    updated: typeof verifiedLocks
  ): LockType => {
    const sequence: LockType[] = [
      'PIN',
      'PASSWORD',
      'LUCKY',
      'PATTERN',
      'FINGERPRINT',
    ];
    const next = sequence.find((k) => !updated[k]);
    return next || current;
  };

  const markLockPassed = (lock: LockType) => {
    const updated = { ...verifiedLocks, [lock]: true };
    setVerifiedLocks(updated);
    setErrorMessage('');

    if (checkAllLocksPassed(updated)) {
      setSuccessMessage('All 5 Admin Locks Verified! Access Granted to Admin Dashboard...');
      localStorage.setItem('ub_admin_session', 'true');
      setTimeout(() => {
        onSuccess();
      }, 700);
    } else {
      const nextLock = getNextUnverifiedLock(lock, updated);
      const passedCount = Object.values(updated).filter(Boolean).length;
      setSuccessMessage(`${lock} Verified! (${passedCount} of 5 locks passed)`);
      setTimeout(() => {
        setSuccessMessage('');
        setActiveLockTab(nextLock);
      }, 500);
    }
  };

  const recordLockFailure = (lock: LockType, failMsg: string) => {
    setFailCounts((prev) => ({
      ...prev,
      [lock]: prev[lock] + 1,
    }));
    triggerError(failMsg);
  };

  // --- VERIFY HANDLERS ---
  const handleVerifyPin = async (pinAttempt: string) => {
    setErrorMessage('');
    if (!vault || pinAttempt.length !== 4) return;

    const hash = await sha256(pinAttempt.trim());
    const matched = vault.pinHash
      ? hash === vault.pinHash
      : pinAttempt.trim() === vault.pin;

    if (matched) {
      markLockPassed('PIN');
      setVerifyPin('');
    } else {
      recordLockFailure('PIN', 'PIN verification failed. Try again.');
      setVerifyPin('');
    }
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!vault) return;

    if (!verifyPassword.trim()) {
      triggerError('Please enter your admin password.');
      return;
    }

    const hash = await sha256(verifyPassword.trim());
    if (hash === vault.passwordHash) {
      markLockPassed('PASSWORD');
      setVerifyPassword('');
    } else {
      recordLockFailure('PASSWORD', 'Password verification failed. Try again.');
    }
  };

  const handleVerifyLuckyNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!vault) return;

    if (!verifyLuckyNumber.trim()) {
      triggerError('Please enter your secret lucky number.');
      return;
    }

    const hash = await sha256(verifyLuckyNumber.trim().toLowerCase());
    const matched = vault.luckyNumberHash
      ? hash === vault.luckyNumberHash
      : verifyLuckyNumber.trim().toLowerCase() === vault.luckyNumber.toLowerCase();

    if (matched) {
      markLockPassed('LUCKY');
      setVerifyLuckyNumber('');
    } else {
      recordLockFailure('LUCKY', 'Lucky Number verification failed. Try again.');
    }
  };

  const handleVerifyPattern = async () => {
    setErrorMessage('');
    if (!vault) return;

    if (verifyPattern.length < 4) {
      triggerError('Pattern must connect at least 4 dots.');
      return;
    }

    const patternString = verifyPattern.join('-');
    const hash = await sha256(patternString);
    const matched = vault.patternHash
      ? hash === vault.patternHash
      : patternString === (vault.pattern || []).join('-');

    if (matched) {
      markLockPassed('PATTERN');
      setVerifyPattern([]);
    } else {
      recordLockFailure('PATTERN', 'Pattern verification failed. Try again.');
      setVerifyPattern([]);
    }
  };

  const handleVerifyFingerprint = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!vault) return;

    if (!isRealCredentialId(vault.fingerprintCredentialId)) {
      triggerError('No hardware fingerprint enrolled in admin vault. Enroll below.');
      return;
    }

    setIsVerifyingFingerprint(true);
    try {
      const res = await authenticateWithBiometrics(
        vault.fingerprintCredentialId,
        vault.recoveryEmail
      );
      if (res.success) {
        markLockPassed('FINGERPRINT');
      } else {
        recordLockFailure(
          'FINGERPRINT',
          res.message || 'Fingerprint verification failed. Try again.'
        );
      }
    } catch (err: any) {
      recordLockFailure(
        'FINGERPRINT',
        err?.message || 'Fingerprint sensor error. Try again.'
      );
    } finally {
      setIsVerifyingFingerprint(false);
    }
  };

  // --- SETUP WIZARD HANDLERS (5 LOCKS) ---
  const handleSendSetupEmailLink = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    const adminEmail =
      setupRecoveryEmail.trim().toLowerCase() ||
      currentUser?.email ||
      'tetelophokwane98@gmail.com';
    setLoading(true);

    try {
      const sentAt = Date.now();
      const expiresAt = sentAt + 60 * 60 * 1000;
      localStorage.setItem(
        `ub_fingerprint_link_${adminEmail}`,
        JSON.stringify({ sentAt, expiresAt, verified: false })
      );

      try {
        await sendSignInLinkToEmail(auth, adminEmail, {
          url: window.location.origin + '?verify_fingerprint=true',
          handleCodeInApp: true,
        });
      } catch (authErr) {
        console.warn('sendSignInLinkToEmail notice:', authErr);
      }

      setSetupEmailLinkSent(true);
      setResendCooldown(60);
      setSuccessMessage(
        `Verification link sent to ${adminEmail}! Tap the link in your email to confirm.`
      );
    } catch (err: any) {
      triggerError(err?.message || 'Failed to dispatch verification link.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSetupEmailVerified = () => {
    setSetupEmailLinkVerified(true);
    setSuccessMessage('Email link verified! Now touch hardware fingerprint sensor.');
  };

  const handleSetupEnrollFingerprint = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsEnrollingFingerprint(true);
    try {
      const adminEmail =
        setupRecoveryEmail.trim().toLowerCase() ||
        currentUser?.email ||
        'tetelophokwane98@gmail.com';
      const res = await enrollFingerprintBiometrics(
        adminEmail,
        currentUser?.fullName || currentUser?.name || 'Universal Band Admin',
        currentUser?.id
      );
      if (res.success && isRealCredentialId(res.credentialId)) {
        setSetupFingerprintCredId(res.credentialId);
        setSuccessMessage('Hardware fingerprint enrolled cleanly! Now save all 5 locks.');
      } else {
        triggerError(res.message || 'Hardware fingerprint enrollment failed.');
      }
    } catch (err: any) {
      triggerError(err?.message || 'Biometric sensor error.');
    } finally {
      setIsEnrollingFingerprint(false);
    }
  };

  const handleCompleteSetup = async () => {
    setErrorMessage('');

    // Validate 1: PIN
    if (!setupPin || setupPin.length !== 4) {
      triggerError('Admin PIN must be exactly 4 digits.');
      setSetupStep(1);
      return;
    }
    if (setupPin !== setupConfirmPin) {
      triggerError('PIN confirmation does not match.');
      setSetupStep(1);
      return;
    }

    // Validate 2: Pass
    if (!setupPassword || setupPassword.length < 6) {
      triggerError('Admin password must be at least 6 characters.');
      setSetupStep(2);
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      triggerError('Password confirmation does not match.');
      setSetupStep(2);
      return;
    }

    // Validate 3: Lucky
    if (!setupLuckyNumber.trim()) {
      triggerError('Please enter your secret lucky number.');
      setSetupStep(3);
      return;
    }
    if (setupLuckyNumber.trim() !== setupConfirmLuckyNumber.trim()) {
      triggerError('Lucky number confirmation does not match.');
      setSetupStep(3);
      return;
    }

    // Validate 4: Pattern
    if (setupPattern.length < 4) {
      triggerError('Pattern must connect at least 4 dots.');
      setSetupStep(4);
      return;
    }
    if (setupPattern.join('-') !== setupConfirmPattern.join('-')) {
      triggerError('Pattern confirmation does not match. Redraw pattern to confirm.');
      setSetupStep(4);
      return;
    }

    // Validate 5: Fingerprint
    if (!isRealCredentialId(setupFingerprintCredId)) {
      triggerError('Please scan and enroll your hardware fingerprint sensor in Step 5.');
      setSetupStep(5);
      return;
    }

    setLoading(true);
    try {
      const pHash = await sha256(setupPin.trim());
      const passHash = await sha256(setupPassword.trim());
      const lHash = await sha256(setupLuckyNumber.trim().toLowerCase());
      const patHash = await sha256(setupPattern.join('-'));

      const newVault: AdminLocksVault = {
        pin: setupPin.trim(),
        pinHash: pHash,
        passwordHash: passHash,
        luckyNumber: setupLuckyNumber.trim(),
        luckyNumberHash: lHash,
        pattern: setupPattern,
        patternHash: patHash,
        fingerprintCredentialId: setupFingerprintCredId,
        fingerprintEnrolled: true,
        recoveryEmail:
          setupRecoveryEmail.trim().toLowerCase() || 'tetelophokwane98@gmail.com',
        isSetupComplete: true,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newVault));
      localStorage.setItem('ub_admin_session', 'true');

      try {
        await setDoc(doc(db, 'adminSecurity', 'admin_security_root'), {
          ...newVault,
          updatedAt: serverTimestamp(),
        });
      } catch (fsErr) {
        console.warn('Firestore mirror warning:', fsErr);
      }

      setVault(newVault);
      setSuccessMessage('All 5 Admin Locks Set Successfully');

      setTimeout(() => {
        onSuccess();
      }, 900);
    } catch (err: any) {
      triggerError(err?.message || 'Failed to save admin locks.');
    } finally {
      setLoading(false);
    }
  };

  // Re-enroll fingerprint flow via email link
  const handleInitiateFingerprintEmailLink = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setModalMode('FINGERPRINT_EMAIL_VERIFY');

    const adminEmail =
      vault?.recoveryEmail || currentUser?.email || 'tetelophokwane98@gmail.com';
    setLoading(true);

    try {
      const sentAt = Date.now();
      const expiresAt = sentAt + 60 * 60 * 1000;
      localStorage.setItem(
        `ub_fingerprint_link_${adminEmail}`,
        JSON.stringify({ sentAt, expiresAt, verified: false })
      );

      try {
        await sendSignInLinkToEmail(auth, adminEmail, {
          url: window.location.origin + '?verify_fingerprint=true',
          handleCodeInApp: true,
        });
      } catch (authErr) {
        console.warn('sendSignInLinkToEmail notice:', authErr);
      }

      setResendCooldown(60);
      setSuccessMessage(`Verification link dispatched to ${adminEmail}. Check your email.`);
    } catch (err: any) {
      triggerError(err?.message || 'Failed to dispatch verification link.');
    } finally {
      setLoading(false);
    }
  };

  const handleReEnrollFingerprintSensor = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsEnrollingFingerprint(true);
    try {
      const adminEmail =
        vault?.recoveryEmail || currentUser?.email || 'tetelophokwane98@gmail.com';
      const res = await enrollFingerprintBiometrics(
        adminEmail,
        currentUser?.fullName || currentUser?.name || 'Universal Band Admin',
        currentUser?.id
      );
      if (res.success && isRealCredentialId(res.credentialId)) {
        const updatedVault = vault
          ? { ...vault }
          : ({
              pin: '',
              pinHash: '',
              passwordHash: '',
              luckyNumber: '',
              luckyNumberHash: '',
              pattern: [],
              patternHash: '',
              recoveryEmail: adminEmail,
              isSetupComplete: true,
              updatedAt: new Date().toISOString(),
            } as AdminLocksVault);

        updatedVault.fingerprintCredentialId = res.credentialId;
        updatedVault.fingerprintEnrolled = true;
        updatedVault.updatedAt = new Date().toISOString();

        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedVault));
        try {
          await setDoc(doc(db, 'adminSecurity', 'admin_security_root'), {
            ...updatedVault,
            updatedAt: serverTimestamp(),
          });
        } catch (_) {}

        setVault(updatedVault);
        markLockPassed('FINGERPRINT');
        setSuccessMessage('Fingerprint enrolled. Tap to Verify');
        setTimeout(() => {
          setModalMode('VERIFY');
          setActiveLockTab('FINGERPRINT');
          setSuccessMessage('');
        }, 1000);
      } else {
        triggerError(res.message || 'Hardware fingerprint enrollment failed.');
      }
    } catch (err: any) {
      triggerError(err?.message || 'Biometric sensor error.');
    } finally {
      setIsEnrollingFingerprint(false);
    }
  };

  const handleKeypadPress = (
    val: string,
    target: 'verify' | 'setup_pin' | 'setup_confirm'
  ) => {
    let current = '';
    if (target === 'verify') current = verifyPin;
    else if (target === 'setup_pin') current = setupPin;
    else if (target === 'setup_confirm') current = setupConfirmPin;

    if (val === 'DEL') {
      const next = current.slice(0, -1);
      if (target === 'verify') setVerifyPin(next);
      else if (target === 'setup_pin') setSetupPin(next);
      else if (target === 'setup_confirm') setSetupConfirmPin(next);
      return;
    }

    if (val === 'CLR') {
      if (target === 'verify') setVerifyPin('');
      else if (target === 'setup_pin') setSetupPin('');
      else if (target === 'setup_confirm') setSetupConfirmPin('');
      return;
    }

    if (current.length >= 4) return;
    const next = current + val;

    if (target === 'verify') {
      setVerifyPin(next);
      if (next.length === 4) {
        handleVerifyPin(next);
      }
    } else if (target === 'setup_pin') {
      setSetupPin(next);
    } else if (target === 'setup_confirm') {
      setSetupConfirmPin(next);
    }
  };

  const renderDotGrid = (
    currentPattern: number[],
    onDotClick: (idx: number) => void
  ) => {
    return (
      <div
        ref={patternGridRef}
        className="w-64 h-64 mx-auto bg-black/60 border border-white/10 rounded-2xl p-4 grid grid-cols-3 grid-rows-3 gap-4 select-none relative"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((dotIdx) => {
          const isSelected = currentPattern.includes(dotIdx);
          const order = currentPattern.indexOf(dotIdx);
          return (
            <button
              key={dotIdx}
              type="button"
              onClick={() => onDotClick(dotIdx)}
              className={`relative rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#FACC15] scale-110 shadow-[0_0_15px_#FACC15]'
                  : 'bg-white/20 hover:bg-white/40'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  isSelected ? 'bg-black' : 'bg-white/60'
                }`}
              />
              {isSelected && (
                <span className="absolute -top-1 -right-1 bg-black text-[#FACC15] text-[9px] font-black w-4 h-4 rounded-full border border-[#FACC15] flex items-center justify-center">
                  {order + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const verifiedCount = Object.values(verifiedLocks).filter(Boolean).length;
  const currentFailCount = failCounts[activeLockTab] || 0;

  const handleModalClose = () => {
    if (modalMode === 'VERIFY' && !checkAllLocksPassed(verifiedLocks)) {
      triggerError('Unlock all 5 keys to continue');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className={`w-full max-w-sm bg-[#161616] rounded-3xl border border-white/10 p-5 shadow-2xl relative max-h-[94vh] overflow-y-auto my-auto flex flex-col ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Close Button */}
        <button
          onClick={handleModalClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-2xl bg-[#FACC15] flex items-center justify-center text-black font-black text-xs shadow-md">
            UB
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>
                {modalMode === 'SETUP'
                  ? 'Set Up Your 5 Admin Locks'
                  : 'Admin 5-Lock Security Check'}
              </span>
              <span className="text-[9px] bg-yellow-400/20 text-[#FACC15] px-1.5 py-0.5 rounded font-extrabold border border-yellow-400/30 uppercase">
                ADMIN
              </span>
            </h2>
            <p className="text-[11px] text-gray-400">
              {modalMode === 'SETUP'
                ? 'Configure PIN, Pass, Lucky, Pattern, and Fingerprint'
                : 'Unlock ALL 5 locks to access Admin Dashboard'}
            </p>
          </div>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="mb-3 p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mb-3 p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* MODE 1: 5-STEP SETUP WIZARD */}
        {modalMode === 'SETUP' && (
          <div className="flex flex-col gap-3">
            {/* Step Indicators in Exact Order */}
            <div className="grid grid-cols-5 gap-1 p-1 bg-white/5 rounded-xl border border-white/5 text-[9px] font-bold text-center">
              {[
                { step: 1 as const, label: '1. PIN' },
                { step: 2 as const, label: '2. Pass' },
                { step: 3 as const, label: '3. Lucky' },
                { step: 4 as const, label: '4. Pattern' },
                { step: 5 as const, label: '5. Touch' },
              ].map((s) => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setSetupStep(s.step)}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    setupStep === s.step
                      ? 'bg-[#FACC15] text-black shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* STEP 1: SET PIN > CONFIRM PIN */}
            {setupStep === 1 && (
              <div className="flex flex-col gap-3 items-center py-1">
                <span className="text-xs font-bold text-gray-300 text-center">
                  Step 1: Set 4-Digit Admin PIN
                </span>

                <div className="flex justify-center gap-3 my-1">
                  {[0, 1, 2, 3].map((idx) => {
                    const filled = setupPin.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all ${
                          filled
                            ? 'border-[#FACC15] bg-[#FACC15]/20 text-[#FACC15] text-lg font-black'
                            : 'border-white/20 bg-white/5'
                        }`}
                      >
                        {filled ? '●' : ''}
                      </div>
                    );
                  })}
                </div>

                {setupPin.length === 4 && (
                  <div className="w-full">
                    <span className="text-xs text-gray-400 block mb-1 text-center">
                      Confirm your 4-digit PIN:
                    </span>
                    <div className="flex justify-center gap-3 mb-1">
                      {[0, 1, 2, 3].map((idx) => {
                        const filled = setupConfirmPin.length > idx;
                        return (
                          <div
                            key={idx}
                            className={`w-9 h-9 rounded-lg border flex items-center justify-center ${
                              filled
                                ? 'border-[#FACC15] bg-[#FACC15]/20 text-[#FACC15] font-black'
                                : 'border-white/20 bg-white/5'
                            }`}
                          >
                            {filled ? '●' : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 w-full max-w-[270px]">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        handleKeypadPress(k, setupPin.length < 4 ? 'setup_pin' : 'setup_confirm')
                      }
                      className="py-2.5 bg-white/5 hover:bg-white/10 active:bg-[#FACC15] active:text-black rounded-xl text-white font-bold text-sm transition-colors border border-white/5 cursor-pointer"
                    >
                      {k}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (setupPin.length !== 4) {
                      triggerError('Please enter a 4-digit PIN.');
                      return;
                    }
                    if (setupPin !== setupConfirmPin) {
                      triggerError('PIN confirmation does not match. Please re-enter confirm PIN.');
                      setSetupConfirmPin('');
                      return;
                    }
                    setErrorMessage('');
                    setSetupStep(2);
                  }}
                  className="mt-1 w-full bg-[#FACC15] text-black font-black py-3 rounded-xl hover:bg-[#eab308] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  <span>Next: Set Pass (Password)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 2: SET PASS > CONFIRM PASS */}
            {setupStep === 2 && (
              <div className="flex flex-col gap-3 py-1">
                <span className="text-xs font-bold text-gray-300">
                  Step 2: Set Admin Pass (Password / Passphrase)
                </span>
                <div className="relative">
                  <input
                    type={showSetupPassword ? 'text' : 'password'}
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Enter new admin pass (min 6 characters)"
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPassword(!showSetupPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-white cursor-pointer"
                  >
                    {showSetupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <input
                  type={showSetupPassword ? 'text' : 'password'}
                  value={setupConfirmPassword}
                  onChange={(e) => setSetupConfirmPassword(e.target.value)}
                  placeholder="Confirm admin pass"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!setupPassword || setupPassword.length < 6) {
                      triggerError('Pass must be at least 6 characters.');
                      return;
                    }
                    if (setupPassword !== setupConfirmPassword) {
                      triggerError('Pass confirmation does not match.');
                      return;
                    }
                    setErrorMessage('');
                    setSetupStep(3);
                  }}
                  className="mt-1 w-full bg-[#FACC15] text-black font-black py-3 rounded-xl hover:bg-[#eab308] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  <span>Next: Set Lucky Number</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 3: SET LUCKY > CONFIRM LUCKY */}
            {setupStep === 3 && (
              <div className="flex flex-col gap-3 py-1">
                <span className="text-xs font-bold text-gray-300">
                  Step 3: Set Secret Lucky Number / Code
                </span>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">
                    Your Secret Lucky Number(s)
                  </label>
                  <input
                    type="text"
                    value={setupLuckyNumber}
                    onChange={(e) => setSetupLuckyNumber(e.target.value)}
                    placeholder="e.g. 7 or 777"
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">
                    Confirm Lucky Number
                  </label>
                  <input
                    type="text"
                    value={setupConfirmLuckyNumber}
                    onChange={(e) => setSetupConfirmLuckyNumber(e.target.value)}
                    placeholder="Re-enter lucky number"
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">
                    Admin Recovery Email
                  </label>
                  <input
                    type="email"
                    value={setupRecoveryEmail}
                    onChange={(e) => setSetupRecoveryEmail(e.target.value)}
                    placeholder="tetelophokwane98@gmail.com"
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!setupLuckyNumber.trim()) {
                      triggerError('Please enter your secret lucky number.');
                      return;
                    }
                    if (setupLuckyNumber.trim() !== setupConfirmLuckyNumber.trim()) {
                      triggerError('Lucky number confirmation does not match.');
                      return;
                    }
                    if (!setupRecoveryEmail.trim()) {
                      triggerError('Please enter admin recovery email.');
                      return;
                    }
                    setErrorMessage('');
                    setSetupStep(4);
                  }}
                  className="mt-1 w-full bg-[#FACC15] text-black font-black py-3 rounded-xl hover:bg-[#eab308] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  <span>Next: Draw Pattern Lock</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 4: SET PATTERN > CONFIRM PATTERN */}
            {setupStep === 4 && (
              <div className="flex flex-col gap-3 items-center py-1">
                <span className="text-xs font-bold text-gray-300 text-center">
                  {!isConfirmingPattern
                    ? 'Step 4: Draw Pattern (Connect at least 4 dots)'
                    : 'Confirm Pattern (Draw the same pattern again)'}
                </span>

                {!isConfirmingPattern ? (
                  renderDotGrid(setupPattern, (idx) => {
                    if (!setupPattern.includes(idx)) {
                      setSetupPattern((prev) => [...prev, idx]);
                    }
                  })
                ) : (
                  renderDotGrid(setupConfirmPattern, (idx) => {
                    if (!setupConfirmPattern.includes(idx)) {
                      setSetupConfirmPattern((prev) => [...prev, idx]);
                    }
                  })
                )}

                <div className="flex gap-2 w-full max-w-[260px]">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isConfirmingPattern) setSetupPattern([]);
                      else setSetupConfirmPattern([]);
                    }}
                    className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-300 hover:text-white flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>

                {!isConfirmingPattern ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (setupPattern.length < 4) {
                        triggerError('Pattern must connect at least 4 dots.');
                        return;
                      }
                      setErrorMessage('');
                      setIsConfirmingPattern(true);
                    }}
                    className="mt-1 w-full bg-[#FACC15] text-black font-black py-3 rounded-xl hover:bg-[#eab308] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <span>Next: Confirm Pattern</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (setupConfirmPattern.length < 4) {
                        triggerError('Confirm pattern must connect at least 4 dots.');
                        return;
                      }
                      if (setupPattern.join('-') !== setupConfirmPattern.join('-')) {
                        triggerError('Patterns do not match. Redraw confirm pattern.');
                        setSetupConfirmPattern([]);
                        return;
                      }
                      setErrorMessage('');
                      setSetupStep(5);
                    }}
                    className="mt-1 w-full bg-[#FACC15] text-black font-black py-3 rounded-xl hover:bg-[#eab308] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <span>Next: Enroll Fingerprint</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* STEP 5: ENROLL FINGERPRINT VIA EMAIL VERIFICATION LINK */}
            {setupStep === 5 && (
              <div className="flex flex-col gap-3 items-center py-1 text-center">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${
                    isRealCredentialId(setupFingerprintCredId)
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-lg shadow-emerald-500/20'
                      : 'bg-[#FACC15]/10 border-[#FACC15]/40 text-[#FACC15]'
                  }`}
                >
                  <Fingerprint className={`w-8 h-8 ${isEnrollingFingerprint ? 'animate-pulse' : ''}`} />
                </div>

                <div>
                  <span className="text-xs font-bold text-white block">
                    Step 5: Enroll Fingerprint via Email Link Verification
                  </span>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-xs">
                    We will send a verification link to{' '}
                    <strong className="text-white">
                      {setupRecoveryEmail || 'tetelophokwane98@gmail.com'}
                    </strong>
                    . Tap the link in the email to confirm you want to enroll your fingerprint.
                  </p>
                </div>

                <div className="w-full p-2.5 bg-black/40 border border-white/10 rounded-xl text-[10px] text-gray-300 text-left space-y-1">
                  <p>
                    <strong className="text-white">Email Subject:</strong> Verify to Enroll Fingerprint - Universal Band Admin
                  </p>
                  <p>
                    <strong className="text-white">Email Body:</strong> Tap this link to confirm you want to enroll your fingerprint for Universal Band Admin. This will NOT reset your password. If you did not request this, ignore this email.
                  </p>
                </div>

                {!setupEmailLinkVerified ? (
                  <div className="w-full space-y-2">
                    <button
                      type="button"
                      disabled={loading || resendCooldown > 0}
                      onClick={handleSendSetupEmailLink}
                      className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                    >
                      {setupEmailLinkSent
                        ? resendCooldown > 0
                          ? `Resend Link in ${resendCooldown}s`
                          : 'Resend Verification Link'
                        : 'Send Verification Link'}
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmSetupEmailVerified}
                      className="w-full py-2.5 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>I have verified, Continue</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSetupEnrollFingerprint}
                    disabled={isEnrollingFingerprint}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20"
                  >
                    {isEnrollingFingerprint ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Touch Fingerprint Sensor...</span>
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-4 h-4" />
                        <span>
                          {isRealCredentialId(setupFingerprintCredId)
                            ? 'Fingerprint Enrolled ✓ (Re-Enroll)'
                            : 'Scan & Enroll Fingerprint'}
                        </span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  disabled={loading || !isRealCredentialId(setupFingerprintCredId)}
                  onClick={handleCompleteSetup}
                  className="mt-1 w-full bg-gradient-to-r from-[#FACC15] to-[#EAB308] text-black font-black py-3.5 rounded-xl hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xl disabled:opacity-50"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Save All 5 Admin Locks</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* MODE 2: VERIFICATION - UNLOCK ALL 5 LOCKS ONE BY ONE */}
        {modalMode === 'VERIFY' && (
          <div className="flex flex-col gap-3">
            {/* 5-Lock Progress & Status */}
            <div className="bg-black/60 border border-white/10 rounded-2xl p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400 font-bold uppercase tracking-wider">
                  Admin Verification Progress
                </span>
                <span className="font-extrabold text-[#FACC15] tabular-nums">
                  {verifiedCount} of 5 Locks Passed
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1 text-[9px] font-bold text-center">
                {[
                  { key: 'PIN' as const, label: '1. PIN' },
                  { key: 'PASSWORD' as const, label: '2. Pass' },
                  { key: 'LUCKY' as const, label: '3. Lucky' },
                  { key: 'PATTERN' as const, label: '4. Pattern' },
                  { key: 'FINGERPRINT' as const, label: '5. Touch' },
                ].map((item) => {
                  const isDone = verifiedLocks[item.key];
                  const isCurrent = activeLockTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveLockTab(item.key)}
                      className={`py-1.5 rounded-lg transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                        isDone
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : isCurrent
                          ? 'bg-[#FACC15] text-black shadow'
                          : 'bg-white/5 text-gray-400'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className="text-[8px]">
                        {isDone ? '✓ Passed' : isCurrent ? 'Active' : 'Pending'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If 3 fails on this lock, offer switch to another lock */}
            {currentFailCount >= 3 && !verifiedLocks[activeLockTab] && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
                <span>Failed 3 times on {activeLockTab}.</span>
                <button
                  type="button"
                  onClick={() => {
                    const alt = getNextUnverifiedLock(activeLockTab, verifiedLocks);
                    setActiveLockTab(alt);
                  }}
                  className="px-2.5 py-1 bg-amber-400 text-black font-black text-[11px] rounded-lg cursor-pointer"
                >
                  Try another lock
                </button>
              </div>
            )}

            {/* TAB 1: PIN */}
            {activeLockTab === 'PIN' && (
              <div className="flex flex-col items-center gap-2 py-1">
                <span className="text-xs text-gray-300 font-bold">
                  Lock 1: Enter 4-Digit Admin PIN
                </span>

                <div className="flex justify-center gap-3 my-1">
                  {[0, 1, 2, 3].map((idx) => {
                    const filled = verifyPin.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${
                          filled
                            ? 'border-[#FACC15] bg-[#FACC15]/20 text-[#FACC15] text-lg font-black'
                            : 'border-white/20 bg-white/5'
                        }`}
                      >
                        {filled ? '●' : ''}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2 w-full max-w-[270px]">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleKeypadPress(k, 'verify')}
                      className="py-3 bg-white/5 hover:bg-white/10 active:bg-[#FACC15] active:text-black rounded-xl text-white font-bold text-base transition-colors border border-white/5 cursor-pointer"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: PASSWORD */}
            {activeLockTab === 'PASSWORD' && (
              <form onSubmit={handleVerifyPassword} className="flex flex-col gap-3 py-1">
                <span className="text-xs text-gray-300 font-bold">
                  Lock 2: Enter Admin Password (Pass)
                </span>
                <div className="relative">
                  <input
                    type={showVerifyPassword ? 'text' : 'password'}
                    value={verifyPassword}
                    onChange={(e) => setVerifyPassword(e.target.value)}
                    placeholder="Admin password"
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                    className="absolute right-3.5 top-3.5 text-gray-400 hover:text-white cursor-pointer"
                  >
                    {showVerifyPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#FACC15] text-black font-black py-3.5 rounded-xl hover:bg-[#eab308] transition-colors shadow-lg cursor-pointer"
                >
                  Unlock Pass
                </button>
              </form>
            )}

            {/* TAB 3: LUCKY */}
            {activeLockTab === 'LUCKY' && (
              <form onSubmit={handleVerifyLuckyNumber} className="flex flex-col gap-3 py-1">
                <span className="text-xs text-gray-300 font-bold">
                  Lock 3: Enter Your Secret Lucky Number
                </span>
                <input
                  type="text"
                  value={verifyLuckyNumber}
                  onChange={(e) => setVerifyLuckyNumber(e.target.value)}
                  placeholder="e.g. 7 or 777"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                  autoFocus
                />

                <button
                  type="submit"
                  className="w-full bg-[#FACC15] text-black font-black py-3.5 rounded-xl hover:bg-[#eab308] transition-colors shadow-lg cursor-pointer"
                >
                  Unlock Lucky Number
                </button>
              </form>
            )}

            {/* TAB 4: PATTERN */}
            {activeLockTab === 'PATTERN' && (
              <div className="flex flex-col items-center gap-3 py-1">
                <span className="text-xs text-gray-300 font-bold">
                  Lock 4: Draw Security Pattern
                </span>

                {renderDotGrid(verifyPattern, (idx) => {
                  if (!verifyPattern.includes(idx)) {
                    setVerifyPattern((prev) => [...prev, idx]);
                  }
                })}

                <div className="flex gap-2 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => setVerifyPattern([])}
                    className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-300 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleVerifyPattern}
                    className="flex-1 py-2.5 bg-[#FACC15] text-black font-black rounded-xl text-xs hover:bg-[#eab308] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Pattern</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: FINGERPRINT */}
            {activeLockTab === 'FINGERPRINT' && (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center border-2 transition-all ${
                    isVerifyingFingerprint
                      ? 'bg-[#FACC15]/20 border-[#FACC15] text-[#FACC15] animate-pulse shadow-lg shadow-yellow-500/20'
                      : verifiedLocks.FINGERPRINT
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-white/5 border-white/20 text-gray-400'
                  }`}
                >
                  <Fingerprint className="w-10 h-10 stroke-[2]" />
                </div>

                <div>
                  <span className="text-sm font-bold text-white block">
                    Lock 5: Hardware Fingerprint Verification
                  </span>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs">
                    Touch your device fingerprint sensor to verify admin passkey.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isVerifyingFingerprint}
                  onClick={handleVerifyFingerprint}
                  className="w-full bg-[#FACC15] text-black font-black py-3.5 rounded-xl hover:bg-[#eab308] transition-colors shadow-lg cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isVerifyingFingerprint ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Sensor...</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4 h-4 stroke-[2.5]" />
                      <span>Touch Fingerprint Sensor to Unlock</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleInitiateFingerprintEmailLink}
                  className="text-xs text-[#FACC15] hover:underline font-bold cursor-pointer flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Enroll / Re-enroll Fingerprint? (Email Link Verification)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* MODE 3: FINGERPRINT EMAIL LINK VERIFICATION / RE-ENROLL */}
        {modalMode === 'FINGERPRINT_EMAIL_VERIFY' && (
          <div className="flex flex-col gap-3 py-1">
            <div className="p-3 bg-[#FACC15]/10 border border-[#FACC15]/20 rounded-xl text-xs text-gray-300 space-y-2">
              <span className="font-bold text-[#FACC15] block text-sm">
                Verify to Enroll Fingerprint
              </span>
              <p>
                We will send a verification link to{' '}
                <strong className="text-white">
                  {vault?.recoveryEmail || currentUser?.email || 'tetelophokwane98@gmail.com'}
                </strong>
                . Tap the link in the email to confirm you want to enroll your fingerprint.
              </p>

              <div className="pt-2 border-t border-white/10 space-y-1 text-[11px] text-gray-300">
                <p>
                  <strong className="text-white">Email Subject:</strong> Verify to Enroll Fingerprint - Universal Band Admin
                </p>
                <p>
                  <strong className="text-white">Email Body:</strong> Tap this link to confirm you want to enroll your fingerprint for Universal Band Admin. This will NOT reset your password. If you did not request this, ignore this email.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isEnrollingFingerprint}
              onClick={handleReEnrollFingerprintSensor}
              className="w-full py-3.5 bg-[#FACC15] text-black font-black text-xs rounded-xl hover:bg-yellow-400 transition-colors shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Fingerprint className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isEnrollingFingerprint
                  ? 'Touch Hardware Fingerprint Sensor...'
                  : 'Scan & Enroll Fingerprint'}
              </span>
            </button>

            <div className="flex justify-between items-center text-xs pt-1">
              <button
                type="button"
                disabled={resendCooldown > 0 || loading}
                onClick={handleInitiateFingerprintEmailLink}
                className="text-[#FACC15] hover:underline disabled:text-gray-500 cursor-pointer font-bold"
              >
                {resendCooldown > 0 ? `Resend link in ${resendCooldown}s` : 'Resend Link'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalMode('VERIFY');
                  setErrorMessage('');
                }}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSecurityModal;
