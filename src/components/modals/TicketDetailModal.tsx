import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Calendar,
  MapPin,
  CheckCircle,
  CheckCircle2,
  ShieldCheck,
  Download,
  Copy,
  Check,
  Smartphone,
  AlertCircle,
  Utensils,
  Clock,
  Zap,
} from 'lucide-react';
import { maskPhoneNumber, formatPhoneForViewer } from '../../utils/attendanceService';
import { getEventPayshapReference, isTicketWaitingPayment, isTicketPaid } from '../../utils/ticketStatus';
import {
  doesUserPersonallyOwnTicket,
  getUserOwnedEventIds,
  getUserOwnedStoreIds,
  isUserVerifiedAdminSession,
} from '../../utils/legacyCleanup';
import { normalizePhoneDigits } from '../../utils/customerQr';

export const TicketDetailModal: React.FC = () => {
  const {
    selectedTicket: rawSelectedTicket,
    currentUser,
    setActiveModal,
    setSelectedTicket,
    stores,
    events,
    tickets,
    mallOrders,
    openEventFoodPreorder,
    tymebankPayshapNumber,
    supportedBanks,
    updateTicketSelectedBank,
    navigateTo,
    adminApproveTicketPayment,
  } = useApp();
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [copiedNumber, setCopiedNumber] = useState<boolean>(false);
  const [phoneTapActive, setPhoneTapActive] = useState<boolean>(false);
  const [nfcWriteStatus, setNfcWriteStatus] = useState<string>('');
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [approvingTicket, setApprovingTicket] = useState<boolean>(false);

  if (!rawSelectedTicket) return null;

  const selectedTicket =
    tickets.find((t) => t.id === rawSelectedTicket.id || t.ticketId === rawSelectedTicket.id) ||
    rawSelectedTicket;

  const isPersonalTicket = doesUserPersonallyOwnTicket(selectedTicket, currentUser);
  const isVerifiedAdmin = isUserVerifiedAdminSession(currentUser);
  const ownedEventIds = getUserOwnedEventIds(currentUser, events, stores);
  const ownedStoreIds = getUserOwnedStoreIds(currentUser, stores);
  const canOrganizerInspect =
    (selectedTicket.eventId && ownedEventIds.has(selectedTicket.eventId)) ||
    (selectedTicket.storeId && ownedStoreIds.has(selectedTicket.storeId));

  if (!isPersonalTicket && !isVerifiedAdmin && !canOrganizerInspect) {
    return null;
  }

  const tPhoneDigits = normalizePhoneDigits(selectedTicket.attendeePhone || selectedTicket.customerPhone || '');
  const linkedPreorderOrder =
    mallOrders.find(
      (o) =>
        o.status !== 'cancelled' &&
        (o.id === selectedTicket.preorderOrderId ||
          (selectedTicket.eventId &&
            o.eventId === selectedTicket.eventId &&
            ((selectedTicket.userId && o.customerId === selectedTicket.userId) ||
              (selectedTicket.customerQrId && o.customerQrId === selectedTicket.customerQrId) ||
              (tPhoneDigits.length >= 7 && normalizePhoneDigits(o.customerPhone) === tPhoneDigits))))
    ) || null;
  const resolvedPreorderSummary =
    selectedTicket.preorderSummary ||
    (linkedPreorderOrder
      ? linkedPreorderOrder.items.map((it) => `${it.quantity}× ${it.name}`).join(', ')
      : '');
  const hasResolvedPreorder = Boolean(selectedTicket.hasFoodPreorder || resolvedPreorderSummary);

  const isPaidPass = isTicketPaid(selectedTicket);
  const isAlreadyScanned =
    selectedTicket.status === 'used' ||
    (selectedTicket.status as string) === 'inside' ||
    selectedTicket.attendanceStatus === 'INSIDE' ||
    selectedTicket.attendanceStatus === 'EXITED' ||
    Boolean(selectedTicket.checkedAt) ||
    Boolean((selectedTicket as any).checkedInAt) ||
    (Array.isArray(selectedTicket.attendanceLogs) && selectedTicket.attendanceLogs.length > 0);

  // Accurately resolve event location from ticket, store, or event
  const resolvedLocation =
    selectedTicket.eventLocation?.trim() ||
    stores.find((s) => s.id === selectedTicket.storeId)?.location ||
    events.find((e) => e.id === selectedTicket.eventId)?.location ||
    selectedTicket.storeName ||
    'Venue Location';

  const resolvedPayshapRef =
    selectedTicket.payshapReference ||
    getEventPayshapReference(selectedTicket.eventTitle || selectedTicket.eventName);

  const canAdminApprove = isVerifiedAdmin;

  const handleCopyPayshapRef = () => {
    if (!resolvedPayshapRef) return;
    navigator.clipboard?.writeText(resolvedPayshapRef);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2500);
  };

  const handleCopyPayshapNum = () => {
    navigator.clipboard?.writeText(tymebankPayshapNumber);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2500);
  };

  const handleAdminBackupApprove = async () => {
    setApprovingTicket(true);
    try {
      await adminApproveTicketPayment(selectedTicket.id || selectedTicket.ticketId);
    } finally {
      setApprovingTicket(false);
    }
  };

  const handleStartPhoneToPhoneTap = async () => {
    setPhoneTapActive(true);
    setNfcWriteStatus('Transmitting gate pass...');

    const customerId =
      selectedTicket.attendeePhone ||
      selectedTicket.ticketId ||
      selectedTicket.userId ||
      selectedTicket.id;

    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      try {
        const ndef = new (window as any).NDEFReader();
        await ndef.write({
          records: [
            {
              recordType: 'text',
              data: customerId,
            },
          ],
        });
        setNfcWriteStatus('NFC pass active! Hold phones back-to-back.');
      } catch (err: any) {
        console.warn('NDEF write warning:', err);
        setNfcWriteStatus('Hold back-to-back with staff phone (Requires Android Chrome with NFC ON).');
      }
    } else {
      setNfcWriteStatus('Phone NFC ready. Hold back-to-back with staff phone or show your Profile ONE QR.');
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedTicket(null);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(selectedTicket.bandCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1A1A1A] rounded-2xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-4">
          <div className="w-10 h-10 rounded-full bg-[#FACC15] flex items-center justify-center text-black font-black text-sm mx-auto mb-2 shadow-md">
            UB
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Universal Band Entry Pass
          </h2>
          <p className="text-xs text-gray-400">
            Use your Profile ONE QR or tap your physical wristband at the gate
          </p>
        </div>

        {/* Ticket Visual Card */}
        <div className="bg-[#121212] rounded-2xl border border-white/10 p-4 relative overflow-hidden">
          {/* Top Banner */}
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-[#FACC15] uppercase tracking-wider block">
                  Official Access Ticket
                </span>
                {selectedTicket.ticketTier && (
                  <span className="bg-[#FACC15] text-black font-black text-[9px] px-2 py-0.5 rounded-md uppercase">
                    {selectedTicket.ticketTier}
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {selectedTicket.eventTitle}
              </h3>
            </div>
            {isTicketWaitingPayment(selectedTicket) ? (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" /> WAITING FOR PAYMENT
              </span>
            ) : isTicketPaid(selectedTicket) ? (
              <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> PAID ✅
              </span>
            ) : (
              <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {selectedTicket.status}
              </span>
            )}
          </div>

          {/* Details */}
          <div className="py-3 space-y-2 text-xs">
            {/* Customer Contact & Live Attendance info */}
            <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-[11px]">Attendee Name:</span>
                <span className="font-bold text-white">
                  {selectedTicket.attendeeName || selectedTicket.customerName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-[11px]">Primary Phone:</span>
                <span className="font-mono font-bold text-[#FACC15]">
                  {formatPhoneForViewer(
                    selectedTicket.attendeePhone || selectedTicket.customerPhone,
                    currentUser,
                    isVerifiedAdmin
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-gray-400 text-[11px]">Live Gate Status:</span>
                <span
                  className={`font-black uppercase text-[10px] px-2 py-0.5 rounded-full ${
                    (selectedTicket.attendanceStatus || (selectedTicket.status === 'used' ? 'INSIDE' : 'OUTSIDE')) === 'INSIDE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : selectedTicket.attendanceStatus === 'EXITED'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-zinc-800 text-gray-300'
                  }`}
                >
                  {selectedTicket.attendanceStatus || (selectedTicket.status === 'used' ? 'INSIDE' : 'OUTSIDE')}
                  {selectedTicket.insideSince ? ` (Since ${selectedTicket.insideSince})` : ''}
                </span>
              </div>
            </div>

            {/* Payment Status & Instructions */}
            {isTicketWaitingPayment(selectedTicket) && (
              <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-300 tracking-wider flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>AWAITING FOR PAYMENT</span>
                  </span>
                  <span className="text-[10px] font-black text-amber-200 tabular-nums">{selectedTicket.price}</span>
                </div>

                {/* Payment Request Flow: Customer waits for request & approves in their chosen banking app */}
                <div className="space-y-2.5">
                  {selectedTicket.payshapRequestSent ? (
                    <div className="bg-emerald-500/20 border border-emerald-400/50 rounded-lg px-2.5 py-2 text-[11px] font-bold text-emerald-200">
                      Payment Request Sent — Open your {selectedTicket.selectedBank || 'banking'} app now and approve the payment request.
                    </div>
                  ) : (
                    <div className="bg-black/60 border border-amber-400/30 rounded-lg p-2.5 space-y-1">
                      <p className="text-xs font-bold text-white leading-snug">
                        Wait for a payment request from us, then open your banking app and approve it.
                      </p>
                      <p className="text-[10px] text-amber-200/90 leading-snug">
                        You do not need to send money manually to any number. Once we send the request, simply approve it in your banking app and your ticket will be confirmed as PAID ✅.
                      </p>
                    </div>
                  )}

                  {/* Bank / Account Selection from Admin-Managed List */}
                  <div className="bg-black/60 p-2.5 rounded-lg border border-[#FACC15]/40 space-y-1.5">
                    <label
                      htmlFor="ticket-detail-bank-select"
                      className="text-[10px] text-gray-300 font-bold block"
                    >
                      Your Bank / Account for Payment Approval
                    </label>
                    <select
                      id="ticket-detail-bank-select"
                      value={selectedTicket.selectedBank || ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          void updateTicketSelectedBank(
                            selectedTicket.id || selectedTicket.ticketId,
                            e.target.value
                          );
                        }
                      }}
                      className="w-full min-h-[40px] bg-[#121212] border border-white/15 focus:border-[#FACC15] rounded-lg px-2.5 py-2 text-xs font-bold text-[#FACC15] focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Select your bank --
                      </option>
                      {supportedBanks.map((bank) => (
                        <option key={bank} value={bank}>
                          {bank}
                        </option>
                      ))}
                    </select>
                    {selectedTicket.selectedBank && (
                      <p className="text-[10px] text-emerald-300 font-semibold">
                        Selected: {selectedTicket.selectedBank} — Watch your banking app for our payment request.
                      </p>
                    )}
                  </div>
                </div>

                {/* ADMIN MANUAL BACKUP APPROVAL ACCESS */}
                {canAdminApprove && (
                  <div className="pt-2.5 border-t border-amber-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-emerald-400">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Admin / Organiser Manual Backup
                      </span>
                      <span className="text-gray-400 font-normal">Direct Override</span>
                    </div>
                    <button
                      type="button"
                      disabled={approvingTicket}
                      onClick={handleAdminBackupApprove}
                      className="w-full min-h-[44px] bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      <span>{approvingTicket ? 'Approving Payment...' : 'Approve Payment (Admin Backup)'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {isTicketPaid(selectedTicket) && (
              <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-2 text-xs font-black text-emerald-300">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Ticket Confirmed - PAID ✅</span>
                </div>
                <div className="text-[11px] font-semibold text-emerald-200/90">
                  {selectedTicket.customerName || selectedTicket.attendeeName} · {selectedTicket.ticketTier || 'General'} · {selectedTicket.price} · {selectedTicket.eventTitle} {selectedTicket.eventDate}
                </div>
              </div>
            )}

            {/* PROMINENT EVENT LOCATION DISPLAY */}
            <div className="bg-[#FACC15]/10 border border-[#FACC15]/30 rounded-xl p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FACC15] text-black flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                <MapPin className="w-4 h-4 text-black stroke-[2.5]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-black tracking-wider text-[#FACC15] block">
                  Event Location & Venue
                </span>
                <span className="text-xs font-black text-white block leading-snug break-words">
                  {resolvedLocation}
                </span>
                {selectedTicket.storeName && selectedTicket.storeName !== resolvedLocation && (
                  <span className="text-[10px] text-gray-300 block mt-0.5 font-medium">
                    Venue: {selectedTicket.storeName}
                  </span>
                )}
              </div>
            </div>

            {/* MODE 2: EVENT FOOD PRE-ORDER STATUS / UNLOCK BUTTON */}
            {hasResolvedPreorder ? (
              <div className="bg-gradient-to-r from-purple-950/80 via-indigo-950/80 to-purple-900/80 border border-purple-500/50 rounded-xl p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-purple-300 tracking-wider flex items-center gap-1">
                    <Utensils className="w-3.5 h-3.5 text-purple-400" />
                    <span>{isPersonalTicket ? 'Event Food Pre-Ordered 🍔🥤' : 'Customer Pre-Ordered Food 🍔🥤'}</span>
                  </span>
                  <span className="bg-emerald-500 text-black font-black text-[9px] px-1.5 py-0.2 rounded uppercase">
                    Paid
                  </span>
                </div>
                <p className="text-white font-bold text-xs">
                  {resolvedPreorderSummary}
                </p>
                {linkedPreorderOrder && (
                  <p className="text-[10px] text-purple-200 font-semibold">
                    Order #{linkedPreorderOrder.orderNumber} • Total R{Number(linkedPreorderOrder.total || 0).toFixed(2)} • Status: {linkedPreorderOrder.status}
                  </p>
                )}
                <p className="text-[10px] text-gray-300">
                  {isPersonalTicket
                    ? 'Vendor will verify your pre-ordered meals when scanning this pass.'
                    : 'Scan Customer ONE QR on handover to release this food/drink pre-order.'}
                </p>
              </div>
            ) : !isPersonalTicket ? (
              <div className="w-full py-2.5 px-3.5 bg-zinc-800/80 text-gray-300 font-semibold text-xs rounded-xl border border-white/10 flex items-center gap-2">
                <Utensils className="w-4 h-4 shrink-0 text-gray-400" />
                <span>Attendee has not placed an event food/drink pre-order yet.</span>
              </div>
            ) : !isPaidPass ? (
              <div className="w-full py-2.5 px-3.5 bg-zinc-800/80 text-amber-300 font-bold text-xs rounded-xl border border-amber-500/30 flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Food pre-order unlocks after ticket payment is approved</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const targetEv = events.find((e) => e.id === selectedTicket.eventId) || {
                    id: selectedTicket.eventId || 'evt_1',
                    title: selectedTicket.eventTitle || 'Event',
                    date: selectedTicket.eventDate || 'Event Day',
                    location: resolvedLocation,
                    price: selectedTicket.price || 'R0',
                    imageUrl: '',
                    status: 'Open',
                    category: 'Events',
                    storeId: selectedTicket.storeId || '',
                  };
                  closeModal();
                  openEventFoodPreorder(targetEv as any);
                }}
                className="w-full py-3 px-3.5 bg-gradient-to-r from-[#FACC15] via-amber-400 to-yellow-500 hover:brightness-110 active:scale-95 text-black font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer border border-yellow-300"
              >
                <Utensils className="w-4 h-4 text-black stroke-[2.5]" />
                <span>Pre-Order Event Food & Menu 🍔🥤</span>
              </button>
            )}

            <div className="flex items-center justify-between text-xs text-gray-300 pt-0.5">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#FACC15] shrink-0" />
                <span className="font-bold text-white">{selectedTicket.eventDate}</span>
              </div>
              <span className="font-black text-xs text-[#FACC15] bg-black/60 px-2.5 py-1 rounded-md border border-white/10">
                {selectedTicket.price}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <span className="text-gray-400 text-[11px]">Ticket Code / NFC:</span>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 font-mono font-bold text-[#FACC15] text-xs hover:underline focus:outline-none cursor-pointer"
                title="Click to copy band code"
              >
                <span>{selectedTicket.ticketId || selectedTicket.bandCode}</span>
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Perforated edge */}
          <div className="relative my-3 flex items-center">
            <div className="w-3 h-5 bg-[#1A1A1A] rounded-r-full -ml-4" />
            <div className="flex-1 border-t-2 border-dashed border-zinc-700 mx-2" />
            <div className="w-3 h-5 bg-[#1A1A1A] rounded-l-full -mr-4" />
          </div>

          {/* Linked to Profile ONE QR */}
          {isPersonalTicket && (
            <div className="bg-black/40 border border-[#FACC15]/30 rounded-2xl p-3.5 my-2 text-center space-y-2.5">
              {isAlreadyScanned ? (
                <p className="text-xs font-black text-rose-400">
                  Single-Use Ticket Already Scanned ({selectedTicket.attendanceStatus || 'USED'}). No re-entry allowed.
                </p>
              ) : !isPaidPass ? (
                <p className="text-xs font-bold text-amber-300">
                  Gate pass locked — awaiting payment approval before ONE QR activation.
                </p>
              ) : (
                <>
                  <p className="text-xs font-bold text-white">
                    This single-use ticket is linked to your permanent Profile ONE QR.
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Show your ONE QR on the Profile tab at the gate — ID: <span className="font-mono text-[#FACC15]">{selectedTicket.id}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      closeModal();
                      navigateTo('/profile');
                    }}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs transition cursor-pointer"
                  >
                    Open My ONE QR on Profile
                  </button>
                </>
              )}
            </div>
          )}

          {/* Barcode visual */}
          <div className="h-7 w-full flex items-center justify-center gap-0.5 mt-2 bg-white/5 py-1 px-3 rounded">
            {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 2, 1, 3, 2, 4, 1, 3, 2].map(
              (h, i) => (
                <div
                  key={i}
                  className={`bg-gray-400 w-1 rounded-sm`}
                  style={{ height: `${h * 4 + 8}px` }}
                />
              )
            )}
          </div>
        </div>

        {/* PHONE-TO-PHONE TAP: "Tap to Enter - Show My Pass" (personal ticket holder only) */}
        {isPersonalTicket && (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              disabled={!isPaidPass || isAlreadyScanned}
              onClick={handleStartPhoneToPhoneTap}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-gray-400 active:scale-95 text-black font-black text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed"
            >
              <Smartphone className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isAlreadyScanned
                  ? 'Pass Already Used (Single-Use Scanned)'
                  : !isPaidPass
                  ? 'Gate Pass Locked Until Payment Approved'
                  : 'Tap to Enter - Show My Pass'}
              </span>
            </button>
          </div>
        )}

        {/* PHONE-TO-PHONE TAP ACTIVE MODAL */}
        {phoneTapActive && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95">
            <div className="w-full max-w-xs space-y-4">
              <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-75" />
                <div className="absolute inset-2 rounded-full bg-emerald-500/30 animate-pulse" />
                <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black shadow-lg shadow-emerald-500/40 relative z-10">
                  <Smartphone className="w-8 h-8 stroke-[2.5]" />
                </div>
              </div>

              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2.5 py-0.5 rounded-full border border-emerald-500/40 inline-block mb-1.5">
                  PHONE-TO-PHONE TAP ACTIVE
                </span>
                <h3 className="text-xl font-black text-white">
                  Hold your phone back-to-back with staff phone
                </h3>
                <p className="text-xs text-gray-300 mt-1">
                  {nfcWriteStatus}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPhoneTapActive(false);
                  closeModal();
                  navigateTo('/profile');
                }}
                className="w-full min-h-[44px] py-3 px-4 rounded-2xl bg-[#FACC15] text-black font-black text-xs transition cursor-pointer"
              >
                Show Profile ONE QR Instead
              </button>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-[11px] text-gray-300 text-left space-y-1">
                <div className="flex items-start gap-1.5 text-gray-400 text-[10px]">
                  <AlertCircle className="w-3.5 h-3.5 text-[#FACC15] shrink-0 mt-0.5" />
                  <span>
                    Web NFC write for phone-to-phone works when both phones are Android Chrome with NFC turned ON.
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono pt-1 border-t border-white/5">
                  Pass Serial: {selectedTicket.ticketId || selectedTicket.bandCode || selectedTicket.id}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPhoneTapActive(false)}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
              >
                Done / Close
              </button>
            </div>
          </div>
        )}

        {offlineNotice && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[11px] font-medium">
            {offlineNotice}
          </div>
        )}

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Anti-Counterfeit Verified</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setOfflineNotice(`Wristband pass #${selectedTicket.bandCode} cached for offline venue access.`);
              setTimeout(() => setOfflineNotice(null), 4000);
            }}
            className="hover:text-white flex items-center gap-1 font-medium focus:outline-none cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Offline</span>
          </button>
        </div>
      </div>
    </div>
  );
};

