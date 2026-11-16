import React from 'react';
import { Volume2, XOctagon, ArrowRight, MessageSquareText, Ticket as TicketIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const PaymentAlarmOverlay: React.FC = () => {
  const {
    activePaymentAlarm,
    dismissPaymentAlarm,
    activeBuyTicketAlarm,
    dismissBuyTicketAlarm,
    navigateTo,
    setActiveModal,
  } = useApp();

  if (!activePaymentAlarm && !activeBuyTicketAlarm) return null;

  const handleStopAndOpenApproval = async () => {
    await dismissPaymentAlarm();
    setActiveModal(null);
    navigateTo('/admin/live-payments');
  };

  if (activePaymentAlarm) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="payment-alarm-title"
        className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md bg-[#161618] border-2 border-[#FACC15] rounded-3xl p-6 shadow-2xl space-y-5">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-[#FACC15] text-black flex items-center justify-center shadow-lg animate-bounce">
              <Volume2 className="w-9 h-9 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-rose-400">
                Bank SMS Detected
              </p>
              <h2
                id="payment-alarm-title"
                className="text-2xl font-black text-white tracking-tight"
              >
                PAYMENT RECEIVED - Check SMS
              </h2>
            </div>
          </div>

          <div className="bg-black/70 border border-[#FACC15]/40 rounded-2xl p-4 text-center space-y-1">
            <div className="text-3xl font-black text-[#FACC15] font-mono tabular-nums">
              {activePaymentAlarm.amount}
            </div>
            <div className="text-sm font-bold text-white">
              from {activePaymentAlarm.customer}
            </div>
          </div>

          {activePaymentAlarm.rawSms && (
            <div className="bg-black/50 border border-white/10 rounded-2xl p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                <MessageSquareText className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>Real SMS Message</span>
              </div>
              <p className="font-mono text-xs text-gray-200 break-words leading-relaxed">
                {activePaymentAlarm.rawSms}
              </p>
            </div>
          )}

          <p className="text-xs text-center text-gray-300 leading-relaxed">
            Tickets stay <span className="font-bold text-amber-300">WAITING FOR PAYMENT</span> until you verify the SMS and approve manually.
          </p>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => void dismissPaymentAlarm()}
              className="w-full min-h-[52px] bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-xl cursor-pointer transition"
            >
              <XOctagon className="w-5 h-5 stroke-[2.5]" />
              <span>STOP / DISMISS ALARM</span>
            </button>

            <button
              type="button"
              onClick={() => void handleStopAndOpenApproval()}
              className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-black text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <span>Open Payment Approval</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ticket-alarm-title"
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-[#161618] border-2 border-[#FACC15] rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-[#FACC15] text-black flex items-center justify-center shadow-lg animate-bounce">
            <TicketIcon className="w-9 h-9 stroke-[2.5]" />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              Admin Ticket Purchase Alert
            </p>
            <h2
              id="ticket-alarm-title"
              className="text-2xl font-black text-white tracking-tight"
            >
              NEW TICKET BOUGHT
            </h2>
          </div>
        </div>

        <div className="bg-black/70 border border-[#FACC15]/40 rounded-2xl p-4 text-center space-y-1">
          <div className="text-2xl font-black text-[#FACC15]">
            {activeBuyTicketAlarm?.price}
          </div>
          <div className="text-sm font-bold text-white">
            {activeBuyTicketAlarm?.customer}
          </div>
          <div className="text-xs text-gray-300">
            {activeBuyTicketAlarm?.eventTitle} • {activeBuyTicketAlarm?.tier}
          </div>
        </div>

        <button
          type="button"
          onClick={() => dismissBuyTicketAlarm()}
          className="w-full min-h-[52px] bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-xl cursor-pointer transition"
        >
          <XOctagon className="w-5 h-5 stroke-[2.5]" />
          <span>STOP / DISMISS ALARM</span>
        </button>
      </div>
    </div>
  );
};
