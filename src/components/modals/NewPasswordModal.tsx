import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { confirmPasswordReset } from 'firebase/auth';
import { auth } from '../../firebase';
import {
  X,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const NewPasswordModal: React.FC = () => {
  const { activeModal, setActiveModal, resetPasswordCode } = useApp();

  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<boolean>(false);

  if (activeModal !== 'new-password') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!resetPasswordCode) {
      setError('Invalid or expired password reset link. Please request a new one.');
      return;
    }

    setIsLoading(true);
    try {
      await confirmPasswordReset(auth, resetPasswordCode, newPassword);
      setSuccessMessage(true);
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch (e) {}

      // Clean URL query parameters
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err: any) {
      console.error('Confirm password reset error:', err);
      setError(err?.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Close Button */}
        <button
          onClick={() => {
            setActiveModal(null);
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }}
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
            Create New Password
          </h2>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Enter your new secure password for your Universal Band account
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success State */}
        {successMessage ? (
          <div className="space-y-4 animate-in fade-in duration-200 text-center">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
              <div className="space-y-1 text-left">
                <p className="font-bold">Password successfully updated!</p>
                <p className="text-[11px] text-gray-300 font-normal">
                  Your password has been changed. You can now log in with your new credentials.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal('login')}
              className="w-full py-3 px-4 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-yellow-400/15 cursor-pointer"
            >
              <span>Log In Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-4 py-3 bg-black/60 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
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
                  <span>Updating password...</span>
                </>
              ) : (
                <>
                  <span>Save New Password</span>
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
