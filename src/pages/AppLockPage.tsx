import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Delete,
  Eye,
  EyeOff,
  ShieldCheck,
  HelpCircle,
  Fingerprint,
  Grid3X3,
  KeyRound,
  Settings,
} from 'lucide-react';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import { Security } from '../components/multilock/Security';
import {
  getMultiLockConfig,
  verifyPasswordLock,
  verifyPatternLock,
  UnlockMethod,
  MultiLockConfig,
} from '../utils/multiLockSecurity';

const PIN_LENGTH = 6;

export const AppLockPage: React.FC = () => {
  const { unlockApp, attemptsLeft, resetPinWithEmail, currentPin, currentUser, setActiveModal } = useApp();

  const isPrivileged =
    currentUser?.role === 'Admin' ||
    currentUser?.role === 'Promoter' ||
    isAuthorizedAdminEmail(currentUser?.email) ||
    localStorage.getItem('ub_admin_session') === 'true';

  const [config, setConfig] = useState<MultiLockConfig>(() => getMultiLockConfig(currentUser?.email));
  const [currentMethod, setCurrentMethod] = useState<UnlockMethod>(() => {
    const cfg = getMultiLockConfig(currentUser?.email);
    return cfg.primaryMethod || 'pin';
  });

  useEffect(() => {
    const cfg = getMultiLockConfig(currentUser?.email);
    setConfig(cfg);
    setCurrentMethod(cfg.primaryMethod || 'pin');
  }, [currentUser?.email]);

  // Common Feedback State
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [shake, setShake] = useState<boolean>(false);
  const [unlockSuccess, setUnlockSuccess] = useState<boolean>(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // 1. PIN State
  const [pinInput, setPinInput] = useState<string>('');
  const [showPinDigits, setShowPinDigits] = useState<boolean>(false);

  // 2. Password State
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // 3. Pattern State
  const [drawPattern, setDrawPattern] = useState<number[]>([]);
  const [patternAttemptsLeft, setPatternAttemptsLeft] = useState<number>(3);

  const triggerError = (msg: string) => {
    setShake(true);
    setErrorMsg(msg);
    setTimeout(() => setShake(false), 500);
  };

  const executeUnlock = useCallback(() => {
    setUnlockSuccess(true);
    setTimeout(() => {
      unlockApp(currentPin, true);
    }, 400);
  }, [currentPin, unlockApp]);

  // 1. PIN Check
  const handlePinUnlock = useCallback(
    (entered: string) => {
      if (!entered) return;
      if (!currentPin) {
        triggerError('No PIN configured yet. Unlock using Fingerprint, Password, or Pattern.');
        setTimeout(() => setPinInput(''), 450);
        return;
      }
      const success = unlockApp(entered);
      if (!success) {
        setShake(true);
        setErrorMsg('Incorrect PIN. Please try again.');
        setTimeout(() => setShake(false), 500);
        setTimeout(() => setPinInput(''), 450);
      } else {
        setErrorMsg('');
        setUnlockSuccess(true);
      }
    },
    [currentPin, unlockApp]
  );

  useEffect(() => {
    if (currentMethod === 'pin') {
      const requiredLength = Math.max(4, Math.min(PIN_LENGTH, currentPin?.length || PIN_LENGTH));
      if (pinInput.length === requiredLength || pinInput.length === PIN_LENGTH) {
        handlePinUnlock(pinInput);
      }
    }
  }, [pinInput, currentMethod, currentPin, handlePinUnlock]);

  // Hardware keyboard for PIN
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentMethod === 'pin') {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          setErrorMsg('');
          setPinInput((prev) => (prev.length < PIN_LENGTH ? prev + e.key : prev));
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          setErrorMsg('');
          setPinInput((prev) => prev.slice(0, -1));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setPinInput('');
          setErrorMsg('');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (pinInput.length > 0) handlePinUnlock(pinInput);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentMethod, pinInput, handlePinUnlock]);

  // 2. Password Check (strict hash match required)
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;

    setErrorMsg('');
    if (!config.passwordHash) {
      triggerError('No password lock configured yet. Please unlock with your PIN or configure Password in Lock Settings.');
      return;
    }

    const matched = await verifyPasswordLock(passwordInput, currentUser?.email);
    if (matched) {
      executeUnlock();
    } else {
      triggerError('Incorrect password. Please try again.');
      setPasswordInput('');
    }
  };

  // 3. Pattern Check (strict hash match required)
  const handlePatternDotClick = (dot: number) => {
    if (drawPattern.includes(dot)) return;
    setDrawPattern((prev) => [...prev, dot]);
  };

  const handlePatternVerify = async () => {
    if (drawPattern.length < 4) {
      triggerError('Connect at least 4 dots to verify pattern.');
      return;
    }

    if (!config.patternHash) {
      triggerError('No pattern lock configured yet. Please unlock with PIN or configure Pattern in Lock Settings.');
      setDrawPattern([]);
      return;
    }

    const matched = await verifyPatternLock(drawPattern, currentUser?.email);
    if (matched) {
      setPatternAttemptsLeft(3);
      executeUnlock();
    } else {
      const remaining = patternAttemptsLeft - 1;
      setPatternAttemptsLeft(remaining);
      if (remaining > 0) {
        triggerError(`Wrong pattern, ${remaining} attempt${remaining === 1 ? '' : 's'} left`);
      } else {
        triggerError('Maximum attempts reached. Switch to PIN or reset pattern.');
      }
      setDrawPattern([]);
    }
  };

  const handleForgotPin = async () => {
    setIsResetting(true);
    const sent = await resetPinWithEmail();
    setIsResetting(false);
    setResetFeedback(
      sent
        ? `A Firebase password reset link has been sent to ${currentUser?.email}.`
        : 'Add a verified email address to your account to recover credentials.'
    );
    setTimeout(() => {
      setResetFeedback(null);
    }, 4500);
  };

  const switchMethod = (method: UnlockMethod) => {
    setCurrentMethod(method);
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col justify-center items-center px-4 py-6 relative text-white select-none">
      <div className="absolute top-1/4 w-72 h-72 bg-[#FACC15]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Lock Settings Controls (No bypass X button) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        {isPrivileged && (
          <button
            type="button"
            onClick={() => setActiveModal('app-lock-settings')}
            className="h-10 px-3 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-[#FACC15] hover:text-yellow-300 transition cursor-pointer border border-white/10 flex items-center gap-1.5 text-xs font-bold shadow-lg"
            title="Configure Multi-Locks (PIN, Fingerprint, Password, Pattern)"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Lock Settings</span>
          </button>
        )}
      </div>

      {/* Top Brand Tag */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#FACC15] flex items-center justify-center font-black text-black text-sm shadow-lg shadow-yellow-400/20">
          UB
        </div>
        <div>
          <span className="text-white font-bold text-lg tracking-tight block">
            Universal Band
          </span>
          <span className="text-[10px] text-gray-400 font-mono tracking-wider uppercase flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#FACC15]" />
            Cashless & Event Access
          </span>
        </div>
      </div>

      {/* Main Lock Card */}
      <div
        className={`w-full max-w-xs bg-[#141414] rounded-3xl p-5 sm:p-6 border border-white/10 shadow-2xl backdrop-blur-sm transition-all duration-300 relative ${
          shake ? 'animate-shake border-red-500/70 bg-red-950/20' : ''
        }`}
      >
        {/* Lock Method Switcher Tabs (For Admin and Promoter) */}
        {isPrivileged && (
          <div className="grid grid-cols-4 gap-1 p-1 bg-black/50 rounded-2xl border border-white/5 mb-4">
            <button
              type="button"
              onClick={() => switchMethod('pin')}
              className={`py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                currentMethod === 'pin' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
              title="Unlock with 6-Digit PIN"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span className="text-[10px]">PIN</span>
            </button>

            <button
              type="button"
              onClick={() => switchMethod('fingerprint')}
              className={`py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                currentMethod === 'fingerprint' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
              title="Unlock with Hardware Fingerprint"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span className="text-[10px]">Touch</span>
            </button>

            <button
              type="button"
              onClick={() => switchMethod('password')}
              className={`py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                currentMethod === 'password' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
              title="Unlock with Password"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="text-[10px]">Pass</span>
            </button>

            <button
              type="button"
              onClick={() => switchMethod('pattern')}
              className={`py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                currentMethod === 'pattern' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
              title="Unlock with Pattern"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span className="text-[10px]">Pattern</span>
            </button>
          </div>
        )}

        {/* Lock Icon & Subtitle Header */}
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FACC15]/10 border border-[#FACC15]/30 flex items-center justify-center text-[#FACC15] mb-2 shadow-inner">
            {currentMethod === 'pin' && <Lock className="w-6 h-6 stroke-[2.2]" />}
            {currentMethod === 'fingerprint' && <Fingerprint className="w-6 h-6 stroke-[2.2] text-emerald-400" />}
            {currentMethod === 'password' && <KeyRound className="w-6 h-6 stroke-[2.2]" />}
            {currentMethod === 'pattern' && <Grid3X3 className="w-6 h-6 stroke-[2.2]" />}
          </div>
          <h1 className="text-base font-black text-white tracking-tight">
            {currentMethod === 'pin' && 'Security PIN Required'}
            {currentMethod === 'fingerprint' && 'Fingerprint Authentication'}
            {currentMethod === 'password' && 'Master Password Required'}
            {currentMethod === 'pattern' && 'Draw Security Pattern'}
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {currentMethod === 'pin' && 'Enter your 6-digit PIN to unlock'}
            {currentMethod === 'fingerprint' && 'Touch hardware fingerprint sensor to authenticate'}
            {currentMethod === 'password' && 'Enter administrator passphrase'}
            {currentMethod === 'pattern' && 'Connect dots to unlock session'}
          </p>
        </div>

        {/* METHOD 1: 6-DIGIT PIN */}
        {currentMethod === 'pin' && (
          <div>
            <div className="flex justify-center items-center gap-2 sm:gap-2.5 mb-3 py-1">
              {Array.from({ length: PIN_LENGTH }).map((_, index) => {
                const digit = pinInput[index];
                const isFilled = Boolean(digit);
                return (
                  <div
                    key={index}
                    className={`w-9 h-11 sm:w-10 sm:h-12 rounded-xl border-2 flex items-center justify-center font-mono font-black text-base transition-all duration-200 ${
                      isFilled
                        ? 'border-[#FACC15] bg-[#FACC15]/15 text-[#FACC15] scale-105 shadow-md shadow-yellow-400/10'
                        : 'border-white/15 bg-white/5 text-transparent'
                    }`}
                  >
                    {isFilled ? (showPinDigits ? digit : '•') : ''}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setShowPinDigits(!showPinDigits)}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition cursor-pointer ml-0.5"
                title={showPinDigits ? 'Hide PIN digits' : 'Show PIN digits'}
                aria-label="Toggle PIN visibility"
              >
                {showPinDigits ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto mb-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => {
                    if (pinInput.length < PIN_LENGTH) {
                      setErrorMsg('');
                      setPinInput((prev) => prev + digit);
                    }
                  }}
                  className="h-11 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 active:bg-yellow-400/20 text-white font-mono font-bold text-base flex items-center justify-center border border-white/5 hover:border-white/10 transition cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPinInput('');
                  setErrorMsg('');
                }}
                className="h-11 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 text-gray-400 font-bold text-xs flex items-center justify-center border border-white/5 transition cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pinInput.length < PIN_LENGTH) {
                    setErrorMsg('');
                    setPinInput((prev) => prev + '0');
                  }
                }}
                className="h-11 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 text-white font-mono font-bold text-base flex items-center justify-center border border-white/5 hover:border-white/10 transition cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setPinInput((prev) => prev.slice(0, -1));
                }}
                className="h-11 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 text-gray-400 flex items-center justify-center border border-white/5 transition cursor-pointer"
                aria-label="Delete digit"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handlePinUnlock(pinInput)}
              disabled={pinInput.length === 0}
              className="w-full bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-black py-2.5 px-4 rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-yellow-400/20 text-xs cursor-pointer mb-2 disabled:opacity-40"
            >
              <Unlock className="w-4 h-4 stroke-[2.5]" />
              <span>Unlock with PIN</span>
            </button>
          </div>
        )}

        {/* METHOD 2: HARDWARE FINGERPRINT */}
        {currentMethod === 'fingerprint' && (
          <div className="py-1">
            <Security
              title="Fingerprint Multi-Lock"
              description="Hardware fingerprint verification"
              onUnlock={executeUnlock}
            />
          </div>
        )}

        {/* METHOD 3: PASSWORD */}
        {currentMethod === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-3 pt-1">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
                className="w-full bg-[#101010] text-white p-3 pr-10 rounded-xl border border-white/10 focus:border-[#FACC15] focus:outline-none text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={!passwordInput.trim()}
              className="w-full bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black py-2.5 rounded-xl text-xs transition cursor-pointer shadow-md disabled:opacity-40"
            >
              Unlock with Password
            </button>
          </form>
        )}

        {/* METHOD 4: PATTERN */}
        {currentMethod === 'pattern' && (
          <div className="space-y-3 pt-1 text-center">
            <div className="grid grid-cols-3 gap-3 w-48 mx-auto p-4 bg-black/60 rounded-3xl border border-white/10">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((dot) => {
                const isSelected = drawPattern.includes(dot);
                const order = drawPattern.indexOf(dot);
                return (
                  <button
                    key={dot}
                    type="button"
                    onClick={() => handlePatternDotClick(dot)}
                    className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FACC15] text-black scale-110 shadow-lg shadow-yellow-400/30'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                    }`}
                  >
                    {isSelected ? order + 1 : '•'}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDrawPattern([])}
                className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold transition cursor-pointer text-xs"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={drawPattern.length < 4}
                onClick={handlePatternVerify}
                className="flex-1 py-2 rounded-xl bg-[#FACC15] hover:bg-yellow-400 disabled:opacity-40 text-black font-extrabold transition cursor-pointer text-xs shadow-md"
              >
                Verify Pattern
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                switchMethod('pin');
                triggerError('Enter 6-digit PIN to unlock or reset pattern in settings.');
              }}
              className="w-full text-center text-[11px] text-[#FACC15] hover:underline font-bold pt-1 cursor-pointer block"
            >
              Forgot Pattern? Switch to PIN
            </button>
          </div>
        )}

        {errorMsg ? (
          <div className="flex items-center justify-center gap-1.5 text-red-400 text-[11px] mt-3 text-center animate-in fade-in font-medium">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        ) : (
          <div className="h-4 mt-3 text-center">
            <span className="text-[10px] text-gray-500">
              {attemptsLeft} attempts remaining
            </span>
          </div>
        )}

        {unlockSuccess && (
          <div className="absolute inset-0 bg-[#141414]/95 rounded-3xl flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200 z-30">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-black flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>
            <h3 className="text-base font-black text-white">Security Verified</h3>
            <p className="text-xs text-gray-400 mt-1">Session unlocked successfully</p>
          </div>
        )}

        <div className="flex items-center justify-center pt-2.5 mt-2 border-t border-white/5 text-[11px] text-gray-400">
          <button
            type="button"
            onClick={handleForgotPin}
            disabled={isResetting}
            className="hover:text-[#FACC15] transition flex items-center gap-1.5 cursor-pointer py-0.5"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{isResetting ? 'Sending...' : 'Forgot PIN / Locks?'}</span>
          </button>
        </div>

        {resetFeedback && (
          <div className="mt-2.5 p-2 bg-emerald-950/70 border border-emerald-500/40 rounded-xl text-emerald-300 text-[10px] text-center flex items-center justify-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{resetFeedback}</span>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-600 mt-5 text-center max-w-xs font-mono">
        Universal Band Zero-Trust Session Security
      </p>
    </div>
  );
};

export default AppLockPage;
