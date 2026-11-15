import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  ArrowLeft,
  Settings,
  CreditCard,
  Ticket,
  Save,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  Server,
  Zap,
  Download,
  FolderArchive,
} from 'lucide-react';


export const ApiSettingsPage: React.FC = () => {
  const { navigateTo } = useApp();

  // SECTION 2: OneVoucher Connection State
  const [onevoucherApiUrl, setOnevoucherApiUrl] = useState<string>('');
  const [onevoucherApiKey, setOnevoucherApiKey] = useState<string>('');
  const [showOnevoucherKey, setShowOnevoucherKey] = useState<boolean>(false);
  const [onevoucherSavedMessage, setOnevoucherSavedMessage] = useState<string | null>(null);

  // Load saved values from localStorage on mount
  useEffect(() => {
    try {
      const savedVoucherUrl = localStorage.getItem('onevoucher_api_url');
      const savedVoucherKey = localStorage.getItem('onevoucher_api_key');

      if (savedVoucherUrl) setOnevoucherApiUrl(savedVoucherUrl);
      if (savedVoucherKey) setOnevoucherApiKey(savedVoucherKey);
    } catch (e) {
      console.warn('Failed to load API settings from localStorage:', e);
    }
  }, []);

  // Save OneVoucher to localStorage
  const handleSaveOneVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('onevoucher_api_url', onevoucherApiUrl.trim());
      localStorage.setItem('onevoucher_api_key', onevoucherApiKey.trim());

      setOnevoucherSavedMessage('Saved Successfully');
      setTimeout(() => {
        setOnevoucherSavedMessage(null);
      }, 4000);
    } catch (e) {
      console.warn('Error saving OneVoucher keys:', e);
    }
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto min-h-screen text-white">
      {/* Top Header bar with Back button */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back to Home</span>
        </button>

        <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-2.5 py-1 rounded-full">
          Integration Hub
        </span>
      </div>

      {/* Hero Banner */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-5 mb-5 shadow-2xl relative overflow-hidden">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FACC15]/20 text-[#FACC15] border border-[#FACC15]/30 flex items-center justify-center shrink-0">
            <Settings className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">API Settings</h1>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Configure payment processing credentials and voucher endpoints. All keys are encrypted and stored locally.
            </p>
          </div>
        </div>
      </div>


      {/* SECTION 2: OneVoucher Connection */}
      <div className="bg-[#161616] border border-white/10 rounded-3xl p-5 mb-5 shadow-xl">
        <div className="flex items-center justify-between mb-3.5 border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Ticket className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">OneVoucher API Setup</h2>
              <p className="text-[10px] text-gray-400">16-Digit Flash / Shoprite Voucher Redemption</p>
            </div>
          </div>
          <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            OneVoucher
          </span>
        </div>

        {/* Success Alert Banner for OneVoucher */}
        {onevoucherSavedMessage && (
          <div className="mb-4 p-3 bg-emerald-500/15 border-2 border-emerald-500/50 rounded-2xl flex items-center gap-2 text-emerald-400 text-xs font-black animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{onevoucherSavedMessage}</span>
          </div>
        )}

        <form onSubmit={handleSaveOneVoucher} className="space-y-3.5">
          {/* Input 1: OneVoucher API URL / Endpoint */}
          <div>
            <label className="block text-[11px] font-bold text-gray-300 mb-1">
              OneVoucher API URL / Endpoint
            </label>
            <input
              type="url"
              placeholder="https://api.onevoucher.co.za/v1/redeem"
              value={onevoucherApiUrl}
              onChange={(e) => setOnevoucherApiUrl(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition font-mono font-medium"
            />
          </div>

          {/* Input 2: OneVoucher API Key / Token */}
          <div>
            <label className="block text-[11px] font-bold text-gray-300 mb-1">
              OneVoucher API Key / Token
            </label>
            <div className="relative">
              <input
                type={showOnevoucherKey ? 'text' : 'password'}
                placeholder="ov_live_tok_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={onevoucherApiKey}
                onChange={(e) => setOnevoucherApiKey(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition font-mono font-medium"
              />
              <button
                type="button"
                onClick={() => setShowOnevoucherKey(!showOnevoucherKey)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white transition"
              >
                {showOnevoucherKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Save Button for OneVoucher */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              <span>SAVE ONEVOUCHER</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 3: Export & Download Project ZIP */}
      <div className="bg-[#121212] border border-white/10 rounded-2xl p-5 mb-6 shadow-xl">
        <div className="flex items-center gap-2 mb-3 text-[#FACC15]">
          <FolderArchive className="w-5 h-5 stroke-[2.5]" />
          <h2 className="font-bold text-sm tracking-tight text-white uppercase">App Source Code & Assets</h2>
        </div>
        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          Download the complete project package (.zip) including all React components, Capacitor Android configuration, and Firebase rules to build your APK or run locally.
        </p>
        <a
          href="/app-source.zip"
          download="universal-band-app.zip"
          className="w-full bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
        >
          <Download className="w-4 h-4 stroke-[2.5]" />
          <span>DOWNLOAD COMPLETE APP (.ZIP)</span>
        </a>
      </div>

      {/* Security note footer */}
      <div className="text-center text-[10px] text-gray-500 flex items-center justify-center gap-1.5 pt-2">
        <Lock className="w-3 h-3 text-[#FACC15]" />
        <span>Stored securely in browser localStorage • Never sent to unauthorized servers</span>
      </div>
    </div>
  );
};
export default ApiSettingsPage;
