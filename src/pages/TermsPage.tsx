import React from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Scale, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';
import { Footer } from '../components/Footer';

export const TermsPage: React.FC = () => {
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
              Legal Agreement
            </span>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Terms & Conditions
            </h1>
            <p className="text-xs text-gray-400 leading-relaxed">
              Last updated: October 2026 • Governed under the Laws of the Republic of South Africa.
            </p>
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 space-y-6 text-xs text-gray-300 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>1. Agreement & Acceptance</span>
              </h2>
              <p>
                By accessing <strong>Universal Band (UB)</strong>, purchasing event passes, or topping up a cashless wristband, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the service.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>2. Ticket Sales & Currency</span>
              </h2>
              <p>
                All ticket prices on Universal Band are denominated and processed in <strong>South African Rands (ZAR)</strong>. Payments are processed securely via <strong>secure payment gateways</strong>. Once payment is confirmed, an electronic ticket QR pass is issued to the buyer’s registered account.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>3. Smart NFC Wristbands</span>
              </h2>
              <p>
                Certain events require linking your digital pass to a physical NFC Universal Band at the event gate. Wristbands are non-transferable once activated on-site and must be worn securely for the duration of the event.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>4. Cashless Wallet & Top-ups</span>
              </h2>
              <p>
                Universal Band cashless wallet credits are valid exclusively for purchases (food, drinks, merchandise) at participating partner venues and festival vendors. Wallet funds are not credit facility accounts and do not accrue interest.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>5. Event Admission & Age Restrictions</span>
              </h2>
              <p>
                Event organizers and venue managers reserve the right of admission. For events serving alcohol, attendees must be 18 years or older with valid South African National ID, Smart Card, or Passport in accordance with the National Liquor Act.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>6. Limitation of Liability</span>
              </h2>
              <p>
                Universal Band acts as the ticketing and cashless payment facilitator. We are not liable for artist lineup changes, weather conditions, or organizer schedule modifications, except as provided under the Consumer Protection Act (CPA).
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>7. Contact for Legal Notices</span>
              </h2>
              <p>
                For legal inquiries, contact Universal Band (Pty) Ltd at <a href="mailto:Tetelophokwane90@gmail.com" className="text-[#FACC15] underline">Tetelophokwane90@gmail.com</a> or call +27 76 304 6653.
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};
