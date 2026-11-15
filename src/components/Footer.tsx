import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Mail, Phone, MapPin, ExternalLink, CreditCard, Lock, Sparkles, CheckCircle2 } from 'lucide-react';

export const Footer: React.FC = () => {
  const { navigateTo } = useApp();

  return (
    <footer className="w-full bg-[#0D0D0D] border-t border-white/10 text-gray-400 text-xs mt-12 pb-16">
      <div className="max-w-md mx-auto px-5 py-8 space-y-7">
        
        {/* Brand identity & Compliance statement */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#FACC15] text-black font-black flex items-center justify-center text-sm shadow-md">
              UB
            </div>
            <div>
              <span className="text-white font-extrabold text-base tracking-tight block">
                Universal Band (UB)
              </span>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-semibold">
                Universal Band (Pty) Ltd • Events & Ticketing
              </span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            South Africa’s premier smart ticketing and cashless wristband platform. We power event access, online ticket sales, and cashless bar and vendor services for live festivals, nightlife venues, and luxury resorts.
          </p>
        </div>

        {/* 5 Compliance Links */}
        <div className="bg-black/60 rounded-2xl p-4 border border-white/5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#FACC15]">
              Customer & Legal Pages
            </span>
            <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
              Secure Verified
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => navigateTo('/about')}
              className="text-left py-1.5 px-2 rounded-lg text-gray-300 hover:text-[#FACC15] hover:bg-white/5 transition cursor-pointer flex items-center justify-between group"
            >
              <span>About Us</span>
              <span className="text-gray-600 group-hover:text-[#FACC15]">→</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/contact')}
              className="text-left py-1.5 px-2 rounded-lg text-gray-300 hover:text-[#FACC15] hover:bg-white/5 transition cursor-pointer flex items-center justify-between group"
            >
              <span>Contact Us</span>
              <span className="text-gray-600 group-hover:text-[#FACC15]">→</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/terms')}
              className="text-left py-1.5 px-2 rounded-lg text-gray-300 hover:text-[#FACC15] hover:bg-white/5 transition cursor-pointer flex items-center justify-between group"
            >
              <span>Terms & Conditions</span>
              <span className="text-gray-600 group-hover:text-[#FACC15]">→</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/privacy')}
              className="text-left py-1.5 px-2 rounded-lg text-gray-300 hover:text-[#FACC15] hover:bg-white/5 transition cursor-pointer flex items-center justify-between group"
            >
              <span>Privacy Policy</span>
              <span className="text-gray-600 group-hover:text-[#FACC15]">→</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/refund-policy')}
              className="col-span-2 text-left py-1.5 px-2 rounded-lg text-gray-300 hover:text-[#FACC15] hover:bg-white/5 transition cursor-pointer flex items-center justify-between group border-t border-white/5 pt-2"
            >
              <span className="text-[#FACC15] font-bold">Refund & Cancellation Policy</span>
              <span className="text-gray-600 group-hover:text-[#FACC15]">→</span>
            </button>
          </div>
        </div>

        {/* Contact details card for compliance review */}
        <div className="space-y-2 text-[11px] text-gray-400 bg-white/[0.02] p-3.5 rounded-2xl border border-white/5">
          <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
            Registered Merchant Support
          </span>
          <div className="flex items-center gap-2 text-gray-300">
            <Mail className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            <a href="mailto:Tetelophokwane90@gmail.com" className="hover:underline hover:text-white truncate">
              Tetelophokwane90@gmail.com
            </a>
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <Phone className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            <a href="tel:+27763046653" className="hover:underline hover:text-white">
              +27 76 304 6653
            </a>
          </div>
          <div className="flex items-start gap-2 text-gray-300">
            <MapPin className="w-3.5 h-3.5 text-[#FACC15] shrink-0 mt-0.5" />
            <span>890 Leeufontein , Marble Hall, 0459</span>
          </div>
        </div>

        {/* Security Badge */}
        <div className="pt-2 border-t border-white/10 flex flex-col items-center justify-center text-center gap-2">
          <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-full text-[10px] text-emerald-300 font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Payments Secured by Secure Gateway</span>
          </div>
          <p className="text-[10px] text-gray-500">
            © {new Date().getFullYear()} Universal Band (Pty) Ltd. All rights reserved. PCI-DSS Level 1 Certified.
          </p>
        </div>

      </div>
    </footer>
  );
};
