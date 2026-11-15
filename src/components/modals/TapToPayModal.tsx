import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MenuItem } from '../../types';
import { X, CreditCard, Radio, CheckCircle, ShieldCheck } from 'lucide-react';

interface TapToPayModalProps {
  item: MenuItem;
  onClose: () => void;
}

export const TapToPayModal: React.FC<TapToPayModalProps> = ({ item, onClose }) => {
  const { currentUser, purchaseMenuItem } = useApp();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericPrice = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
  const newBalance = Math.max(0, currentUser.walletBalance - numericPrice);

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    const result = await purchaseMenuItem(item);
    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } else if (result.error) {
      setError(result.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1A1A1A] rounded-2xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#FACC15] flex items-center justify-center text-black font-black text-xs">
            UB
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Tap-to-Pay POS
            </h2>
            <p className="text-[11px] text-gray-400">Universal Band Cashless Terminal</p>
          </div>
        </div>

        {success ? (
          <div className="py-6 text-center">
            <CheckCircle className="w-14 h-14 text-[#FACC15] mx-auto mb-2 animate-bounce" />
            <h3 className="text-white font-bold text-lg">Payment Successful!</h3>
            <p className="text-xs text-gray-300 mt-1">
              Paid <span className="text-[#FACC15] font-bold">{item.price}</span> for{' '}
              <span className="text-white font-bold">{item.name}</span>
            </p>
            <div className="mt-4 p-3 bg-black/50 rounded-xl border border-white/5 inline-block text-xs">
              <span className="text-gray-400 block text-[11px]">New Wristband Balance:</span>
              <span className="text-lg font-black text-[#FACC15]">R{newBalance.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div>
            {/* Item Card Preview */}
            <div className="bg-[#121212] rounded-2xl p-3.5 border border-white/10 mb-4 flex items-center gap-3">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border border-white/10"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 text-[#FACC15] font-black text-lg">
                  UB
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {item.category.toUpperCase()}
                </span>
                <h4 className="text-sm font-bold text-white tracking-tight truncate">
                  {item.name}
                </h4>
                <span className="text-base font-black text-[#FACC15] block mt-0.5">
                  {item.price}
                </span>
              </div>
            </div>

            {/* Wallet Summary */}
            <div className="bg-gradient-to-r from-zinc-900 to-black rounded-xl p-3.5 border border-white/5 mb-4 text-xs space-y-2">
              <div className="flex items-center justify-between text-gray-400">
                <span>Current Band Balance:</span>
                <span className="font-bold text-white">R{currentUser.walletBalance.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-400">
                <span>Charge Amount:</span>
                <span className="font-bold text-red-400">-{item.price}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/10 font-bold text-white">
                <span>Balance After Tap:</span>
                <span className="text-[#FACC15]">R{newBalance.toFixed(2)}</span>
              </div>
            </div>

            {error && (
              <div className="p-2.5 mb-3 bg-red-950/70 border border-red-500/30 rounded-xl text-red-300 text-xs">
                {error}
              </div>
            )}

            {/* NFC Wave Indicator */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 py-1 mb-3">
              <Radio className="w-4 h-4 text-[#FACC15] animate-pulse" />
              <span>Tap Universal Band or Click to Pay</span>
            </div>

            <button
              onClick={handlePay}
              disabled={loading}
              className="w-full bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold py-3.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-yellow-400/20 text-xs disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4 stroke-[2.5]" />
              <span>{loading ? 'Processing NFC...' : `Pay ${item.price} with Band`}</span>
            </button>

            <div className="mt-3 text-center flex items-center justify-center gap-1 text-[10px] text-gray-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Instant contactless terminal clearance</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
