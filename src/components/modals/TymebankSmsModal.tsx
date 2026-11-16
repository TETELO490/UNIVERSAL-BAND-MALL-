import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../../context/AppContext';
import {
  checkSmsPermissionGranted,
  ensureSmsPermission,
  openAppSettings,
} from '../../utils/nativePermissions';
import { X, ShieldCheck, CheckCircle2, AlertCircle, Smartphone, RefreshCw, Settings } from 'lucide-react';

interface TymebankSmsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TymebankSmsModal: React.FC<TymebankSmsModalProps> = ({ isOpen, onClose }) => {
  const {
    tymebankPayshapNumber,
    updateTymebankPayshapNumber,
    tymebankSmsLogs,
    clearTymebankSmsLogs,
    scanRealSmsInbox,
  } = useApp();

  const [localPayshapNumber, setLocalPayshapNumber] = useState<string>(
    tymebankPayshapNumber || '0821234567'
  );
  const [permissionGranted, setPermissionGranted] = useState<boolean>(() => {
    return localStorage.getItem('tymebank_sms_permission') === 'true';
  });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanningInbox, setIsScanningInbox] = useState<boolean>(false);

  useEffect(() => {
    if (tymebankPayshapNumber) {
      setLocalPayshapNumber(tymebankPayshapNumber);
    }
  }, [tymebankPayshapNumber]);

  useEffect(() => {
    if (!isOpen || !Capacitor.isNativePlatform()) return;
    void checkSmsPermissionGranted().then((granted) => {
      setPermissionGranted(granted);
    });
  }, [isOpen]);

  const handleSavePayshapNumber = (val: string) => {
    setLocalPayshapNumber(val);
    updateTymebankPayshapNumber(val);
  };

  const requestSmsPermission = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const res = await ensureSmsPermission();
    if (res.granted) {
      setPermissionGranted(true);
      localStorage.setItem('tymebank_sms_permission', 'true');
      setSuccessMsg(
        'SMS Permission granted. Universal Band is now listening for real GoTyme / TymeBank payment SMS to ring the Payment Alarm.'
      );
      const scanRes = await scanRealSmsInbox({ promptIfNeeded: false });
      if (scanRes.matchedCount > 0) {
        setSuccessMsg(
          `SMS Permission granted. Found ${scanRes.matchedCount} GoTyme / TymeBank payment SMS alert${scanRes.matchedCount === 1 ? '' : 's'} in inbox. Tickets require manual approval.`
        );
      }
    } else {
      setPermissionGranted(false);
      localStorage.setItem('tymebank_sms_permission', 'false');
      setErrorMsg(res.message || 'Payment Alarm will not work without SMS permission.');
    }
  };

  const handleScanRealInbox = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsScanningInbox(true);
    try {
      const scanRes = await scanRealSmsInbox({ promptIfNeeded: true });
      if (!scanRes.granted) {
        setPermissionGranted(false);
        setErrorMsg('Payment Alarm will not work without SMS permission.');
        return;
      }
      setPermissionGranted(true);
      if (scanRes.matchedCount > 0) {
        setSuccessMsg(
          `Checked ${scanRes.scannedCount} SMS messages and found ${scanRes.matchedCount} GoTyme / TymeBank payment alert${scanRes.matchedCount === 1 ? '' : 's'}. Review & approve tickets manually in Payment Approval.`
        );
      } else {
        setSuccessMsg(
          `Checked ${scanRes.scannedCount} recent phone SMS message${scanRes.scannedCount === 1 ? '' : 's'}. No new GoTyme / TymeBank payment alerts found.`
        );
      }
    } finally {
      setIsScanningInbox(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#141414] border border-white/15 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1.5 rounded-xl bg-white/5 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-[#FACC15]/20 border border-[#FACC15]/40 flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-[#FACC15]" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">GoTyme / TymeBank SMS Listener</h2>
            <p className="text-xs text-gray-400">
              Plays loud Payment Alarm on incoming bank SMS — manual approval only
            </p>
          </div>
        </div>

        {/* Merchant TymeBank PayShap Number Config */}
        <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 mb-4 space-y-3">
          <h3 className="text-xs font-black uppercase text-[#FACC15] tracking-wider">Your TymeBank PayShap Account</h3>
          <div>
            <label className="block text-xs text-gray-300 font-semibold mb-1">
              TymeBank PayShap ID / Cell Number
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localPayshapNumber}
                onChange={(e) => handleSavePayshapNumber(e.target.value)}
                placeholder="e.g. 0821234567"
                className="flex-1 bg-black text-white px-3 py-2.5 rounded-xl border border-white/15 text-xs focus:outline-none focus:border-[#FACC15] font-mono font-bold"
              />
              <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Customers pay via PayShap from their bank app to this number. You verify the bank SMS and approve manually.
            </p>
          </div>
        </div>

        {/* SMS Permission Section */}
        <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>SMS Read Permission</span>
              </h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {permissionGranted
                  ? 'Permission granted. Listening for real GoTyme Bank / TymeBank SMS.'
                  : 'Required for Payment Alarm to detect incoming bank payment SMS.'}
              </p>
            </div>
            {!permissionGranted ? (
              <button
                type="button"
                onClick={requestSmsPermission}
                className="bg-[#FACC15] hover:bg-yellow-400 text-black font-black px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-md shrink-0"
              >
                Allow SMS
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl shrink-0">
                Allowed
              </span>
            )}
          </div>

          {!permissionGranted && (
            <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-3 space-y-2">
              <p className="text-xs font-black text-rose-200">
                Payment Alarm will not work without SMS permission
              </p>
              <p className="text-[11px] text-rose-100/80 leading-relaxed">
                Universal Band listens for real GoTyme Bank / TymeBank SMS containing &quot;You received&quot; and &quot;from&quot; for any amount so your alarm rings loudly when money arrives.
              </p>
            </div>
          )}

          {Capacitor.isNativePlatform() && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isScanningInbox}
                onClick={handleScanRealInbox}
                className="flex-1 bg-[#FACC15]/15 hover:bg-[#FACC15]/25 border border-[#FACC15]/40 text-[#FACC15] font-black px-3 py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningInbox ? 'animate-spin' : ''}`} />
                <span>{isScanningInbox ? 'Checking SMS Inbox...' : 'Check Recent Phone SMS'}</span>
              </button>
              {!permissionGranted && (
                <button
                  type="button"
                  onClick={() => void openAppSettings()}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Settings</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Success / Error Messages */}
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Incoming Bank Payment Alert Log */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider">
              Incoming Bank SMS Alerts ({tymebankSmsLogs.length})
            </h3>
            {tymebankSmsLogs.length > 0 && (
              <button
                type="button"
                onClick={clearTymebankSmsLogs}
                className="text-[10px] text-gray-400 hover:text-rose-400 transition cursor-pointer"
              >
                Clear Log
              </button>
            )}
          </div>
          {tymebankSmsLogs.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-xs bg-black/40 rounded-xl border border-white/5">
              No GoTyme / TymeBank payment SMS alerts detected yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {tymebankSmsLogs.map((log) => (
                <div key={log.id} className="bg-black/60 border border-white/10 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span className="font-mono text-[#FACC15]">BANK PAYMENT SMS</span>
                    <span>{log.time}</span>
                  </div>
                  <p className="font-mono text-gray-300 text-[11px] bg-white/5 p-1.5 rounded">{log.text}</p>
                  <p className="font-bold text-emerald-400 text-[11px]">{log.status}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default TymebankSmsModal;
