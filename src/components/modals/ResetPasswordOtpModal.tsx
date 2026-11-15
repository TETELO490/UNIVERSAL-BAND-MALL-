import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, firebaseConfig, getActionCodeSettings } from '../../firebase';
import {
  X,
  Mail,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const ResetPasswordOtpModal: React.FC = () => {
  const { activeModal, setActiveModal, currentUser } = useApp();

  const [email, setEmail] = useState<string>(currentUser?.email || '');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (activeModal !== 'reset-password-otp') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('Enter valid email');
      return;
    }

    setIsLoading(true);
    try {
      try {
        await sendPasswordResetEmail(auth, cleanEmail, getActionCodeSettings());
      } catch (continueErr: any) {
        if (
          continueErr?.code === 'auth/unauthorized-continue-uri' ||
          continueErr?.code === 'auth/invalid-continue-uri'
        ) {
          await sendPasswordResetEmail(auth, cleanEmail);
        } else {
          throw continueErr;
        }
      }
      setSuccessMessage('Password reset link sent to your email - check inbox and spam');
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch (e) {}
    } catch (err: any) {
      console.error('Password reset error:', err);
      const code = err?.code;
      if (code === 'auth/invalid-email') {
        setError('Enter valid email');
      } else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        setError('No account found with this email');
      } else {
        setError(err?.message || 'No account found with this email');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Close Button */}
        <button
          onClick={() => setActiveModal(null)}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#FACC15]/10 text-[#FACC15] border border-[#FACC15]/30 mb-2">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Forgot Password
          </h2>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Enter your email to receive a secure password reset link from Universal Band
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Password reset link sent to your email - check inbox and spam</p>
                <p className="text-[11px] text-gray-300 font-normal">
                  You will receive an email from <span className="text-[#FACC15] font-mono">noreply@{firebaseConfig.authDomain}</span> (Universal Band). Click the link to create a new password.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="w-full py-3 px-4 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-yellow-400/15 cursor-pointer"
            >
              <span>Back to Login</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. you@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-black/60 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-yellow-400/15 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending reset link...</span>
                </>
              ) : (
                <>
                  <span>Send Password Reset Link</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
