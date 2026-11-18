import React, { useState, useEffect } from 'react';
import { MailCheck, RefreshCw, Send, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useApp } from '../context/AppContext';
import {
  sendFirebaseVerificationLink,
  checkFirebaseEmailVerified,
} from '../utils/emailVerificationService';

export const EmailVerificationScreen: React.FC = () => {
  const { firebaseUser, currentUser, setCurrentUser, navigateTo, setWelcomeMessage } = useApp();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const userEmail = firebaseUser?.email || currentUser?.email || '';

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleCheckVerified = async () => {
    setChecking(true);
    setFeedback(null);
    try {
      const targetUser = auth.currentUser || firebaseUser;
      const result = await checkFirebaseEmailVerified(targetUser, userEmail);
      if (result.verified && auth.currentUser?.emailVerified) {
        setCurrentUser({
          ...currentUser,
          emailVerified: true,
        });
        setWelcomeMessage('Email verified! Welcome to Universal Band Mall.');
        navigateTo('/');
        // Force a clean state refresh if React didn't re-render firebaseUser reference
        window.location.reload();
      } else {
        setFeedback({
          type: 'error',
          text: 'Your email is not verified yet. Please click the verification link in your inbox (check Spam/Junk too), then tap this button again.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Could not check verification status. Please try again.',
      });
    } finally {
      setChecking(false);
    }
  };

  const handleResendEmail = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setFeedback(null);
    try {
      const res = await sendFirebaseVerificationLink(auth.currentUser || firebaseUser);
      if (res.success) {
        setCooldown(60);
        setFeedback({
          type: 'success',
          text: `Verification email resent to ${userEmail}. Please check your inbox and spam folder.`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: res.error || 'Failed to resend verification email. Please try again.',
        });
      }
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {}
    navigateTo('/login');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#161616] border border-[#FACC15]/30 rounded-3xl p-6 shadow-2xl space-y-5 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FACC15]/15 border border-[#FACC15]/40 flex items-center justify-center">
          <MailCheck className="w-8 h-8 text-[#FACC15]" />
        </div>

        <div className="space-y-2">
          <span className="inline-block text-[10px] font-black uppercase tracking-widest text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-3 py-1 rounded-full">
            Universal Band Mall
          </span>
          <h1 className="text-xl font-black text-white leading-tight">
            We sent you a verification link, check your email
          </h1>
          <p className="text-xs text-gray-300 leading-relaxed">
            A verification link has been sent to{' '}
            <strong className="text-[#FACC15] break-all">{userEmail}</strong>.
            You must verify your email before you can access the home screen or book a band.
          </p>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold text-left flex items-start gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/60 border-red-500/40 text-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={checking}
            onClick={handleCheckVerified}
            className="w-full min-h-[46px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-black text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 stroke-[2.5] ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Checking Verification...' : "I've Verified My Email"}</span>
          </button>

          <button
            type="button"
            disabled={resending || cooldown > 0}
            onClick={handleResendEmail}
            className="w-full min-h-[44px] bg-white/10 hover:bg-white/15 active:scale-[0.98] text-white font-bold text-xs rounded-xl border border-white/15 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5 text-[#FACC15]" />
            <span>
              {resending
                ? 'Sending...'
                : cooldown > 0
                ? `Resend Verification Email (${cooldown}s)`
                : 'Resend Verification Email'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full min-h-[40px] text-gray-400 hover:text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out / Use Different Email</span>
          </button>
        </div>

        <p className="text-[10px] text-gray-500">
          Didn&apos;t see the email? Check your Spam or Junk folder for &ldquo;Universal Band Mall - Verify Your Email&rdquo;.
        </p>
      </div>
    </div>
  );
};

export default EmailVerificationScreen;
