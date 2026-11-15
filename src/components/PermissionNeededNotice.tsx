import React, { useEffect, useState } from 'react';
import { ShieldAlert, Settings, X } from 'lucide-react';
import {
  PERMISSION_DENIED_EVENT,
  PermissionDeniedDetail,
  openAppSettings,
} from '../utils/nativePermissions';

export const PermissionNeededNotice: React.FC = () => {
  const [deniedDetail, setDeniedDetail] = useState<PermissionDeniedDetail | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<PermissionDeniedDetail>;
      if (custom?.detail) {
        setDeniedDetail(custom.detail);
        setSettingsNotice(null);
      }
    };

    window.addEventListener(PERMISSION_DENIED_EVENT, handler);
    return () => window.removeEventListener(PERMISSION_DENIED_EVENT, handler);
  }, []);

  if (!deniedDetail) return null;

  const handleOpenSettings = async () => {
    const opened = await openAppSettings();
    if (!opened) {
      setSettingsNotice(
        'Open your device or browser Site Settings > Permissions for Universal Band and allow access.'
      );
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="permission-needed-title"
      className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div className="bg-[#18181B] border border-rose-500/40 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="permission-needed-title" className="text-sm font-black text-white">
                {deniedDetail.title || 'Permission needed'}
              </h3>
              <p className="text-[11px] text-rose-300 font-semibold uppercase tracking-wide">
                Access Denied
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDeniedDetail(null)}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
          {deniedDetail.message}
        </p>

        {settingsNotice && (
          <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/30 text-[11px] text-amber-200 leading-snug">
            {settingsNotice}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setDeniedDetail(null)}
            className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs transition cursor-pointer"
          >
            Not Now
          </button>
          <button
            type="button"
            onClick={handleOpenSettings}
            className="flex-1 py-2.5 px-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow"
          >
            <Settings className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Open Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionNeededNotice;
