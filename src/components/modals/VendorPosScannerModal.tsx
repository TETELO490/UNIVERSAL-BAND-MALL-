import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useApp } from '../../context/AppContext';
import {
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  Beer,
  Search,
  CreditCard,
  TrendingUp,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { searchCustomerByIdOrPhone } from '../../utils/customerDirectory';
import { parseCustomerQrScan } from '../../utils/customerQr';
import confetti from 'canvas-confetti';
import { ensureCameraPermission } from '../../utils/nativePermissions';

interface VendorPosScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VendorPosScannerModal: React.FC<VendorPosScannerModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    deductVendorSale,
    liveSales,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'scan' | 'recent_sales'>('scan');
  const [scannerId] = useState(() => `vendor-qr-reader-${Math.random().toString(36).substring(2, 8)}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lookupInput, setLookupInput] = useState<string>('');
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);

  // Scanned customer info
  const [scannedCustomer, setScannedCustomer] = useState<{
    id: string;
    name: string;
    bandCode: string;
    balance: number;
  } | null>(null);

  // Selected item / amount to deduct
  const [selectedItemName, setSelectedItemName] = useState<string>('Cold Craft Beer');
  const [deductAmount, setDeductAmount] = useState<number>(30);
  const [customAmountInput, setCustomAmountInput] = useState<string>('30');
  const [isDeducting, setIsDeducting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Quick Preset Items
  const presetItems = [
    { name: 'Cold Craft Beer', price: 30, icon: '🍺' },
    { name: 'Draft Pint (Castle Lite)', price: 45, icon: '🍻' },
    { name: 'Soft Drink (Coke / Sprite)', price: 25, icon: '🥤' },
    { name: 'Gourmet Beef Burger', price: 95, icon: '🍔' },
  ];

  const resolveCustomerWalletFromFirestore = async (
    identifier: string,
    fallbackName?: string,
    fallbackBand?: string
  ) => {
    const trimmed = identifier.trim();
    if (!trimmed) {
      setFeedbackMsg({ type: 'error', text: 'Invalid customer identifier.' });
      return;
    }

    let resolvedId = trimmed;
    let resolvedName = fallbackName || 'Customer';
    let resolvedBalance: number | null = null;

    // 1. Direct lookup on wallets/{id} and users/{id}
    const [walletSnap, userSnap] = await Promise.all([
      getDoc(doc(db, 'wallets', trimmed)),
      getDoc(doc(db, 'users', trimmed)),
    ]);

    if (userSnap.exists()) {
      const u = userSnap.data() as any;
      resolvedName = u.fullName || u.name || resolvedName;
      if (typeof u.walletBalance === 'number') {
        resolvedBalance = u.walletBalance;
      }
    }
    if (walletSnap.exists()) {
      const w = walletSnap.data() as any;
      if (typeof w.balance === 'number') {
        resolvedBalance = w.balance;
      }
    }

    // 2. If not matched by doc ID, search by phone/email/SA ID via Firestore directory
    if (resolvedBalance === null && !userSnap.exists()) {
      const matched = await searchCustomerByIdOrPhone(trimmed);
      if (matched) {
        resolvedId = matched.id;
        resolvedName = matched.name || resolvedName;
        const [mWallet, mUser] = await Promise.all([
          getDoc(doc(db, 'wallets', matched.id)),
          getDoc(doc(db, 'users', matched.id)),
        ]);
        if (mUser.exists() && typeof (mUser.data() as any).walletBalance === 'number') {
          resolvedBalance = (mUser.data() as any).walletBalance;
        }
        if (mWallet.exists() && typeof (mWallet.data() as any).balance === 'number') {
          resolvedBalance = (mWallet.data() as any).balance;
        }
      }
    }

    if (resolvedBalance === null) {
      setFeedbackMsg({
        type: 'error',
        text: `No registered customer wallet found for "${trimmed}".`,
      });
      return;
    }

    const bandCode = fallbackBand || `UB-${resolvedId.slice(-6).toUpperCase()}`;
    setScannedCustomer({
      id: resolvedId,
      name: resolvedName,
      bandCode,
      balance: resolvedBalance,
    });
    setFeedbackMsg({
      type: 'success',
      text: `Loaded ${resolvedName}'s Universal Band! Balance: R${resolvedBalance.toFixed(2)}`,
    });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const playBeepSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  };

  const handleParseQrCode = async (text: string) => {
    try {
      playBeepSound();
      const scan = parseCustomerQrScan(text);
      if (scan.dynamicError) {
        stopCameraScanner();
        setFeedbackMsg({ type: 'error', text: scan.dynamicErrorMessage });
        return;
      }

      const custId = scan.userId || scan.customerId || scan.customerQrId || scan.phone || scan.raw;
      const custName = scan.name;
      const custBand = scan.customerQrId || scan.bandCode || scan.ticketId;

      stopCameraScanner();
      await resolveCustomerWalletFromFirestore(custId, custName, custBand);
    } catch (e) {
      console.warn('QR parse error:', e);
      setFeedbackMsg({ type: 'error', text: 'Failed to verify scanned QR pass.' });
    }
  };

  const handleManualCustomerLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupInput.trim()) return;
    setIsLookingUp(true);
    setFeedbackMsg(null);
    try {
      await resolveCustomerWalletFromFirestore(lookupInput.trim());
    } finally {
      setIsLookingUp(false);
    }
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    const perm = await ensureCameraPermission();
    if (!perm.granted) {
      setIsCameraActive(false);
      setCameraError(
        perm.message || 'Camera access not granted or not available. Use phone/ID lookup below.'
      );
      return;
    }

    try {
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;
      setIsCameraActive(true);

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleParseQrCode(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setIsCameraActive(false);
      setCameraError('Camera access not granted or not available. Use phone/ID lookup below.');
    }
  };

  const stopCameraScanner = () => {
    if (scannerRef.current && isCameraActive) {
      scannerRef.current
        .stop()
        .then(() => {
          scannerRef.current = null;
          setIsCameraActive(false);
        })
        .catch(() => {
          setIsCameraActive(false);
        });
    } else {
      setIsCameraActive(false);
    }
  };

  const handleDeduct = async () => {
    if (!scannedCustomer) {
      setFeedbackMsg({ type: 'error', text: 'Please scan or select a customer band first.' });
      return;
    }

    const amt = deductAmount;
    if (isNaN(amt) || amt <= 0) {
      setFeedbackMsg({ type: 'error', text: 'Enter a valid amount.' });
      return;
    }

    setIsDeducting(true);
    setFeedbackMsg(null);

    const res = await deductVendorSale({
      customerId: scannedCustomer.id,
      amount: amt,
      itemName: selectedItemName,
      vendorName: currentUser.name || 'Vendor Bar POS',
    });

    setIsDeducting(false);

    if (res.success) {
      playBeepSound();
      setScannedCustomer((prev) =>
        prev
          ? {
              ...prev,
              balance: res.newBalance,
            }
          : null
      );
      setFeedbackMsg({
        type: 'success',
        text: `Deducted R${amt.toFixed(2)} for ${selectedItemName}! New balance: R${res.newBalance.toFixed(2)}`,
      });
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#FACC15', '#10B981', '#FFFFFF'],
        });
      } catch (e) {}
    } else {
      setFeedbackMsg({
        type: 'error',
        text: res.error || 'Failed to deduct from band.',
      });
    }
  };

  const handleClose = () => {
    stopCameraScanner();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-[#161616] rounded-3xl border border-[#FACC15]/30 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 my-auto max-h-[92vh] flex flex-col text-white">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close Vendor Scanner"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-[#FACC15] text-black flex items-center justify-center shadow-md font-black">
            <Beer className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white tracking-tight">
                Vendor POS Scanner
              </h2>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                LIVE TERMINAL
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Scan Customer Band QR • Deduct R30 Beer • Live Sales Sync
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-black/60 rounded-xl border border-white/10 mb-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className={`py-2 text-xs font-black rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'scan' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Scan & Deduct</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('recent_sales')}
            className={`py-2 text-xs font-black rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'recent_sales' ? 'bg-[#FACC15] text-black shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Live Sales Feed ({liveSales.length})</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto pr-1 flex-1 space-y-4">
          {activeTab === 'scan' ? (
            <>
              {/* Feedback Banner */}
              {feedbackMsg && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in ${
                    feedbackMsg.type === 'success'
                      ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                      : 'bg-red-950/80 border border-red-500/50 text-red-300'
                  }`}
                >
                  {feedbackMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  )}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* Scanned Customer Card */}
              {scannedCustomer ? (
                <div className="bg-[#121212] rounded-2xl p-4 border border-[#FACC15]/40 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Customer Universal Band
                      </span>
                      <h3 className="text-base font-black text-white">{scannedCustomer.name}</h3>
                      <span className="text-[11px] font-mono text-[#FACC15] font-bold">
                        {scannedCustomer.bandCode}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 font-bold block">CURRENT BALANCE</span>
                      <span className="text-2xl font-black text-emerald-400 tracking-tight">
                        R{scannedCustomer.balance.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-[11px] text-gray-400">
                      Balance after R{deductAmount} tap:
                    </span>
                    <span className="text-sm font-black text-[#FACC15]">
                      R{Math.max(0, scannedCustomer.balance - deductAmount).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-black/40 rounded-2xl border border-white/10 text-center text-xs text-gray-400">
                  No customer band scanned yet. Scan their QR pass or look up customer phone/ID below.
                </div>
              )}

              {/* Camera Scanner View / Toggle */}
              <div className="bg-black/40 rounded-2xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-[#FACC15]" />
                    <span>Camera QR Scanner</span>
                  </span>
                  {!isCameraActive ? (
                    <button
                      type="button"
                      onClick={startCameraScanner}
                      className="text-[11px] font-bold text-black bg-[#FACC15] hover:bg-yellow-400 px-3 py-1 rounded-lg transition cursor-pointer"
                    >
                      Turn On Camera
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCameraScanner}
                      className="text-[11px] font-bold text-white bg-red-600 hover:bg-red-500 px-3 py-1 rounded-lg transition cursor-pointer"
                    >
                      Turn Off Camera
                    </button>
                  )}
                </div>

                <div
                  className={`relative w-full aspect-square max-h-56 bg-black rounded-xl overflow-hidden border border-white/10 ${
                    isCameraActive ? 'block' : 'hidden'
                  }`}
                >
                  <div id={scannerId} className="w-full h-full" />

                  {isCameraActive && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                      {/* Reticle */}
                      <div className="relative w-40 h-40 sm:w-44 sm:h-44 rounded-xl animate-scan-reticle">
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-[#FACC15] rounded-tl-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-[#FACC15] rounded-tr-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-[#FACC15] rounded-bl-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-[#FACC15] rounded-br-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />

                        {/* Moving Laser */}
                        <div className="absolute inset-x-1 animate-scan-laser pointer-events-none z-10">
                          <div className="h-10 w-full bg-gradient-to-t from-[#FACC15]/25 via-[#FACC15]/10 to-transparent -translate-y-full rounded-t" />
                          <div className="h-0.5 w-full bg-[#FACC15] rounded-full shadow-[0_0_10px_#FACC15]" />
                        </div>
                      </div>

                      <div className="absolute bottom-2 inset-x-0 text-center">
                        <span className="text-[9px] font-bold bg-black/80 text-gray-200 px-2.5 py-0.5 rounded-full border border-white/10 backdrop-blur-sm">
                          Scanning Band QR...
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <p className="text-[11px] text-amber-400 mt-2 bg-amber-500/10 p-2 rounded-lg">
                    {cameraError}
                  </p>
                )}

                {/* Customer Phone / ID Lookup */}
                <form onSubmit={handleManualCustomerLookup} className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                    placeholder="Customer phone, email, or band ID..."
                    className="flex-1 bg-black/60 border border-white/15 focus:border-[#FACC15] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isLookingUp || !lookupInput.trim()}
                    className="py-2 px-3 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-xs font-bold text-[#FACC15] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{isLookingUp ? 'Finding...' : 'Find'}</span>
                  </button>
                </form>
              </div>

              {/* Preset Items to Deduct */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                  Select Item to Deduct (Vendor POS)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {presetItems.map((item) => {
                    const isSelected = selectedItemName === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => {
                          setSelectedItemName(item.name);
                          setDeductAmount(item.price);
                          setCustomAmountInput(String(item.price));
                        }}
                        className={`p-3 rounded-2xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#FACC15]/20 border-[#FACC15] shadow-lg shadow-yellow-400/10 scale-[1.02]'
                            : 'bg-[#121212] border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xl">{item.icon}</span>
                          <span
                            className={`text-xs font-black px-2 py-0.5 rounded-lg ${
                              isSelected
                                ? 'bg-[#FACC15] text-black'
                                : 'bg-white/10 text-white'
                            }`}
                          >
                            R{item.price}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-white mt-2 block truncate">
                          {item.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Amount input */}
              <div className="bg-[#121212] rounded-2xl p-3 border border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">Custom Amount (ZAR):</span>
                <div className="relative w-28">
                  <span className="absolute left-3 top-2 text-xs font-bold text-gray-400">R</span>
                  <input
                    type="number"
                    min="1"
                    value={customAmountInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomAmountInput(val);
                      const n = parseFloat(val);
                      if (!isNaN(n) && n > 0) {
                        setDeductAmount(n);
                      }
                    }}
                    className="w-full bg-black/60 border border-white/15 focus:border-[#FACC15] rounded-xl pl-7 pr-3 py-1.5 text-xs font-black text-white text-right focus:outline-none"
                  />
                </div>
              </div>

              {/* BIG DEDUCT BUTTON */}
              <button
                type="button"
                onClick={handleDeduct}
                disabled={isDeducting || !scannedCustomer}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FACC15] via-amber-400 to-yellow-500 hover:brightness-105 active:scale-98 text-black font-black text-sm tracking-wide shadow-xl shadow-yellow-400/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Beer className="w-5 h-5 stroke-[2.5]" />
                <span>
                  {isDeducting
                    ? 'Processing Band Tap...'
                    : `DEDUCT R${deductAmount.toFixed(2)} (${selectedItemName})`}
                </span>
              </button>
            </>
          ) : (
            /* Live Sales Feed */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>Real-Time Sales Activity</span>
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>

              {liveSales.length === 0 ? (
                <div className="p-6 text-center bg-black/40 rounded-2xl border border-white/5 text-gray-500 text-xs">
                  No vendor sales recorded yet. Tap "Scan & Deduct" to deduct R30 beer!
                </div>
              ) : (
                liveSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="bg-[#121212] p-3 rounded-2xl border border-white/5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                        🍺
                      </div>
                      <div>
                        <p className="text-xs font-black text-white">{sale.itemName}</p>
                        <p className="text-[10px] text-gray-500">
                          {sale.customerName} • {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-400 block">
                        +R{Number(sale.amount).toFixed(2)}
                      </span>
                      <span className="text-[9px] text-emerald-400/90 font-bold">
                        VERIFIED
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom Exit */}
        <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-xs shrink-0">
          <span className="text-[10px] text-gray-500">
            Universal Band Real-Time NFC/QR Clearance
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
