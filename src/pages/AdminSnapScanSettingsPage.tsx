import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Save,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { setCachedPublicSnapCode } from '../utils/snapscanHelper';

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`ub_admin_pin_v1:${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const AdminSnapScanSettingsPage: React.FC = () => {
  const { navigateTo } = useApp();

  // PIN gate state
  const [loadingPinState, setLoadingPinState] = useState(true);
  const [hasExistingPin, setHasExistingPin] = useState(false);
  const [storedPinHash, setStoredPinHash] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState(false);

  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  // SnapScan keys state (empty by default, never hardcoded)
  const [snapCode, setSnapCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [webhookAuthKey, setWebhookAuthKey] = useState('');

  // Visibility toggles (masked as dots by default)
  const [showSnapCode, setShowSnapCode] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookKey, setShowWebhookKey] = useState(false);

  const [loadingKeys, setLoadingKeys] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const checkPin = async () => {
      try {
        const pinSnap = await getDoc(doc(db, 'admin_config', 'pin'));
        if (!active) return;
        if (pinSnap.exists() && pinSnap.data()?.pinHash) {
          setHasExistingPin(true);
          setStoredPinHash(String(pinSnap.data()?.pinHash));
        } else {
          setHasExistingPin(false);
        }
      } catch (e: any) {
        if (!active) return;
        setPinError('Could not verify Admin PIN permissions. Make sure you are signed in as Admin.');
      } finally {
        if (active) setLoadingPinState(false);
      }
    };
    void checkPin();
    return () => {
      active = false;
    };
  }, []);

  const loadKeysFromFirestore = async () => {
    setLoadingKeys(true);
    setSaveError(null);
    try {
      const snap = await getDoc(doc(db, 'admin_config', 'snapscan'));
      if (snap.exists()) {
        const data = snap.data();
        setSnapCode(String(data?.snapCode || ''));
        setApiKey(String(data?.apiKey || ''));
        setWebhookAuthKey(String(data?.webhookAuthKey || ''));
      }
    } catch (e: any) {
      setSaveError('Failed to load saved keys from admin_config. Check admin sign-in.');
    } finally {
      setLoadingKeys(false);
    }
  };

  const handleSetFirstPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const cleanPin = pinInput.trim();
    if (cleanPin.length < 4) {
      setPinError('Admin PIN must be at least 4 characters.');
      return;
    }
    if (cleanPin !== confirmPinInput.trim()) {
      setPinError('PINs do not match. Please try again.');
      return;
    }

    setSavingPin(true);
    try {
      const hashed = await hashPin(cleanPin);
      await setDoc(
        doc(db, 'admin_config', 'pin'),
        {
          pinHash: hashed,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setStoredPinHash(hashed);
      setHasExistingPin(true);
      setIsUnlocked(true);
      setPinInput('');
      setConfirmPinInput('');
      await loadKeysFromFirestore();
    } catch (err: any) {
      setPinError(err?.message || 'Could not save Admin PIN to Firebase.');
    } finally {
      setSavingPin(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      setPinError('Please enter your Admin PIN.');
      return;
    }
    const hashed = await hashPin(cleanPin);
    if (hashed !== storedPinHash) {
      setPinError('Incorrect Admin PIN.');
      return;
    }
    setIsUnlocked(true);
    setPinInput('');
    await loadKeysFromFirestore();
  };

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    const cleanSnapCode = snapCode.trim();
    const cleanApiKey = apiKey.trim();
    const cleanWebhookKey = webhookAuthKey.trim();

    if (!cleanSnapCode) {
      setSaveError('Please paste your Online Merchant ID / SnapCode before saving.');
      return;
    }

    setSavingKeys(true);
    try {
      const nowIso = new Date().toISOString();

      // 1. Store all private keys in admin-only `admin_config/snapscan`
      await setDoc(
        doc(db, 'admin_config', 'snapscan'),
        {
          snapCode: cleanSnapCode,
          apiKey: cleanApiKey,
          webhookAuthKey: cleanWebhookKey,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      // 2. Store ONLY the public SnapCode in `app_settings/snapscan_public`
      // so the customer PAY button can build the SnapLink without ever reading private keys.
      await setDoc(
        doc(db, 'app_settings', 'snapscan_public'),
        {
          snapCode: cleanSnapCode,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      setCachedPublicSnapCode(cleanSnapCode);
      setSaveSuccess('Saved securely to Firebase (admin_config).');
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save keys to Firebase.');
    } finally {
      setSavingKeys(false);
    }
  };

  return (
    <div className="pb-24 pt-4 px-2 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo('/profile')}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back</span>
        </button>
        <span className="text-xs font-black text-[#FACC15] uppercase tracking-wider">
          Admin Settings
        </span>
      </div>

      {loadingPinState ? (
        <div className="bg-[#161616] border border-white/10 rounded-2xl p-8 text-center text-xs text-gray-400">
          Checking Admin PIN security...
        </div>
      ) : !isUnlocked ? (
        <div className="bg-[#161616] border border-[#FACC15]/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FACC15]/15 border border-[#FACC15]/40 text-[#FACC15] flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-white">
                {hasExistingPin ? 'Enter Admin PIN' : 'Set Your Admin PIN'}
              </h1>
              <p className="text-xs text-gray-400">
                {hasExistingPin
                  ? 'Admin Settings is protected. Enter your PIN to open.'
                  : 'First time setup: create your private Admin PIN to lock Admin Settings.'}
              </p>
            </div>
          </div>

          {pinError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold">
              {pinError}
            </div>
          )}

          <form
            onSubmit={hasExistingPin ? handleVerifyPin : handleSetFirstPin}
            className="space-y-3"
          >
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                {hasExistingPin ? 'Admin PIN' : 'Create Admin PIN'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                className="w-full min-h-[46px] bg-black/50 border border-white/15 focus:border-[#FACC15] rounded-xl px-4 text-white text-center text-lg font-black tracking-[0.35em] outline-none"
              />
            </div>

            {!hasExistingPin && (
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Confirm Admin PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="••••"
                  className="w-full min-h-[46px] bg-black/50 border border-white/15 focus:border-[#FACC15] rounded-xl px-4 text-white text-center text-lg font-black tracking-[0.35em] outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={savingPin}
              className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-black text-sm rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {savingPin
                  ? 'Saving PIN...'
                  : hasExistingPin
                  ? 'Unlock Admin Settings'
                  : 'Save PIN & Open Settings'}
              </span>
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[#161616] border border-[#FACC15]/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-black text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#FACC15]" />
                <span>Admin Settings</span>
              </h1>
              <button
                type="button"
                onClick={() => setIsUnlocked(false)}
                className="text-[11px] font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-1 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>Lock</span>
              </button>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>These keys are private. Never share them.</span>
            </div>
          </div>

          <form
            onSubmit={handleSaveKeys}
            className="bg-[#161616] border border-white/10 rounded-2xl p-4 space-y-4"
          >
            {loadingKeys ? (
              <div className="py-6 text-center text-xs text-gray-400">
                Loading saved keys...
              </div>
            ) : (
              <>
                {/* 1. Online Merchant ID / SnapCode */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    Online Merchant ID / SnapCode
                  </label>
                  <div className="relative">
                    <input
                      type={showSnapCode ? 'text' : 'password'}
                      autoComplete="off"
                      value={snapCode}
                      onChange={(e) => setSnapCode(e.target.value)}
                      placeholder="Paste Online Merchant ID / SnapCode"
                      className="w-full min-h-[46px] bg-black/50 border border-white/15 focus:border-[#FACC15] rounded-xl pl-3.5 pr-12 text-sm font-mono text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSnapCode((v) => !v)}
                      aria-label={showSnapCode ? 'Hide SnapCode' : 'Show SnapCode'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FACC15] hover:bg-white/5 transition cursor-pointer"
                    >
                      {showSnapCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 2. API Key */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste SnapScan API Key"
                      className="w-full min-h-[46px] bg-black/50 border border-white/15 focus:border-[#FACC15] rounded-xl pl-3.5 pr-12 text-sm font-mono text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      aria-label={showApiKey ? 'Hide API Key' : 'Show API Key'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FACC15] hover:bg-white/5 transition cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 3. Webhook Authentication Key */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                    Webhook Authentication Key
                  </label>
                  <div className="relative">
                    <input
                      type={showWebhookKey ? 'text' : 'password'}
                      autoComplete="off"
                      value={webhookAuthKey}
                      onChange={(e) => setWebhookAuthKey(e.target.value)}
                      placeholder="Paste Webhook Authentication Key"
                      className="w-full min-h-[46px] bg-black/50 border border-white/15 focus:border-[#FACC15] rounded-xl pl-3.5 pr-12 text-sm font-mono text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWebhookKey((v) => !v)}
                      aria-label={showWebhookKey ? 'Hide Webhook Key' : 'Show Webhook Key'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FACC15] hover:bg-white/5 transition cursor-pointer"
                    >
                      {showWebhookKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {saveError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold">
                    {saveError}
                  </div>
                )}

                {saveSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{saveSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingKeys}
                  className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-black text-sm rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingKeys ? 'Saving...' : 'SAVE'}</span>
                </button>
              </>
            )}
          </form>

          <button
            type="button"
            onClick={() => navigateTo('/snapscan-orders')}
            className="w-full min-h-[46px] bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Receipt className="w-4 h-4 text-[#FACC15]" />
            <span>Open Admin SnapScan Orders List</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminSnapScanSettingsPage;
