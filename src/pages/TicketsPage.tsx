import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Ticket as TicketType } from '../types';
import {
  Calendar,
  MapPin,
  Radio,
  Sparkles,
  Ticket as TicketIcon,
  ChevronRight,
  Receipt,
  Clock,
  ArrowRight,
  CheckCircle2,
  PieChart,
  Utensils,
  Unlock,
} from 'lucide-react';
import { maskPhoneNumber } from '../utils/attendanceService';
import { isEventExpired } from '../utils/dateHelper';
import { isTicketWaitingPayment, isTicketPaid } from '../utils/ticketStatus';

export const TicketsPage: React.FC = () => {
  const { tickets, stores, events, navigateTo, setSelectedTicket, setActiveModal, openEventFoodPreorder } = useApp();
  const [activeTab, setActiveTab] = useState<'active' | 'billed'>('active');

  // Split tickets: Active (valid or in-use today, excluding expired) vs Billed
  const { activeTickets, billedTickets } = useMemo(() => {
    const active: TicketType[] = [];
    const billed: TicketType[] = [];

    for (const t of tickets) {
      const expired = isEventExpired(t) || t.status === 'expired';
      if (t.status === 'billed' || (t.status as string) === 'Billed' || t.isBilled || expired) {
        // Expired and billed tickets go to account ticket history, not active normal tickets page
        billed.push(t);
      } else {
        active.push(t);
      }
    }
    return { activeTickets: active, billedTickets: billed };
  }, [tickets]);

  const handleTicketClick = (ticket: TicketType) => {
    setSelectedTicket(ticket);
    setActiveModal('ticket-detail');
  };

  const displayedTickets = activeTab === 'active' ? activeTickets : billedTickets;

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            My Tickets
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Universal Band wristband passes & itemized event billing
          </p>
        </div>
        <span className="bg-[#FACC15] text-black font-extrabold text-xs px-2.5 py-1 rounded-full shadow-sm">
          {tickets.length} Total
        </span>
      </div>

      {/* Tabs: Active Passes vs Moved to Bill */}
      <div className="flex bg-[#141414] p-1 rounded-2xl border border-white/10 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'active'
              ? 'bg-[#FACC15] text-black shadow-md'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <TicketIcon className="w-3.5 h-3.5" />
          <span>Active Passes</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1 ${
              activeTab === 'active' ? 'bg-black text-[#FACC15]' : 'bg-white/10 text-gray-400'
            }`}
          >
            {activeTickets.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('billed')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'billed'
              ? 'bg-[#FACC15] text-black shadow-md'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Moved to Bill</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1 ${
              activeTab === 'billed' ? 'bg-black text-[#FACC15]' : 'bg-white/10 text-gray-400'
            }`}
          >
            {billedTickets.length}
          </span>
        </button>
      </div>

      {/* Owner Midnight Policy Notice */}
      <div className="bg-gradient-to-r from-amber-950/40 via-[#1A1A1A] to-amber-950/40 border border-yellow-500/20 rounded-2xl p-3 mb-4 space-y-2">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-yellow-400/20 text-[#FACC15] flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 text-[11px] leading-snug">
            <span className="font-bold text-[#FACC15] block">
              Automated 00:00 Midnight Rule
            </span>
            <span className="text-gray-300">
              When an event finishes and midnight strikes, all used passes automatically leave active tickets and migrate to your EveryCent Bill.
            </span>
          </div>
        </div>
      </div>

      {/* Ticket List Rendering */}
      {displayedTickets.length === 0 ? (
        <div className="bg-[#1A1A1A] rounded-2xl p-8 border border-white/5 text-center shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 mx-auto mb-3">
            {activeTab === 'active' ? (
              <TicketIcon className="w-7 h-7" />
            ) : (
              <Receipt className="w-7 h-7 text-[#FACC15]" />
            )}
          </div>
          <h3 className="text-white font-bold text-base mb-1">
            {activeTab === 'active' ? 'No Active Tickets' : 'No Settled Bills Yet'}
          </h3>
          <p className="text-gray-400 text-xs mb-5">
            {activeTab === 'active'
              ? 'You do not have any pending or upcoming event passes.'
              : 'Used tickets will move here automatically at 00:00 midnight once the event concludes.'}
          </p>
          {activeTab === 'active' ? (
            <button
              onClick={() => navigateTo('/')}
              className="bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold px-5 py-2.5 rounded-xl text-xs transition inline-flex items-center gap-1.5 shadow-md shadow-yellow-400/20 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Discover Events</span>
            </button>
          ) : (
            <button
              onClick={() => navigateTo('/every-cent')}
              className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2 rounded-xl text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <PieChart className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Go to EveryCent Spending Statement</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedTickets.map((ticket, index) => {
            const isBilled = ticket.status === 'billed' || (ticket.status as string) === 'Billed' || ticket.isBilled;
            const isUsed = ticket.status === 'used' || (ticket.status as string) === 'Used';

            const ticketLocation =
              ticket.eventLocation?.trim() ||
              stores.find((s) => s.id === ticket.storeId)?.location ||
              events.find((e) => e.id === ticket.eventId)?.location ||
              ticket.storeName ||
              'Venue Location';

            return (
              <div
                key={ticket.id || index}
                onClick={() => handleTicketClick(ticket)}
                className={`bg-[#1A1A1A] rounded-2xl border overflow-hidden shadow-xl transition-all duration-200 cursor-pointer group ${
                  isBilled
                    ? 'border-yellow-500/30 hover:border-yellow-400/60 bg-gradient-to-b from-[#1E1A10] to-[#141414]'
                    : isUsed
                    ? 'border-blue-500/30 hover:border-blue-400/60'
                    : 'border-white/10 hover:border-[#FACC15]/40'
                }`}
              >
                {/* Top Band Header */}
                <div
                  className={`p-4 border-b border-white/5 flex items-center justify-between ${
                    isBilled
                      ? 'bg-gradient-to-r from-yellow-950/60 via-zinc-900 to-black'
                      : isUsed
                      ? 'bg-gradient-to-r from-blue-950/60 via-zinc-900 to-black'
                      : 'bg-gradient-to-r from-yellow-500/20 via-zinc-900 to-black'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#FACC15] flex items-center justify-center text-black font-black text-[10px]">
                      UB
                    </div>
                    <span className="text-[11px] font-mono tracking-wider text-gray-300 font-semibold">
                      {ticket.bandCode}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-1.5">
                    {isTicketWaitingPayment(ticket) ? (
                      <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" />
                        <span>WAITING FOR PAYMENT</span>
                      </span>
                    ) : isTicketPaid(ticket) ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Ticket Confirmed - PAID ✅</span>
                      </span>
                    ) : isBilled ? (
                      <span className="inline-flex items-center gap-1 bg-yellow-400/20 text-[#FACC15] border border-yellow-400/40 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm">
                        <Receipt className="w-3 h-3" />
                        <span>BILLED AT MIDNIGHT</span>
                      </span>
                    ) : isUsed ? (
                      <span className="inline-flex items-center gap-1 bg-blue-950/80 text-blue-400 border border-blue-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        Used (Moves at 00:00)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {ticket.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Ticket Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-yellow-300 transition-colors">
                        {ticket.eventTitle || ticket.eventName}
                      </h3>
                      <p className="text-[11px] font-mono text-[#FACC15] mt-0.5">
                        {ticket.attendeeName || ticket.customerName}
                        {(ticket.attendeePhone || ticket.customerPhone) &&
                          ` • ${maskPhoneNumber(ticket.attendeePhone || ticket.customerPhone || '')}`}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <div className="flex items-center gap-1 text-gray-300">
                          <Calendar className="w-3.5 h-3.5 text-[#FACC15]" />
                          <span>{ticket.eventDate}</span>
                        </div>
                      </div>

                      {/* Event Location - Prominently Visible on Ticket Card */}
                      <div className="mt-2.5 inline-flex items-center gap-1.5 bg-[#FACC15]/10 border border-[#FACC15]/30 rounded-xl px-2.5 py-1 text-xs max-w-full">
                        <MapPin className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                        <span className="text-[10px] text-[#FACC15] font-black uppercase tracking-wider shrink-0">
                          Location:
                        </span>
                        <span className="text-xs font-black text-white truncate">
                          {ticketLocation}
                        </span>
                      </div>

                      {isTicketWaitingPayment(ticket) && (
                        <div className="mt-2 bg-amber-950/50 border border-amber-500/40 rounded-xl px-2.5 py-2 text-[11px] font-bold text-amber-300">
                          {ticket.payshapRequestSent
                            ? 'Request Sent - Waiting for customer to approve in their bank app'
                            : 'WAITING FOR PAYMENT · Approve PayShap request or transfer to confirm'}
                        </div>
                      )}

                      {/* MODE 2: EVENT FOOD PRE-ORDER BADGE / UNLOCK BUTTON */}
                      {!isBilled && (
                        <div className="mt-2.5">
                          {ticket.hasFoodPreorder || ticket.preorderSummary ? (
                            <div className="bg-purple-950/60 border border-purple-500/40 rounded-xl p-2 text-[11px] flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Utensils className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span className="text-white font-bold truncate">
                                  Food Pre-Ordered: {ticket.preorderSummary}
                                </span>
                              </div>
                              <span className="text-[9px] font-black uppercase bg-emerald-500 text-black px-1.5 py-0.2 rounded shrink-0">
                                Paid
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const ev = events.find((item) => item.id === ticket.eventId) || {
                                  id: ticket.eventId || 'evt_1',
                                  title: ticket.eventTitle || 'Event',
                                  date: ticket.eventDate || 'Event Day',
                                  location: ticketLocation,
                                  price: ticket.price || 'R0',
                                  imageUrl: '',
                                  status: 'Open',
                                  category: 'Events',
                                  storeId: ticket.storeId || '',
                                };
                                openEventFoodPreorder(ev as any);
                              }}
                              className="w-full py-2.5 px-3 bg-gradient-to-r from-[#FACC15] via-amber-400 to-yellow-500 hover:brightness-110 active:scale-95 text-black font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer border border-yellow-300"
                            >
                              <Utensils className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                              <span>Pre-Order Food & Menu 🍔🥤</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-[#FACC15] font-black text-base shrink-0">
                      {ticket.price}
                    </span>
                  </div>

                  {/* Billed itemized tag if migrated */}
                  {isBilled && (
                    <div className="mt-3 p-2.5 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2 text-yellow-300">
                        <Receipt className="w-3.5 h-3.5 text-[#FACC15]" />
                        <span>Moved to EveryCent Bill Ledger</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateTo('/every-cent');
                        }}
                        className="text-[10px] font-black text-[#FACC15] hover:text-white flex items-center gap-0.5 underline cursor-pointer"
                      >
                        <span>View Statement</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Perforated divider */}
                  <div className="relative my-4 flex items-center">
                    <div className="w-3 h-6 bg-[#0A0A0A] rounded-r-full -ml-4" />
                    <div className="flex-1 border-t-2 border-dashed border-zinc-800 mx-2" />
                    <div className="w-3 h-6 bg-[#0A0A0A] rounded-l-full -mr-4" />
                  </div>

                  {/* Bottom pass actions */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 text-gray-400 text-xs">
                      {isBilled ? (
                        <span className="text-[11px] font-medium text-yellow-500/80">
                          Settled Financial Receipt
                        </span>
                      ) : (
                        <>
                          <Radio className="w-3.5 h-3.5 text-[#FACC15] animate-pulse" />
                          <span className="text-[11px] font-medium">
                            NFC Band Linked • Tap at Gate
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs font-bold text-[#FACC15] group-hover:translate-x-0.5 transition-transform">
                      <TicketIcon className="w-4 h-4" />
                      <span>{isBilled ? 'View Receipt' : 'View Pass · Use Profile QR'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
