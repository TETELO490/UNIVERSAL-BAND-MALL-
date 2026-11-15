import React, { useState, useEffect } from 'react';
import { Fingerprint, CheckCircle2, AlertCircle, ShieldCheck, Unlock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  enrollFingerprintBiometrics,
  authenticateWithBiometrics,
  getMultiLockConfig,
  isRealCredentialId,
} from '../../utils/multiLockSecurity';

interface SecurityProps {
  onUnlock?: () => void;
  title?: string;
  description?: string;
  className?: string;
}

export const Security: React.FC<SecurityProps> = ({
  onUnlock,
  title = 'Biometric Security',
  description = 'Hardware-backed fingerprint authentication',
  className = '',
}) => {
  const { currentUser, unlockApp, currentPin, navigateTo } = useApp();

  const [credentialId, setCredentialId] = useState<string>(() => {
    const cfg = getMultiLockConfig(currentUser?.email);
    const localId = localStorage.getItem('ub_biometric_id');
    if (isRealCredentialId(cfg.fingerprintCredentialId)) return cfg.fingerprintCredentialId;
    if (isRealCredentialId(localId)) return localId;
    return '';
  });

  const isEnrolled = isRealCredentialId(credentialId);

  const [isEnrolling, setIsEnrolling] = useState<boolean>(false);
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Clean out any legacy simulated credential markers on mount / user switch
  useEffect(() => {
    const localId = localStorage.getItem('ub_biometric_id');
    if (localId && !isRealCredentialId(localId)) {
      localStorage.removeItem('ub_biometric_id');
      localStorage.removeItem('ub_biometric_enrolled');
    }

    const cfg = getMultiLockConfig(currentUser?.email);
    if (isRealCredentialId(cfg.fingerprintCredentialId)) {
      setCredentialId(cfg.fingerprintCredentialId);
    } else if (isRealCredentialId(localId)) {
      setCredentialId(localId);
    } else {
      setCredentialId('');
    }
  }, [currentUser?.email]);

  const handleEnrollFingerprint = async () => {
    setErrorMessage('');
    setStatusMessage('');
    setIsEnrolling(true);

    try {
      const res = await enrollFingerprintBiometrics(
        currentUser?.email,
        currentUser?.fullName || currentUser?.name,
        currentUser?.id
      );

      if (res.success && isRealCredentialId(res.credentialId)) {
        setCredentialId(res.credentialId);
        setStatusMessage('Hardware fingerprint enrolled! Now tap Unlock with Fingerprint.');
      } else {
        setErrorMessage(res.message || 'Hardware fingerprint enrollment failed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Hardware fingerprint enrollment failed.');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleUnlockFingerprint = async () => {
    setErrorMessage('');
    setStatusMessage('');
    setIsUnlocking(true);

    try {
      const res = await authenticateWithBiometrics(credentialId, currentUser?.email);
      if (res.success) {
        setStatusMessage('Hardware fingerprint verified! Vault unlocked.');
        if (onUnlock) {
          onUnlock();
        } else {
          unlockApp(currentPin, true);
          navigateTo('/');
        }
      } else {
        setErrorMessage(res.message || 'Hardware fingerprint verification failed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Fingerprint verification failed.');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className={`w-full max-w-sm mx-auto p-5 rounded-2xl bg-[#0D0D0D] border border-white/10 shadow-2xl text-center space-y-4 ${className}`}>
      <div className="space-y-1.5">
        <div
          className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-all ${
            isEnrolled
              ? 'bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/20'
              : 'bg-blue-500/15 border-2 border-blue-500/40 text-blue-400'
          }`}
        >
          <Fingerprint className={`w-8 h-8 stroke-[2.2] ${isEnrolling || isUnlocking ? 'animate-pulse text-[#FACC15]' : ''}`} />
        </div>
        <h3 className="font-black text-white text-base tracking-tight">{title}</h3>
        <p className="text-xs text-gray-400">{description}</p>
        <div className="pt-1 flex justify-center">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              isEnrolled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}
          >
            {isEnrolled ? (
              <>
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Hardware Sensor Enrolled
              </>
            ) : (
              'Not Enrolled'
            )}
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-left">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-rose-300 break-words leading-relaxed font-mono flex-1">
              {errorMessage}
            </div>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center gap-1.5 text-emerald-300 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="space-y-3 pt-1">
        <button
          type="button"
          onClick={handleEnrollFingerprint}
          disabled={isEnrolling || isUnlocking}
          className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <Fingerprint className="w-4 h-4 stroke-[2.5]" />
          <span>
            {isEnrolling
              ? 'Enrolling Hardware Sensor...'
              : isEnrolled
              ? 'Re-Enroll Fingerprint'
              : 'Enroll Fingerprint'}
          </span>
        </button>

        <button
          type="button"
          onClick={handleUnlockFingerprint}
          disabled={!isEnrolled || isUnlocking || isEnrolling}
          className={`w-full py-3.5 px-4 text-xs font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 ${
            isEnrolled
              ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-lg shadow-emerald-600/30 cursor-pointer'
              : 'bg-emerald-950/30 border border-emerald-900/40 text-emerald-600/50 cursor-not-allowed opacity-50'
          }`}
          title={isEnrolled ? 'Tap to unlock with hardware fingerprint' : 'Enroll hardware fingerprint first to enable unlock'}
        >
          <Unlock className="w-4 h-4 stroke-[2.5]" />
          <span>{isUnlocking ? 'Verifying Fingerprint...' : 'Unlock with Fingerprint'}</span>
        </button>
      </div>

      {!isEnrolled && (
        <p className="text-[11px] text-gray-500">
          Enroll your device&apos;s hardware fingerprint sensor first.
        </p>
      )}
    </div>
  );
};

export default Security;
