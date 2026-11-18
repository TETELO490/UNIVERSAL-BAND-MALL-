import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import { NewOrderSoundConfig } from '../types';
import {
  BUILT_IN_ORDER_SOUNDS,
  playNewOrderSound,
  stopActiveOrderSound,
  unlockAdminAudio,
  requestAdminNotificationPermission,
} from '../utils/audio';
import {
  checkNotificationsPermissionGranted,
  ensureFilesPermission,
} from '../utils/nativePermissions';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Shield,
  Save,
  Volume2,
  Music,
  Upload,
  Play,
  Bell,
  Trash2,
  Headphones,
  ShieldCheck,
  Building2,
  Plus,
} from 'lucide-react';

export const AdminPayshapSettingsPage: React.FC = () => {
  const {
    currentUser,
    firebaseUser,
    tymebankPayshapNumber,
    updateTymebankPayshapNumber,
    supportedBanks,
    updateSupportedBanks,
    newOrderSound,
    updateNewOrderSound,
    supportRingEnabled,
    setSupportRingEnabled,
    smsPermissionActive,
    lastPaymentAmount,
    testPaymentAlarm,
    navigateTo,
    setActiveModal,
  } = useApp();

  const isUserLoggedIn = Boolean(
    firebaseUser ||
      (currentUser?.isRegistered && currentUser?.id !== 'guest_user') ||
      localStorage.getItem('ub_admin_session') === 'true'
  );

  const roleLower = (currentUser?.role || '').toLowerCase();
  const has5LocksPassed =
    typeof window !== 'undefined' &&
    sessionStorage.getItem('ub_admin_5locks_passed') === 'true' &&
    localStorage.getItem('ub_admin_session') === 'true';

  const isAdmin =
    isUserLoggedIn &&
    has5LocksPassed &&
    (roleLower === 'admin' ||
      isAuthorizedAdminEmail(currentUser?.email) ||
      localStorage.getItem('ub_admin_session') === 'true');

  const [payshapInput, setPayshapInput] = useState<string>(
    tymebankPayshapNumber || '0821234567'
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newBankInput, setNewBankInput] = useState<string>('');
  const [bankSavedMsg, setBankSavedMsg] = useState<string | null>(null);

  // New Order Sound state
  const [draftSound, setDraftSound] = useState<NewOrderSoundConfig>(newOrderSound);
  const [soundSaving, setSoundSaving] = useState<boolean>(false);
  const [soundSuccessMsg, setSoundSuccessMsg] = useState<string | null>(null);
  const [soundErrorMsg, setSoundErrorMsg] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<string>('default');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void checkNotificationsPermissionGranted().then((granted) => {
      setNotifStatus(granted ? 'granted' : 'default');
    });
  }, []);

  useEffect(() => {
    if (tymebankPayshapNumber) {
      setPayshapInput(tymebankPayshapNumber);
    }
  }, [tymebankPayshapNumber]);

  useEffect(() => {
    setDraftSound(newOrderSound);
  }, [newOrderSound]);

  useEffect(() => {
    return () => {
      stopActiveOrderSound();
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmed = payshapInput.trim();
    if (!trimmed || trimmed.length < 6) {
      setErrorMsg('Please enter a valid TymeBank PayShap ID or cell phone number.');
      return;
    }

    setIsSaving(true);
    try {
      await updateTymebankPayshapNumber(trimmed);
      setSuccessMsg('PayShap ID updated successfully');
    } catch {
      setErrorMsg('Could not save PayShap ID. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSoundErrorMsg(null);
    setSoundSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name)) {
      setSoundErrorMsg('Please choose an MP3, WAV, M4A, or OGG audio ringtone file.');
      return;
    }

    if (file.size > 1_500_000) {
      setSoundErrorMsg('Audio file must be under 1.5MB so it plays instantly and saves reliably.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:')) {
        setSoundErrorMsg('Could not load audio file.');
        return;
      }
      setDraftSound((prev) => ({
        ...prev,
        mode: 'custom',
        customName: file.name,
        customDataUrl: dataUrl,
      }));
      setSoundSuccessMsg(`Loaded "${file.name}". Tap Test Sound or Save Sound.`);
    };
    reader.onerror = () => {
      setSoundErrorMsg('Failed to read selected audio file.');
    };
    reader.readAsDataURL(file);
  };

  const handleTestSound = async () => {
    setSoundErrorMsg(null);
    await testPaymentAlarm(draftSound);
  };

  const handleSaveSound = async () => {
    setSoundErrorMsg(null);
    setSoundSuccessMsg(null);
    setSoundSaving(true);
    try {
      await unlockAdminAudio();
      await updateNewOrderSound(draftSound);
      setSoundSuccessMsg('Payment Alarm sound saved! It will ring continuously when a GoTyme / TymeBank payment SMS arrives.');
    } catch {
      setSoundErrorMsg('Could not save Payment Alarm sound. Please try again.');
    } finally {
      setSoundSaving(false);
    }
  };

  const handleEnableBackgroundAlerts = async () => {
    await unlockAdminAudio();
    const res = await requestAdminNotificationPermission();
    setNotifStatus(res);
  };

  if (!isAdmin) {
    return (
      <div className="pb-24 pt-6 px-4 max-w-md mx-auto">
        <div className="bg-[#1A1A1A] border border-rose-500/30 rounded-2xl p-6 text-center space-y-3">
          <Shield className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-extrabold text-white">Admin Access Only</h1>
          <p className="text-xs text-gray-400">
            Only the administrator can open Admin Settings and change the PayShap ID or New Order Sound.
          </p>
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="min-h-[44px] px-5 bg-[#FACC15] text-black font-black text-xs rounded-xl cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const activePresetMeta = BUILT_IN_ORDER_SOUNDS.find((s) => s.id === draftSound.presetId);
  const activeSoundLabel =
    draftSound.mode === 'custom' && draftSound.customDataUrl
      ? draftSound.customName || 'Uploaded Custom Ringtone'
      : activePresetMeta?.label || 'Classic Loud Ringtone';

  return (
    <div className="pb-24 pt-4 px-4 max-w-md mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo('/profile')}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back</span>
        </button>

        <span className="text-xs font-bold text-[#FACC15] tracking-wide">
          Admin Settings
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          Admin &amp; PayShap Settings
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Configure your TymeBank PayShap ID and custom New Order ringtone alert.
        </p>
      </div>

      {/* Current Active PayShap ID */}
      <div className="bg-[#1A1A1A] border border-[#FACC15]/30 rounded-2xl p-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
          Current TymeBank PayShap ID
        </span>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="text-2xl font-mono font-black text-[#FACC15] tracking-wide tabular-nums break-all">
            {tymebankPayshapNumber || '0821234567'}
          </span>
          <Smartphone className="w-5 h-5 text-[#FACC15] shrink-0" />
        </div>
      </div>

      {/* Edit PayShap ID Form */}
      <form
        onSubmit={handleSave}
        className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl"
      >
        <div>
          <label
            htmlFor="admin-payshap-id-input"
            className="block text-xs font-bold text-gray-200 mb-1.5"
          >
            New TymeBank PayShap ID / Cell Number
          </label>
          <input
            id="admin-payshap-id-input"
            type="text"
            value={payshapInput}
            onChange={(e) => {
              setPayshapInput(e.target.value);
              if (successMsg) setSuccessMsg(null);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="e.g. 0821234567 or myname@tymebank"
            className="w-full min-h-[44px] bg-black/70 border border-white/15 focus:border-[#FACC15] rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-white placeholder-gray-500 focus:outline-none"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            Saving immediately updates &quot;TymeBank PayShap ID&quot; on the ticket payment screen and wallet top-up screen.
          </p>
        </div>

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4 stroke-[2.5]" />
          <span>{isSaving ? 'SAVING...' : 'SAVE'}</span>
        </button>
      </form>

      {/* SUPPORTED CUSTOMER BANKS LIST (Admin-Managed) */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#FACC15]" />
              <span>Supported Customer Banks</span>
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Customers choose their bank from this list so you know which banking app to send their payment request to.
            </p>
          </div>
          <span className="text-[10px] font-black text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-2 py-0.5 rounded-full shrink-0">
            {supportedBanks.length} Banks
          </span>
        </div>

        {/* Add Bank Input */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const clean = newBankInput.trim();
            if (!clean) return;
            if (supportedBanks.some((b) => b.toLowerCase() === clean.toLowerCase())) {
              setNewBankInput('');
              return;
            }
            await updateSupportedBanks([...supportedBanks, clean]);
            setNewBankInput('');
            setBankSavedMsg(`Added "${clean}" to customer bank list.`);
            setTimeout(() => setBankSavedMsg(null), 3000);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={newBankInput}
            onChange={(e) => setNewBankInput(e.target.value)}
            placeholder="Add bank name (e.g. Capitec, FNB, Absa)..."
            className="flex-1 min-h-[44px] bg-black/70 border border-white/15 focus:border-[#FACC15] rounded-xl px-3.5 py-2 text-xs font-bold text-white placeholder-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newBankInput.trim()}
            className="min-h-[44px] px-4 bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black text-xs rounded-xl flex items-center gap-1 transition cursor-pointer disabled:opacity-40 shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </form>

        {bankSavedMsg && (
          <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{bankSavedMsg}</span>
          </div>
        )}

        {/* Current Banks List */}
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {supportedBanks.map((bank) => (
            <div
              key={bank}
              className="flex items-center justify-between gap-2 bg-black/60 border border-white/10 rounded-xl px-3 py-2.5"
            >
              <span className="text-xs font-bold text-white truncate">{bank}</span>
              <button
                type="button"
                disabled={supportedBanks.length <= 1}
                onClick={async () => {
                  const next = supportedBanks.filter((b) => b !== bank);
                  if (next.length === 0) return;
                  await updateSupportedBanks(next);
                  setBankSavedMsg(`Removed "${bank}" from customer bank list.`);
                  setTimeout(() => setBankSavedMsg(null), 3000);
                }}
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-1.5 rounded-lg transition cursor-pointer disabled:opacity-30"
                title="Remove bank"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* PAYMENT APPROVAL & LIVE ALARMS SECTION */}
      <div className="bg-[#1A1A1A] border border-emerald-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Payment Approval &amp; Alarms</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Background SMS alarm for GoTyme / TymeBank payments — manual admin approval only.
            </p>
          </div>
          <span
            className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
              smsPermissionActive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            {smsPermissionActive ? 'SMS ACTIVE' : 'SMS INACTIVE'}
          </span>
        </div>

        <div className="bg-black/50 border border-white/10 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">SMS Alarm Listener:</span>
            <span className="font-bold text-emerald-400">ALWAYS ON (Any Amount)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Last Payment SMS Amount:</span>
            <span className="font-mono text-[#FACC15]">{lastPaymentAmount || 'None yet'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigateTo('/admin/live-payments')}
          className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
        >
          <Smartphone className="w-4 h-4" />
          <span>OPEN PAYMENT APPROVAL</span>
        </button>
      </div>

      {/* PAYMENT ALARM SOUND & VOLUME SECTION */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#FACC15]" />
              <span>Payment Alarm Sound &amp; Volume</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Rings continuously when a GoTyme / TymeBank payment SMS arrives until stopped.
            </p>
          </div>
          <Music className="w-5 h-5 text-[#FACC15] shrink-0" />
        </div>

        <div className="bg-black/50 border border-[#FACC15]/30 rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
              Selected Alarm Sound
            </span>
            <span className="text-sm font-bold text-[#FACC15] truncate block">
              {activeSoundLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={handleTestSound}
            className="min-h-[44px] px-3.5 py-2 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>TEST ALARM</span>
          </button>
        </div>

        {/* Built-in Loud Ringtones */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-gray-200 block">
            Pick an App Sound / Ringtone
          </span>
          <div className="space-y-1.5">
            {BUILT_IN_ORDER_SOUNDS.map((sound) => {
              const isSelected =
                draftSound.mode === 'preset' && draftSound.presetId === sound.id;
              return (
                <button
                  key={sound.id}
                  type="button"
                  onClick={() => {
                    setSoundSuccessMsg(null);
                    setSoundErrorMsg(null);
                    setDraftSound((prev) => ({
                      ...prev,
                      mode: 'preset',
                      presetId: sound.id,
                    }));
                  }}
                  className={`w-full min-h-[48px] text-left p-3 rounded-xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-[#FACC15]/15 border-[#FACC15] text-white'
                      : 'bg-black/40 border-white/10 text-gray-300 hover:border-white/25'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold block">{sound.label}</span>
                    <span className="text-[11px] text-gray-400 block">
                      {sound.description}
                    </span>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      isSelected ? 'border-[#FACC15]' : 'border-gray-500'
                    }`}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-[#FACC15]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Upload Custom MP3 / Phone Ringtone */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-white block">
                Or Upload Your Own MP3 / Phone Ringtone
              </span>
              <span className="text-[11px] text-gray-400 block">
                MP3, WAV, M4A, or OGG (max 1.5MB)
              </span>
            </div>
            {draftSound.customDataUrl && (
              <button
                type="button"
                onClick={() =>
                  setDraftSound((prev) => ({
                    ...prev,
                    mode: 'preset',
                    customDataUrl: undefined,
                    customName: undefined,
                  }))
                }
                className="min-h-[44px] px-2.5 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioFileUpload}
            className="hidden"
          />

          <button
            type="button"
            onClick={async () => {
              const perm = await ensureFilesPermission();
              if (!perm.granted) return;
              fileInputRef.current?.click();
            }}
            className="w-full min-h-[44px] bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <Upload className="w-4 h-4 text-[#FACC15]" />
            <span>
              {draftSound.customName
                ? `Uploaded: ${draftSound.customName}`
                : 'Choose MP3 / Ringtone from Phone'}
            </span>
          </button>
        </div>

        {/* Volume Slider */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-gray-200">Alert Volume</span>
            <span className="font-mono font-bold text-[#FACC15] tabular-nums">
              {Math.round((draftSound.volume ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={draftSound.volume ?? 1}
            onChange={(e) =>
              setDraftSound((prev) => ({
                ...prev,
                volume: parseFloat(e.target.value),
              }))
            }
            className="w-full accent-[#FACC15]"
          />
        </div>

        {/* Background Notification Permission */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Background Lock-Screen Alerts</span>
            </span>
            <span className="text-[11px] text-gray-400 block mt-0.5">
              {notifStatus === 'granted'
                ? 'Active — device wakes/notifies on new tickets'
                : 'Tap Enable so orders alert even when app is in background'}
            </span>
          </div>
          {notifStatus !== 'granted' ? (
            <button
              type="button"
              onClick={handleEnableBackgroundAlerts}
              className="min-h-[44px] px-3 bg-white/10 hover:bg-white/20 text-[#FACC15] font-bold text-xs rounded-xl shrink-0 cursor-pointer"
            >
              Enable
            </button>
          ) : (
            <span className="text-xs font-bold text-emerald-400 shrink-0">Active</span>
          )}
        </div>

        {soundSuccessMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{soundSuccessMsg}</span>
          </div>
        )}

        {soundErrorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{soundErrorMsg}</span>
          </div>
        )}

        <button
          type="button"
          disabled={soundSaving}
          onClick={handleSaveSound}
          className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4 stroke-[2.5]" />
          <span>{soundSaving ? 'SAVING ALARM...' : 'SAVE PAYMENT ALARM'}</span>
        </button>
      </div>

      {/* Support Notifications - Ring ON / OFF */}
      <div className="bg-[#141414] border border-emerald-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Headphones className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-black text-white uppercase tracking-wide">
                Support Notifications
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                Ring ON / OFF when a customer sends a message or payment proof in Support Chat
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={supportRingEnabled}
            onClick={() => {
              const next = !supportRingEnabled;
              setSupportRingEnabled(next);
              if (next) {
                void unlockAdminAudio().then(() => {
                  playNewOrderSound(draftSound);
                });
              } else {
                stopActiveOrderSound();
              }
            }}
            className={`px-3.5 py-2 rounded-xl font-black text-xs transition shrink-0 cursor-pointer border ${
              supportRingEnabled
                ? 'bg-emerald-600 text-white border-emerald-400/50 shadow-md shadow-emerald-950/50'
                : 'bg-zinc-800 text-gray-400 border-white/10'
            }`}
          >
            {supportRingEnabled ? 'Ring ON' : 'Ring OFF'}
          </button>
        </div>
      </div>

      {/* Payment SMS Listener & Alert Log Shortcut */}
      <div className="bg-[#141414] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-white">GoTyme / TymeBank SMS Listener</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Manage SMS permission and incoming bank payment SMS log
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveModal('admin-console')}
          className="min-h-[44px] shrink-0 px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl cursor-pointer transition"
        >
          Open Console
        </button>
      </div>
    </div>
  );
};

export default AdminPayshapSettingsPage;
