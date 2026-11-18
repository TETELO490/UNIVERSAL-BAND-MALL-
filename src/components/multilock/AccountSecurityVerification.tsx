import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Fingerprint,
  Grid3X3,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserProfile } from '../../types';
import {
  getMultiLockConfig,
  verifyPasswordLock,
  verifyPatternLock,
  authenticateWithBiometrics,
  isRealCredentialId,
  MultiLockConfig,
} from '../../utils/multiLockSecurity';
import { PatternGrid } from '../security/PatternGrid';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';

interface AccountSecurityVerificationProps {
  pendingUser: UserProfile;
  targetEmail: string;
  onSuccess: () => void;
  onCancel: () => void;
  reason?: string;
}

type SecurityMethod = 'fingerprint' | 'pattern' | 'password';

export const AccountSecurityVerification: React.FC<AccountSecurityVerificationProps> = ({
  pendingUser,
  targetEmail,
  onSuccess,
  onCancel,
  reason,
}) => {
  const [activeMethod, setActiveMethod] = useState<SecurityMethod>('fingerprint');
  const [config, setConfig] = useState<MultiLockConfig>(() => getMultiLockConfig(targetEmail));
  const [loadingConfig, setLoadingConfig] = useState<boolean>(true);

  // Verification status of each factor
  const [fingerprintDone, setFingerprintDone] = useState<boolean>(false);
  const [patternDone, setPatternDone] = useState<boolean>(false);
  const [passwordDone, setPasswordDone] = useState<boolean>(false);

  // Method states
  const [isScanningFingerprint, setIsScanningFingerprint] = useState<boolean>(false);
  const [fingerprintError, setFingerprintError] = useState<string | null>(null);

  const [drawPattern, setDrawPattern] = useState<number[]>([]);
  const [patternError, setPatternError] = useState<string | null>(null);

  const [inputPassword, setInputPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isCompleting, setIsCompleting] = useState<boolean>(false);

  // Firestore retrieved hashes & real WebAuthn credentialId
  const [dbPatternHash, setDbPatternHash] = useState<string | null>(null);
  const [dbPasswordHash, setDbPasswordHash] = useState<string | null>(null);
  const [dbFingerprintCredId, setDbFingerprintCredId] = useState<string | null>(null);

  const isRolePrivileged =
    pendingUser.role === 'Admin' ||
    pendingUser.role === 'Promoter' ||
    targetEmail.toLowerCase() === 'tetelophokwane98@gmail.com' ||
    targetEmail.toLowerCase() === 'admin@universalband.co.za';

  // Fetch security settings from Firestore and LocalStorage on mount
  useEffect(() => {
    let isMounted = true;
    const fetchSecurityProfile = async () => {
      try {
        const localCfg = getMultiLockConfig(targetEmail);
        let patternHash = localCfg.patternHash;
        let passwordHash = localCfg.passwordHash;
        let fingerprintCredId = isRealCredentialId(localCfg.fingerprintCredentialId)
          ? localCfg.fingerprintCredentialId
          : '';

        // 1. Fetch from users/{uid}
        if (pendingUser.id) {
          try {
            const userSnap = await getDoc(doc(db, 'users', pendingUser.id));
            if (userSnap.exists()) {
              const uData = userSnap.data();
              if (uData?.securitySettings) {
                const s = uData.securitySettings;
                if (s.patternHash) patternHash = s.patternHash;
                if (s.passwordHash) passwordHash = s.passwordHash;
                if (isRealCredentialId(s.fingerprintCredentialId)) {
                  fingerprintCredId = s.fingerprintCredentialId;
                }
                localCfg.patternHash = patternHash;
                localCfg.passwordHash = passwordHash;
                localCfg.fingerprintCredentialId = fingerprintCredId;
                if (s.fingerprintEnabled !== undefined) localCfg.fingerprintEnabled = s.fingerprintEnabled;
                if (s.patternEnabled !== undefined) localCfg.patternEnabled = s.patternEnabled;
                if (s.passwordEnabled !== undefined) localCfg.passwordEnabled = s.passwordEnabled;
              }
            }
          } catch (e) {
            console.warn('Could not read user security settings from Firestore:', e);
          }
        }

        // 2. If Admin, check adminSecurity/{email} first, then admin_security_root
        if (isRolePrivileged) {
          try {
            const emailDocId = targetEmail.trim().toLowerCase();
            let adminSecSnap = emailDocId
              ? await getDoc(doc(db, 'adminSecurity', emailDocId))
              : null;
            if (!adminSecSnap || !adminSecSnap.exists()) {
              adminSecSnap = await getDoc(doc(db, 'adminSecurity', 'admin_security_root'));
            }
            if (adminSecSnap.exists()) {
              const aData = adminSecSnap.data();
              if (aData?.patternHash) {
                patternHash = aData.patternHash;
                localCfg.patternHash = aData.patternHash;
              }
              if (aData?.passwordHash) {
                passwordHash = aData.passwordHash;
                localCfg.passwordHash = aData.passwordHash;
              } else if (aData?.luckyNumberHash && !passwordHash) {
                passwordHash = aData.luckyNumberHash;
              }
              if (isRealCredentialId(aData?.fingerprintCredentialId) && !fingerprintCredId) {
                fingerprintCredId = aData.fingerprintCredentialId;
                localCfg.fingerprintCredentialId = fingerprintCredId;
              }
            }
          } catch (e) {
            console.warn('Could not read admin security settings:', e);
          }
        }

        if (isMounted) {
          setDbPatternHash(patternHash || null);
          setDbPasswordHash(passwordHash || null);
          setDbFingerprintCredId(fingerprintCredId || null);
          setConfig(localCfg);

          // If no security locks were configured for this account, grant access immediately!
          if (!patternHash && !passwordHash && !fingerprintCredId) {
            onSuccess();
            return;
          }

          if (fingerprintCredId) {
            setActiveMethod('fingerprint');
          } else if (patternHash) {
            setActiveMethod('pattern');
          } else {
            setActiveMethod('password');
          }
        }
      } finally {
        if (isMounted) setLoadingConfig(false);
      }
    };

    fetchSecurityProfile();

    return () => {
      isMounted = false;
    };
  }, [pendingUser.id, targetEmail, isRolePrivileged, onSuccess]);

  // Determine required methods - ONLY require methods that were actually configured for this account!
  const requiresFingerprint = Boolean(
    dbFingerprintCredId || (config.fingerprintEnabled && isRealCredentialId(config.fingerprintCredentialId))
  );
  const requiresPattern = Boolean(dbPatternHash || (config.patternEnabled && config.patternHash));
  const requiresPassword = Boolean(dbPasswordHash || (config.passwordEnabled && config.passwordHash));

  const totalRequired =
    (requiresFingerprint ? 1 : 0) + (requiresPattern ? 1 : 0) + (requiresPassword ? 1 : 0) || 1;
  const completedCount =
    (fingerprintDone && requiresFingerprint ? 1 : 0) +
    (patternDone && requiresPattern ? 1 : 0) +
    (passwordDone && requiresPassword ? 1 : 0);
  const allCompleted =
    (!requiresFingerprint || fingerprintDone) &&
    (!requiresPattern || patternDone) &&
    (!requiresPassword || passwordDone);

  // Auto-advance to next required method when one finishes
  const advanceToNext = (justFinished: SecurityMethod) => {
    if (justFinished === 'fingerprint') {
      if (!patternDone) setActiveMethod('pattern');
      else if (!passwordDone) setActiveMethod('password');
    } else if (justFinished === 'pattern') {
      if (!passwordDone) setActiveMethod('password');
      else if (!fingerprintDone) setActiveMethod('fingerprint');
    } else if (justFinished === 'password') {
      if (!fingerprintDone) setActiveMethod('fingerprint');
      else if (!patternDone) setActiveMethod('pattern');
    }
  };

  // Completion trigger when all are passed
  useEffect(() => {
    if (allCompleted && !isCompleting) {
      setIsCompleting(true);
      try {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#FACC15', '#10B981', '#3B82F6'],
        });
      } catch (e) {}

      const timer = setTimeout(() => {
        onSuccess();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [allCompleted, isCompleting, onSuccess]);

  // 1. FINGERPRINT HANDLER (Real hardware WebAuthn only)
  const handleScanFingerprint = async () => {
    setFingerprintError(null);
    setIsScanningFingerprint(true);
    try {
      const credId = dbFingerprintCredId || config.fingerprintCredentialId;
      const res = await authenticateWithBiometrics(credId || undefined, targetEmail);
      if (res.success) {
        setFingerprintDone(true);
        advanceToNext('fingerprint');
      } else {
        setFingerprintError(res.message || 'Hardware fingerprint verification failed. Please try again.');
      }
    } catch (err: any) {
      setFingerprintError(err?.message || 'Biometric sensor verification error.');
    } finally {
      setIsScanningFingerprint(false);
    }
  };

  // 2. PATTERN HANDLER
  const [showPatternLines, setShowPatternLines] = useState<boolean>(true);
  const [patternAttemptsLeft, setPatternAttemptsLeft] = useState<number>(3);

  const handleClearPattern = () => {
    setDrawPattern([]);
    setPatternError(null);
  };

  const handleVerifyPattern = async () => {
    setPatternError(null);
    if (drawPattern.length < 4) {
      setPatternError('Please connect at least 4 dots to verify your pattern.');
      return;
    }

    const expectedHash = dbPatternHash || config.patternHash;
    if (!expectedHash) {
      setPatternError('No security pattern has been configured on this account yet.');
      return;
    }

    const matchedZeroIndexed = await verifyPatternLock(drawPattern, targetEmail, expectedHash);
    const matchedOneIndexed = matchedZeroIndexed
      ? true
      : await verifyPatternLock(drawPattern.map((d) => d + 1), targetEmail, expectedHash);

    if (matchedZeroIndexed || matchedOneIndexed) {
      setPatternAttemptsLeft(3);
      setPatternDone(true);
      advanceToNext('pattern');
    } else {
      const remaining = patternAttemptsLeft - 1;
      if (remaining > 0) {
        setPatternAttemptsLeft(remaining);
        setPatternError(`Wrong pattern, ${remaining} attempt${remaining === 1 ? '' : 's'} left`);
      } else {
        setPatternAttemptsLeft(3);
        setPatternError('Wrong pattern, 0 attempts left. Please try again carefully.');
      }
      setDrawPattern([]);
    }
  };

  // 3. MASTER PASSWORD HANDLER
  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!inputPassword.trim()) {
      setPasswordError('Please enter your master security password.');
      return;
    }

    const expectedHash = dbPasswordHash || config.passwordHash;
    if (!expectedHash) {
      setPasswordError('No master security password has been configured on this account yet.');
      return;
    }

    const isMatch = await verifyPasswordLock(inputPassword.trim(), targetEmail, expectedHash);
    if (isMatch) {
      setPasswordDone(true);
      advanceToNext('password');
    } else {
      setPasswordError('Incorrect security password. Please try again.');
      setInputPassword('');
    }
  };

  return (
    <div className="w-full bg-[#121212] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl relative text-left">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 mb-5 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-400/10 border border-[#FACC15]/30 flex items-center justify-center text-[#FACC15] shadow-inner">
            <ShieldCheck className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white tracking-tight">Security Verification</h2>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#FACC15]/20 text-[#FACC15] border border-[#FACC15]/30">
                {pendingUser.role || 'Protected'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Email & password verified. Complete multi-lock verification to enter.
            </p>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-white p-1.5 rounded-full hover:bg-white/5 transition cursor-pointer"
          title="Cancel login and return"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Account Info Banner */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-3 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#FACC15] text-black font-black text-xs flex items-center justify-center">
            {(pendingUser.fullName || pendingUser.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-xs font-bold text-white leading-tight">
              {pendingUser.fullName || pendingUser.name || targetEmail}
            </div>
            <div className="text-[10px] text-gray-400">{targetEmail}</div>
          </div>
        </div>

        {/* Progress Pill */}
        <div className="text-right">
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Required Checks</div>
          <div className="text-xs font-black text-[#FACC15]">
            {completedCount} of {totalRequired} Completed
          </div>
        </div>
      </div>

      {/* 3 Steps Navigation Buttons */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {/* Button 1: Fingerprint */}
        <button
          type="button"
          onClick={() => setActiveMethod('fingerprint')}
          className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition cursor-pointer ${
            activeMethod === 'fingerprint'
              ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15] shadow-sm'
              : fingerprintDone
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20'
          }`}
        >
          <div className="flex items-center gap-1 mb-1">
            <Fingerprint className="w-4 h-4 stroke-[2]" />
            {fingerprintDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          </div>
          <span className="text-[11px] font-bold">1. Fingerprint</span>
          <span className="text-[9px] opacity-75">{fingerprintDone ? 'Verified' : 'Pending'}</span>
        </button>

        {/* Button 2: Pattern */}
        <button
          type="button"
          onClick={() => setActiveMethod('pattern')}
          className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition cursor-pointer ${
            activeMethod === 'pattern'
              ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15] shadow-sm'
              : patternDone
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20'
          }`}
        >
          <div className="flex items-center gap-1 mb-1">
            <Grid3X3 className="w-4 h-4 stroke-[2]" />
            {patternDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          </div>
          <span className="text-[11px] font-bold">2. Pattern</span>
          <span className="text-[9px] opacity-75">{patternDone ? 'Verified' : 'Pending'}</span>
        </button>

        {/* Button 3: Password */}
        <button
          type="button"
          onClick={() => setActiveMethod('password')}
          className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition cursor-pointer ${
            activeMethod === 'password'
              ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15] shadow-sm'
              : passwordDone
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20'
          }`}
        >
          <div className="flex items-center gap-1 mb-1">
            <KeyRound className="w-4 h-4 stroke-[2]" />
            {passwordDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          </div>
          <span className="text-[11px] font-bold">3. Password</span>
          <span className="text-[9px] opacity-75">{passwordDone ? 'Verified' : 'Pending'}</span>
        </button>
      </div>

      {/* METHOD 1: FINGERPRINT SCANNER */}
      {activeMethod === 'fingerprint' && (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-5 text-center flex flex-col items-center animate-in fade-in duration-200">
          <div className="relative mb-4">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                fingerprintDone
                  ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 shadow-lg shadow-emerald-500/20'
                  : isScanningFingerprint
                  ? 'bg-amber-400/20 border-2 border-[#FACC15] text-[#FACC15] animate-pulse shadow-lg shadow-yellow-500/20 scale-105'
                  : 'bg-white/5 border border-white/20 text-gray-300 hover:border-[#FACC15]/60 hover:text-white'
              }`}
            >
              {fingerprintDone ? (
                <CheckCircle2 className="w-12 h-12 stroke-[2.2]" />
              ) : (
                <Fingerprint className="w-12 h-12 stroke-[2.2]" />
              )}
            </div>

            {isScanningFingerprint && (
              <span className="absolute inset-0 rounded-full border-2 border-[#FACC15] animate-ping opacity-75 pointer-events-none" />
            )}
          </div>

          <h3 className="text-sm font-bold text-white mb-1">
            {fingerprintDone
              ? 'Fingerprint Verified!'
              : isScanningFingerprint
              ? 'Scanning Biometric Sensor...'
              : 'Biometric Fingerprint Scan'}
          </h3>
          <p className="text-xs text-gray-400 mb-5 max-w-xs">
            {fingerprintDone
              ? 'Hardware biometric identity confirmed.'
              : 'Touch your fingerprint sensor or click below to authenticate with platform biometric passkey.'}
          </p>

          {fingerprintError && (
            <div className="w-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-2.5 mb-4 flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{fingerprintError}</span>
            </div>
          )}

          {fingerprintDone ? (
            <div className="w-full py-2.5 px-4 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Passed - Move to next step</span>
            </div>
          ) : (
            <div className="w-full flex flex-col gap-2">
              <button
                type="button"
                onClick={handleScanFingerprint}
                disabled={isScanningFingerprint}
                className="w-full py-3 px-4 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isScanningFingerprint ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Contacting Hardware Sensor...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4 stroke-[2.5]" />
                    <span>Touch Sensor / Authenticate Fingerprint</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* METHOD 2: 3x3 PATTERN GRID */}
      {activeMethod === 'pattern' && (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-5 text-center flex flex-col items-center animate-in fade-in duration-200">
          <div className="flex items-center justify-between w-full mb-3 px-2">
            <span className="text-xs font-bold text-white">Draw Your Security Pattern</span>
            <button
              type="button"
              onClick={() => setShowPatternLines((prev) => !prev)}
              className="text-[11px] font-bold text-[#FACC15] flex items-center gap-1 cursor-pointer"
            >
              {showPatternLines ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPatternLines ? 'Hide pattern' : 'Show pattern'}</span>
            </button>
          </div>

          {/* 3x3 Drag-and-Tap Pattern Grid */}
          <div className="mb-4">
            <PatternGrid
              dots={[0, 1, 2, 3, 4, 5, 6, 7, 8]}
              value={drawPattern}
              onChange={(next) => {
                setPatternError(null);
                setDrawPattern(next);
              }}
              showNumbers={showPatternLines}
              sizeClassName="w-56 h-56"
            />
          </div>

          {patternError && (
            <div className="w-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-2.5 mb-4 flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{patternError}</span>
            </div>
          )}

          {patternDone ? (
            <div className="w-full py-2.5 px-4 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Pattern Verified - Completed</span>
            </div>
          ) : (
            <div className="w-full flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearPattern}
                disabled={drawPattern.length === 0}
                className="py-2.5 px-3 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold rounded-xl border border-white/10 transition cursor-pointer disabled:opacity-40"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={handleVerifyPattern}
                disabled={drawPattern.length < 4}
                className="flex-1 py-2.5 px-4 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20 transition active:scale-95 cursor-pointer disabled:opacity-40"
              >
                <span>Verify Pattern</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* METHOD 3: MASTER SECURITY PASSWORD */}
      {activeMethod === 'password' && (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-5 text-center flex flex-col items-center animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/15 text-[#FACC15] flex items-center justify-center mb-3">
            <KeyRound className="w-6 h-6 stroke-[2.2]" />
          </div>

          <h3 className="text-sm font-bold text-white mb-1">
            {passwordDone ? 'Security Password Verified!' : 'Master Security Password'}
          </h3>
          <p className="text-xs text-gray-400 mb-4 max-w-xs">
            {passwordDone
              ? 'Master passphrase matched your registered account security record.'
              : 'Enter the master security password configured in your account settings.'}
          </p>

          {passwordError && (
            <div className="w-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-2.5 mb-4 flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{passwordError}</span>
            </div>
          )}

          {passwordDone ? (
            <div className="w-full py-2.5 px-4 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Password Verified - Completed</span>
            </div>
          ) : (
            <form onSubmit={handleVerifyPassword} className="w-full space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={inputPassword}
                  onChange={(e) => {
                    setInputPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Enter master security password"
                  autoFocus
                  className="w-full bg-neutral-900 border border-white/15 rounded-xl px-3.5 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={!inputPassword.trim()}
                className="w-full py-3 px-4 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20 transition active:scale-95 cursor-pointer disabled:opacity-40"
              >
                <span>Verify Security Password</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Bottom Footer Actions */}
      <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Cancel & Log Out</span>
        </button>

        {allCompleted ? (
          <button
            type="button"
            onClick={onSuccess}
            className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer animate-bounce"
          >
            <Sparkles className="w-4 h-4 text-black" />
            <span>Enter Account Now</span>
          </button>
        ) : (
          <div className="text-[11px] text-gray-500 flex items-center gap-1">
            <Lock className="w-3 h-3 text-yellow-500/80" />
            <span>High-Security Zero-Trust Verification</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountSecurityVerification;
