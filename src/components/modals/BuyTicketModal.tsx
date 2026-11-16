import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { formatEventDate, isEventExpired } from '../../utils/dateHelper';
import { getEventTicketStats } from '../../utils/eventTicketLimit';
import { getEventPayshapReference, isTopUpPayshapReference } from '../../utils/ticketStatus';
import {
  X,
  CreditCard,
  ShieldCheck,
  User,
  Phone,
  Plus,
  Minus,
  AlertCircle,
  Ticket as TicketIcon,
  Copy,
  Check,
  Smartphone,
  Banknote,
  CheckCircle2,
  Contact,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { pickRealContact } from '../../utils/nativePermissions';

export const BuyTicketModal: React.FC = () => {
  const {
    selectedBuyingEvent,
    setSelectedBuyingEvent,
    events,
    tickets,
    currentUser,
    buyTicket,
    buyTicketWithPayShap,
    tymebankPayshapNumber,
    setSelectedTicket,
    setActiveModal,
  } = useApp();

  const [paymentMode, setPaymentMode] = useState<'payshap' | 'wallet'>('payshap');
  const [fullName, setFullName] = useState<string>(currentUser.fullName || currentUser.name || '');
  const [phone, setPhone] = useState<string>(currentUser.phone || '');
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [copiedPhone, setCopiedPhone] = useState<boolean>(false);
  const [isManualRefEditing, setIsManualRefEditing] = useState<boolean>(false);
  const [manualPayshapRef, setManualPayshapRef] = useState<string>('');

  const liveEvent = useMemo(() => {
    if (!selectedBuyingEvent) return null;
    return events.find((e) => e.id === selectedBuyingEvent.id) || selectedBuyingEvent;
  }, [events, selectedBuyingEvent]);

  const ticketStats = useMemo(() => getEventTicketStats(liveEvent, tickets), [liveEvent, tickets]);

  const availableTiers = useMemo(() => {
    return ticketStats.availableTiers;
  }, [ticketStats]);

  const [selectedTierId, setSelectedTierId] = useState<string>(() => availableTiers[0]?.id || 'general');

  useEffect(() => {
    if (availableTiers.length > 0 && !availableTiers.some((t) => t.id === selectedTierId)) {
      setSelectedTierId(availableTiers[0].id);
    }
  }, [availableTiers, selectedTierId]);

  useEffect(() => {
    if (
      ticketStats.hasLimit &&
      ticketStats.remaining !== null &&
      ticketStats.remaining > 0 &&
      quantity > ticketStats.remaining
    ) {
      setQuantity(ticketStats.remaining);
    }
  }, [ticketStats.hasLimit, ticketStats.remaining, quantity]);

  useEffect(() => {
    if (liveEvent?.title) {
      setIsManualRefEditing(false);
      setManualPayshapRef(getEventPayshapReference(liveEvent.title));
    }
  }, [liveEvent?.id, liveEvent?.title]);

  if (!liveEvent) return null;

  const isExpired = isEventExpired(liveEvent);
  const isClosed = liveEvent.status === 'Closed';
  const isSoldOut = ticketStats.isSoldOut;
  const maxSelectableQty = ticketStats.hasLimit
    ? Math.min(10, Math.max(1, ticketStats.remaining ?? 0))
    : 10;

  const selectedTierObj = availableTiers.find((t) => t.id === selectedTierId) || availableTiers[0] || {
    id: 'general',
    name: 'General Admission',
    shortName: 'GENERAL',
    price: parseFloat(liveEvent.price.replace(/[^0-9.]/g, '')) || 0,
    formattedPrice: liveEvent.price || 'R0',
    badge: '🎟️ GENERAL',
  };

  const numericUnitPrice = selectedTierObj.price;
  const totalCost = numericUnitPrice * quantity;
  const balanceAfter = currentUser.walletBalance - totalCost;
  const purchaseBlocked = isExpired || isClosed || isSoldOut;

  // PayShap Reference Auto-Generation: "Universal Band - [Name of that Event]"
  const resolvedEventCode = (liveEvent.eventCode || liveEvent.title.replace(/\s+/g, '').slice(0, 6)).toUpperCase();
  const autoPayshapReference = getEventPayshapReference(liveEvent.title);
  const activePayshapReference =
    isManualRefEditing && manualPayshapRef.trim()
      ? manualPayshapRef.trim()
      : autoPayshapReference;

  const copyPayshapRef = () => {
    navigator.clipboard?.writeText(activePayshapReference);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2500);
  };

  const copyPayshapNumber = () => {
    navigator.clipboard?.writeText(tymebankPayshapNumber);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2500);
  };

  const handlePickFromContacts = async () => {
    const contact = await pickRealContact();
    if (!contact.granted || contact.cancelled) return;
    if (contact.name && !fullName.trim()) {
      setFullName(contact.name);
    }
    if (contact.phone) {
      setPhone(contact.phone);
    }
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isExpired) {
      setError('This event has already passed. Tickets are no longer available for purchase.');
      return;
    }
    if (isClosed) {
      setError('Ticket sales for this event are currently closed.');
      return;
    }
    if (isSoldOut) {
      setError('Sold Out! All tickets for this event have been sold.');
      return;
    }
    if (ticketStats.hasLimit && ticketStats.remaining !== null && quantity > ticketStats.remaining) {
      setError(`Only ${ticketStats.remaining} ticket(s) remaining for this event.`);
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter attendee full name.');
      return;
    }
    const cleanPhone = phone.replace(/\s+/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      setError('Please provide a valid attendee mobile phone number (min 9-10 digits).');
      return;
    }

    setLoading(true);
    setError(null);

    if (paymentMode === 'payshap') {
      if (isTopUpPayshapReference(activePayshapReference)) {
        setLoading(false);
        setError(`Event payment reference cannot be the Top Up reference. Use "${autoPayshapReference}".`);
        return;
      }
      // PayShap TymeBank flow
      const res = await buyTicketWithPayShap(liveEvent, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        quantity,
        ticketTier: selectedTierObj.name,
        tierPrice: selectedTierObj.formattedPrice,
        payshapReference: activePayshapReference,
      });

      setLoading(false);

      if (res.success && res.ticket) {
        setSelectedBuyingEvent(null);
        setSelectedTicket(res.ticket);
        setActiveModal('ticket-detail');
      } else if (res.error) {
        setError(res.error);
      }
    } else {
      // Regular wallet flow
      const res = await buyTicket(liveEvent, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        quantity,
        ticketTier: selectedTierObj.name,
        tierPrice: selectedTierObj.formattedPrice,
      });

      setLoading(false);

      if (res.success && res.ticket) {
        setSelectedBuyingEvent(null);
        setSelectedTicket(res.ticket);
        setActiveModal('ticket-detail');
      } else if (res.error) {
        setError(res.error);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1A1A1A] rounded-2xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={() => setSelectedBuyingEvent(null)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title & Badge */}
        <div className="flex items-center gap-2.5 mb-3.5">
          <div className="w-8 h-8 rounded-full bg-[#FACC15] flex items-center justify-center text-black font-black text-xs">
            UB
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Buy Event Ticket
            </h2>
            <p className="text-[11px] text-gray-400">PayShap Instant Transfer &amp; Pass</p>
          </div>
        </div>

        {/* Selected Event Card Preview */}
        <div className="bg-[#121212] rounded-2xl p-3.5 border border-white/5 mb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FACC15]">
              {liveEvent.title}
            </span>
            <span className="text-[9px] font-mono text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
              Code: {resolvedEventCode}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatEventDate(liveEvent.date)} • {liveEvent.location}
          </p>

          {/* Ticket Tier Selector */}
          <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2">
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
              Select Ticket Tier:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {availableTiers.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`p-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                    selectedTierId === tier.id
                      ? 'bg-[#FACC15] text-black border-[#FACC15] font-black shadow-md'
                      : 'bg-[#1E1E1E] text-white border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-tight truncate">
                      {tier.badge}
                    </span>
                    {tier.remaining <= 10 && tier.remaining > 0 && (
                      <span className="text-[9px] bg-rose-500/20 text-rose-300 font-bold px-1 rounded">
                        Only {tier.remaining} left!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-black">
                      {tier.formattedPrice}
                    </span>
                    <span className="text-[9px] opacity-75 font-mono">
                      {tier.soldCount}/{tier.maxLimit} sold
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Payment Method Selector: PayShap vs Wallet */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/60 rounded-xl border border-white/10 mb-3 text-xs">
          <button
            type="button"
            onClick={() => setPaymentMode('payshap')}
            className={`py-2 px-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              paymentMode === 'payshap'
                ? 'bg-[#FACC15] text-black font-black shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>PayShap Transfer</span>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMode('wallet')}
            className={`py-2 px-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              paymentMode === 'wallet'
                ? 'bg-[#FACC15] text-black font-black shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>NFC Wallet</span>
          </button>
        </div>

        {/* PAYSHAP INSTRUCTIONS BOX (When PayShap is selected) */}
        {paymentMode === 'payshap' ? (
          <div className="bg-[#121212] border border-[#FACC15]/40 rounded-xl p-3 mb-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#FACC15] font-black uppercase text-[10px]">TymeBank PayShap Details</span>
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Auto-SMS Confirmed
              </span>
            </div>

            {/* PayShap Cell / ID */}
            <div className="bg-black/60 p-2 rounded-lg border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[9px] text-gray-400 block font-semibold">TymeBank PayShap ID</span>
                <span className="font-mono font-bold text-white text-xs">{tymebankPayshapNumber}</span>
              </div>
              <button
                type="button"
                onClick={copyPayshapNumber}
                className="text-[10px] bg-white/10 hover:bg-white/20 text-gray-300 px-2 py-1 rounded transition flex items-center gap-1 cursor-pointer"
              >
                {copiedPhone ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPhone ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Auto-generated PayShap Reference ("Universal Band - [Event Name]") */}
            <div className="bg-black/60 p-2 rounded-lg border border-[#FACC15]/30 space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[9px] text-gray-400 font-semibold">PayShap Payment Reference</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isManualRefEditing) {
                        setIsManualRefEditing(false);
                        setManualPayshapRef(autoPayshapReference);
                      } else {
                        setManualPayshapRef(activePayshapReference);
                        setIsManualRefEditing(true);
                      }
                    }}
                    className="text-[10px] bg-white/10 hover:bg-white/20 text-gray-200 font-bold px-2 py-0.5 rounded transition flex items-center gap-1 cursor-pointer"
                    title={isManualRefEditing ? 'Reset to automatic event reference' : 'Edit reference manually as backup'}
                  >
                    {isManualRefEditing ? (
                      <>
                        <RotateCcw className="w-2.5 h-2.5 text-[#FACC15]" />
                        <span>Auto</span>
                      </>
                    ) : (
                      <>
                        <Pencil className="w-2.5 h-2.5 text-[#FACC15]" />
                        <span>Edit</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={copyPayshapRef}
                    className="text-[10px] bg-[#FACC15] text-black font-black px-2 py-0.5 rounded transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedRef ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedRef ? 'Copied' : 'Copy Ref'}</span>
                  </button>
                </div>
              </div>
              {isManualRefEditing ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={manualPayshapRef}
                    onChange={(e) => setManualPayshapRef(e.target.value)}
                    placeholder={autoPayshapReference}
                    className="w-full bg-[#121212] border border-[#FACC15]/60 focus:border-[#FACC15] rounded-lg px-2.5 py-1.5 text-xs font-mono font-black text-[#FACC15] focus:outline-none"
                  />
                  <p className="text-[9px] text-gray-400">
                    Manual backup active — tap &quot;Auto&quot; to restore <span className="text-[#FACC15] font-mono">{autoPayshapReference}</span>.
                  </p>
                </div>
              ) : (
                <div className="font-mono font-black text-sm text-[#FACC15] tracking-wide break-all">
                  {activePayshapReference}
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-400 leading-tight">
              Tapping Buy Ticket creates your pass as <strong className="text-amber-300">WAITING FOR PAYMENT</strong> and alerts the organizer. Approve the PayShap Request or pay via PayShap from <strong>ANY bank app</strong> — TymeBank SMS confirms it as <strong className="text-emerald-400">PAID ✅</strong> automatically!
            </p>
          </div>
        ) : (
          /* Wallet Balance Preview */
          <div className="bg-black/50 rounded-xl p-3 border border-white/5 mb-4 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-gray-400">
              <span>Wristband Balance:</span>
              <span className="font-bold text-white">R{currentUser.walletBalance.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-400">
              <span>Total ({quantity}x Pass{quantity > 1 ? 'es' : ''}):</span>
              <span className="font-bold text-red-400">-R{totalCost.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-white/10 font-bold text-white">
              <span>Balance After:</span>
              <span className={balanceAfter >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                R{balanceAfter.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 mb-3 bg-red-950/80 border border-red-500/30 rounded-xl text-red-200 text-xs">
            {error}
          </div>
        )}

        {/* Form: Full Name + Phone Number */}
        <form onSubmit={handlePurchase} className="space-y-3 text-xs">
          <div>
            <label className="block text-gray-300 font-semibold mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Attendee Full Name</span>
            </label>
            <input
              type="text"
              required
              disabled={purchaseBlocked}
              placeholder="e.g. Sipho Nkosi"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-white/10 focus:border-[#FACC15] focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-gray-300 font-semibold mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>Primary Mobile Phone</span>
              </span>
              <button
                type="button"
                disabled={purchaseBlocked}
                onClick={handlePickFromContacts}
                className="text-[10px] bg-white/10 hover:bg-white/20 text-[#FACC15] font-bold px-2 py-0.5 rounded-md transition inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Contact className="w-3 h-3" />
                <span>Pick Contact</span>
              </button>
            </label>
            <input
              type="tel"
              required
              disabled={purchaseBlocked}
              placeholder="e.g. 082 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-yellow-400/30 focus:border-[#FACC15] focus:outline-none font-mono disabled:opacity-50"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || (paymentMode === 'wallet' && balanceAfter < 0) || purchaseBlocked}
              className={`w-full font-extrabold py-3.5 rounded-xl transition flex items-center justify-center gap-2 text-xs cursor-pointer ${
                purchaseBlocked
                  ? 'bg-zinc-800 text-gray-500 border border-zinc-700 cursor-not-allowed opacity-60'
                  : 'bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black shadow-lg shadow-yellow-400/20 disabled:opacity-50'
              }`}
            >
              <CreditCard className="w-4 h-4 stroke-[2.5]" />
              <span>
                {loading
                  ? 'Creating Ticket...'
                  : paymentMode === 'payshap'
                  ? `Buy Ticket • R${totalCost.toFixed(2)}`
                  : `Confirm & Pay R${totalCost.toFixed(2)} with Wallet`}
              </span>
            </button>
          </div>
        </form>

        <div className="mt-3 text-center flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>PayShap payments verified automatically via TymeBank SMS</span>
        </div>
      </div>
    </div>
  );
};
export default BuyTicketModal;
