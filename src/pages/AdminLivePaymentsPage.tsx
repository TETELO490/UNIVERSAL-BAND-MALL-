import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import { Capacitor } from '@capacitor/core';
import {
  ArrowLeft,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Radio,
  Ticket as TicketIcon,
  ShoppingBag,
} from 'lucide-react';

export const AdminLivePaymentsPage: React.FC = () => {
  const {
    currentUser,
    firebaseUser,
    paymentBankMessage,
    paymentReferenceFormat,
    lastPaymentSmsText,
    lastPaymentSmsSender,
    lastPaymentSmsAt,
    lastConfirmedReference,
    smsPermissionActive,
    requestAdminSmsPermissionPopup,
    updatePaymentConfirmationSettings,
    scanRealSmsInbox,
    tickets,
    mallOrders,
    navigateTo,
  } = useApp();

  const isUserLoggedIn = Boolean(
    firebaseUser ||
      (currentUser?.isRegistered && currentUser?.id !== 'guest_user') ||
      localStorage.getItem('ub_admin_session') === 'true'
  );

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isAdmin =
    isUserLoggedIn &&
    (roleLower === 'admin' ||
      isAuthorizedAdminEmail(currentUser?.email) ||
      localStorage.getItem('ub_admin_session') === 'true');

  const [bankInput, setBankInput] = useState<string>(paymentBankMessage || 'TymeBank');
  const [refFmtInput, setRefFmtInput] = useState<string>(paymentReferenceFormat || 'UB-');
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [isScanningNow, setIsScanningNow] = useState<boolean>(false);
  const [scanResultSummary, setScanResultSummary] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);
    setIsSavingSettings(true);
    try {
      await updatePaymentConfirmationSettings({
        bankMessage: bankInput,
        referenceFormat: refFmtInput,
      });
      setSuccessMsg('Payment confirmation settings saved successfully.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCheckPaymentsNow = async () => {
    setSuccessMsg(null);
    setErrorMsg(null);
    setIsScanningNow(true);
    try {
      const res = await scanRealSmsInbox({ promptIfNeeded: true, sinceMs: Date.now() - 7 * 24 * 60 * 60 * 1000 });
      if (!res.granted) {
        setErrorMsg('SMS permission is not active. Please allow SMS permission below.');
        return;
      }
      setScanResultSummary(
        `Scanned ${res.scannedCount} SMS messages from inbox. Auto-confirmed ${res.matchedCount} new payment(s)!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to scan SMS inbox.');
    } finally {
      setIsScanningNow(false);
    }
  };

  const handleRequestPermission = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const granted = await requestAdminSmsPermissionPopup();
    if (granted) {
      setSuccessMsg('SMS Permission ACTIVE! Universal Band is now monitoring bank payments.');
    } else {
      setErrorMsg('SMS Permission was denied. Please allow SMS access.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="pb-24 pt-6 px-4 max-w-md mx-auto">
        <div className="bg-[#1A1A1A] border border-rose-500/30 rounded-2xl p-6 text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-extrabold text-white">Admin Access Only</h1>
          <p className="text-xs text-gray-400">
            Live Payments oversight is restricted to authorized administrators.
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

  const waitingTicketsList = tickets.filter(
    (t) => t.paymentStatus === 'WAITING FOR PAYMENT' || t.paymentStatus === 'PENDING_PAYMENT'
  );
  const waitingOrdersList = mallOrders.filter(
    (o) => o.paymentStatus === 'WAITING FOR PAYMENT' || o.status === 'new_order'
  );

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo('/admin/payshap-settings')}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Settings</span>
        </button>

        <span className="text-xs font-bold text-emerald-400 tracking-wide flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live Payments Active</span>
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Smartphone className="w-6 h-6 text-[#FACC15]" />
          <span>Live Payments</span>
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Real-time SMS payment confirmation for customers buying tickets &amp; orders.
        </p>
      </div>

      {/* 1. SMS Permission & Always-ON Background Status Card */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              SMS Permission Status
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`text-xs font-black px-2.5 py-1 rounded-full uppercase ${
                  smsPermissionActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {smsPermissionActive ? 'ACTIVE' : 'NOT ACTIVE'}
              </span>
              <span className="text-[11px] text-gray-400">
                {smsPermissionActive ? 'Ready to read bank SMS' : 'Permission required'}
              </span>
            </div>
          </div>

          {!smsPermissionActive && (
            <button
              type="button"
              onClick={handleRequestPermission}
              className="min-h-[44px] px-4 py-2 bg-[#FACC15] text-black font-black text-xs rounded-xl hover:bg-yellow-400 transition cursor-pointer shrink-0"
            >
              Allow SMS
            </button>
          )}
        </div>

        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              Automatic Background Checking
            </span>
            <span className="text-xs font-bold text-emerald-400 block mt-0.5">
              ALWAYS ON (Reads incoming SMS instantly)
            </span>
          </div>
          <Radio className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
        </div>
      </div>

      {/* 2. Last Payment Telemetry Card */}
      <div className="bg-[#1A1A1A] border border-[#FACC15]/30 rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] block">
            Last Payment SMS Received
          </span>
          <span className="text-[10px] font-mono text-gray-400">
            {lastPaymentSmsAt ? new Date(lastPaymentSmsAt).toLocaleTimeString() : 'Waiting for SMS'}
          </span>
        </div>

        <div className="bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-xs text-gray-200 min-h-[60px] break-words">
          {lastPaymentSmsText || 'No payment SMS received yet. Send a test TymeBank PayShap transfer.'}
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-gray-400">
            Sender: <span className="text-white font-bold">{lastPaymentSmsSender || '—'}</span>
          </span>
          <span className="text-gray-400">
            Confirmed Ref: <span className="text-[#FACC15] font-mono font-bold">{lastConfirmedReference || '—'}</span>
          </span>
        </div>
      </div>

      {/* 3. Check Payments Now Button */}
      <button
        type="button"
        disabled={isScanningNow}
        onClick={handleCheckPaymentsNow}
        className="w-full min-h-[52px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-xl transition cursor-pointer disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 stroke-[2.5] ${isScanningNow ? 'animate-spin' : ''}`} />
        <span>{isScanningNow ? 'CHECKING SMS INBOX...' : 'CHECK PAYMENTS NOW'}</span>
      </button>

      {scanResultSummary && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{scanResultSummary}</span>
        </div>
      )}

      {/* 4. Bank Message & Reference Format Settings Form */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl"
      >
        <h3 className="text-sm font-black text-white uppercase tracking-wider">
          Bank Match Settings
        </h3>

        <div>
          <label className="block text-xs font-bold text-gray-200 mb-1">
            Bank Message Keyword (e.g. TymeBank, GoTyme, Capitec)
          </label>
          <input
            type="text"
            value={bankInput}
            onChange={(e) => setBankInput(e.target.value)}
            placeholder="TymeBank, GoTyme"
            className="w-full min-h-[44px] bg-black/70 border border-white/15 focus:border-[#FACC15] rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-white placeholder-gray-500 focus:outline-none"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            The app confirms orders as PAID only when the incoming SMS contains this bank word.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-200 mb-1">
            Reference Format (e.g. UB-)
          </label>
          <input
            type="text"
            value={refFmtInput}
            onChange={(e) => setRefFmtInput(e.target.value)}
            placeholder="UB-"
            className="w-full min-h-[44px] bg-black/70 border border-white/15 focus:border-[#FACC15] rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-white placeholder-gray-500 focus:outline-none"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            The reference prefix pattern the app matches in the SMS (e.g. UB-1234).
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
          disabled={isSavingSettings}
          className="w-full min-h-[46px] bg-white/10 hover:bg-white/20 active:scale-[0.99] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 border border-white/15"
        >
          <span>{isSavingSettings ? 'Saving...' : 'Save Bank Settings'}</span>
        </button>
      </form>

      {/* 5. Waiting Orders & Tickets Preview */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 space-y-3 shadow-xl">
        <h3 className="text-xs font-black text-white uppercase tracking-wider">
          Waiting for Payment ({waitingTicketsList.length + waitingOrdersList.length})
        </h3>
        {waitingTicketsList.length === 0 && waitingOrdersList.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center">
            No orders or tickets currently waiting for payment.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {waitingTicketsList.map((t) => (
              <div key={t.id} className="bg-black/50 p-2.5 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <TicketIcon className="w-4 h-4 text-[#FACC15] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{t.eventName || t.eventTitle}</p>
                    <p className="text-[11px] text-gray-400 font-mono">Ref: {t.id} · {t.price}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full shrink-0">
                  Waiting
                </span>
              </div>
            ))}
            {waitingOrdersList.map((o) => (
              <div key={o.id} className="bg-black/50 p-2.5 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <ShoppingBag className="w-4 h-4 text-[#FACC15] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{o.storeName} · {o.orderNumber}</p>
                    <p className="text-[11px] text-gray-400 font-mono">Ref: {o.collectionCode} · R{Number(o.total || 0).toFixed(2)}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full shrink-0">
                  Waiting
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLivePaymentsPage;
