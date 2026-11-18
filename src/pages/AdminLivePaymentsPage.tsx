import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import { Capacitor } from '@capacitor/core';
import {
  checkNotificationsPermissionGranted,
  ensureNotificationsPermission,
  openAppSettings,
} from '../utils/nativePermissions';
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
  XOctagon,
  Bell,
  Volume2,
  Settings,
} from 'lucide-react';

export const AdminLivePaymentsPage: React.FC = () => {
  const {
    currentUser,
    firebaseUser,
    lastPaymentSmsText,
    lastPaymentSmsSender,
    lastPaymentSmsAt,
    lastPaymentAmount,
    smsPermissionActive,
    requestAdminSmsPermissionPopup,
    scanRealSmsInbox,
    activePaymentAlarm,
    dismissPaymentAlarm,
    confirmTicketPaymentManually,
    confirmMallOrderPaymentManually,
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

  const [isScanningNow, setIsScanningNow] = useState<boolean>(false);
  const [scanResultSummary, setScanResultSummary] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notifGranted, setNotifGranted] = useState<boolean>(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    void checkNotificationsPermissionGranted().then(setNotifGranted);
  }, []);

  const handleCheckPaymentsNow = async () => {
    setSuccessMsg(null);
    setErrorMsg(null);
    setIsScanningNow(true);
    try {
      const res = await scanRealSmsInbox({
        promptIfNeeded: true,
        sinceMs: Date.now() - 7 * 24 * 60 * 60 * 1000,
      });
      if (!res.granted) {
        setErrorMsg('Payment Alarm will not work without SMS permission.');
        return;
      }
      setScanResultSummary(
        `Checked ${res.scannedCount} SMS messages from inbox. Found ${res.matchedCount} GoTyme / TymeBank payment SMS alert(s). Please verify and approve manually below.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to read SMS inbox.');
    } finally {
      setIsScanningNow(false);
    }
  };

  const handleRequestPermission = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const granted = await requestAdminSmsPermissionPopup();
    if (granted) {
      setSuccessMsg('SMS Permission ACTIVE. Universal Band will play the Payment Alarm on incoming GoTyme / TymeBank payment SMS.');
    } else {
      setErrorMsg('Payment Alarm will not work without SMS permission. Please allow SMS access.');
    }
  };

  const handleEnableNotifications = async () => {
    const res = await ensureNotificationsPermission();
    setNotifGranted(res.granted);
    if (!res.granted) {
      setErrorMsg('Notification permission is needed to show heads-up payment alerts on your lock screen.');
    }
  };

  const handleConfirmTicket = async (ticketId: string, label: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmingId(ticketId);
    try {
      const ok = await confirmTicketPaymentManually(ticketId);
      if (ok) {
        setSuccessMsg(`Approved payment for ticket ${label} (${ticketId}). Status updated to PAID.`);
      } else {
        setErrorMsg(`Could not approve ticket ${ticketId}. Please try again.`);
      }
    } finally {
      setConfirmingId(null);
    }
  };

  const handleConfirmOrder = async (orderId: string, label: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmingId(orderId);
    try {
      const ok = await confirmMallOrderPaymentManually(orderId);
      if (ok) {
        setSuccessMsg(`Approved payment for order ${label}. Status updated to PAID.`);
      } else {
        setErrorMsg(`Could not approve order ${label}. Please try again.`);
      }
    } finally {
      setConfirmingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="pb-24 pt-6 px-4 max-w-md mx-auto">
        <div className="bg-[#1A1A1A] border border-rose-500/30 rounded-2xl p-6 text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-extrabold text-white">Admin Access Only</h1>
          <p className="text-xs text-gray-400">
            Payment Approval and Live SMS Alarms are restricted to authorized administrators.
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
          <span>Alarm Settings</span>
        </button>

        <span
          className={`text-xs font-bold tracking-wide flex items-center gap-1.5 ${
            smsPermissionActive ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              smsPermissionActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
            }`}
          />
          <span>{smsPermissionActive ? 'SMS Alarm Armed' : 'SMS Permission Needed'}</span>
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Smartphone className="w-6 h-6 text-[#FACC15]" />
          <span>Payment Approval</span>
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Verify real incoming GoTyme / TymeBank payment SMS and manually approve customer tickets &amp; orders.
        </p>
      </div>

      {/* ACTIVE ALARM BANNER */}
      {activePaymentAlarm && (
        <div className="bg-rose-950/80 border-2 border-[#FACC15] rounded-2xl p-4 space-y-3 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#FACC15]">
              <Volume2 className="w-5 h-5 animate-bounce shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider">
                PAYMENT RECEIVED - Check SMS
              </span>
            </div>
          </div>
          <div className="bg-black/60 border border-white/15 rounded-xl p-3 space-y-1">
            <div className="text-lg font-black text-[#FACC15] font-mono">
              {activePaymentAlarm.amount} from {activePaymentAlarm.customer}
            </div>
            <p className="font-mono text-[11px] text-gray-200 break-words">
              {activePaymentAlarm.rawSms}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void dismissPaymentAlarm()}
            className="w-full min-h-[48px] bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <XOctagon className="w-4 h-4 stroke-[2.5]" />
            <span>STOP / DISMISS ALARM</span>
          </button>
        </div>
      )}

      {/* 1. SMS Permission & Background Status Card */}
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
                {smsPermissionActive ? 'ACTIVE' : 'DENIED / OFF'}
              </span>
              <span className="text-[11px] text-gray-400">
                {smsPermissionActive ? 'Listening for bank SMS' : 'Alarm cannot detect SMS'}
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

        {!smsPermissionActive && (
          <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-black text-rose-200">
                  Payment Alarm will not work without SMS permission
                </p>
                <p className="text-[11px] text-rose-100/80 leading-relaxed">
                  Universal Band needs permission to check incoming bank SMS from GoTyme Bank / TymeBank so your alarm rings loudly whenever any real payment arrives, even if the app is closed. No ticket is ever auto-approved.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleRequestPermission}
                className="flex-1 min-h-[40px] px-3 py-2 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl cursor-pointer transition"
              >
                Enable SMS Permission
              </button>
              {Capacitor.isNativePlatform() && (
                <button
                  type="button"
                  onClick={() => void openAppSettings()}
                  className="min-h-[40px] px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>App Settings</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Notification Permission Status */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              Lock-Screen Heads-Up Alerts
            </span>
            <span
              className={`text-xs font-bold block mt-0.5 ${
                notifGranted ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {notifGranted ? 'Notifications Enabled' : 'Enable to wake screen on payment'}
            </span>
          </div>
          {notifGranted ? (
            <Bell className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="min-h-[40px] px-3 py-1.5 bg-white/10 hover:bg-white/20 text-[#FACC15] font-bold text-xs rounded-xl shrink-0 cursor-pointer"
            >
              Allow Alerts
            </button>
          )}
        </div>

        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              Background Payment Detection
            </span>
            <span className="text-xs font-bold text-emerald-400 block mt-0.5">
              Triggers alarm for ANY GoTyme / TymeBank amount
            </span>
          </div>
          <Radio className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
        </div>
      </div>

      {/* 2. Last Payment SMS Received */}
      <div className="bg-[#1A1A1A] border border-[#FACC15]/30 rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] block">
            Last Bank Payment SMS
          </span>
          <span className="text-[10px] font-mono text-gray-400">
            {lastPaymentSmsAt ? new Date(lastPaymentSmsAt).toLocaleTimeString() : 'Waiting for SMS'}
          </span>
        </div>

        <div className="bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-xs text-gray-200 min-h-[60px] break-words">
          {lastPaymentSmsText || 'No bank payment SMS received yet.'}
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-gray-400">
            SMS From: <span className="text-white font-bold">{lastPaymentSmsSender || '—'}</span>
          </span>
          <span className="text-gray-400">
            Amount: <span className="text-[#FACC15] font-mono font-bold">{lastPaymentAmount || '—'}</span>
          </span>
        </div>
      </div>

      {/* 3. Check Recent Bank SMS Button (Read-only, alarm check, NO auto-approval) */}
      <button
        type="button"
        disabled={isScanningNow}
        onClick={handleCheckPaymentsNow}
        className="w-full min-h-[52px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-xl transition cursor-pointer disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 stroke-[2.5] ${isScanningNow ? 'animate-spin' : ''}`} />
        <span>{isScanningNow ? 'CHECKING SMS INBOX...' : 'CHECK RECENT BANK SMS'}</span>
      </button>

      {scanResultSummary && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{scanResultSummary}</span>
        </div>
      )}

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

      {/* 4. Manual Approval Queue */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-black text-white uppercase tracking-wider">
            Waiting for Payment ({waitingTicketsList.length + waitingOrdersList.length})
          </h3>
          <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full">
            Manual Approval Only
          </span>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed">
          Auto-approval is disabled. After verifying the bank SMS on your phone, tap Confirm Payment below to mark a ticket or order as PAID.
        </p>

        {waitingTicketsList.length === 0 && waitingOrdersList.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center bg-black/40 rounded-xl border border-white/5">
            No orders or tickets currently waiting for payment.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {waitingTicketsList.map((t) => (
              <div
                key={t.id}
                className="bg-black/60 p-3 rounded-xl border border-white/10 space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <TicketIcon className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">
                        {t.eventName || t.eventTitle}
                      </p>
                      <p className="text-[11px] text-gray-300 truncate">
                        {t.attendeeName || t.customerName}
                        {t.attendeePhone || t.customerPhone
                          ? ` · ${t.attendeePhone || t.customerPhone}`
                          : ''}
                      </p>
                      <p className="text-[11px] text-gray-400 font-mono">
                        ID: {t.id}
                        {t.payshapReference ? ` · Ref: ${t.payshapReference}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-[#FACC15] font-mono shrink-0">
                    {t.price}
                  </span>
                </div>

                {t.selectedBank && (
                  <div className="bg-white/5 border border-[#FACC15]/30 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#FACC15] flex items-center justify-between">
                    <span>Customer Bank:</span>
                    <span className="text-white">{t.selectedBank}</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={confirmingId === t.id}
                  onClick={() =>
                    void handleConfirmTicket(t.id, t.eventName || t.eventTitle || t.id)
                  }
                  className="w-full min-h-[42px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {confirmingId === t.id ? 'CONFIRMING...' : 'Confirm Payment (Mark PAID)'}
                  </span>
                </button>
              </div>
            ))}

            {waitingOrdersList.map((o) => (
              <div
                key={o.id}
                className="bg-black/60 p-3 rounded-xl border border-white/10 space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <ShoppingBag className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">
                        {o.storeName} · {o.orderNumber}
                      </p>
                      <p className="text-[11px] text-gray-300 truncate">
                        {o.customerName}
                        {o.customerPhone ? ` · ${o.customerPhone}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-400 font-mono">
                        Ref: {o.collectionCode || o.id}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-[#FACC15] font-mono shrink-0">
                    R{Number(o.total || 0).toFixed(2)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={confirmingId === o.id}
                  onClick={() =>
                    void handleConfirmOrder(o.id, `${o.storeName} ${o.orderNumber}`)
                  }
                  className="w-full min-h-[42px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {confirmingId === o.id ? 'CONFIRMING...' : 'Confirm Payment (Mark PAID)'}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLivePaymentsPage;
