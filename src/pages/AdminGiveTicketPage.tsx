import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Gift,
  MapPin,
  Phone,
  ShieldCheck,
  Ticket as TicketIcon,
  User,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Ticket } from '../types';
import { getEventTicketStats } from '../utils/eventTicketLimit';

export const AdminGiveTicketPage: React.FC = () => {
  const {
    events,
    tickets,
    navigateTo,
    adminIssueBackupTicket,
    setSelectedTicket,
    setActiveModal,
  } = useApp();

  const [selectedEventId, setSelectedEventId] = useState<string>(() => events[0]?.id || '');
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [issuing, setIssuing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedTicket, setIssuedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || events[0] || null,
    [events, selectedEventId]
  );

  const availableTiers = useMemo(() => {
    if (!selectedEvent) return [];
    return getEventTicketStats(selectedEvent, tickets).availableTiers;
  }, [selectedEvent, tickets]);

  useEffect(() => {
    if (availableTiers.length > 0) {
      if (!availableTiers.some((t) => t.id === selectedTierId)) {
        setSelectedTierId(availableTiers[0].id);
      }
    } else {
      setSelectedTierId('');
    }
  }, [availableTiers, selectedTierId]);

  const selectedTierObj =
    availableTiers.find((t) => t.id === selectedTierId) || availableTiers[0] || null;

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIssuedTicket(null);

    if (!selectedEvent) {
      setError('Please select an event.');
      return;
    }
    if (!recipientName.trim() || recipientName.trim().length < 2) {
      setError('Please enter the recipient full name.');
      return;
    }
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      setError('Please enter a valid recipient mobile phone number.');
      return;
    }

    setIssuing(true);
    try {
      const res = await adminIssueBackupTicket(selectedEvent, {
        fullName: recipientName.trim(),
        phone: recipientPhone.trim(),
        quantity,
        ticketTier: selectedTierObj?.name || 'General',
        tierPrice: selectedTierObj?.formattedPrice || selectedEvent.price || 'R0',
      });

      if (res.success && res.ticket) {
        setIssuedTicket(res.ticket);
        setRecipientName('');
        setRecipientPhone('');
        setQuantity(1);
      } else {
        setError(res.error || 'Could not issue backup ticket.');
      }
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="pb-24 pt-4 px-2 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo('/profile')}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back</span>
        </button>
        <span className="text-xs font-black text-[#FACC15] uppercase tracking-wider">
          Admin Backup Ticket
        </span>
      </div>

      <div className="bg-[#161616] border border-[#FACC15]/30 rounded-2xl p-4 space-y-1.5">
        <h1 className="text-lg font-black text-white flex items-center gap-2">
          <Gift className="w-5 h-5 text-[#FACC15]" />
          <span>Give Ticket (Admin Backup)</span>
        </h1>
        <p className="text-xs text-gray-400">
          Issue a <strong className="text-emerald-400">PAID &amp; VALID</strong> ticket for any event and any tier (Early Bird, VIP, General, etc.) directly to a customer as an admin backup.
        </p>
      </div>

      {issuedTicket && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-300 font-black text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Backup Ticket Issued &amp; Marked PAID</span>
          </div>
          <div className="bg-black/40 border border-white/10 rounded-xl p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Pass Code:</span>
              <span className="font-mono font-black text-[#FACC15]">{issuedTicket.bandCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Event:</span>
              <span className="font-bold text-white truncate max-w-[190px]">{issuedTicket.eventTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tier:</span>
              <span className="font-bold text-[#FACC15]">{issuedTicket.ticketTier} × {issuedTicket.quantity || 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Recipient:</span>
              <span className="font-bold text-white">{issuedTicket.attendeeName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Phone:</span>
              <span className="font-mono text-gray-200">{issuedTicket.attendeePhone}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedTicket(issuedTicket);
              setActiveModal('ticket-detail');
            }}
            className="w-full min-h-[44px] bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <TicketIcon className="w-4 h-4" />
            <span>Open Ticket Pass</span>
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 text-center text-xs text-gray-400">
          No events found yet. Create an event first to issue backup tickets.
        </div>
      ) : (
        <form
          onSubmit={handleIssue}
          className="bg-[#161616] border border-white/10 rounded-2xl p-4 space-y-4"
        >
          {/* 1. Choose Event */}
          <div>
            <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              1. Select Event
            </label>
            <select
              value={selectedEvent?.id || ''}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full min-h-[46px] bg-black/60 border border-white/15 focus:border-[#FACC15] rounded-xl px-3.5 text-sm font-bold text-white outline-none"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id} className="bg-[#161616] text-white">
                  {ev.title} ({ev.date})
                </option>
              ))}
            </select>
            {selectedEvent && (
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#FACC15]" />
                  {selectedEvent.date}
                </span>
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 text-[#FACC15]" />
                  {selectedEvent.location}
                </span>
              </div>
            )}
          </div>

          {/* 2. Choose Ticket Tier (Early Bird, VIP, General, etc.) */}
          <div>
            <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              2. Select Ticket Tier
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableTiers.map((tier) => {
                const active = selectedTierObj?.id === tier.id;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      active
                        ? 'bg-[#FACC15] text-black border-[#FACC15] shadow-md'
                        : 'bg-black/40 text-white border-white/15 hover:border-[#FACC15]/50'
                    }`}
                  >
                    <div className="text-[11px] font-black uppercase tracking-wide truncate">
                      {tier.name}
                    </div>
                    <div className={`text-sm font-black mt-0.5 ${active ? 'text-black' : 'text-[#FACC15]'}`}>
                      {tier.formattedPrice}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Recipient Full Name */}
          <div>
            <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              3. Recipient Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g. Thabo Matlala"
                className="w-full min-h-[46px] bg-black/50 border border-white/15 focus:border-[#FACC15] rounded-xl pl-10 pr-3.5 text-sm text-white outline-none"
              />
            </div>
          </div>

          {/* 4. Recipient Mobile Phone */}
          <div>
            <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              4. Recipient Mobile Phone
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="e.g. 0781234567"
                className="w-full min-h-[46px] bg-black/50 border border-white/15 focus:border-[#FACC15] rounded-xl pl-10 pr-3.5 text-sm text-white outline-none"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              If this phone number belongs to a registered user, the ticket will automatically appear in their My Tickets page.
            </p>
          </div>

          {/* 5. Quantity */}
          <div className="flex items-center justify-between bg-black/40 border border-white/10 rounded-xl p-3">
            <span className="text-xs font-bold text-gray-300">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white font-black text-base cursor-pointer"
              >
                -
              </button>
              <span className="text-base font-black text-[#FACC15] w-6 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white font-black text-base cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={issuing}
            className="w-full min-h-[48px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black font-black text-sm rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
            <span>
              {issuing
                ? 'Issuing Backup Ticket...'
                : `Give ${selectedTierObj?.name || 'Ticket'} (Mark as PAID)`}
            </span>
          </button>
        </form>
      )}
    </div>
  );
};

export default AdminGiveTicketPage;
