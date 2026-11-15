import React from 'react';
import { useApp } from '../../context/AppContext';
import { isEventExpired } from '../../utils/dateHelper';
import { X, Ticket as TicketIcon, Calendar, MapPin, Clock, History, CheckCircle2 } from 'lucide-react';

export const TicketHistoryModal: React.FC = () => {
  const { tickets, activeModal, setActiveModal, setSelectedTicket } = useApp();

  if (activeModal !== 'ticket-history') return null;

  // Filter expired / past / billed tickets for ticket history
  const historyTickets = tickets.filter((t) => {
    return (
      isEventExpired(t) ||
      t.status === 'expired' ||
      t.status === 'billed' ||
      (t.status as string) === 'Billed' ||
      t.isBilled ||
      t.isEventOver
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1A1A1A] rounded-2xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={() => setActiveModal(null)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-[#C9A86A]/20 flex items-center justify-center text-[#C9A86A]">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Ticket History
            </h2>
            <p className="text-[11px] text-gray-400">
              Expired & past event passes ({historyTickets.length})
            </p>
          </div>
        </div>

        {/* Ticket List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {historyTickets.length === 0 ? (
            <div className="py-12 px-4 text-center bg-[#121212] rounded-2xl border border-white/5 space-y-2">
              <History className="w-8 h-8 text-gray-500 mx-auto" />
              <p className="text-sm font-bold text-white">No Ticket History Yet</p>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                Tickets will appear here automatically once their event date has passed or concluded.
              </p>
            </div>
          ) : (
            historyTickets.map((t) => (
              <div
                key={t.id}
                onClick={() => {
                  setSelectedTicket(t);
                  setActiveModal('ticket-detail');
                }}
                className="bg-[#121212] p-3.5 rounded-2xl border border-white/5 hover:border-[#C9A86A]/40 transition cursor-pointer flex items-center justify-between group shadow"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-950/80 text-amber-300 font-extrabold text-[9px] uppercase px-2 py-0.5 rounded-md border border-amber-500/30">
                      {t.status === 'billed' || t.isBilled ? '🧾 Billed' : '⏰ Expired / Past'}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      #{t.ticketId || t.bandCode}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white group-hover:text-[#FACC15] transition-colors">
                    {t.eventTitle || t.eventName}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1 text-gray-300">
                      <Calendar className="w-3 h-3 text-[#C9A86A]" />
                      {t.eventDate || t.event_date}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-gray-300 truncate max-w-[150px]">
                      <MapPin className="w-3 h-3 text-gray-500" />
                      {t.eventLocation || t.storeName}
                    </span>
                  </div>
                </div>

                <div className="text-right pl-2">
                  <span className="text-xs font-black text-[#C9A86A] block">
                    {t.price}
                  </span>
                  <span className="text-[10px] text-gray-500 block mt-1">
                    {t.ticketTier || 'Pass'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-white/10 text-center text-[10px] text-gray-400">
          Saved securely in your Universal Band account history
        </div>
      </div>
    </div>
  );
};
