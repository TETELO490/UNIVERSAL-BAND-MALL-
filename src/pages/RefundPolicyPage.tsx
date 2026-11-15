import React from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, RotateCcw, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Footer } from '../components/Footer';

export const RefundPolicyPage: React.FC = () => {
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
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-yellow-400 bg-yellow-400/10 px-2.5 py-1 rounded-full border border-yellow-400/20 inline-block">
              Card & CPA Policy
            </span>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Refund & Cancellation Policy
            </h1>
            <p className="text-xs text-gray-400 leading-relaxed">
              Clear guidelines on ticket cancellations, event postponements, and cashless wristband balance refunds.
            </p>
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 space-y-6 text-xs text-gray-300 leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>1. Event Cancellation by Organizer</span>
              </h2>
              <p>
                If an event is cancelled in its entirety by the event organizer or venue and is not rescheduled, ticket purchasers are entitled to a <strong>100% full refund</strong> of the face value of the ticket. Refunds are credited back to the original payment method (card or bank account via secure gateway) within 5 to 7 business days.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>2. Event Postponement or Date Rescheduling</span>
              </h2>
              <p>
                In the event that an event is postponed or rescheduled to a new date, your original ticket pass remains automatically valid for the rescheduled date. If you are unable to attend on the rescheduled date, you may request a refund by emailing <a href="mailto:Tetelophokwane90@gmail.com" className="text-[#FACC15] underline">Tetelophokwane90@gmail.com</a> within 14 days of the postponement announcement.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>3. Voluntary Ticket Cancellations & CPA Cooling-off</span>
              </h2>
              <p>
                Under Section 16 & 17 of the South African Consumer Protection Act (CPA):
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-400">
                <li>Cancellations requested more than 14 days prior to event date are eligible for a refund less a reasonable administration fee of up to 15%.</li>
                <li>Cancellations requested within 7 days of the event date may not be refundable as organizers commit venue, security, and staging resources.</li>
                <li>In cases of proven hospitalization or death of the attendee or immediate family, a full refund will be provided upon presentation of verification.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>4. Unused Cashless Wristband Balances</span>
              </h2>
              <p>
                If you top up your Universal Band cashless wristband with credit and have unused funds remaining after the event, you can request an electronic payout to your South African bank account within 30 days following the event conclusion via our support portal.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 text-[#FACC15]">
                <span>5. How to Request a Refund</span>
              </h2>
              <p>
                To initiate a refund request, send an email to <a href="mailto:Tetelophokwane90@gmail.com" className="text-[#FACC15] underline">Tetelophokwane90@gmail.com</a> with:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-400">
                <li>Your Ticket ID or Transaction Reference (e.g. UB-84729)</li>
                <li>The email address used during purchase</li>
                <li>Reason for refund request</li>
              </ul>
              <p className="text-[11px] text-gray-400 mt-2">
                Our support desk processes refund queries within 48 hours. Direct hotline: +27 76 304 6653.
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};
