import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../../context/AppContext';
import {
  checkSmsPermissionGranted,
  ensureSmsPermission,
  openAppSettings,
} from '../../utils/nativePermissions';
import { X, ShieldCheck, CheckCircle2, AlertCircle, Smartphone, RefreshCw, Send } from 'lucide-react';

interface TymebankSmsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TymebankSmsModal: React.FC<TymebankSmsModalProps> = ({ isOpen, onClose }) => {
  const {
    events,
    tymebankPayshapNumber,
    updateTymebankPayshapNumber,
    tymebankSmsLogs,
    clearTymebankSmsLogs,
    processTymebankSms,
    scanRealSmsInbox,
  } = useApp();

  const [localPayshapNumber, setLocalPayshapNumber] = useState<string>(
    tymebankPayshapNumber || '0821234567'
  );
  const [permissionGranted, setPermissionGranted] = useState<boolean>(() => {
    return localStorage.getItem('tymebank_sms_permission') === 'true';
  });
  const [testSender, setTestSender] = useState<string>('TYMEBANK');
  const [testSmsText, setTestSmsText] = useState<string>('');
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
      setSuccessMsg('Real Android SMS Read Permission granted. Universal Band is now listening and scanning for TymeBank PayShap payments.');
      const scanRes = await scanRealSmsInbox({ promptIfNeeded: false });
      if (scanRes.matchedCount > 0) {
        setSuccessMsg(
          `SMS Permission granted & auto-approved ${scanRes.matchedCount} payment${scanRes.matchedCount === 1 ? '' : 's'} from your SMS inbox!`
        );
      }
    } else {
      setPermissionGranted(false);
      localStorage.setItem('tymebank_sms_permission', 'false');
      setErrorMsg(res.message || 'Permission needed: Please allow SMS access in Android App Settings.');
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
        setErrorMsg('Permission needed: Allow SMS access in Android App Settings to read your TymeBank SMS inbox.');
        return;
      }
      setPermissionGranted(true);
      if (scanRes.matchedCount > 0) {
        setSuccessMsg(
          `Scanned ${scanRes.scannedCount} SMS messages and auto-approved ${scanRes.matchedCount} payment${scanRes.matchedCount === 1 ? '' : 's'}!`
        );
      } else {
        setSuccessMsg(
          `Scanned ${scanRes.scannedCount} recent phone SMS message${scanRes.scannedCount === 1 ? '' : 's'}. No new unmatched TymeBank payments found.`
        );
      }
    } finally {
      setIsScanningInbox(false);
    }
  };

  const handleLoadFromEvent = () => {
    setErrorMsg(null);
    if (events.length === 0) {
      setErrorMsg('Create an event on the Events page first to generate a matching TymeBank SMS example.');
      return;
    }
    const ev = events[0];
    const genPrice = parseFloat(String(ev.generalPrice || ev.price || '').replace(/[^0-9.]/g, '')) || 0;
    if (genPrice <= 0) {
      setErrorMsg(`Event "${ev.title}" has no General price configured yet.`);
      return;
    }
    setTestSender('TYMEBANK');
    setTestSmsText(`TYMEBANK: You received R${genPrice.toFixed(2)} from Sipho. Reference: Universal Band - ${ev.title}.`);
  };

  const handleTestSmsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!permissionGranted) {
      setErrorMsg('Please grant SMS Read Permission first before processing TymeBank SMS messages.');
      return;
    }

    const result = processTymebankSms(testSmsText, testSender);
    if (result.success) {
      setSuccessMsg(result.message);
    } else {
      setErrorMsg(result.message);
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
            <h2 className="text-xl font-black text-white">TymeBank PayShap SMS Auto-Confirm</h2>
            <p className="text-xs text-gray-400">Automatic payment confirmation by reading TymeBank SMS</p>
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
              Customers pay via PayShap from their own bank app (Capitec, FNB, Nedbank, Standard Bank) to this number.
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
                  ? 'Permission granted. Listening to real phone SMS inbox.'
                  : 'Required to automatically read incoming TymeBank SMS payments.'}
              </p>
            </div>
            {!permissionGranted ? (
              <button
                type="button"
                onClick={requestSmsPermission}
                className="bg-[#FACC15] hover:bg-yellow-400 text-black font-black px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-md shrink-0"
              >
                Grant Permission
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl shrink-0">
                Allowed
              </span>
            )}
          </div>
          {Capacitor.isNativePlatform() && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isScanningInbox}
                onClick={handleScanRealInbox}
                className="flex-1 bg-[#FACC15]/15 hover:bg-[#FACC15]/25 border border-[#FACC15]/40 text-[#FACC15] font-black px-3 py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningInbox ? 'animate-spin' : ''}`} />
                <span>{isScanningInbox ? 'Scanning SMS Inbox...' : 'Scan Phone SMS Inbox Now'}</span>
              </button>
              {!permissionGranted && (
                <button
                  type="button"
                  onClick={() => void openAppSettings()}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Open Settings
                </button>
              )}
            </div>
          )}
        </div>

        {/* Incoming TymeBank SMS Reader / Test Tool */}
        <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 mb-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black uppercase text-[#FACC15] tracking-wider">Incoming TymeBank SMS Reader</h3>
            <button
              type="button"
              onClick={handleLoadFromEvent}
              className="text-[10px] bg-white/10 hover:bg-white/20 text-[#FACC15] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer"
            >
              Fill From My Event
            </button>
          </div>
          <form onSubmit={handleTestSmsSubmit} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-400 font-bold shrink-0">SMS Sender:</label>
              <select
                value={testSender}
                onChange={(e) => setTestSender(e.target.value)}
                className="flex-1 bg-black text-white px-2.5 py-1.5 rounded-lg border border-white/15 text-xs focus:outline-none focus:border-[#FACC15] font-mono"
              >
                <option value="TYMEBANK">TYMEBANK (Allowed)</option>
                <option value="MTN">MTN (Ignored)</option>
                <option value="Vodacom">Vodacom (Ignored)</option>
                <option value="Nedbank">Nedbank (Ignored)</option>
                <option value="Friend">Friend (Ignored)</option>
              </select>
            </div>
            <textarea
              rows={2}
              value={testSmsText}
              onChange={(e) => setTestSmsText(e.target.value)}
              placeholder='Paste TymeBank SMS e.g. "You received R<amount> from Sipho. Reference: Universal Band - <Event Name>" or "Universal Band Top Up"'
              className="w-full bg-black text-white p-3 rounded-xl border border-white/15 text-xs focus:outline-none focus:border-[#FACC15] font-mono"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-400">Read-only • Never deletes SMS • Requires &quot;You received&quot;, &quot;R&quot;, &quot;Reference&quot;</span>
              <button
                type="submit"
                className="bg-[#FACC15] hover:bg-yellow-400 text-black font-black px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Process SMS</span>
              </button>
            </div>
          </form>
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

        {/* Confirmed SMS Logs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider">
              Processed TymeBank SMS Log ({tymebankSmsLogs.length})
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
              No TymeBank SMS messages processed yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {tymebankSmsLogs.map((log) => (
                <div key={log.id} className="bg-black/60 border border-white/10 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span className="font-mono text-[#FACC15]">TYMEBANK SMS</span>
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
