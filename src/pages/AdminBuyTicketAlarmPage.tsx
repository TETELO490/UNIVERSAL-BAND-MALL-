import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { BuiltInSoundId, BuyTicketAlarmConfig } from '../types';
import { BUILT_IN_ORDER_SOUNDS, DEFAULT_NEW_ORDER_SOUND } from '../utils/audio';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import { ensureFilesPermission } from '../utils/nativePermissions';
import {
  ArrowLeft,
  Volume2,
  Music,
  Upload,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Shield,
  Power,
} from 'lucide-react';

export const AdminBuyTicketAlarmPage: React.FC = () => {
  const {
    currentUser,
    firebaseUser,
    buyTicketAlarm,
    updateBuyTicketAlarm,
    navigateTo,
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

  const [draft, setDraft] = useState<BuyTicketAlarmConfig>(
    buyTicketAlarm || {
      ...DEFAULT_NEW_ORDER_SOUND,
      enabled: true,
    }
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (buyTicketAlarm) {
      setDraft(buyTicketAlarm);
    }
  }, [buyTicketAlarm]);

  if (!isAdmin) {
    return (
      <div className="pb-24 pt-6 px-4 max-w-md mx-auto">
        <div className="bg-[#1A1A1A] border border-rose-500/30 rounded-2xl p-6 text-center space-y-3">
          <Shield className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-extrabold text-white">Admin only</h1>
          <p className="text-xs text-gray-400">
            Buy Ticket Alarm Song settings can only be viewed or changed in the Admin account.
          </p>
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="w-full min-h-[44px] bg-[#FACC15] text-black font-black text-xs rounded-xl cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const handleToggleEnabled = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const nextConfig: BuyTicketAlarmConfig = {
      ...draft,
      enabled: !draft.enabled,
    };
    setDraft(nextConfig);
    await updateBuyTicketAlarm(nextConfig);
    setSuccessMsg(
      nextConfig.enabled
        ? 'Buy Ticket Alarm turned ON.'
        : 'Buy Ticket Alarm turned OFF.'
    );
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (file.size > 1_500_000) {
      setErrorMsg('Audio file must be smaller than 1.5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setDraft((prev) => ({
          ...prev,
          mode: 'custom',
          customName: file.name,
          customDataUrl: reader.result as string,
        }));
        setSuccessMsg(`Loaded song "${file.name}". Tap Save Alarm Song below to apply.`);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Could not read audio file.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustomSong = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setDraft((prev) => ({
      ...prev,
      mode: 'preset',
      customDataUrl: undefined,
      customName: undefined,
    }));
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      await updateBuyTicketAlarm(draft);
      setSuccessMsg('Buy Ticket Alarm Song settings saved.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save alarm settings.');
    } finally {
      setSaving(false);
    }
  };

  const currentSongLabel =
    draft.mode === 'custom' && draft.customName
      ? draft.customName
      : BUILT_IN_ORDER_SOUNDS.find((s) => s.id === (draft.presetId || 'loud-ringtone'))?.label ||
        'Classic Loud Ringtone';

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo('/profile')}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back</span>
        </button>

        <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#FACC15]/15 text-[#FACC15] border border-[#FACC15]/30">
          Admin Only
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Volume2 className="w-6 h-6 text-[#FACC15]" />
          <span>Buy Ticket Alarm Song</span>
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Configure the alarm song that rings in your Admin account when real customers buy event tickets.
        </p>
      </div>

      {/* Alarm ON / OFF Switch */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              draft.enabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-zinc-800 border-white/10 text-gray-400'
            }`}
          >
            <Power className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-white">Buy Ticket Song Alarm</p>
            <p className="text-[11px] text-gray-400">
              {draft.enabled ? 'Alarm ON — rings on real ticket purchases' : 'Alarm OFF'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          onClick={() => void handleToggleEnabled()}
          className={`min-h-[44px] px-4 rounded-xl font-black text-xs cursor-pointer transition border ${
            draft.enabled
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50'
              : 'bg-zinc-800 hover:bg-zinc-700 text-gray-300 border-white/10'
          }`}
        >
          {draft.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Song Selection & Upload Card */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="bg-black/50 border border-[#FACC15]/30 rounded-xl p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
              Selected Alarm Song
            </span>
            <span className="text-sm font-bold text-[#FACC15] truncate block">
              {currentSongLabel}
            </span>
          </div>
          <Music className="w-5 h-5 text-[#FACC15] shrink-0" />
        </div>

        {/* Built-in Alarm Ringtones */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-gray-200 block">
            Choose Alarm Song
          </span>
          <div className="space-y-1.5">
            {BUILT_IN_ORDER_SOUNDS.map((sound) => {
              const isSelected =
                draft.mode === 'preset' && draft.presetId === sound.id;
              return (
                <button
                  key={sound.id}
                  type="button"
                  onClick={() => {
                    setSuccessMsg(null);
                    setErrorMsg(null);
                    setDraft((prev) => ({
                      ...prev,
                      mode: 'preset',
                      presetId: sound.id as BuiltInSoundId,
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
                    <span className="text-[11px] text-gray-400 block">{sound.description}</span>
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

        {/* Upload / Change / Remove Custom Song */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-white block">
                Upload Buy Ticket Alarm Song
              </span>
              <span className="text-[11px] text-gray-400 block">
                MP3, WAV, M4A, or OGG (max 1.5MB)
              </span>
            </div>
            {draft.customDataUrl && (
              <button
                type="button"
                onClick={handleRemoveCustomSong}
                className="min-h-[40px] px-2.5 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Song</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioUpload}
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
              {draft.customName
                ? `Change Song (${draft.customName})`
                : 'Choose Song File'}
            </span>
          </button>
        </div>

        {/* Volume Slider */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-gray-200">Alarm Volume</span>
            <span className="font-mono font-bold text-[#FACC15] tabular-nums">
              {Math.round((draft.volume ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={draft.volume ?? 1}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                volume: parseFloat(e.target.value),
              }))
            }
            className="w-full accent-[#FACC15]"
          />
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
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4 stroke-[2.5]" />
          <span>{saving ? 'SAVING...' : 'SAVE BUY TICKET ALARM SONG'}</span>
        </button>
      </div>
    </div>
  );
};

export default AdminBuyTicketAlarmPage;
