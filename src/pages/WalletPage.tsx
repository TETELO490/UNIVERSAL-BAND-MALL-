import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  ArrowLeft,
  CreditCard,
  ArrowUpRight,
  CheckCircle2,
  Radio,
  AlertCircle,
  Settings,
  PieChart,
  User,
} from 'lucide-react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import confetti from 'canvas-confetti';

export const WalletPage: React.FC = () => {
  const {
    currentUser,
    currentWalletBalance,
    topUpWallet,
    navigateTo,
    walletTransactions,
    tymebankPayshapNumber,
  } = useApp();

  // Real Amount state
  const [amount, setAmount] = useState<string>('50');

  // Sub-view only for OneVoucher
  const [showOneVoucherModal, setShowOneVoucherModal] = useState<boolean>(false);

  const [customAmount, setCustomAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [voucherPin, setVoucherPin] = useState<string>('');
  const [voucherAmount, setVoucherAmount] = useState<number>(100);
  const [onevoucherApiUrl, setOnevoucherApiUrl] = useState<string>('');
  const [onevoucherApiKey, setOnevoucherApiKey] = useState<string>('');

  const quickAmounts = [50, 100, 200, 500];

  // Synchronized canonical current balance
  const displayBalance = currentWalletBalance;

  useEffect(() => {
    try {
      const vUrl = localStorage.getItem('onevoucher_api_url');
      const vKey = localStorage.getItem('onevoucher_api_key');
      if (vUrl) setOnevoucherApiUrl(vUrl);
      if (vKey) setOnevoucherApiKey(vKey);
    } catch (e) {
      console.warn('Could not read API settings:', e);
    }
  }, []);

  const handleTopUp = async (amt: number) => {
    setIsProcessing(true);
    setErrorMessage('');
    try {
      await topUpWallet(amt);
      try {
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch (e) {}
      setSuccessMessage(`Successfully added R${amt.toFixed(2)} to your Universal Band!`);
      setShowOneVoucherModal(false);
      setTimeout(() => {
        setSuccessMessage('');
      }, 5000);
    } catch (err) {
      setErrorMessage('Top up failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCustomTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customAmount);
    if (!isNaN(val) && val > 0) {
      handleTopUp(val);
      setCustomAmount('');
    }
  };

  const handleVoucherPinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 16);
    const parts = raw.match(/.{1,4}/g);
    setVoucherPin(parts ? parts.join('-') : raw);
  };

  const handleOneVoucherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDigits = voucherPin.replace(/[^0-9]/g, '');
    if (cleanDigits.length < 16) {
      setErrorMessage('Please enter a valid 16-digit OneVoucher PIN.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    try {
      if (onevoucherApiUrl) {
        const res = await fetch(onevoucherApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(onevoucherApiKey ? { Authorization: `Bearer ${onevoucherApiKey}` } : {}),
          },
          body: JSON.stringify({
            pin: cleanDigits,
            amount: voucherAmount,
            userId: currentUser.id,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.message || data?.error || `Voucher API returned ${res.status}`);
        }
        const verifiedAmt = typeof data?.amount === 'number' && data.amount > 0 ? data.amount : voucherAmount;
        await handleTopUp(verifiedAmt);
        setVoucherPin('');
        return;
      }

      // Fallback: redeem strictly against a real admin-issued voucher document in Firestore
      const voucherRef = doc(db, 'vouchers', cleanDigits);
      const redeemedAmount = await runTransaction(db, async (tx) => {
        const snap = await tx.get(voucherRef);
        if (!snap.exists()) {
          throw new Error('Voucher PIN not found and OneVoucher API URL is not configured in API Settings.');
        }
        const vData = snap.data() as any;
        if (vData.redeemed || vData.status === 'redeemed') {
          throw new Error('This voucher PIN has already been redeemed.');
        }
        const amt = typeof vData.amount === 'number' && vData.amount > 0 ? vData.amount : voucherAmount;
        tx.update(voucherRef, {
          redeemed: true,
          status: 'redeemed',
          redeemedBy: currentUser.id,
          redeemedAt: new Date().toISOString(),
        });
        return amt;
      });

      await handleTopUp(redeemedAmount);
      setVoucherPin('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'OneVoucher redemption failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto min-h-screen text-white relative">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back</span>
        </button>

        <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-2.5 py-1 rounded-full">
          Wristband Wallet
        </span>
      </div>

      {/* Balance Card - Dynamic total calculated from transactions */}
      <div className="bg-gradient-to-br from-[#121212] via-[#1A1A1A] to-[#242424] rounded-3xl p-5 border-2 border-[#FACC15]/50 mb-4 relative overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Current Balance
          </span>
          <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-full border border-white/10">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase">NFC Linked</span>
          </div>
        </div>

        <div className="flex items-baseline gap-1 my-1">
          <span className="text-4xl font-black text-[#FACC15] tracking-tight">
            R{displayBalance.toFixed(2)}
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
          <span>Linked User: <strong className="text-gray-200">{currentUser.name}</strong></span>
          <span className="font-mono text-yellow-400/80 bg-yellow-400/10 px-2.5 py-0.5 rounded border border-yellow-400/20">
            {`UB-${(currentUser.id || 'USER').slice(-6).toUpperCase()}`}
          </span>
        </div>
      </div>

      {/* PROFILE ONE QR LINK CARD */}
      <div className="bg-[#141414] rounded-3xl p-4 border border-[#FACC15]/30 mb-4 shadow-xl flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-wider text-white">
            Your Permanent ONE QR
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Your ONE QR lives on your Profile for tickets, food, and merch.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigateTo('/profile')}
          className="min-h-[44px] shrink-0 px-3.5 py-2 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition"
        >
          <User className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Open QR</span>
        </button>
      </div>

      {/* Every Cent Statement Quick Launch Banner */}
      <button
        type="button"
        onClick={() => navigateTo('/every-cent')}
        className="w-full mb-4 p-3 rounded-2xl bg-[#181818] hover:bg-[#202020] border border-[#FACC15]/40 hover:border-[#FACC15] flex items-center justify-between transition cursor-pointer group shadow-lg"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FACC15] text-black flex items-center justify-center shrink-0">
            <PieChart className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div className="text-left">
            <div className="text-xs font-black text-white group-hover:text-[#FACC15] flex items-center gap-1.5 transition">
              <span>See Where Every Cent Went</span>
              <span className="text-[9px] font-black bg-[#FACC15] text-black px-1.5 py-0.2 rounded">STATEMENT</span>
            </div>
            <p className="text-[10px] text-gray-400">Cent-by-cent audit, cash flow & itemized slips</p>
          </div>
        </div>
        <span className="text-[#FACC15] text-xs font-black group-hover:translate-x-1 transition-transform">➔</span>
      </button>

      {/* Success Message Banner */}
      {successMessage && (
        <div className="mb-4 p-3.5 bg-emerald-500/15 border border-emerald-500/50 rounded-2xl text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="mb-4 p-3.5 bg-red-500/15 border border-red-500/50 rounded-2xl text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* NEW SECTION: "Top Up Wallet" with 2 side-by-side cards    */}
      {/* ======================================================== */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-5 mb-5 shadow-xl">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-sm font-black uppercase tracking-wider text-white">
            Top Up Wallet
          </h3>
          <button
            type="button"
            onClick={() => navigateTo('/api-settings')}
            className="text-[11px] font-bold text-[#FACC15] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>API Settings</span>
          </button>
        </div>

        {/* PayShap & OneVoucher Top-Up Options */}
        <div className="grid grid-cols-1 gap-3">
          {/* CARD 1: PayShap Top-Up */}
          <div className="bg-[#181814] border border-[#FACC15]/40 rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-white tracking-tight">
                Top Up with PayShap
              </h4>
              <p className="text-[11px] text-gray-300 mt-0.5 leading-snug">
                Pay from any South African bank app to TymeBank PayShap ID{' '}
                <span className="font-mono font-bold text-[#FACC15] tabular-nums">
                  {tymebankPayshapNumber || '0821234567'}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('/top-up')}
              className="w-full min-h-[44px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-xs py-2.5 rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Top Up with PayShap</span>
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* CARD 2: OneVoucher */}
          <div
            onClick={() => {
              setErrorMessage('');
              setShowOneVoucherModal(true);
            }}
            className="bg-[#1A0A0E] hover:bg-[#250E14] border border-[#E11D48]/30 hover:border-[#E11D48] rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#E11D48]/10 group cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#E11D48]/5 rounded-full blur-xl pointer-events-none" />

            <div>
              {/* OneVoucher logo icon at top (red and white voucher icon) */}
              <div className="w-10 h-10 rounded-xl bg-[#3D0A14] border border-[#E11D48]/40 flex items-center justify-center p-2 mb-3 shadow-sm group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6" viewBox="0 0 40 40" fill="none">
                  <rect width="40" height="40" rx="8" fill="#E11D48" />
                  <path
                    d="M10 14C10 12.8954 10.8954 12 12 12H28C29.1046 12 30 12.8954 30 14V17C28.8954 17 28 17.8954 28 19C28 20.1046 28.8954 21 30 21V26C30 27.1046 29.1046 28 28 28H12C10.8954 28 10 27.1046 10 26V21C11.1046 21 12 20.1046 12 19C12 17.8954 11.1046 17 10 17V14Z"
                    fill="white"
                  />
                  <path
                    d="M15 16H25M15 20H25M15 24H21"
                    stroke="#E11D48"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* Title */}
              <h4 className="text-xs font-black text-white tracking-tight group-hover:text-[#F43F5E] transition-colors leading-snug">
                Redeem OneVoucher
              </h4>

              {/* Small text */}
              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                Enter 16-digit PIN
              </p>

              <div className="mt-3 text-[10px] text-gray-500 py-1.5 px-2 bg-black/40 rounded-lg border border-white/5 truncate">
                Flash / Shoprite
              </div>
            </div>

            {/* Button */}
            <div className="mt-4 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setErrorMessage('');
                  setShowOneVoucherModal(true);
                }}
                className="w-full bg-[#E11D48] hover:bg-[#F43F5E] active:scale-95 text-white font-black text-xs py-2 rounded-xl transition shadow-md flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Redeem</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-5 mb-5 shadow-xl">
        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2.5">
          Quick Preset Amounts (Card)
        </label>
        <div className="grid grid-cols-4 gap-2">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setAmount(String(amt))}
              className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                amount === String(amt)
                  ? 'bg-[#00C3F7] text-black border-[#00C3F7]'
                  : 'bg-[#242424] hover:bg-[#FACC15] hover:text-black text-white border-white/5'
              }`}
            >
              R{amt}
            </button>
          ))}
        </div>
      </div>

      {/* Real Cashless Activity List - Calculated from transactions */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-5 mb-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Recent Cashless Activity
          </span>
          {walletTransactions.length > 0 && (
            <span className="text-[11px] text-gray-400 font-mono">
              Total: R{displayBalance.toFixed(2)}
            </span>
          )}
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {walletTransactions.length === 0 ? (
            <div className="p-4 text-center bg-black/40 rounded-2xl border border-white/5 text-gray-500 text-xs">
              No recent activity • Wallet starts at R0.00
            </div>
          ) : (
            walletTransactions.map((tx) => {
              const isCredit = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 text-xs border border-white/5"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        isCredit
                          ? 'bg-emerald-400/20 text-emerald-400'
                          : 'bg-red-400/20 text-red-400'
                      }`}
                    >
                      {isCredit ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-white font-medium">{tx.title}</p>
                      <p className="text-[10px] text-gray-500">
                        {tx.subtitle} • {tx.date}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-bold ${
                      isCredit ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {isCredit ? '+' : ''}R{Math.abs(tx.amount).toFixed(2)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* OneVoucher Inline Sub-Dialog */}
      {showOneVoucherModal && (
        <div className="bg-[#141414] border-2 border-[#E11D48] rounded-3xl p-5 mb-5 shadow-2xl animate-in fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
            <h4 className="text-xs font-black text-white">OneVoucher Redemption</h4>
            <button
              type="button"
              onClick={() => setShowOneVoucherModal(false)}
              className="text-gray-400 hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
          <label className="text-[11px] font-bold text-gray-300 block mb-1">
            Enter 16-Digit OneVoucher PIN
          </label>
          <input
            type="text"
            placeholder="XXXX - XXXX - XXXX - XXXX"
            value={voucherPin}
            onChange={handleVoucherPinChange}
            maxLength={19}
            className="w-full bg-black/60 border border-white/10 focus:border-[#E11D48] text-white font-mono text-center font-bold tracking-widest text-sm py-2.5 rounded-xl mb-3 focus:outline-none"
          />
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setVoucherAmount(amt)}
                className={`py-2 rounded-xl text-xs font-black transition border ${
                  voucherAmount === amt
                    ? 'bg-[#E11D48] text-white border-[#E11D48]'
                    : 'bg-black/40 text-gray-300 border-white/10'
                }`}
              >
                R{amt}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={isProcessing || voucherPin.replace(/[^0-9]/g, '').length < 16}
            onClick={handleOneVoucherSubmit}
            className="w-full bg-[#E11D48] hover:bg-[#F43F5E] active:scale-95 text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-lg transition cursor-pointer disabled:opacity-50"
          >
            <span>{isProcessing ? 'Redeeming Voucher...' : `Redeem R${voucherAmount} OneVoucher`}</span>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
export default WalletPage;
