import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Smartphone,
  User,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  sendFirebaseVerificationLink,
  checkFirebaseEmailVerified,
} from '../../utils/emailVerificationService';
import { auth, SUPPORT_EMAIL, SUPPORT_PHONE } from '../../firebase';
import { AccountSecurityVerification } from '../multilock/AccountSecurityVerification';
import { UserProfile } from '../../types';

interface AuthModalProps {
  onSuccess?: () => void;
  onClose?: () => void;
  reason?: 'buy_ticket' | 'create_event' | 'become_promoter' | 'general';
  eventName?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, onClose, reason = 'general', eventName }) => {
  const {
    loginWithEmailOrPhone,
    registerWithEmail,
    loginAsAdminMaster,
    setActiveModal,
    setCurrentUser,
    setWelcomeMessage,
    setPendingVerification,
    currentUser,
    completeSecurityLogin,
    cancelSecurityLogin,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER' | 'VERIFY' | 'SECURITY_VERIFY'>('LOGIN');
  const [pendingSecurityUser, setPendingSecurityUser] = useState<UserProfile | null>(null);
  const [securityTargetEmail, setSecurityTargetEmail] = useState<string>('');

  // Login form state
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Verification state
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyName, setVerifyName] = useState('');
  const [isCheckingLink, setIsCheckingLink] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Resend cooldown timer
  useEffect(() => {
    if (activeTab === 'VERIFY' && resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [activeTab, resendCooldown]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setActiveModal(null);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!loginId.trim()) {
      setError('Please enter your email or South African phone number.');
      return;
    }
    if (!loginPassword) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginWithEmailOrPhone(loginId.trim(), loginPassword);
      if (!res.success) {
        if (res.requireSecurityVerification && res.pendingUser) {
          setPendingSecurityUser(res.pendingUser);
          setSecurityTargetEmail(res.email || loginId.trim());
          setActiveTab('SECURITY_VERIFY');
          return;
        }
        if (res.requireVerification && res.email) {
          setVerifyEmail(res.email);
          if (res.fullName) setVerifyName(res.fullName);
          setActiveTab('VERIFY');
          setResendCooldown(60);
          setError('Email not verified. Please check your email and click verification link.');
        } else {
          setError(res.error || 'Invalid credentials. Please try again.');
        }
      } else {
        if (onSuccess) {
          onSuccess();
        } else {
          setActiveModal(null);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!regName.trim() || regName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!regEmail.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!regPhone.trim()) {
      setError('Please enter your South African phone number (e.g. 082 123 4567).');
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await registerWithEmail({
        fullName: regName.trim(),
        email: regEmail.trim(),
        phone: regPhone.trim(),
        password: regPassword,
      });

      if (!res.success) {
        setError(res.error || 'Registration failed. Please try again.');
      } else {
        setInfoMessage('Account created successfully! Welcome to Universal Band.');
        try {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        } catch (e) {}

        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            setActiveModal(null);
          }
        }, 1000);
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckEmailLink = async () => {
    setIsCheckingLink(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await checkFirebaseEmailVerified(auth.currentUser, verifyEmail);
      if (res.verified) {
        setVerifiedSuccess(true);
        try {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        } catch (e) {}

        const cleanEmail = verifyEmail.trim().toLowerCase();
        const updatedProf = {
          ...currentUser,
          name: verifyName || currentUser.name || cleanEmail.split('@')[0],
          fullName: verifyName || currentUser.fullName || cleanEmail.split('@')[0],
          email: cleanEmail,
          emailVerified: true,
          isRegistered: true,
        };
        setCurrentUser(updatedProf);
        localStorage.setItem('ub_user_profile', JSON.stringify(updatedProf));
        localStorage.setItem('ub_has_registered', 'true');
        localStorage.setItem(`ub_email_verified_${cleanEmail}`, 'true');
        setPendingVerification(null);
        setWelcomeMessage(`Email verified! Welcome.`);

        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            setActiveModal(null);
          }
        }, 1200);
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
        setError(res.error || 'Failed to resend verification email.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error resending verification.');
    } finally {
      setIsResending(false);
    }
  };

  const getReasonTitle = () => {
    if (activeTab === 'VERIFY') {
      return 'Verify Your Email';
    }
    if (reason === 'buy_ticket') {
      return eventName
        ? `Sign in to buy tickets for ${eventName}`
        : 'Sign in to complete your ticket purchase';
    }
    if (reason === 'create_event') {
      return 'Sign in to create your event';
    }
    if (reason === 'become_promoter') {
      return 'Sign in to become an event promoter';
    }
    return 'Sign in or create an account';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      {activeTab === 'SECURITY_VERIFY' && pendingSecurityUser ? (
        <div className="w-full max-w-md my-auto">
          <AccountSecurityVerification
            pendingUser={pendingSecurityUser}
            targetEmail={securityTargetEmail}
            onSuccess={() => {
              completeSecurityLogin(pendingSecurityUser);
              if (onSuccess) {
                onSuccess();
              } else {
                setActiveModal(null);
              }
            }}
            onCancel={async () => {
              await cancelSecurityLogin();
              setActiveTab('LOGIN');
              setError('Security verification cancelled.');
            }}
          />
        </div>
      ) : (
        <div className="w-full max-w-sm bg-[#161616] rounded-3xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 my-auto text-white">
          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

        {/* Header Branding */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#FACC15] text-black font-black text-base shadow-lg shadow-yellow-400/20 mb-2">
            UB
          </div>
          <h2 className="text-base font-extrabold text-white tracking-tight leading-snug">
            {getReasonTitle()}
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Universal Band • Instant passes & cashless wristbands
          </p>
        </div>

        {/* Tab Switcher (Only in Login / Register mode) */}
        {activeTab !== 'VERIFY' && (
          <div className="flex bg-black/60 p-1 rounded-xl border border-white/5 mb-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setActiveTab('LOGIN');
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'LOGIN'
                  ? 'bg-[#FACC15] text-black shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('REGISTER');
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'REGISTER'
                  ? 'bg-[#FACC15] text-black shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Info notification */}
        {infoMessage && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs">
            <Sparkles className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* VIEW 1: VERIFY SCREEN */}
        {activeTab === 'VERIFY' ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#FACC15]/15 border border-[#FACC15]/30 text-[#FACC15] flex items-center justify-center mx-auto mb-2">
                <Mail className="w-5 h-5 text-[#FACC15]" />
              </div>
              <p className="text-xs text-gray-300 leading-relaxed font-medium">
                Verification email sent to <strong className="text-[#FACC15] font-mono break-all">{verifyEmail}</strong>. Check Inbox and SPAM folder. Click the link to verify.
              </p>
              <p className="text-[10px] text-gray-400 mt-1.5 font-medium">
                Support: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#FACC15] underline">{SUPPORT_EMAIL}</a> | <a href={`tel:+27${SUPPORT_PHONE.replace(/^0/, '')}`} className="text-[#FACC15] underline">{SUPPORT_PHONE}</a>
              </p>
            </div>

            {verifiedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Verified! Taking you into the app...</span>
              </div>
            )}

            {!verifiedSuccess && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleCheckEmailLink}
                  disabled={isCheckingLink}
                  className="w-full py-2.5 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-yellow-400/20 disabled:opacity-50"
                >
                  {isCheckingLink ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking verification status...</span>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>I've Clicked the Verification Link</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || isResending}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs border border-white/10 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('LOGIN');
                      setError(null);
                    }}
                    className="text-[11px] text-gray-400 hover:text-white transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Back to Login</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'LOGIN' ? (
          /* VIEW 2: LOGIN FORM */
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">
                Email or South African Phone Number
              </label>
              <div className="relative">
                <Smartphone className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="082 123 4567 or you@example.co.za"
                  className="w-full pl-9 pr-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-9 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
                >
                  {showLoginPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-yellow-400/20 active:scale-98 disabled:opacity-50"
            >
              {isLoading ? (
                <span>Logging in...</span>
              ) : (
                <>
                  <span>Log In & Continue</span>
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* VIEW 3: REGISTER FORM */
          <form onSubmit={handleRegisterSubmit} className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">Full Name</label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Katlego Matlou"
                  className="w-full pl-9 pr-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">
                South African Phone (+27 / 082)
              </label>
              <div className="relative">
                <Smartphone className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="tel"
                  required
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="082 123 4567"
                  className="w-full pl-9 pr-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="you@example.co.za"
                  className="w-full pl-9 pr-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-300 mb-1">Create Password</label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-9 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
                >
                  {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-yellow-400/20 active:scale-98 disabled:opacity-50"
            >
              {isLoading ? (
                <span>Registering & Sending Link...</span>
              ) : (
                <>
                  <span>Create Account & Verify</span>
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
      )}
    </div>
  );
};
