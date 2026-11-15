import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Lock,
  KeyRound,
  CheckCircle2,
  Fingerprint,
  Grid3X3,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import {
  getMultiLockConfig,
  saveMultiLockConfig,
  setPasswordLock,
  setPatternLock,
  isRealCredentialId,
  UnlockMethod,
  MultiLockConfig,
} from '../../utils/multiLockSecurity';
import { isAuthorizedAdminEmail } from '../../utils/cryptoHelper';
import { Security } from '../multilock/Security';

export const AppLockSettingsModal: React.FC = () => {
  const { updatePin, lockApp, setActiveModal, currentUser } = useApp();

  const isPrivileged =
    currentUser?.role === 'Admin' ||
    currentUser?.role === 'Promoter' ||
    isAuthorizedAdminEmail(currentUser?.email) ||
    localStorage.getItem('ub_admin_session') === 'true';

  const [config, setConfig] = useState<MultiLockConfig>(() => getMultiLockConfig(currentUser?.email));
  const [activeTab, setActiveTab] = useState<'PIN' | 'FINGERPRINT' | 'PASSWORD' | 'PATTERN'>('PIN');
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  // 1. PIN State
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // 2. Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 3. Pattern State
  const [setupPattern, setSetupPattern] = useState<number[]>([]);

  useEffect(() => {
    setConfig(getMultiLockConfig(currentUser?.email));
  }, [currentUser?.email]);

  const showMsg = (text: string, error = false) => {
    setFeedback({ text, error });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 6) {
      showMsg('PIN must be exactly 6 digits', true);
      return;
    }
    if (newPin !== confirmPin) {
      showMsg('PIN confirmation does not match', true);
      return;
    }

    updatePin(newPin);
    const updated = saveMultiLockConfig({ pinEnabled: true }, currentUser?.email, currentUser?.id);
    setConfig(updated);
    setNewPin('');
    setConfirmPin('');
    showMsg('6-digit Security PIN updated successfully!');
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showMsg('Password must be at least 6 characters', true);
      return;
    }
    if (newPassword !== confirmPassword) {
      showMsg('Passwords do not match', true);
      return;
    }

    await setPasswordLock(newPassword, currentUser?.email, currentUser?.id);
    setNewPassword('');
    setConfirmPassword('');
    const updated = saveMultiLockConfig({ passwordEnabled: true }, currentUser?.email, currentUser?.id);
    setConfig(updated);
    showMsg('Master security password saved and enabled!');
  };

  const handlePatternDotClick = (dot: number) => {
    if (setupPattern.includes(dot)) return;
    setSetupPattern((prev) => [...prev, dot]);
  };

  const handleSavePattern = async () => {
    if (setupPattern.length < 4) {
      showMsg('Pattern must connect at least 4 dots', true);
      return;
    }
    await setPatternLock(setupPattern, currentUser?.email, currentUser?.id);
    const updated = saveMultiLockConfig({ patternEnabled: true }, currentUser?.email, currentUser?.id);
    setConfig(updated);
    showMsg(`Pattern saved with ${setupPattern.length} points!`);
    setSetupPattern([]);
  };

  const handleToggle = (key: keyof MultiLockConfig) => {
    const updated = saveMultiLockConfig({ [key]: !config[key] }, currentUser?.email, currentUser?.id);
    setConfig(updated);
  };

  const handleSetPrimary = (method: UnlockMethod) => {
    const updated = saveMultiLockConfig({ primaryMethod: method }, currentUser?.email, currentUser?.id);
    setConfig(updated);
    showMsg(`Primary unlock method set to ${method.toUpperCase()}`);
  };

  const fingerprintActuallyEnrolled = Boolean(
    config.fingerprintEnrolled && isRealCredentialId(config.fingerprintCredentialId)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-sm bg-[#161616] rounded-3xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto my-auto flex flex-col">
        <button
          onClick={() => setActiveModal(null)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-2xl bg-[#FACC15] flex items-center justify-center text-black font-black text-xs shadow-md">
            UB
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>Security &amp; Locks</span>
              {isPrivileged && (
                <span className="text-[9px] bg-yellow-400/20 text-[#FACC15] px-1.5 py-0.5 rounded font-extrabold border border-yellow-400/30 uppercase">
                  {currentUser.role}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-gray-400">
              {isPrivileged
                ? 'Multi-Lock Vault: PIN, Hardware Fingerprint, Password & Pattern'
                : 'Account Security & PIN Settings'}
            </p>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-2.5 rounded-xl text-xs mb-3 text-center flex items-center justify-center gap-1.5 font-bold animate-in fade-in ${
              feedback.error
                ? 'bg-red-950/80 text-red-300 border border-red-500/30'
                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            {feedback.error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {isPrivileged && (
          <div className="bg-black/50 p-2.5 rounded-2xl border border-white/5 mb-3 flex flex-col gap-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">
                Active Locks Vault:
              </span>
              <span className="text-[#FACC15] font-bold">
                Primary: {config.primaryMethod.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${config.pinEnabled ? 'bg-yellow-400/20 text-[#FACC15] border border-yellow-400/30' : 'bg-white/5 text-gray-500'}`}>
                PIN (6D) ✓
              </span>
              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${config.fingerprintEnabled && fingerprintActuallyEnrolled ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30' : 'bg-white/5 text-gray-500'}`}>
                Fingerprint {fingerprintActuallyEnrolled ? '✓' : ''}
              </span>
              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${config.passwordEnabled && config.passwordHash ? 'bg-blue-400/20 text-blue-400 border border-blue-400/30' : 'bg-white/5 text-gray-500'}`}>
                Password {config.passwordHash ? '✓' : ''}
              </span>
              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] ${config.patternEnabled && config.patternHash ? 'bg-purple-400/20 text-purple-400 border border-purple-400/30' : 'bg-white/5 text-gray-500'}`}>
                Pattern {config.patternHash ? '✓' : ''}
              </span>
            </div>
          </div>
        )}

        {isPrivileged ? (
          <div className="grid grid-cols-4 gap-1 p-1 bg-black/60 rounded-2xl border border-white/5 mb-4 shrink-0 text-center">
            <button
              type="button"
              onClick={() => setActiveTab('PIN')}
              className={`py-2 rounded-xl text-[10px] font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                activeTab === 'PIN' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>PIN</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('FINGERPRINT')}
              className={`py-2 rounded-xl text-[10px] font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                activeTab === 'FINGERPRINT' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>Touch</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('PASSWORD')}
              className={`py-2 rounded-xl text-[10px] font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                activeTab === 'PASSWORD' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Pass</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('PATTERN')}
              className={`py-2 rounded-xl text-[10px] font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                activeTab === 'PATTERN' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>Pattern</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/60 rounded-2xl border border-white/5 mb-4 shrink-0 text-center">
            <button
              type="button"
              onClick={() => setActiveTab('PIN')}
              className={`py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'PIN' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Add PIN</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('FINGERPRINT')}
              className={`py-2.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'FINGERPRINT' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Fingerprint className="w-4 h-4" />
              <span>Add Fingerprint</span>
            </button>
          </div>
        )}

        {activeTab === 'PIN' && (
          <form onSubmit={handleUpdatePin} className="space-y-3 text-xs flex-1">
            <div className="bg-[#101010] p-3 rounded-2xl border border-white/5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-bold">6-Digit PIN Protection</span>
                <span className="text-[#FACC15] font-mono font-bold">Active</span>
              </div>
              <p className="text-[11px] text-gray-500">
                Primary numeric code for instant unlock.
              </p>
            </div>

            <div>
              <label className="block text-gray-300 font-bold mb-1">New 6-Digit PIN</label>
              <input
                type="password"
                maxLength={6}
                inputMode="numeric"
                placeholder="Enter 6 digits"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-[#101010] text-white p-2.5 rounded-xl border border-white/10 focus:border-[#FACC15] font-mono tracking-widest text-center text-sm"
              />
            </div>

            <div>
              <label className="block text-gray-300 font-bold mb-1">Confirm 6-Digit PIN</label>
              <input
                type="password"
                maxLength={6}
                inputMode="numeric"
                placeholder="Re-enter 6 digits"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-[#101010] text-white p-2.5 rounded-xl border border-white/10 focus:border-[#FACC15] font-mono tracking-widest text-center text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#262626] hover:bg-[#FACC15] hover:text-black text-white font-bold py-2.5 rounded-xl transition text-xs cursor-pointer"
            >
              Save 6-Digit PIN
            </button>

            {isPrivileged && (
              <button
                type="button"
                onClick={() => handleSetPrimary('pin')}
                className="w-full py-1.5 text-center text-[10px] text-gray-400 hover:text-[#FACC15] font-bold cursor-pointer"
              >
                {config.primaryMethod === 'pin' ? '✓ Primary Unlock Method' : 'Set as Primary Unlock'}
              </button>
            )}
          </form>
        )}

        {activeTab === 'FINGERPRINT' && (
          <div className="space-y-3.5 text-xs text-center flex-1">
            <Security
              title="Fingerprint Sensor Lock"
              description="Hardware biometric fingerprint passkey"
              className="bg-transparent border-0 shadow-none p-0 max-w-full"
              onUnlock={() => {
                setConfig(getMultiLockConfig(currentUser?.email));
                showMsg('Hardware fingerprint verified!');
              }}
            />

            <div className="flex items-center justify-between p-2.5 bg-[#101010] rounded-xl border border-white/5">
              <span className="text-gray-300">Allow Fingerprint Unlock</span>
              <input
                type="checkbox"
                checked={config.fingerprintEnabled}
                onChange={() => handleToggle('fingerprintEnabled')}
                className="w-4 h-4 accent-[#FACC15] cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => handleSetPrimary('fingerprint')}
              className="w-full py-1.5 text-center text-[10px] text-gray-400 hover:text-[#FACC15] font-bold cursor-pointer"
            >
              {config.primaryMethod === 'fingerprint' ? '✓ Primary Unlock Method' : 'Set as Primary Unlock'}
            </button>
          </div>
        )}

        {activeTab === 'PASSWORD' && (
          <form onSubmit={handleUpdatePassword} className="space-y-3 text-xs flex-1">
            <div className="bg-[#101010] p-3 rounded-2xl border border-white/5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-bold">Master Password</span>
                <span className="text-[#FACC15] font-mono text-[10px]">
                  {config.passwordHash ? 'Configured ✓' : 'Not Set'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Alphanumeric passphrase for high-security administrator authorization.
              </p>
            </div>

            <div>
              <label className="block text-gray-300 font-bold mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#101010] text-white p-2.5 pr-9 rounded-xl border border-white/10 focus:border-[#FACC15] font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-gray-300 font-bold mb-1">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#101010] text-white p-2.5 rounded-xl border border-white/10 focus:border-[#FACC15] font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#262626] hover:bg-[#FACC15] hover:text-black text-white font-bold py-2.5 rounded-xl transition text-xs cursor-pointer"
            >
              Save Password Lock
            </button>

            <button
              type="button"
              onClick={() => handleSetPrimary('password')}
              className="w-full py-1.5 text-center text-[10px] text-gray-400 hover:text-[#FACC15] font-bold cursor-pointer"
            >
              {config.primaryMethod === 'password' ? '✓ Primary Unlock Method' : 'Set as Primary Unlock'}
            </button>
          </form>
        )}

        {activeTab === 'PATTERN' && (
          <div className="space-y-3 text-xs text-center flex-1">
            <div className="bg-[#101010] p-3 rounded-2xl border border-white/5 space-y-1">
              <span className="text-gray-300 font-bold block">3×3 Gesture Pattern</span>
              <p className="text-[11px] text-gray-500">
                Connect at least 4 dots to configure your custom unlock pattern.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 w-48 mx-auto p-4 bg-black/60 rounded-3xl border border-white/10">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((dot) => {
                const isSelected = setupPattern.includes(dot);
                const order = setupPattern.indexOf(dot);
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
                onClick={() => setSetupPattern([])}
                className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold transition cursor-pointer text-xs"
              >
                Reset
              </button>
              <button
                type="button"
                disabled={setupPattern.length < 4}
                onClick={handleSavePattern}
                className="flex-1 py-2 rounded-xl bg-[#FACC15] hover:bg-yellow-400 disabled:opacity-40 text-black font-extrabold transition cursor-pointer text-xs shadow-md"
              >
                Save Pattern
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleSetPrimary('pattern')}
              className="w-full py-1 text-center text-[10px] text-gray-400 hover:text-[#FACC15] font-bold cursor-pointer"
            >
              {config.primaryMethod === 'pattern' ? '✓ Primary Unlock Method' : 'Set as Primary Unlock'}
            </button>
          </div>
        )}

        <div className="pt-3 mt-3 border-t border-white/5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveModal(null);
              lockApp();
            }}
            className="w-full bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold py-3 rounded-2xl transition flex items-center justify-center gap-2 text-xs shadow-lg shadow-yellow-400/10 cursor-pointer"
          >
            <Lock className="w-4 h-4 stroke-[2.5]" />
            <span>Lock App &amp; Test Unlocks</span>
          </button>
        </div>
      </div>
    </div>
  );
};
