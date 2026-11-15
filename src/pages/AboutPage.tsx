import React from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, ShieldCheck, Ticket, Users, Zap, CheckCircle2, Building, Sparkles } from 'lucide-react';
import { Footer } from '../components/Footer';

export const AboutPage: React.FC = () => {
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
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FACC15] bg-[#FACC15]/10 px-2.5 py-1 rounded-full border border-[#FACC15]/20 inline-block">
              About Universal Band (Pty) Ltd
            </span>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Powering South Africa's Premier Live Events & Ticketing
            </h1>
            <p className="text-sm text-gray-400 leading-relaxed">
              Universal Band (UB) is a modern South African event ticketing and smart cashless solutions company headquartered in Polokwane, Limpopo.
            </p>
          </div>

          {/* Mission Card */}
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#FACC15] text-black font-black flex items-center justify-center">
              <Zap className="w-5 h-5 stroke-[2.5]" />
            </div>
            <h2 className="text-base font-bold text-white">Our Mission</h2>
            <p className="text-xs text-gray-300 leading-relaxed">
              We eliminate gate congestion, ticket fraud, and long bar queues. By pairing online secure card ticket purchasing with high-speed NFC wristband credentials, attendees experience fast 1-second check-in and instantaneous tap-and-pay cashless convenience.
            </p>
          </div>

          {/* What We Offer */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider text-gray-300">
              What Universal Band Does
            </h2>

            <div className="grid gap-3">
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex gap-3.5 items-start">
                <Ticket className="w-5 h-5 text-[#FACC15] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white">Verified Event Tickets in ZAR</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Direct online ticket sales for live music concerts, festivals, day parties, and lifestyle venues with instant digital QR passes.
                  </p>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex gap-3.5 items-start">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white">Smart Wristband Gate Entry</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    NFC-enabled wristband checkpoints that prevent counterfeit tickets and allow smooth entry even during peak arrival hours.
                  </p>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex gap-3.5 items-start">
                <Building className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white">Venue & Food Stall Integration</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Official partnerships with venues like Florence Palm and Mphela Resort to facilitate pre-ordering and safe cashless bar transactions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Company Details */}
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 space-y-3 text-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#FACC15]">
              Company Information
            </h2>
            <div className="space-y-2 text-gray-300 text-[11px]">
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400">Legal Entity:</span>
                <span className="font-bold text-white">Universal Band (Pty) Ltd</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400">Jurisdiction:</span>
                <span className="font-bold text-white">Republic of South Africa</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400">Head Office:</span>
                <span className="font-bold text-white text-right">Polokwane, Limpopo</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-400">Payment Processing:</span>
                <span className="font-bold text-emerald-400">Secure Payment Provider (Pty) Ltd</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Support Email:</span>
                <span className="font-bold text-white">Tetelophokwane90@gmail.com</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};
