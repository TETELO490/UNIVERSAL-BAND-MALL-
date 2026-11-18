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
} from 'lucide-react';
import { maskPhoneNumber } from '../utils/attendanceService';
import { isEventExpired } from '../utils/dateHelper';
import { isTicketWaitingPayment, isTicketPaid } from '../utils/ticketStatus';
import {
  doesUserPersonallyOwnTicket,
  getRoleScopedTickets,
  isUserVerifiedAdminSession,
} from '../utils/legacyCleanup';
import { normalizePhoneDigits } from '../utils/customerQr';

export const TicketsPage: React.FC = () => {
  const {
    tickets,
    mallOrders,
    stores,
    events,
    currentUser,
    navigateTo,
    setSelectedTicket,
    setActiveModal,
    openEventFoodPreorder,
  } = useApp();
  const [activeTab, setActiveTab] = useState<'active' | 'billed'>('active');

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isOrganizerRole =
    roleLower === 'promoter' ||
    roleLower === 'event organiser' ||
    roleLower === 'organizer' ||
    roleLower === 'seller' ||
    roleLower === 'vendor' ||
    roleLower === 'store manager' ||
    roleLower === 'manager';
  const isVerifiedAdmin = isUserVerifiedAdminSession(currentUser);

  // Strictly scope tickets by user role & ownership (zero legacy/stranger leakage)
  const scopedTickets = useMemo(() => {
    return getRoleScopedTickets({ tickets, currentUser, events, stores });
  }, [tickets, currentUser, events, stores]);

  // Split tickets: Active (valid or in-use today, excluding expired) vs Billed
  const { activeTickets, billedTickets } = useMemo(() => {
    const active: TicketType[] = [];
    const billed: TicketType[] = [];

    for (const t of scopedTickets) {
      const expired = isEventExpired(t) || t.status === 'expired';
      if (t.status === 'billed' || (t.status as string) === 'Billed' || t.isBilled || expired) {
        billed.push(t);
      } else {
        active.push(t);
      }
    }
    return { activeTickets: active, billedTickets: billed };
  }, [scopedTickets]);

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
            {isVerifiedAdmin ? 'All Event Tickets' : isOrganizerRole ? 'My Event Tickets' : 'My Tickets'}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isOrganizerRole
              ? 'Tickets purchased for your events & your personal passes'
              : 'Universal Band wristband passes & itemized event billing'}
          </p>
        </div>
        <span className="bg-[#FACC15] text-black font-extrabold text-xs px-2.5 py-1 rounded-full shadow-sm">
          {scopedTickets.length} Total
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
            {activeTab === 'active'
              ? isOrganizerRole
                ? 'No Ticket Sales Yet'
                : 'No Active Tickets'
              : 'No Settled Bills Yet'}
          </h3>
          <p className="text-gray-400 text-xs mb-5">
            {activeTab === 'active'
              ? isOrganizerRole
                ? 'When someone buys a ticket for your event, it will appear here automatically.'
                : 'You do not have any pending or upcoming event passes.'
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
            const isPersonalTicket = doesUserPersonallyOwnTicket(ticket, currentUser);

            const tPhoneDigits = normalizePhoneDigits(ticket.attendeePhone || ticket.customerPhone || '');
            const linkedPreorderOrder =
              mallOrders.find(
                (o) =>
                  o.status !== 'cancelled' &&
                  (o.id === ticket.preorderOrderId ||
                    (ticket.eventId &&
                      o.eventId === ticket.eventId &&
                      ((ticket.userId && o.customerId === ticket.userId) ||
                        (ticket.customerQrId && o.customerQrId === ticket.customerQrId) ||
                        (tPhoneDigits.length >= 7 && normalizePhoneDigits(o.customerPhone) === tPhoneDigits))))
              ) || null;
            const resolvedPreorderSummary =
              ticket.preorderSummary ||
              (linkedPreorderOrder
                ? linkedPreorderOrder.items.map((it) => `${it.quantity}× ${it.name}`).join(', ')
                : '');
            const hasResolvedPreorder = Boolean(ticket.hasFoodPreorder || resolvedPreorderSummary);

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
                className={`bg-[#161619] rounded-3xl border overflow-hidden shadow-2xl transition-all duration-200 cursor-pointer group ${
                  isBilled
                    ? 'border-yellow-500/30 hover:border-yellow-400/60 bg-gradient-to-b from-[#1E1A10] to-[#161619]'
                    : isUsed
                    ? 'border-blue-500/30 hover:border-blue-400/60'
                    : 'border-white/10 hover:border-[#FACC15]/50'
                }`}
              >
                {/* Top Band Header */}
                <div
                  className={`px-5 py-3.5 border-b border-white/5 flex items-center justify-between ${
                    isBilled
                      ? 'bg-gradient-to-r from-yellow-950/60 via-zinc-900 to-[#161619]'
                      : isUsed
                      ? 'bg-gradient-to-r from-blue-950/60 via-zinc-900 to-[#161619]'
                      : 'bg-gradient-to-r from-yellow-500/15 via-zinc-900 to-[#161619]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-[#FACC15] flex items-center justify-center text-black font-black text-xs shadow-md">
                      UB
                    </div>
                    <span className="text-xs font-mono tracking-wider text-gray-200 font-extrabold">
                      {ticket.bandCode || ticket.ticketId}
                    </span>
                    {isOrganizerRole && (
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          doesUserPersonallyOwnTicket(ticket, currentUser)
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        }`}
                      >
                        {doesUserPersonallyOwnTicket(ticket, currentUser) ? 'My Pass' : 'Event Sale'}
                      </span>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-1.5">
                    {isTicketWaitingPayment(ticket) ? (
                      <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">
                        <Clock className="w-3 h-3" />
                        <span>WAITING FOR PAYMENT</span>
                      </span>
                    ) : isTicketPaid(ticket) ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>PAID ✅</span>
                      </span>
                    ) : isBilled ? (
                      <span className="inline-flex items-center gap-1 bg-yellow-400/20 text-[#FACC15] border border-yellow-400/40 text-[10px] font-extrabold px-3 py-1 rounded-full shadow-sm">
                        <Receipt className="w-3 h-3" />
                        <span>BILLED</span>
                      </span>
                    ) : isUsed ? (
                      <span className="inline-flex items-center gap-1 bg-blue-950/80 text-blue-400 border border-blue-500/40 text-[10px] font-bold px-3 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        <span>USED</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold px-3 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{ticket.status}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Ticket Info Content */}
                <div className="p-5 space-y-4">
                  {/* Event Name & Price Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg sm:text-xl font-black text-white tracking-tight group-hover:text-yellow-300 transition-colors leading-snug">
                        {ticket.eventTitle || ticket.eventName}
                      </h3>
                      <p className="text-xs text-gray-300 font-semibold mt-1 flex items-center gap-1.5">
                        <span className="text-white font-bold">{ticket.attendeeName || ticket.customerName}</span>
                        {(ticket.attendeePhone || ticket.customerPhone) && (
                          <>
                            <span className="text-gray-500">•</span>
                            <span className="font-mono text-gray-300">{maskPhoneNumber(ticket.attendeePhone || ticket.customerPhone || '')}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="text-base sm:text-lg font-black text-[#FACC15] shrink-0 tabular-nums">
                      {ticket.price}
                    </span>
                  </div>

                  {/* Date & Location Rows */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                      <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-[#FACC15]">
                        <Calendar className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-white">{ticket.eventDate || 'Event Day'}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-300 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-[#FACC15]">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-white truncate">{ticketLocation}</span>
                    </div>
                  </div>

                  {/* Waiting Payment Info Bar */}
                  {isTicketWaitingPayment(ticket) && (
                    <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-amber-300 flex items-center gap-2">
                      <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                      <span className="leading-snug">
                        {ticket.payshapRequestSent
                          ? 'Request Sent - Waiting for customer approval in bank app'
                          : 'Waiting for Payment · Approve PayShap or transfer to confirm'}
                      </span>
                    </div>
                  )}

                  {/* Food Pre-Order Section */}
                  {!isBilled && (
                    <div>
                      {hasResolvedPreorder ? (
                        <div className="bg-purple-950/60 border border-purple-500/40 rounded-2xl p-3 text-xs flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Utensils className="w-4 h-4 text-purple-400 shrink-0" />
                            <span className="text-white font-bold truncate">
                              {isPersonalTicket ? 'Food Pre-Ordered:' : 'Customer Food Pre-Ordered:'} {resolvedPreorderSummary}
                            </span>
                          </div>
                          <span className="text-[10px] font-black uppercase bg-emerald-500 text-black px-2 py-0.5 rounded-full shrink-0">
                            Paid
                          </span>
                        </div>
                      ) : !isPersonalTicket ? (
                        <div className="w-full bg-zinc-900/80 border border-white/10 text-gray-300 font-semibold text-xs rounded-2xl py-2.5 px-3 flex items-center gap-2">
                          <Utensils className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>Customer has not placed a food pre-order yet</span>
                        </div>
                      ) : isTicketWaitingPayment(ticket) ? (
                        <div className="w-full bg-zinc-900/80 border border-white/10 text-amber-300 font-bold text-xs rounded-2xl py-2.5 px-3 flex items-center justify-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Food pre-orders unlock after payment approval</span>
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
                          className="w-full min-h-[46px] bg-gradient-to-r from-[#FACC15] via-amber-400 to-yellow-500 hover:brightness-110 active:scale-[0.99] text-black font-black text-xs sm:text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer border border-yellow-300 py-3"
                        >
                          <Utensils className="w-4 h-4 text-black stroke-[2.5]" />
                          <span>Pre-Order Food & Menu 🍔🥤</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Billed Itemized Tag if migrated */}
                  {isBilled && (
                    <div className="p-3 rounded-2xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-yellow-300">
                        <Receipt className="w-4 h-4 text-[#FACC15]" />
                        <span>Moved to EveryCent Bill Ledger</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateTo('/every-cent');
                        }}
                        className="text-xs font-black text-[#FACC15] hover:text-white flex items-center gap-1 underline cursor-pointer"
                      >
                        <span>View Statement</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Perforated / Dashed Divider Line */}
                  <div className="relative my-4 flex items-center">
                    <div className="w-3.5 h-7 bg-[#0A0A0A] rounded-r-full -ml-5" />
                    <div className="flex-1 border-t-2 border-dashed border-zinc-700/80 mx-2" />
                    <div className="w-3.5 h-7 bg-[#0A0A0A] rounded-l-full -mr-5" />
                  </div>

                  {/* Bottom Pass Actions */}
                  <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                    <div className="flex items-center gap-2 text-gray-300 min-w-0">
                      {isBilled ? (
                        <span className="font-medium text-yellow-500/90">
                          Settled Financial Receipt
                        </span>
                      ) : isTicketWaitingPayment(ticket) ? (
                        <span className="font-semibold text-amber-300 truncate">
                          Pass Locked • Awaiting Payment Approval
                        </span>
                      ) : isUsed ? (
                        <span className="font-semibold text-gray-400 truncate">
                          Single-Use Pass Redeemed
                        </span>
                      ) : (
                        <>
                          <Radio className="w-4 h-4 text-[#FACC15] animate-pulse shrink-0" />
                          <span className="font-semibold text-gray-200 truncate">
                            NFC Band Linked • Tap at Gate
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 font-bold text-[#FACC15] group-hover:translate-x-0.5 transition-transform shrink-0">
                      <TicketIcon className="w-4 h-4" />
                      <span>
                        {isBilled
                          ? 'View Receipt'
                          : isTicketWaitingPayment(ticket)
                          ? 'View Payment Instructions'
                          : 'View Pass · Use Profile QR'}
                      </span>
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

export default TicketsPage;
