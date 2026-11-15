import React from 'react';
import { useApp } from '../../context/AppContext';
import { X, ShieldCheck, FileText, Check, Lock, Wallet, Ticket, AlertTriangle, Scale } from 'lucide-react';

export const TermsModal: React.FC = () => {
  const { activeModal, setActiveModal } = useApp();

  if (activeModal !== 'terms') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[85vh] bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FACC15]/10 text-[#FACC15] border border-[#FACC15]/30 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Terms & Conditions</h2>
              <p className="text-xs text-gray-400">Universal Band Cashless & Event Platform</p>
            </div>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            className="p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Terms Content */}
        <div className="flex-1 overflow-y-auto py-4 px-1 space-y-6 text-xs text-gray-300 pr-2 scrollbar-thin scrollbar-thumb-white/10">
          {/* Section 1: Introduction & Acceptance */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-400 font-bold text-sm">
              <Scale className="w-4 h-4 shrink-0" />
              <h3>1. Agreement & Acceptance</h3>
            </div>
            <p className="leading-relaxed text-gray-300">
              Welcome to <strong>Universal Band (UB)</strong>. By registering an account, purchasing an event ticket, or using our NFC cashless wristband services, you agree to be bound by these Terms and Conditions and our Privacy Policy. If you do not agree, you may not use the Universal Band platform.
            </p>
          </section>

          {/* Section 2: Cashless NFC Wallet & Top-Ups */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-400 font-bold text-sm">
              <Wallet className="w-4 h-4 shrink-0" />
              <h3>2. Cashless NFC Wallet System</h3>
            </div>
            <ul className="list-disc list-inside space-y-1 text-gray-300 pl-1 leading-relaxed">
              <li><strong>Top-Up Funds:</strong> Funds loaded onto your Universal Band NFC wallet are stored digitally for instant tap-to-pay transactions at participating vendors and event stores.</li>
              <li><strong>Zero Auto-Deductions:</strong> Charges occur strictly when you tap your NFC wristband or approve a food/drink pre-reservation.</li>
              <li><strong>Refunds & Unused Balances:</strong> Unused digital wallet funds can be claimed or transferred back to your verified bank account via the Every Cent Audit section or at official cash-out gates.</li>
              <li><strong>Lost/Stolen Bands:</strong> You must immediately report a lost wristband to event security or freeze your account in-app to protect your wallet balance.</li>
            </ul>
          </section>

          {/* Section 3: Event Ticketing & Gate Access */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-400 font-bold text-sm">
              <Ticket className="w-4 h-4 shrink-0" />
              <h3>3. Event Tickets & Admissions</h3>
            </div>
            <p className="leading-relaxed text-gray-300">
              All digital tickets generated within the Universal Band app contain unique secure QR/NFC codes.
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-300 pl-1 leading-relaxed">
              <li>Tickets are non-duplicable and strictly validated at door check-in.</li>
              <li>In the event of event cancellation by the promoter, official refund guidelines set by the event organizer will apply.</li>
              <li>Passes and tickets are linked to your registered South African phone number or email profile for identity security.</li>
            </ul>
          </section>

          {/* Section 4: Liquor Control & SA ID Verification (POPIA & Liquor Act) */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-400 font-bold text-sm">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <h3>4. Liquor Control & Age Verification (18+)</h3>
            </div>
            <p className="leading-relaxed text-gray-300">
              In strict accordance with the South African National Liquor Act 59 of 2003 and POPIA regulations:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-300 pl-1 leading-relaxed">
              <li>Sale or service of alcohol to persons under 18 years of age is illegal.</li>
              <li>All alcohol orders and NFC bar taps require verified South African ID verification showing age 18+.</li>
              <li>Bar staff and store managers reserve the right to inspect physical ID or require in-app verification before dispensing alcoholic beverages.</li>
            </ul>
          </section>

          {/* Section 5: Account Security & Security PIN */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-400 font-bold text-sm">
              <Lock className="w-4 h-4 shrink-0" />
              <h3>5. Account Security & OTP Authentication</h3>
            </div>
            <p className="leading-relaxed text-gray-300">
              You are responsible for maintaining the confidentiality of your login credentials, app lock PIN, and OTP codes. Universal Band staff will never ask for your password or OTP code over the phone or email.
            </p>
          </section>

          {/* Section 6: User Conduct & Liability */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-400 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <h3>6. Limitation of Liability</h3>
            </div>
            <p className="leading-relaxed text-gray-300">
              Universal Band shall not be held liable for unauthorized account access resulting from shared credentials, lost physical devices without reported freezes, or third-party event organizer schedule changes.
            </p>
          </section>
        </div>

        {/* Footer Button */}
        <div className="pt-4 border-t border-white/10 shrink-0 flex items-center justify-between gap-3">
          <span className="text-[11px] text-gray-400">Effective Date: October 2026</span>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className="px-5 py-2.5 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-yellow-400/20 transition cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>I Understand & Agree</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default TermsModal;
