import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Smartphone,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  sendFirebaseVerificationLink,
  checkFirebaseEmailVerified,
} from '../utils/emailVerificationService';
import { auth, SUPPORT_EMAIL, SUPPORT_PHONE } from '../firebase';
import { AccountSecurityVerification } from '../components/multilock/AccountSecurityVerification';
import { UserProfile } from '../types';

export const LoginPage: React.FC = () => {
  const {
    loginWithEmailOrPhone,
    signInWithGoogle,
    navigateTo,
    setActiveModal,
    completeSecurityLogin,
    cancelSecurityLogin,
    customLogoUrl,
    openAdminLoginFlow,
  } = useApp();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isInSecurityVerify, setIsInSecurityVerify] = useState<boolean>(false);
  const [pendingSecurityUser, setPendingSecurityUser] = useState<UserProfile | null>(null);
  const [securityTargetEmail, setSecurityTargetEmail] = useState<string>('');

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setUnverifiedEmail(null);

    if (!identifier.trim()) {
      setError('Please enter your email or South African phone number.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await loginWithEmailOrPhone(identifier.trim(), password);
      if (!res.success) {
        if (res.requireAdminSecurity) {
          openAdminLoginFlow();
          return;
        }
        if (res.requireSecurityVerification && res.pendingUser) {
          setPendingSecurityUser(res.pendingUser);
          setSecurityTargetEmail(res.email || identifier.trim());
          setIsInSecurityVerify(true);
          return;
        }
        if (res.requireVerification && res.email) {
          setUnverifiedEmail(res.email);
          setError('Email not verified. Please check your inbox for verification link. Check spam folder.');
        } else {
          setError(res.error || 'Invalid credentials. Please try again.');
        }
      } else {
        navigateTo('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your details.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Sign-in
  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleError(null);
    setInfoMessage(null);
    setIsLoading(true);

    try {
      const res = await signInWithGoogle();
      if (!res.success) {
        setGoogleError(res.error || 'Google sign-in cancelled');
      } else {
        navigateTo('/dashboard');
      }
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.message?.includes('popup-closed') ||
        err?.message?.includes('closed-by-user')
      ) {
        setGoogleError('Google sign-in cancelled');
      } else {
        setGoogleError(err?.message || 'Google sign-in failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  // Handle "Resend verification link" button
  const handleResendVerification = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setError(null);
    setInfoMessage(null);

    try {
      const target = unverifiedEmail || identifier.trim();
      const res = await sendFirebaseVerificationLink(target, password);
      if (res.success) {
        setInfoMessage(`Verification email resent to ${target}! Please check your inbox and spam folder.`);
        setResendCooldown(60);
      } else {
        setError(res.error || 'Could not resend verification email. Please enter your password above and try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error resending verification email.');
    } finally {
      setIsResending(false);
    }
  };

  if (isInSecurityVerify && pendingSecurityUser) {
    return (
      <div className="min-h-[85vh] flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
        <AccountSecurityVerification
          pendingUser={pendingSecurityUser}
          targetEmail={securityTargetEmail}
          onSuccess={() => {
            completeSecurityLogin(pendingSecurityUser);
          }}
          onCancel={async () => {
            await cancelSecurityLogin();
            setIsInSecurityVerify(false);
            setError('Security verification cancelled.');
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
      {/* Top Header Branding */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full overflow-hidden border border-[#C9A86A] bg-black shadow-xl shadow-black/80 mb-3 p-1">
          <img
            src={customLogoUrl || '/universal-band-logo.svg'}
            alt="Universal Band"
            className="w-full h-full object-contain rounded-full"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.includes('universal-band-logo.svg')) {
                target.src = '/universal-band-logo.svg';
              }
            }}
          />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">Welcome Back</h1>
        <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
          Log in to access your tickets, cashless wristband, and stores
        </p>
      </div>

      {/* Card Container */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
        {/* Error Notification */}
        {error && (
          <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium animate-in fade-in zoom-in-95 duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Info Notification */}
        {infoMessage && (
          <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-medium animate-in fade-in zoom-in-95 duration-150">
            <Sparkles className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* Unverified Email Warning & Resend Action Banner */}
        {unverifiedEmail && (
          <div className="mb-5 p-4 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 text-xs text-yellow-200 space-y-2.5 animate-in fade-in">
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white">Verification Link Sent</p>
                <p className="text-[11px] text-gray-300 mt-0.5">
                  Check Inbox and SPAM folder for <strong className="text-[#FACC15] font-mono">{unverifiedEmail}</strong>. Click the link to verify.
                </p>
                <p className="text-[10px] text-gray-400 mt-1 font-medium">
                  Support: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#FACC15] underline">{SUPPORT_EMAIL}</a> | <a href={`tel:+27${SUPPORT_PHONE.replace(/^0/, '')}`} className="text-[#FACC15] underline">{SUPPORT_PHONE}</a>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendCooldown > 0 || isResending}
              className="w-full py-2 px-3 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
              <span>
                {isResending
                  ? 'Sending verification email...'
                  : resendCooldown > 0
                  ? `Resend Verification Email (${resendCooldown}s)`
                  : 'Resend Verification Email'}
              </span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Email or Phone */}
          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1.5">
              Email or South African Phone Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Smartphone className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="082 123 4567 or you@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-black/60 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] transition"
              />
            </div>
          </div>

          {/* 2. Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-gray-300">
                Password
              </label>
              <button
                type="button"
                onClick={() => setActiveModal('reset-password-otp')}
                className="text-[11px] font-extrabold text-[#FACC15] hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-10 pr-10 py-2.5 bg-black/60 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-extrabold py-3 px-4 rounded-xl text-sm shadow-lg shadow-yellow-400/20 transition duration-150 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Logging in...
              </span>
            ) : (
              <>
                <span>Log In</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] uppercase font-black tracking-widest text-gray-500">OR</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google Sign-in */}
        <div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3 px-4 rounded-xl text-xs transition active:scale-95 cursor-pointer shadow-md"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {googleError && (
            <div className="mt-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span className="leading-relaxed">{googleError}</span>
            </div>
          )}
        </div>

        {/* Switch to Register */}
        <div className="mt-5 text-center space-y-3">
          <p className="text-xs text-gray-400">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigateTo('/register')}
              className="text-[#FACC15] font-extrabold hover:underline ml-1 cursor-pointer"
            >
              Register Now
            </button>
          </p>

          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="text-xs text-gray-400 hover:text-white transition flex items-center justify-center gap-1.5 mx-auto cursor-pointer font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Browse Events without logging in</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default LoginPage;
