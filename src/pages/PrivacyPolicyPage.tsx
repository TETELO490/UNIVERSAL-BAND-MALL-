import React from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Lock, ShieldCheck, Eye, CheckCircle2 } from 'lucide-react';
import { Footer } from '../components/Footer';

export const PrivacyPolicyPage: React.FC = () => {
  const { navigateTo } = useApp();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      <div className="max-w-md mx-auto px-4 py-6 flex-1 w-full">
        {/* Back navigation */}
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#FACC15] mb-6 cursor-pointer transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Events</span>
        </button>

        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 inline-block">
              POPIA Compliant
            </span>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Privacy Policy
            </h1>
            <p className="text-xs text-gray-400 leading-relaxed">
              Protection of Personal Information Act (POPIA) compliance policy for Universal Band (Pty) Ltd.
            </p>
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 space-y-6 text-xs text-gray-300 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>1. Commitment to Privacy</span>
              </h2>
              <p>
                Universal Band (Pty) Ltd ("UB", "we", "us") respects your privacy and is committed to processing your personal data lawfully in compliance with the Protection of Personal Information Act No. 4 of 2013 (POPIA).
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>2. Information We Collect</span>
              </h2>
              <p>When you purchase event tickets, create an account, or top up your wristband, we collect:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-400">
                <li>Full Name and Contact Email</li>
                <li>South African Mobile Phone Number</li>
                <li>Transaction Reference & Ticket Records</li>
                <li>ID number (strictly where required for age-restricted 18+ alcohol events)</li>
              </ul>
              <p className="text-[11px] text-emerald-400 font-semibold mt-1">
                Note: We DO NOT store your credit or debit card numbers. Card data is securely tokenized and processed directly via PCI-DSS Level 1 certified gateways.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>3. How We Use Your Data</span>
              </h2>
              <ul className="list-disc pl-5 space-y-1 text-gray-400">
                <li>Issuing electronic ticket QR passes and validating gate check-in</li>
                <li>Processing cashless top-ups and generating real-time transaction statements</li>
                <li>Sending critical event updates, venue changes, or postponement notices</li>
                <li>Preventing ticket fraud and unauthorized access</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>4. Data Sharing & Third Parties</span>
              </h2>
              <p>
                We do not sell or rent your personal information to third parties. We only share information with licensed payment processors and authorized event venue scanners for the sole purpose of ticket validation.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>5. Data Security & Storage</span>
              </h2>
              <p>
                All sensitive data transmission is protected using 256-bit SSL encryption. Data is stored on secure cloud database servers with strict role-based access control.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>6. Your Rights Under POPIA</span>
              </h2>
              <p>
                You have the right to request access to your personal information, request correction of inaccurate data, or request deletion of your account by contacting our Information Officer at <a href="mailto:Tetelophokwane90@gmail.com" className="text-[#FACC15] underline">Tetelophokwane90@gmail.com</a>.
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};
