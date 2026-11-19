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
import {
  buildSnapScanUrl,
  getPublicSnapCode,
  openSnapScanLink,
  recordSnapScanOrder,
  recordSnapScanRetryAttempt,
} from '../../utils/snapscanHelper';

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
    supportedBanks,
    setSelectedTicket,
    setActiveModal,
  } = useApp();

  const [paymentMode, setPaymentMode] = useState<'payshap' | 'snapscan' | 'wallet'>('payshap');
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [snapScanResult, setSnapScanResult] = useState<{
    orderDocId: string;
    orderNumber: string;
    totalRands: number;
    pressedPayLabel: string;
    attempts: string[];
    snapUrl: string;
  } | null>(null);
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
      if (!selectedBank.trim()) {
        setLoading(false);
        setError('Please select which bank or account you will use to approve the payment request.');
        return;
      }
      // PayShap Payment Request flow
      const res = await buyTicketWithPayShap(liveEvent, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        quantity,
        ticketTier: selectedTierObj.name,
        tierPrice: selectedTierObj.formattedPrice,
        payshapReference: activePayshapReference,
        selectedBank: selectedBank.trim(),
      });

      setLoading(false);

      if (res.success && res.ticket) {
        setSelectedBuyingEvent(null);
        setSelectedTicket(res.ticket);
        setActiveModal('ticket-detail');
      } else if (res.error) {
        setError(res.error);
      }
    } else if (paymentMode === 'snapscan') {
      // SnapScan Payment flow with Order Number + exact Pressed PAY at HH:MM
      const snapRecord = await recordSnapScanOrder({
        totalRands: totalCost,
        storeId: liveEvent.storeId || '',
        storeName: liveEvent.title,
        customerName: fullName.trim(),
        customerPhone: phone.trim(),
      });

      await buyTicketWithPayShap(liveEvent, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        quantity,
        ticketTier: selectedTierObj.name,
        tierPrice: selectedTierObj.formattedPrice,
        payshapReference: `${snapRecord.orderNumber} (${snapRecord.pressedPayLabel})`,
        selectedBank: 'SnapScan',
      });

      const snapCode = await getPublicSnapCode();
      if (!snapCode) {
        setLoading(false);
        setError('SnapScan is not configured yet. Please ask the admin to save the SnapCode in Admin Settings.');
        return;
      }

      const snapUrl = buildSnapScanUrl(totalCost, snapRecord.orderNumber, snapCode);
      openSnapScanLink(snapUrl);

      setLoading(false);
      setSnapScanResult({
        orderDocId: snapRecord.id,
        orderNumber: snapRecord.orderNumber,
        totalRands: totalCost,
        pressedPayLabel: snapRecord.pressedPayLabel,
        attempts: snapRecord.attempts || [snapRecord.pressedPayTime],
        snapUrl,
      });
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

  if (snapScanResult) {
    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#1A1A1A] rounded-2xl border border-[#FACC15]/40 p-6 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FACC15]/15 border border-[#FACC15]/40 text-[#FACC15] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <div className="text-3xl font-black tracking-tight text-[#FACC15]">
                {snapScanResult.orderNumber}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(snapScanResult.orderNumber);
                  setCopiedRef(true);
                  setTimeout(() => setCopiedRef(false), 2000);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-bold text-white flex items-center gap-1 cursor-pointer"
                title="Copy Order Number"
              >
                {copiedRef ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#FACC15]" />}
                <span>{copiedRef ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <h2 className="text-lg font-black text-white">
              Payment is under review
            </h2>
            <p className="text-xs font-bold text-gray-300">
              Total: <strong className="text-white">R{snapScanResult.totalRands.toFixed(2)}</strong> •{' '}
              <span className="text-amber-300">{snapScanResult.pressedPayLabel}</span>
            </p>
            {snapScanResult.attempts.length > 0 && (
              <div className="pt-1 flex flex-wrap items-center justify-center gap-1.5">
                {snapScanResult.attempts.map((t, i) => (
                  <span
                    key={`ticket-att-${i}`}
                    className="text-[10px] font-mono font-bold text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-2 py-0.5 rounded-lg"
                  >
                    Attempt #{i + 1} · {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                const hhmm = await recordSnapScanRetryAttempt(snapScanResult.orderDocId);
                setSnapScanResult((prev) =>
                  prev
                    ? {
                        ...prev,
                        pressedPayLabel: `Pressed PAY at ${hhmm}`,
                        attempts: [...prev.attempts, hhmm],
                      }
                    : prev
                );
                openSnapScanLink(snapScanResult.snapUrl);
              }}
              className="w-full min-h-[46px] bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>PAY AGAIN / Retry Payment • R{snapScanResult.totalRands.toFixed(2)}</span>
            </button>
            <p className="text-[11px] text-gray-300 leading-snug px-1">
              You do NOT need to install SnapScan. You can pay with Card on the next page.
            </p>
            <a
              href={snapScanResult.snapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[42px] bg-white/5 hover:bg-white/10 border border-[#FACC15]/40 text-[#FACC15] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
            >
              <span>Open Payment Page Again</span>
            </a>
            <button
              type="button"
              onClick={() => {
                setSnapScanResult(null);
                setSelectedBuyingEvent(null);
              }}
              className="w-full min-h-[44px] bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

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

        {/* Payment Method Selector: PayShap vs SnapScan vs Wallet */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-black/60 rounded-xl border border-white/10 mb-3 text-[11px]">
          <button
            type="button"
            onClick={() => setPaymentMode('payshap')}
            className={`py-2 px-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              paymentMode === 'payshap'
                ? 'bg-[#FACC15] text-black font-black shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">PayShap</span>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMode('snapscan')}
            className={`py-2 px-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              paymentMode === 'snapscan'
                ? 'bg-[#FACC15] text-black font-black shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">SnapScan</span>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMode('wallet')}
            className={`py-2 px-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              paymentMode === 'wallet'
                ? 'bg-[#FACC15] text-black font-black shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Banknote className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Wallet</span>
          </button>
        </div>

        {/* SNAPSCAN PAYMENT BOX (When SnapScan is selected) */}
        {paymentMode === 'snapscan' && (
          <div className="bg-[#121212] border border-[#FACC15]/40 rounded-xl p-3 mb-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#FACC15] font-black uppercase text-[10px]">Pay with SnapScan</span>
              <span className="text-sm font-black text-white font-mono">R{totalCost.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-gray-300 leading-snug">
              Tapping <strong className="text-[#FACC15]">Pay with SnapScan</strong> opens SnapScan with the locked amount of <strong className="text-white">R{totalCost.toFixed(2)}</strong> and records your Order Number &amp; exact time.
            </p>
          </div>
        )}

        {/* PAYSHAP PAYMENT REQUEST BOX (When PayShap is selected) */}
        {paymentMode === 'payshap' && (
          <div className="bg-[#121212] border border-[#FACC15]/40 rounded-xl p-3 mb-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#FACC15] font-black uppercase text-[10px]">PayShap Payment Request</span>
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Approve in Your Bank App
              </span>
            </div>

            {/* Customer Bank / Account Selector */}
            <div className="bg-black/60 p-2.5 rounded-lg border border-[#FACC15]/30 space-y-1.5">
              <label
                htmlFor="buy-ticket-bank-select"
                className="text-[10px] text-gray-300 font-bold block"
              >
                Choose Your Bank / Account to Approve Payment
              </label>
              <select
                id="buy-ticket-bank-select"
                value={selectedBank}
                onChange={(e) => {
                  setSelectedBank(e.target.value);
                  if (error) setError(null);
                }}
                className={`w-full min-h-[40px] bg-[#121212] border rounded-lg px-2.5 py-2 text-xs font-bold focus:outline-none cursor-pointer ${
                  selectedBank
                    ? 'border-emerald-500/60 text-white focus:border-[#FACC15]'
                    : 'border-amber-500/60 text-amber-200 focus:border-[#FACC15]'
                }`}
              >
                <option value="" disabled>
                  -- Choose your bank / account --
                </option>
                {supportedBanks.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
              {!selectedBank && (
                <p className="text-[10px] text-amber-300 font-semibold">
                  You must choose your bank above before you can buy a ticket.
                </p>
              )}
            </div>

            <p className="text-[10px] text-gray-300 leading-snug">
              Tapping Buy Ticket creates your pass as <strong className="text-amber-300">WAITING FOR PAYMENT</strong>. Wait for a payment request from us, then open your <strong className="text-[#FACC15]">{selectedBank || 'banking'}</strong> app and approve it. Once approved, your ticket is marked <strong className="text-emerald-400">PAID ✅</strong>.
            </p>
          </div>
        )}

        {/* Wallet Balance Preview (When Wallet is selected) */}
        {paymentMode === 'wallet' && (
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
              disabled={
                loading ||
                (paymentMode === 'payshap' && !selectedBank.trim()) ||
                (paymentMode === 'wallet' && balanceAfter < 0) ||
                purchaseBlocked
              }
              className={`w-full font-extrabold py-3.5 rounded-xl transition flex items-center justify-center gap-2 text-xs ${
                purchaseBlocked || (paymentMode === 'payshap' && !selectedBank.trim())
                  ? 'bg-zinc-800 text-gray-500 border border-zinc-700 cursor-not-allowed opacity-60'
                  : 'bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black shadow-lg shadow-yellow-400/20 disabled:opacity-50 cursor-pointer'
              }`}
            >
              <CreditCard className="w-4 h-4 stroke-[2.5]" />
              <span>
                {loading
                  ? 'Creating Ticket...'
                  : paymentMode === 'payshap' && !selectedBank.trim()
                  ? 'Choose a Bank to Buy Ticket'
                  : paymentMode === 'snapscan'
                  ? `Pay with SnapScan • R${totalCost.toFixed(2)}`
                  : paymentMode === 'payshap'
                  ? `Buy Ticket • R${totalCost.toFixed(2)}`
                  : `Confirm & Pay R${totalCost.toFixed(2)} with Wallet`}
              </span>
            </button>
            {paymentMode === 'snapscan' && (
              <p className="text-[11px] text-center text-gray-300 mt-2 leading-snug">
                You do NOT need to install SnapScan. You can pay with Card on the next page.
              </p>
            )}
          </div>
        </form>

        <div className="mt-3 text-center flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>PayShap payments auto-checked with Admin backup approval</span>
        </div>
      </div>
    </div>
  );
};
export default BuyTicketModal;
