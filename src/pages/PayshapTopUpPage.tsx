import React, { useMemo, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../context/AppContext';
import {
  checkSmsPermissionGranted,
  ensureSmsPermission,
  openAppSettings,
} from '../utils/nativePermissions';
import { getTopUpPayshapReference } from '../utils/ticketStatus';
import {
  ArrowLeft,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Building2,
  Clock,
  MessageSquare,
  ShieldAlert,
  Pencil,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';

const PRESET_AMOUNTS = [50, 100, 200, 500];

export const PayshapTopUpPage: React.FC = () => {
  const {
    currentUser,
    currentWalletBalance,
    tymebankPayshapNumber,
    walletTopups,
    submitPayshapTopUpRequest,
    scanRealSmsInbox,
    navigateTo,
  } = useApp();

  const [amountInput, setAmountInput] = useState<string>('');
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanningSms, setIsScanningSms] = useState<boolean>(false);
  const [smsScanBanner, setSmsScanBanner] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);

  // SMS Permission & Auto-detect states
  const [smsStatus, setSmsStatus] = useState<'prompt' | 'granted' | 'denied'>(() => {
    if (typeof window === 'undefined') return 'prompt';
    const val = localStorage.getItem('tymebank_sms_permission');
    if (val === 'true') return 'granted';
    if (val === 'false') return 'denied';
    return 'prompt';
  });
  const [smsDeniedMsg, setSmsDeniedMsg] = useState<string | null>(null);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('ub_sms_auto_detect_enabled') !== 'false';
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void (async () => {
      const granted = await checkSmsPermissionGranted();
      if (cancelled) return;
      if (granted) {
        setSmsStatus('granted');
        const scanRes = await scanRealSmsInbox({ promptIfNeeded: false });
        if (!cancelled && scanRes.matchedCount > 0) {
          const topupMatch = scanRes.results.find((r) => r.success && r.data?.paidAmount);
          const amtText = topupMatch?.data?.paidAmount
            ? `R${Number(topupMatch.data.paidAmount).toFixed(2)}`
            : 'Payment';
          setSmsScanBanner({
            type: 'success',
            text: `Payment Received! ${amtText} added to your wallet.`,
          });
        }
      } else {
        setSmsStatus((prev) => (prev === 'granted' ? 'prompt' : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleScanInboxNow = async (promptIfNeeded = true) => {
    setSmsScanBanner(null);
    setSmsDeniedMsg(null);
    setIsScanningSms(true);
    try {
      const res = await scanRealSmsInbox({ promptIfNeeded });
      if (!res.granted) {
        setSmsStatus('denied');
        setSmsDeniedMsg(
          'SMS permission denied. Please tap Allow SMS or Open Settings to enable auto-confirmation.'
        );
        return;
      }
      setSmsStatus('granted');
      if (res.matchedCount > 0) {
        const match = res.results.find((r) => r.success && r.data?.paidAmount);
        const amtText = match?.data?.paidAmount
          ? `R${Number(match.data.paidAmount).toFixed(2)}`
          : 'Payment';
        setSmsScanBanner({
          type: 'success',
          text: `Payment Received! ${amtText} added to your wallet.`,
        });
      } else {
        setSmsScanBanner({
          type: 'info',
          text: `Checked ${res.scannedCount} recent SMS message${
            res.scannedCount === 1 ? '' : 's'
          } — waiting for TymeBank PayShap SMS.`,
        });
      }
    } finally {
      setIsScanningSms(false);
    }
  };

  const handleRequestSmsPermission = async () => {
    setSmsDeniedMsg(null);
    setSmsScanBanner(null);
    const res = await ensureSmsPermission();
    if (res.granted) {
      setSmsStatus('granted');
      localStorage.setItem('tymebank_sms_permission', 'true');
      await handleScanInboxNow(false);
    } else {
      setSmsStatus('denied');
      setSmsDeniedMsg(
        res.message || 'SMS permission denied. You can still top-up manually, but auto-confirm will not work.'
      );
      localStorage.setItem('tymebank_sms_permission', 'false');
    }
  };

  const handleToggleAutoDetect = () => {
    const next = !autoDetectEnabled;
    setAutoDetectEnabled(next);
    localStorage.setItem('ub_sms_auto_detect_enabled', next ? 'true' : 'false');
  };

  const numericAmount = useMemo(() => {
    const parsed = parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100) / 100;
  }, [amountInput]);

  const autoPayshapReference = getTopUpPayshapReference();
  const [isManualRefEditing, setIsManualRefEditing] = useState<boolean>(false);
  const [manualRefInput, setManualRefInput] = useState<string>(autoPayshapReference);

  const payshapReference = useMemo(() => {
    if (isManualRefEditing && manualRefInput.trim()) {
      return manualRefInput.trim();
    }
    return autoPayshapReference;
  }, [autoPayshapReference, isManualRefEditing, manualRefInput]);

  const handleCopyPayshapId = async () => {
    const value = tymebankPayshapNumber || '0821234567';
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {}
  };

  const handleCopyReference = async () => {
    if (!payshapReference) return;
    try {
      await navigator.clipboard?.writeText(payshapReference);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } catch {}
  };

  const handleConfirmPendingTopUp = async () => {
    setErrorMsg(null);
    if (numericAmount <= 0) {
      setErrorMsg('Please enter or select a valid top-up amount.');
      return;
    }

    let smsAllowed = smsStatus === 'granted';
    if (!smsAllowed) {
      const res = await ensureSmsPermission();
      if (res.granted) {
        smsAllowed = true;
        setSmsStatus('granted');
      } else {
        setSmsStatus('denied');
        setSmsDeniedMsg(
          res.message || 'SMS permission denied. You can still top-up manually, but auto-confirm will not work.'
        );
      }
    }

    setIsSubmitting(true);
    try {
      await submitPayshapTopUpRequest(numericAmount, payshapReference);
      setSubmittedRef(payshapReference);
      if (smsAllowed) {
        setTimeout(() => {
          void handleScanInboxNow(false);
        }, 300);
      }
    } catch {
      setErrorMsg('Could not submit top-up request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const myTopups = useMemo(() => {
    const uid = currentUser?.id;
    return walletTopups
      .filter((t) => !uid || t.userId === uid)
      .slice(0, 5);
  }, [walletTopups, currentUser?.id]);

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back</span>
        </button>

        <span className="text-xs font-bold text-[#FACC15] tracking-wide">
          PayShap Top Up
        </span>
      </div>

      {/* Current Wallet Balance Summary */}
      <div className="bg-[#1A1A1A] border border-[#FACC15]/40 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-lg">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
            Current Wallet Balance
          </span>
          <span className="text-2xl font-black text-[#FACC15] tabular-nums">
            R{(Number(currentWalletBalance) || 0).toFixed(2)}
          </span>
        </div>
        <div className="w-11 h-11 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/30 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-[#FACC15]" />
        </div>
      </div>

      {/* SMS Permission & Auto-Detect Banner */}
      {smsStatus !== 'granted' ? (
        <div className="bg-[#1A1A1A] border border-amber-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <MessageSquare className="w-5 h-5 text-[#FACC15] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-xs font-extrabold text-white tracking-wide">
                Auto-Detect PayShap Payments via SMS
              </h2>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                We need SMS permission so we can automatically detect when your TymeBank PayShap payment arrives and add it to your wallet. We only read payment SMS messages, we do NOT read your private chats.
              </p>
            </div>
          </div>

          {smsDeniedMsg && (
            <div className="bg-rose-950/70 border border-rose-500/40 rounded-xl p-3 text-rose-200 text-[11px] flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">SMS Permission Denied</p>
                <p className="text-rose-300/90 mt-0.5">
                  You can still top-up manually, but auto-confirm will not work.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRequestSmsPermission}
              className="flex-1 min-h-[40px] bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl shadow transition cursor-pointer"
            >
              Allow SMS
            </button>
            <button
              type="button"
              onClick={() => void openAppSettings()}
              className="min-h-[40px] px-4 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Open Settings
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#161616] border border-emerald-500/30 rounded-xl px-4 py-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-emerald-300">SMS Auto-Detect Enabled</p>
                <p className="text-[11px] text-gray-400">Incoming TymeBank PayShap payments auto-confirm.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoDetect}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                autoDetectEnabled
                  ? 'bg-emerald-500 text-black'
                  : 'bg-white/10 text-gray-400'
              }`}
            >
              {autoDetectEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {Capacitor.isNativePlatform() && (
            <button
              type="button"
              disabled={isScanningSms}
              onClick={() => void handleScanInboxNow(true)}
              className="w-full min-h-[38px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-bold text-[#FACC15] inline-flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningSms ? 'animate-spin' : ''}`} />
              <span>{isScanningSms ? 'Scanning SMS Inbox...' : 'Check SMS Inbox Now'}</span>
            </button>
          )}
        </div>
      )}

      {smsScanBanner && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-2 border ${
            smsScanBanner.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
              : 'bg-[#161616] border-[#FACC15]/40 text-amber-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{smsScanBanner.text}</span>
        </div>
      )}

      {/* Step 1: Enter Amount */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <div>
          <h1 className="text-lg font-extrabold text-white tracking-tight">
            Top Up with PayShap
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Choose a quick amount or type a custom amount below.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {PRESET_AMOUNTS.map((amt) => {
            const isSelected = numericAmount === amt;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setAmountInput(String(amt));
                  setSubmittedRef(null);
                  setErrorMsg(null);
                }}
                className={`min-h-[44px] rounded-xl text-xs font-black transition border cursor-pointer tabular-nums ${
                  isSelected
                    ? 'bg-[#FACC15] text-black border-[#FACC15] shadow-md'
                    : 'bg-black/60 text-white border-white/10 hover:border-[#FACC15]/60'
                }`}
              >
                R{amt}
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor="payshap-custom-amount"
            className="block text-xs font-bold text-gray-300 mb-1.5"
          >
            Custom Amount (ZAR)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-[#FACC15]">
              R
            </span>
            <input
              id="payshap-custom-amount"
              type="number"
              min="1"
              step="1"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setSubmittedRef(null);
                setErrorMsg(null);
              }}
              placeholder="Enter amount e.g. 150"
              className="w-full min-h-[44px] bg-black/70 border border-white/15 focus:border-[#FACC15] rounded-xl pl-8 pr-4 py-2.5 text-sm font-bold text-white tabular-nums placeholder-gray-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Step 2: Live PayShap ID & Reference (Shown after entering amount) */}
      {numericAmount > 0 && (
        <div className="bg-[#161616] border border-[#FACC15]/50 rounded-2xl p-5 shadow-2xl space-y-4">
          <div className="flex items-baseline justify-between border-b border-white/10 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#FACC15] block">
                PayShap Transfer Details
              </span>
              <p className="text-xs text-gray-300 mt-0.5">
                Top-up amount:{' '}
                <strong className="text-white tabular-nums">
                  R{numericAmount.toFixed(2)}
                </strong>
              </p>
            </div>
          </div>

          {/* Current PayShap ID from Admin Settings */}
          <div className="bg-black/70 border border-white/10 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] text-gray-400 font-semibold block">
                TymeBank PayShap ID
              </span>
              <span className="font-mono font-black text-base text-white tracking-wide tabular-nums break-all">
                {tymebankPayshapNumber || '0821234567'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyPayshapId}
              className="min-h-[44px] shrink-0 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              {copiedId ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Unique PayShap Payment Reference */}
          <div className="bg-black/70 border border-[#FACC15]/40 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-400 font-semibold">
                PayShap Payment Reference
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isManualRefEditing) {
                      setIsManualRefEditing(false);
                      setManualRefInput(autoPayshapReference);
                    } else {
                      setManualRefInput(payshapReference);
                      setIsManualRefEditing(true);
                    }
                  }}
                  className="min-h-[36px] px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-gray-200 font-bold text-[11px] rounded-xl inline-flex items-center gap-1 transition cursor-pointer"
                  title={isManualRefEditing ? 'Reset to automatic reference' : 'Edit reference manually as backup'}
                >
                  {isManualRefEditing ? (
                    <>
                      <RotateCcw className="w-3 h-3 text-[#FACC15]" />
                      <span>Use Auto</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="w-3 h-3 text-[#FACC15]" />
                      <span>Edit</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCopyReference}
                  className="min-h-[44px] px-3.5 py-2 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedRef ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Ref</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            {isManualRefEditing ? (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={manualRefInput}
                  onChange={(e) => {
                    setManualRefInput(e.target.value);
                    setSubmittedRef(null);
                  }}
                  placeholder={autoPayshapReference}
                  className="w-full min-h-[40px] bg-[#111111] border border-[#FACC15]/60 focus:border-[#FACC15] rounded-xl px-3 py-2 text-xs font-mono font-black text-[#FACC15] focus:outline-none"
                />
                <p className="text-[10px] text-gray-400">
                  Manual backup active — tap &quot;Use Auto&quot; to restore{' '}
                  <span className="text-[#FACC15] font-mono">{autoPayshapReference}</span>.
                </p>
              </div>
            ) : (
              <div className="font-mono font-black text-sm text-[#FACC15] tracking-wide break-all">
                {payshapReference}
              </div>
            )}
          </div>

          {/* Bank App Instructions */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 flex items-start gap-2.5">
            <Building2 className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
            <p className="text-xs text-gray-200 leading-relaxed">
              Pay from <strong>ANY bank app</strong> (Capitec, FNB, Nedbank, Standard Bank, TymeBank, etc.) using PayShap to the TymeBank PayShap ID above and use the exact Reference shown. Your wallet updates automatically once the TymeBank SMS payment arrives.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {submittedRef ? (
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs space-y-1">
              <div className="font-black text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>PayShap Top-Up Request Saved</span>
              </div>
              <p className="text-emerald-200/90 leading-snug">
                Reference <strong className="font-mono">{submittedRef}</strong> is waiting for TymeBank SMS confirmation. Once received, R{numericAmount.toFixed(2)} will be credited to your wallet balance.
              </p>
            </div>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirmPendingTopUp}
              className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isSubmitting
                  ? 'Saving Request...'
                  : `I've Sent R${numericAmount.toFixed(2)} via PayShap`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Recent PayShap Top-Up Requests */}
      {myTopups.length > 0 && (
        <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 space-y-2.5">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-300">
            Recent PayShap Top-Ups
          </h2>
          <div className="space-y-2">
            {myTopups.map((item) => {
              const isCredited = item.status === 'CREDITED';
              return (
                <div
                  key={item.id}
                  className="bg-black/40 border border-white/5 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-white truncate">
                      {item.payshapReference}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      PayShap ID: {item.payshapId}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-white tabular-nums">
                      R{Number(item.amount || 0).toFixed(2)}
                    </p>
                    <p
                      className={`text-[11px] font-bold inline-flex items-center gap-1 ${
                        isCredited ? 'text-emerald-400' : 'text-[#FACC15]'
                      }`}
                    >
                      {isCredited ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      <span>{isCredited ? 'Credited' : 'Pending SMS'}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PayshapTopUpPage;
