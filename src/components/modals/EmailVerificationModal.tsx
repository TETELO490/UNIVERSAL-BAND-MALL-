import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Sparkles,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  sendFirebaseVerificationLink,
  checkFirebaseEmailVerified,
} from '../../utils/emailVerificationService';
import { auth, SUPPORT_EMAIL, SUPPORT_PHONE } from '../../firebase';

interface EmailVerificationModalProps {
  email: string;
  fullName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  isOpen?: boolean;
}

export const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({
  email,
  fullName,
  onSuccess,
  onCancel,
  isOpen = true,
}) => {
  const { currentUser, setCurrentUser, navigateTo, setWelcomeMessage } = useApp();

  const [isCheckingLink, setIsCheckingLink] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleCheckEmailLink = async () => {
    setIsCheckingLink(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await checkFirebaseEmailVerified(auth.currentUser, email);
      if (res.verified) {
        setVerifiedSuccess(true);
        try {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        } catch (e) {}

        const cleanEmail = email.trim().toLowerCase();
        const updatedProf = { ...currentUser, email: cleanEmail, emailVerified: true };
        setCurrentUser(updatedProf);
        localStorage.setItem('ub_user_profile', JSON.stringify(updatedProf));
        localStorage.setItem('ub_has_registered', 'true');
        localStorage.setItem(`ub_email_verified_${cleanEmail}`, 'true');
        setWelcomeMessage('Email verified! Welcome to Universal Band.');

        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            navigateTo('/');
          }
        }, 1500);
      } else {
        setError('Email link not verified yet. Please check your inbox & spam folder and click the link.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to check verification link status.');
    } finally {
      setIsCheckingLink(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await sendFirebaseVerificationLink(auth.currentUser);
      if (res.success) {
        setInfoMessage('Verification link resent! Check your inbox and spam folder.');
        setResendCooldown(60);
      } else {
        setError(res.error || 'Failed to resend verification link.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error resending verification.');
    } finally {
      setIsResending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm bg-[#161616] rounded-3xl border border-white/10 p-6 shadow-2xl relative animate-in fade-in zoom-in-95 my-auto text-white">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Icon & Heading */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-[#FACC15]/15 border border-[#FACC15]/30 text-[#FACC15] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-yellow-400/10">
            {verifiedSuccess ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            ) : (
              <Mail className="w-6 h-6 text-[#FACC15]" />
            )}
          </div>

          <h2 className="text-lg font-black tracking-tight text-white">
            {verifiedSuccess ? 'Email Verified Successfully!' : 'Verify Your Email'}
          </h2>

          <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
            Verification email sent to <strong className="text-[#FACC15] font-mono break-all">{email}</strong>. Check Inbox and SPAM folder. Click the link to verify.
          </p>
        </div>

        {/* Success Alert */}
        {verifiedSuccess && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Account verified! Taking you to the app...</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Info Notification */}
        {infoMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs flex items-start gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {!verifiedSuccess && (
          <div className="space-y-3">
            {/* Check Email Link Button */}
            <button
              type="button"
              onClick={handleCheckEmailLink}
              disabled={isCheckingLink}
              className="w-full py-3 px-4 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-yellow-400/20 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isCheckingLink ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking Email Verification...</span>
                </>
              ) : (
                <>
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>I've Clicked the Verification Link</span>
                </>
              )}
            </button>

            {/* Resend Link */}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isResending}
              className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/10 transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
              <span>
                {isResending
                  ? 'Sending email...'
                  : resendCooldown > 0
                  ? `Resend link (${resendCooldown}s)`
                  : 'Resend Verification Link'}
              </span>
            </button>
          </div>
        )}

        {/* Support Footer Note */}
        <div className="mt-5 pt-3 border-t border-white/5 text-center text-[10px] text-gray-500 space-y-1">
          <p className="font-semibold text-gray-400">Need help with verification?</p>
          <p>
            Email: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gray-300 underline">{SUPPORT_EMAIL}</a>
            {' • '}
            Tel: <a href={`tel:+27${SUPPORT_PHONE.replace(/^0/, '')}`} className="text-gray-300 underline">{SUPPORT_PHONE}</a>
          </p>
        </div>
      </div>
    </div>
  );
};
export default EmailVerificationModal;
