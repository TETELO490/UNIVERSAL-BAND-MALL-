import React from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Wallet } from 'lucide-react';

export const PayshapTopUpPage: React.FC = () => {
  const { currentWalletBalance, navigateTo } = useApp();

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
          Top Up
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

      {/* Payment Options Section (Empty with TODO as requested) */}
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 text-center space-y-3 shadow-xl">
        <h2 className="text-sm font-black text-white uppercase tracking-wider">
          Payment Options
        </h2>
        <p className="text-xs text-gray-400 italic">
          // TODO: Owner will add real payment methods here.
        </p>
      </div>
    </div>
  );
};

export default PayshapTopUpPage;
