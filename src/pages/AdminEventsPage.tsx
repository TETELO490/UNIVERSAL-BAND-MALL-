import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import {
  Calendar,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ShieldCheck,
  Search,
  Clock,
  ArrowLeft,
  X,
  Ticket as TicketIcon,
  Send,
} from 'lucide-react';
import { TymebankSmsModal } from '../components/modals/TymebankSmsModal';
import { SendPayshapRequestModal } from '../components/modals/SendPayshapRequestModal';
import { EventItem, Ticket } from '../types';
import { isTicketWaitingPayment, isTicketPaid } from '../utils/ticketStatus';

export const AdminEventsPage: React.FC = () => {
  const {
    currentUser,
    events,
    tickets,
    addNewEvent,
    updateEvent,
    deleteEvent,
    markPayshapRequestSent,
    navigateTo,
    tymebankPayshapNumber,
    tymebankSmsLogs,
    setActiveModal,
  } = useApp();

  const roleLower = (currentUser?.role || '').toLowerCase();
  const has5LocksPassed =
    typeof window !== 'undefined' &&
    sessionStorage.getItem('ub_admin_5locks_passed') === 'true' &&
    localStorage.getItem('ub_admin_session') === 'true';

  const isAdmin =
    has5LocksPassed &&
    (roleLower === 'admin' ||
      isAuthorizedAdminEmail(currentUser?.email) ||
      localStorage.getItem('ub_admin_session') === 'true');

  const [isSmsModalOpen, setIsSmsModalOpen] = useState<boolean>(false);
  const [selectedPayshapTicket, setSelectedPayshapTicket] = useState<Ticket | null>(null);
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [editingTargetEvent, setEditingTargetEvent] = useState<EventItem | null>(null);

  // Form states
  const [eventName, setEventName] = useState<string>('');
  const [eventDate, setEventDate] = useState<string>('');
  const [eventCode, setEventCode] = useState<string>('');
  const [generalPrice, setGeneralPrice] = useState<string>('');
  const [vipPrice, setVipPrice] = useState<string>('');
  const [kidsPrice, setKidsPrice] = useState<string>('');
  const [eventLocation, setEventLocation] = useState<string>('Pretoria Venue');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Deletion state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const openCreateModal = () => {
    setEditingTargetEvent(null);
    setEventName('');
    setEventDate('');
    setEventCode('');
    setGeneralPrice('');
    setVipPrice('');
    setKidsPrice('');
    setEventLocation('Pretoria Venue');
    setFormError(null);
    setShowEventModal(true);
  };

  const openEditModal = (ev: EventItem) => {
    setEditingTargetEvent(ev);
    setEventName(ev.title || '');
    setEventDate(ev.date || '');
    setEventCode(ev.eventCode || '');
    const cleanNum = (v: any) => {
      const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
      return !isNaN(n) && n > 0 ? String(n) : '';
    };
    setGeneralPrice(cleanNum(ev.generalPrice) || cleanNum(ev.price) || '');
    setVipPrice(cleanNum(ev.vipPrice));
    setKidsPrice(cleanNum(ev.kidsPrice));
    setEventLocation(ev.location || 'Pretoria Venue');
    setFormError(null);
    setShowEventModal(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!eventName.trim()) {
      setFormError('Please enter the event name.');
      return;
    }
    if (!eventDate.trim()) {
      setFormError('Please enter the event date (e.g. 20 Nov 2026).');
      return;
    }
    const cleanCode = eventCode.trim().replace(/\s+/g, '').toUpperCase();
    if (!cleanCode) {
      setFormError('Please enter an event code with no spaces (e.g. JAZZ20).');
      return;
    }
    const genNum = parseFloat(generalPrice.replace(/[^0-9.]/g, ''));
    if (isNaN(genNum) || genNum <= 0) {
      setFormError('Please enter a valid general ticket price for this event.');
      return;
    }
    const vipNum = parseFloat(vipPrice.replace(/[^0-9.]/g, ''));
    const kidsNum = parseFloat(kidsPrice.replace(/[^0-9.]/g, ''));

    setIsSubmitting(true);

    if (editingTargetEvent) {
      const ok = await updateEvent(editingTargetEvent.id, {
        title: eventName.trim(),
        date: eventDate.trim(),
        eventCode: cleanCode,
        generalPrice: genNum,
        price: `R${genNum}`,
        vipPrice: !isNaN(vipNum) && vipNum > 0 ? vipNum : 0,
        kidsPrice: !isNaN(kidsNum) && kidsNum > 0 ? kidsNum : 0,
        location: eventLocation.trim() || 'Pretoria Venue',
      });
      setIsSubmitting(false);
      if (ok) {
        setSuccessMsg(`Event "${eventName}" updated successfully!`);
        setShowEventModal(false);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setFormError('Failed to update event. Please try again.');
      }
    } else {
      const ok = await addNewEvent({
        title: eventName.trim(),
        date: eventDate.trim(),
        eventCode: cleanCode,
        generalPrice: genNum,
        price: `R${genNum}`,
        vipPrice: !isNaN(vipNum) && vipNum > 0 ? vipNum : 0,
        kidsPrice: !isNaN(kidsNum) && kidsNum > 0 ? kidsNum : 0,
        location: eventLocation.trim() || 'Pretoria Venue',
        storeId: '',
        category: 'Events',
        status: 'Open',
        imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
      });
      setIsSubmitting(false);
      if (ok) {
        setSuccessMsg(`Event "${eventName}" created successfully!`);
        setShowEventModal(false);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setFormError('Failed to save event. Please check inputs.');
      }
    }
  };

  const filteredEvents = useMemo(() => {
    if (!searchFilter.trim()) return events;
    const q = searchFilter.toLowerCase().trim();
    return events.filter(
      (ev) =>
        ev.title.toLowerCase().includes(q) ||
        (ev.eventCode && ev.eventCode.toLowerCase().includes(q)) ||
        ev.date.toLowerCase().includes(q)
    );
  }, [events, searchFilter]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white p-6 flex flex-col items-center justify-center text-center">
        <ShieldCheck className="w-16 h-16 text-rose-500 mb-3" />
        <h2 className="text-xl font-bold">Admin Access Required</h2>
        <p className="text-gray-400 text-sm mt-1 max-w-sm mb-4">
          This events and PayShap payment confirmation dashboard is restricted to administrator accounts.
        </p>
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="bg-[#FACC15] text-black font-black px-5 py-2.5 rounded-xl text-xs"
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-32 pt-4 px-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 transition cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Events Dashboard</span>
            </h1>
            <p className="text-xs text-gray-400">Events, ticket prices &amp; PayShap payments</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSmsModalOpen(true)}
          className="bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer active:scale-95"
          title="TymeBank SMS Reader"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          <span>PayShap SMS</span>
        </button>
      </div>

      {/* PayShap TymeBank Info Banner */}
      <div className="bg-[#141414] border border-white/10 rounded-2xl p-3 mb-4 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-gray-400 font-bold uppercase block">Your TymeBank PayShap ID</span>
          <span className="text-sm font-black font-mono text-[#FACC15]">{tymebankPayshapNumber}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">Customers pay here via PayShap from ANY bank.</span>
        </div>
        <button
          type="button"
          onClick={() => setIsSmsModalOpen(true)}
          className="text-xs text-[#FACC15] hover:underline font-bold px-2 py-1 cursor-pointer"
        >
          Configure
        </button>
      </div>

      {/* Actions Bar: Create Event & Search */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={openCreateModal}
          className="flex-1 bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-yellow-400/20 transition cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>CREATE NEW EVENT</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Search events by name or code (e.g. JAZZ20)..."
          className="w-full bg-[#141414] text-white text-xs pl-9 pr-3 py-2.5 rounded-xl border border-white/10 focus:border-[#FACC15] focus:outline-none"
        />
        {searchFilter && (
          <button
            type="button"
            onClick={() => setSearchFilter('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Events List */}
      <div className="space-y-4">
        {filteredEvents.length === 0 ? (
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-8 text-center text-gray-400 text-xs">
            <Calendar className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="font-bold text-white mb-1">No events found</p>
            <p className="text-[11px] text-gray-500 mb-3">Press &quot;CREATE NEW EVENT&quot; to add your first event.</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="bg-[#FACC15] text-black font-black px-4 py-2 rounded-xl text-xs"
            >
              + Create Event
            </button>
          </div>
        ) : (
          filteredEvents.map((ev) => {
            const genPriceVal = parseFloat(String(ev.generalPrice || ev.price || '0').replace(/[^0-9.]/g, '')) || 0;
            const vipPriceVal = parseFloat(String(ev.vipPrice || '0').replace(/[^0-9.]/g, '')) || 0;
            const kidsPriceVal = parseFloat(String(ev.kidsPrice || '0').replace(/[^0-9.]/g, '')) || 0;
            const evCode = ev.eventCode || ev.title.replace(/\s+/g, '').slice(0, 6).toUpperCase();

            // Find all tickets for this event
            const eventTickets = tickets.filter((t) => t.eventId === ev.id);
            const paidTickets = eventTickets.filter(isTicketPaid);
            const pendingTickets = eventTickets.filter(isTicketWaitingPayment);

            return (
              <div
                key={ev.id}
                className="bg-[#141414] border border-white/10 rounded-2xl p-4 shadow-xl space-y-3"
              >
                {/* Event Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-black text-white">{ev.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#FACC15]" />
                        <span>{ev.date}</span>
                      </span>
                      <span>•</span>
                      <span className="font-mono font-bold text-[#FACC15] bg-[#FACC15]/10 px-1.5 py-0.5 rounded border border-[#FACC15]/30">
                        Code: {evCode}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(ev)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer"
                      title="Edit Event & Prices"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(ev.id)}
                      className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900 border border-rose-500/30 text-rose-400 hover:text-rose-200 transition cursor-pointer"
                      title="Delete Event"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Delete Confirmation Box */}
                {confirmDeleteId === ev.id && (
                  <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl space-y-2">
                    <p className="text-xs text-rose-200 font-bold">
                      Delete event &quot;{ev.title}&quot; permanently?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteEvent(ev.id);
                          setConfirmDeleteId(null);
                        }}
                        className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black py-1.5 rounded-lg text-xs cursor-pointer"
                      >
                        Yes, Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 bg-white/10 hover:bg-white/20 text-gray-300 font-bold py-1.5 rounded-lg text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Event Prices Grid */}
                <div className="grid grid-cols-3 gap-2 bg-black/40 p-2.5 rounded-xl border border-white/5 text-center">
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">General</span>
                    <span className="text-xs font-black text-white font-mono">
                      {genPriceVal > 0 ? `R${genPriceVal}` : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">VIP</span>
                    <span className="text-xs font-black text-[#FACC15] font-mono">
                      {vipPriceVal > 0 ? `R${vipPriceVal}` : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">Kids</span>
                    <span className="text-xs font-black text-emerald-400 font-mono">
                      {kidsPriceVal > 0 ? `R${kidsPriceVal}` : 'Not set'}
                    </span>
                  </div>
                </div>

                {/* CONFIRMED PAYMENTS INSIDE THAT EVENT (Requirement 11) */}
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Confirmed Payments ({paidTickets.length})</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-bold">TymeBank SMS Verified</span>
                  </div>

                  {paidTickets.length === 0 ? (
                    <div className="bg-black/30 p-2 rounded-xl text-center text-gray-500 text-[11px]">
                      No confirmed PayShap payments yet for this event.
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {paidTickets.map((t) => {
                        const priceClean = t.price.replace(/[^0-9.]/g, '') || String(genPriceVal);
                        return (
                          <div
                            key={t.id}
                            className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2 text-xs flex items-center justify-between"
                          >
                            <span className="font-bold text-emerald-300">
                              ✅ {t.customerName || t.attendeeName} - {t.ticketTier || 'General'} - PAID - R{priceClean} - {ev.title} {ev.date}
                            </span>
                            <span className="text-[9px] font-mono text-gray-400 shrink-0 ml-1">
                              {t.ticketId || t.id}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* WAITING FOR PAYMENT Tickets */}
                  {pendingTickets.length > 0 && (
                    <div className="pt-1.5 space-y-2">
                      <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>WAITING FOR PAYMENT ({pendingTickets.length}):</span>
                      </span>
                      {pendingTickets.map((pt) => (
                        <div
                          key={pt.id}
                          className="bg-amber-950/35 border border-amber-500/40 rounded-xl p-2.5 text-xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-bold text-white block truncate">
                                {pt.attendeeName || pt.customerName} · {pt.ticketTier || 'General'}
                              </span>
                              <span className="text-[11px] font-mono text-gray-300 block">
                                {pt.attendeePhone || pt.customerPhone || 'No phone'} · Ref: {pt.payshapReference}
                              </span>
                            </div>
                            <span className="text-xs font-black text-[#FACC15] font-mono shrink-0 tabular-nums">
                              {pt.price}
                            </span>
                          </div>

                          {pt.payshapRequestSent && (
                            <div className="bg-amber-500/15 border border-amber-400/40 rounded-lg px-2 py-1 text-[10px] font-bold text-amber-200">
                              Request Sent - Waiting for customer to approve in their bank app
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedPayshapTicket(pt)}
                            className="w-full min-h-[44px] bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                          >
                            <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Send PayShap Request to Customer</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE / EDIT EVENT MODAL */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141414] border border-white/15 rounded-3xl max-w-sm w-full p-5 text-white shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowEventModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-xl bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-black text-white mb-0.5">
              {editingTargetEvent ? 'Edit Event & Ticket Prices' : 'Create New Event'}
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Set event code and individual ticket prices
            </p>

            {formError && (
              <div className="mb-3 p-2.5 bg-rose-950/80 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEvent} className="space-y-3 text-xs">
              {/* Event Name */}
              <div>
                <label className="block text-gray-300 font-bold mb-1">
                  Event Name <span className="text-[#FACC15]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jazz Night"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full bg-[#1C1C1C] text-white p-2.5 rounded-xl border border-white/15 focus:border-[#FACC15] focus:outline-none"
                />
              </div>

              {/* Event Date */}
              <div>
                <label className="block text-gray-300 font-bold mb-1">
                  Event Date <span className="text-[#FACC15]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 20 Nov 2026"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-[#1C1C1C] text-white p-2.5 rounded-xl border border-white/15 focus:border-[#FACC15] focus:outline-none"
                />
              </div>

              {/* Event Code */}
              <div>
                <label className="block text-gray-300 font-bold mb-1">
                  Event Code (Short code, no spaces) <span className="text-[#FACC15]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. JAZZ20"
                  value={eventCode}
                  onChange={(e) => setEventCode(e.target.value.replace(/\s+/g, '').toUpperCase())}
                  className="w-full bg-[#1C1C1C] text-white p-2.5 rounded-xl border border-white/15 focus:border-[#FACC15] focus:outline-none font-mono font-bold uppercase"
                />
                <span className="text-[10px] text-gray-400 mt-0.5 block">
                  PayShap Reference auto-fills as: Universal Band - {eventName.trim() || 'Mamelodi Music Fest'}
                </span>
              </div>

              {/* Ticket Prices for THIS event */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <span className="text-[11px] font-black uppercase text-[#FACC15] tracking-wider block">
                  Ticket Prices for THIS Event
                </span>

                <div>
                  <label className="block text-gray-300 font-semibold mb-1">
                    🎟️ General Ticket Price (ZAR) <span className="text-[#FACC15]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 60"
                    value={generalPrice}
                    onChange={(e) => setGeneralPrice(e.target.value)}
                    className="w-full bg-[#1C1C1C] text-white p-2 rounded-xl border border-white/15 focus:border-[#FACC15] focus:outline-none font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-300 font-semibold mb-1">
                      ⭐ VIP Price (ZAR)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 150 (Optional)"
                      value={vipPrice}
                      onChange={(e) => setVipPrice(e.target.value)}
                      className="w-full bg-[#1C1C1C] text-white p-2 rounded-xl border border-white/15 focus:border-[#FACC15] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 font-semibold mb-1">
                      👶 Kids Price (ZAR)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 30 (Optional)"
                      value={kidsPrice}
                      onChange={(e) => setKidsPrice(e.target.value)}
                      className="w-full bg-[#1C1C1C] text-white p-2 rounded-xl border border-white/15 focus:border-[#FACC15] focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#FACC15] hover:bg-yellow-400 text-black font-black py-3 rounded-xl transition shadow-lg shadow-yellow-400/20 cursor-pointer disabled:opacity-50 text-xs"
                >
                  {isSubmitting ? 'Saving Event...' : 'SAVE EVENT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TYMEBANK SMS MODAL */}
      <TymebankSmsModal
        isOpen={isSmsModalOpen}
        onClose={() => setIsSmsModalOpen(false)}
      />

      {/* SEND PAYSHAP REQUEST MODAL */}
      <SendPayshapRequestModal
        ticket={
          selectedPayshapTicket
            ? tickets.find((t) => t.id === selectedPayshapTicket.id) || selectedPayshapTicket
            : null
        }
        onClose={() => setSelectedPayshapTicket(null)}
        onMarkRequestSent={markPayshapRequestSent}
      />
    </div>
  );
};

export default AdminEventsPage;
