import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Ticket } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, doc, runTransaction } from 'firebase/firestore';
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  ShieldCheck,
  Calendar,
  MapPin,
  Ticket as TicketIcon,
  Wifi,
  ChevronLeft,
  Store as StoreIcon,
  Lock,
  Utensils,
  Check,
  Radio,
  Camera,
  Phone,
  LogIn,
  LogOut,
} from 'lucide-react';
import { TicketQrScannerModal } from '../components/modals/TicketQrScannerModal';
import { maskPhoneNumber, formatPhoneForViewer, normalizePhone, formatMovementTime } from '../utils/attendanceService';
import { isTicketPaid } from '../utils/ticketStatus';
import { getTicketQuantity } from '../utils/eventTicketLimit';
import {
  getUserOwnedStoreIds,
  getUserOwnedEventIds,
  isLegacyTestTicket,
  isUserVerifiedAdminSession,
} from '../utils/legacyCleanup';
import { AttendanceStatus } from '../types';

export const CheckInPage: React.FC = () => {
  const {
    tickets,
    stores,
    events,
    checkInTicket,
    checkOutTicket,
    currentUser,
    navigateTo,
  } = useApp();

  const [checkMode, setCheckMode] = useState<'tickets' | 'reservations'>('tickets');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'used'>('all');
  const [adminStoreFilter, setAdminStoreFilter] = useState<string>('ALL');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [firestoreReservations, setFirestoreReservations] = useState<any[]>([]);

  // Listen to reservations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reservations'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setFirestoreReservations(list);
    }, (err) => {
      console.warn('Notice: reservations listener fallback:', err);
    });
    return () => unsub();
  }, []);

  const handleCollectReservation = async (res: any) => {
    if (res.status === 'refunded' || res.status === 'cancelled') {
      setFeedback({
        message: `ORDER REFUNDED: This pre-order was cancelled and refunded. Cannot collect!`,
        type: 'error',
      });
      return;
    }

    if (res.status === 'collected' || res.status === 'released' || res.collectedAt) {
      setFeedback({
        message: `ALREADY COLLECTED: Single-use reservation "${res.itemName}" was already handed over.`,
        type: 'error',
      });
      return;
    }

    if (res.paymentStatus === 'WAITING FOR PAYMENT' || res.paymentStatus === 'PENDING_PAYMENT') {
      setFeedback({
        message: `UNPAID RESERVATION: Payment for "${res.itemName}" has not been approved yet.`,
        type: 'error',
      });
      return;
    }

    // Requirement 4: A reservation can ONLY be collected at its own storeId
    if (isPromoter && res.storeId !== promoterStoreId) {
      setFeedback({
        message: `UNAUTHORIZED LOCATION: This reservation is for ${res.storeName}. It can ONLY be collected at ${res.storeName}!`,
        type: 'error',
      });
      return;
    }

    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'reservations', res.id);
        const snap = await tx.get(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data.status === 'collected' || data.status === 'released' || data.collectedAt) {
            throw new Error('ALREADY_COLLECTED');
          }
          if (data.status === 'refunded' || data.status === 'cancelled') {
            throw new Error('REFUNDED');
          }
        }
        tx.update(ref, {
          status: 'collected',
          collectedAt: new Date(),
          collectedBy: currentUser.name,
        });
      });
      setFeedback({
        message: `COLLECTED: Handed over ${res.itemName} at ${res.storeName || promoterStoreName}!`,
        type: 'success',
      });
    } catch (e: any) {
      if (e?.message === 'ALREADY_COLLECTED') {
        setFeedback({
          message: `ALREADY COLLECTED: Single-use reservation "${res.itemName}" was already redeemed.`,
          type: 'error',
        });
      } else if (e?.message === 'REFUNDED') {
        setFeedback({
          message: `ORDER REFUNDED: Cannot collect a refunded reservation.`,
          type: 'error',
        });
      } else {
        setFeedback({
          message: `Collection failed: ${e?.message || e}`,
          type: 'error',
        });
      }
    }
  };

  const isAdmin = isUserVerifiedAdminSession(currentUser);
  const roleLower = (currentUser?.role || '').toLowerCase();
  const isPromoter =
    !isAdmin &&
    (roleLower === 'promoter' ||
      roleLower === 'event organiser' ||
      roleLower === 'organizer' ||
      roleLower === 'seller' ||
      roleLower === 'store manager' ||
      roleLower === 'manager');
  const ownedStoreIds = useMemo(
    () => getUserOwnedStoreIds(currentUser, stores),
    [currentUser, stores]
  );
  const ownedEventIds = useMemo(
    () => getUserOwnedEventIds(currentUser, events, stores),
    [currentUser, events, stores]
  );
  const promoterStoreId = currentUser?.assignedStoreId || '';
  const promoterStoreName =
    currentUser?.assignedStoreName ||
    stores.find((s) => s.id === promoterStoreId)?.name ||
    'Your Event Venue';

  // Real-time search scoped to own store/events if organizer/promoter, or global if admin
  const matchedTickets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const activeEventSet = new Set(events.map((e) => e.id));

    return tickets.filter((ticket) => {
      if (isLegacyTestTicket(ticket, activeEventSet)) return false;

      // 1. Role Scoping:
      if (!isAdmin) {
        const ownsTicket =
          (ticket.eventId && ownedEventIds.has(ticket.eventId)) ||
          (ticket.storeId && ownedStoreIds.has(ticket.storeId));
        if (!ownsTicket) return false;
      } else if (adminStoreFilter !== 'ALL') {
        if (ticket.storeId !== adminStoreFilter) {
          return false;
        }
      }

      // 2. Search term: where phone digits match OR attendee name / pass code matches
      const cleanDigits = normalizePhone(term);
      const phoneDigits = normalizePhone(ticket.attendeePhone || ticket.customerPhone || '');
      const matchSearch =
        !term ||
        (cleanDigits && (phoneDigits.includes(cleanDigits) || phoneDigits.endsWith(cleanDigits))) ||
        (ticket.attendeeName || ticket.customerName || '').toLowerCase().includes(term) ||
        ticket.ticketId?.toLowerCase().includes(term) ||
        ticket.bandCode?.toLowerCase().includes(term) ||
        ticket.id?.toLowerCase().includes(term);

      // 3. Status filter (only paid & unused count as 'valid')
      const paid = isTicketPaid(ticket);
      const currentAttendance: AttendanceStatus =
        ticket.attendanceStatus || (ticket.status === 'used' || (ticket.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
      const alreadyUsed =
        ticket.status === 'used' ||
        (ticket.status as string) === 'inside' ||
        currentAttendance === 'INSIDE' ||
        currentAttendance === 'EXITED' ||
        Boolean(ticket.checkedAt) ||
        Boolean((ticket as any).checkedInAt) ||
        (Array.isArray(ticket.attendanceLogs) && ticket.attendanceLogs.length > 0);
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'valid' && paid && !alreadyUsed) ||
        (statusFilter === 'used' && paid && alreadyUsed);

      return matchSearch && matchStatus;
    });
  }, [tickets, searchTerm, isPromoter, promoterStoreId, isAdmin, adminStoreFilter, statusFilter]);

  // Scoped food & drink reservations for venue counter
  const matchedReservations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return firestoreReservations.filter((res) => {
      if (!isAdmin && (!res.storeId || !ownedStoreIds.has(res.storeId))) {
        return false;
      }
      if (isAdmin && adminStoreFilter !== 'ALL' && res.storeId !== adminStoreFilter) {
        return false;
      }

      const matchSearch =
        !term ||
        res.walletId?.toLowerCase().includes(term) ||
        res.itemName?.toLowerCase().includes(term) ||
        res.id?.toLowerCase().includes(term) ||
        res.storeName?.toLowerCase().includes(term);

      const isCollected = res.status === 'collected';
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'valid' && !isCollected) ||
        (statusFilter === 'used' && isCollected);

      return matchSearch && matchStatus;
    });
  }, [firestoreReservations, searchTerm, isAdmin, ownedStoreIds, adminStoreFilter, statusFilter]);

  const stats = useMemo(() => {
    const activeEventSet = new Set(events.map((e) => e.id));
    const scopedTickets = tickets.filter((t) => {
      if (isLegacyTestTicket(t, activeEventSet)) return false;
      if (!isTicketPaid(t)) return false;
      if (!isAdmin) {
        return (
          (t.eventId && ownedEventIds.has(t.eventId)) ||
          (t.storeId && ownedStoreIds.has(t.storeId))
        );
      }
      return adminStoreFilter === 'ALL' || t.storeId === adminStoreFilter;
    });

    let total = 0;
    let used = 0;
    let valid = 0;
    scopedTickets.forEach((t) => {
      const qty = getTicketQuantity(t);
      total += qty;
      const st: AttendanceStatus = t.attendanceStatus || (t.status === 'used' || (t.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
      const isUsed =
        t.status === 'used' ||
        (t.status as string) === 'inside' ||
        st === 'INSIDE' ||
        st === 'EXITED' ||
        Boolean(t.checkedAt) ||
        Boolean((t as any).checkedInAt) ||
        (Array.isArray(t.attendanceLogs) && t.attendanceLogs.length > 0);
      if (isUsed) used += qty;
      else valid += qty;
    });
    return { total, valid, used };
  }, [tickets, isPromoter, promoterStoreId, adminStoreFilter]);

  const handlePerformCheckIn = async (ticket: Ticket) => {
    const res = await checkInTicket(ticket.ticketId || ticket.id);
    if (res.success) {
      setFeedback({ message: res.message, type: 'success' });
    } else {
      setFeedback({ message: res.message, type: 'error' });
    }

    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  const handlePerformCheckOut = async (ticket: Ticket) => {
    const res = await checkOutTicket(ticket.ticketId || ticket.id);
    if (res.success) {
      setFeedback({ message: res.message, type: 'success' });
    } else {
      setFeedback({ message: res.message, type: 'error' });
    }

    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  return (
    <div className="pb-24 pt-3 px-4 max-w-md mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() =>
            isPromoter ? navigateTo(`/store/${promoterStoreId}`) : navigateTo('/')
          }
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white transition focus:outline-none"
        >
          <ChevronLeft className="w-4 h-4 text-[#FACC15]" />
          <span>{isPromoter ? `Back to ${promoterStoreName}` : 'Back to Discover'}</span>
        </button>

        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
          <Wifi className="w-3 h-3 text-emerald-400" />
          <span>Offline Gate Cache Ready</span>
        </div>
      </div>

      {/* Event Check-In Door Tap to Enter Shortcut */}
      <button
        type="button"
        onClick={() => navigateTo('/staff/check-in')}
        className="w-full mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600/25 via-emerald-500/10 to-transparent border border-emerald-500/40 hover:border-emerald-400 flex items-center justify-between text-left transition shadow-lg cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-black flex items-center justify-center font-black shrink-0 shadow-md">
            <Radio className="w-5 h-5 stroke-[2.5] animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-black text-white group-hover:text-emerald-400 flex items-center gap-1.5 transition">
              <span>Event Check-In Door (Tap to Enter)</span>
              <span className="text-[9px] bg-emerald-500 text-black px-1.5 py-0.2 rounded font-extrabold">NEW</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Live NFC phone-to-phone & wristband gate verification
            </p>
          </div>
        </div>
        <span className="text-emerald-400 text-xs font-black group-hover:translate-x-1 transition-transform">➔</span>
      </button>

      {/* Header Info */}
      <div className="bg-[#1A1A1A] rounded-2xl p-4 border border-white/5 shadow-xl mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FACC15] flex items-center justify-center text-black font-black text-sm">
              <ShieldCheck className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight">
                {isPromoter ? `${promoterStoreName} Check-In` : 'Global ID Tracking'}
              </h1>
              <p className="text-[11px] text-gray-400">
                {isPromoter
                  ? 'Scoped strictly to your assigned venue'
                  : 'Admin multi-store entry clearance'}
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
              isAdmin
                ? 'bg-yellow-400/20 text-[#FACC15] border-yellow-400/40'
                : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
            }`}
          >
            {isAdmin ? 'ADMIN (GLOBAL)' : 'PROMOTER'}
          </span>
        </div>

        {/* Counter Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/5 text-center">
          <div className="bg-black/40 rounded-xl p-2 border border-white/5">
            <span className="text-[10px] text-gray-400 block uppercase font-bold">
              {isPromoter ? 'Venue Total' : 'All Passes'}
            </span>
            <span className="text-sm font-black text-white">{stats.total}</span>
          </div>
          <div className="bg-black/40 rounded-xl p-2 border border-white/5">
            <span className="text-[10px] text-emerald-400 block uppercase font-bold">Valid</span>
            <span className="text-sm font-black text-emerald-400">{stats.valid}</span>
          </div>
          <div className="bg-black/40 rounded-xl p-2 border border-white/5">
            <span className="text-[10px] text-gray-400 block uppercase font-bold">Checked-In</span>
            <span className="text-sm font-black text-yellow-400">{stats.used}</span>
          </div>
        </div>
      </div>

      {/* Admin Store Filter Dropdown */}
      {isAdmin && (
        <div className="mb-4 bg-[#141414] p-2.5 rounded-xl border border-white/5 flex items-center justify-between text-xs">
          <span className="text-gray-400 font-semibold flex items-center gap-1.5">
            <StoreIcon className="w-3.5 h-3.5 text-[#FACC15]" />
            <span>Filter Store:</span>
          </span>
          <select
            value={adminStoreFilter}
            onChange={(e) => setAdminStoreFilter(e.target.value)}
            className="bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg border border-white/10 font-bold focus:outline-none focus:border-[#FACC15]"
          >
            <option value="ALL">All Stores (Global View)</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.location})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Mode Switcher: TICKETS vs FOOD RESERVATIONS */}
      <div className="flex items-center gap-2 p-1 bg-[#141414] rounded-2xl border border-white/5 mb-4 shadow-inner">
        <button
          onClick={() => setCheckMode('tickets')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-extrabold uppercase transition cursor-pointer ${
            checkMode === 'tickets'
              ? 'bg-[#FACC15] text-black shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <TicketIcon className="w-4 h-4" />
          <span>Tickets / Passes ({matchedTickets.length})</span>
        </button>

        <button
          onClick={() => setCheckMode('reservations')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-extrabold uppercase transition cursor-pointer ${
            checkMode === 'reservations'
              ? 'bg-[#FACC15] text-black shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Utensils className="w-4 h-4" />
          <span>Food Collections ({matchedReservations.length})</span>
        </button>
      </div>

      {/* Live QR Code Camera Scanner Trigger */}
      <button
        type="button"
        onClick={() => setIsQrScannerOpen(true)}
        className="w-full mb-3 p-3.5 rounded-2xl bg-gradient-to-r from-[#FACC15] via-yellow-400 to-amber-500 hover:brightness-105 active:scale-[0.98] text-black font-black text-xs transition flex items-center justify-between shadow-xl shadow-yellow-400/20 cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black text-[#FACC15] flex items-center justify-center font-black shadow-md shrink-0">
            <Camera className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm tracking-tight">
                Scan Ticket QR Code
              </span>
              <span className="text-[9px] bg-black text-[#FACC15] px-1.5 py-0.2 rounded font-extrabold uppercase">
                Camera Live
              </span>
            </div>
            <p className="text-[11px] text-black/80 font-semibold mt-0.5">
              {isAdmin
                ? 'Camera QR validation across all partner venues'
                : `Camera QR validation strictly for ${promoterStoreName}`}
            </p>
          </div>
        </div>
        <div className="bg-black/15 group-hover:bg-black/25 px-2.5 py-1.5 rounded-xl font-extrabold text-[11px] flex items-center gap-1 transition">
          <span>Open</span>
          <span className="text-xs">➔</span>
        </div>
      </button>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-[#FACC15] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              checkMode === 'tickets'
                ? isPromoter
                  ? `Search phone (e.g. 0821234567 or 4567) or ticket for ${promoterStoreName}...`
                  : 'Search attendee phone (full or last 4 digits) or ticket code...'
                : `Search reservations for ${isPromoter ? promoterStoreName : 'all stores'}...`
            }
            className="w-full bg-[#1A1A1A] text-white pl-10 pr-20 py-3 rounded-2xl border border-yellow-400/30 focus:border-[#FACC15] focus:outline-none text-xs placeholder:text-gray-500 shadow-md font-mono"
            autoFocus
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-gray-400 hover:text-white text-xs font-bold px-1.5 py-1"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsQrScannerOpen(true)}
              title="Open Camera QR Scanner"
              className="p-1.5 rounded-lg bg-[#FACC15]/20 text-[#FACC15] hover:bg-[#FACC15] hover:text-black transition cursor-pointer"
            >
              <Camera className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* Scope Explanation Banner */}
      <div className="mb-4 p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-gray-400 flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
        {isPromoter ? (
          <span>
            <strong>Store Scope Active:</strong> Query is strictly filtered by{' '}
            <code className="text-[#FACC15]">storeId == &quot;{promoterStoreId}&quot;</code>. You
            cannot see or admit passes for other stores.
          </span>
        ) : (
          <span>
            <strong>Admin Global Scope:</strong> Full view across all partner venues. Shows store
            badge on each ticket.
          </span>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4 text-xs font-bold">
        <button
          onClick={() => setStatusFilter('all')}
          className={`flex-1 py-1.5 rounded-xl transition ${
            statusFilter === 'all'
              ? 'bg-[#FACC15] text-black shadow-sm'
              : 'bg-[#141414] text-gray-400 hover:text-white border border-white/5'
          }`}
        >
          All ({stats.total})
        </button>
        <button
          onClick={() => setStatusFilter('valid')}
          className={`flex-1 py-1.5 rounded-xl transition ${
            statusFilter === 'valid'
              ? 'bg-emerald-500 text-black shadow-sm'
              : 'bg-[#141414] text-gray-400 hover:text-white border border-white/5'
          }`}
        >
          Valid ({stats.valid})
        </button>
        <button
          onClick={() => setStatusFilter('used')}
          className={`flex-1 py-1.5 rounded-xl transition ${
            statusFilter === 'used'
              ? 'bg-zinc-700 text-white shadow-sm'
              : 'bg-[#141414] text-gray-400 hover:text-white border border-white/5'
          }`}
        >
          Used ({stats.used})
        </button>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-3 rounded-2xl mb-4 text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border border-emerald-500/50'
              : 'bg-red-950/90 text-red-200 border border-red-500/50'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between mb-3 text-xs text-gray-400 font-semibold">
        <span>Found {matchedTickets.length} ticket(s)</span>
        {searchTerm && <span>Search: &quot;{searchTerm}&quot;</span>}
      </div>

      {/* 1. TICKET CARDS LIST */}
      {checkMode === 'tickets' && (
        <>
          {matchedTickets.length === 0 ? (
            <div className="bg-[#1A1A1A] rounded-2xl p-8 border border-white/5 text-center shadow-lg">
              <TicketIcon className="w-10 h-10 text-gray-500 mx-auto mb-2" />
              <h3 className="text-white font-bold text-sm mb-1">
                {isPromoter
                  ? `No Tickets for ${promoterStoreName}`
                  : 'No Tickets Found'}
              </h3>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                {isPromoter
                  ? `If the customer bought a pass for a different venue or event, it is strictly hidden from your gate scanner.`
                  : `No pass matches query "${searchTerm}". Verify the ticket ID or phone number.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {matchedTickets.map((ticket) => {
                const paid = isTicketPaid(ticket);
                const currentAttendance: AttendanceStatus =
                  ticket.attendanceStatus || (ticket.status === 'used' || (ticket.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
                const isInside = currentAttendance === 'INSIDE';
                const isExited = currentAttendance === 'EXITED';
                const alreadyUsed =
                  ticket.status === 'used' ||
                  (ticket.status as string) === 'inside' ||
                  isInside ||
                  isExited ||
                  Boolean(ticket.checkedAt) ||
                  Boolean((ticket as any).checkedInAt) ||
                  (Array.isArray(ticket.attendanceLogs) && ticket.attendanceLogs.length > 0);
                const displayName = ticket.attendeeName || ticket.customerName || 'Attendee';
                const phoneDisplay = formatPhoneForViewer(ticket.attendeePhone || ticket.customerPhone, currentUser, isAdmin);

                return (
                  <div
                    key={ticket.id}
                    className="bg-[#1A1A1A] rounded-2xl p-4 border border-white/5 shadow-xl transition-all relative overflow-hidden"
                  >
                    <div
                      className={`absolute top-0 left-0 right-0 h-1 ${
                        !paid ? 'bg-amber-400' : alreadyUsed ? 'bg-rose-500' : 'bg-emerald-400'
                      }`}
                    />

                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-white/10 shrink-0 overflow-hidden relative flex items-center justify-center">
                        {ticket.customerPhoto ? (
                          <img
                            src={ticket.customerPhoto}
                            alt={displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-extrabold text-[#FACC15] text-lg">
                            {displayName.charAt(0)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <h3 className="text-sm font-bold text-white tracking-tight truncate">
                            {displayName}
                          </h3>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                              !paid
                                ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                                : alreadyUsed
                                ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                                : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                            }`}
                          >
                            {!paid ? 'UNPAID' : alreadyUsed ? 'USED' : 'VALID'}
                          </span>
                        </div>

                        <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 bg-[#FACC15]/10 text-[#FACC15] border border-[#FACC15]/30 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                            <StoreIcon className="w-3 h-3 text-[#FACC15]" />
                            <span>Venue: {ticket.storeName || ticket.storeId}</span>
                          </span>
                          {(ticket.eventLocation || (ticket as any).location) && (
                            <span className="inline-flex items-center gap-1 bg-white/5 text-gray-200 border border-white/10 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              <MapPin className="w-3 h-3 text-[#FACC15]" />
                              <span>{ticket.eventLocation || (ticket as any).location}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-gray-300 font-mono mb-1">
                          <span className="text-gray-400 font-sans text-[11px]">Phone:</span>
                          <span className="font-bold text-[#FACC15] bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                            {phoneDisplay}
                          </span>
                        </div>

                        <div className="text-xs text-gray-400 space-y-0.5">
                          <p className="text-gray-200 font-medium truncate">
                            {ticket.eventTitle || ticket.eventName}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span>Code: <strong className="text-white font-mono">{ticket.ticketId || ticket.bandCode}</strong></span>
                            <span>•</span>
                            <span>{ticket.eventDate}</span>
                          </div>
                        </div>

                        {ticket.lastMovementAt && (
                          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-gray-400">
                            <Clock className="w-3 h-3 text-yellow-400" />
                            <span>
                              {alreadyUsed
                                ? `Scanned at ${ticket.insideSince || ticket.lastMovementAt}`
                                : `Created at ${ticket.createdAt?.slice(11, 16) || 'earlier'}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center justify-between">
                      <div className="text-[11px] text-gray-400">
                        <span>Gate State: </span>
                        <strong className="text-white">
                          {!paid
                            ? 'Waiting for Payment Approval'
                            : alreadyUsed
                            ? 'Already Scanned (Invalid)'
                            : 'Valid for Entry'}
                        </strong>
                      </div>

                      {!paid ? (
                        <span className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/40">
                          UNPAID
                        </span>
                      ) : alreadyUsed ? (
                        <span className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/40">
                          ALREADY USED
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePerformCheckIn(ticket)}
                          className="bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-yellow-400/10 cursor-pointer"
                        >
                          <LogIn className="w-4 h-4 stroke-[2.5]" />
                          <span>CHECK IN</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 2. FOOD RESERVATIONS LIST (Counter Release) */}
      {checkMode === 'reservations' && (
        <>
          {matchedReservations.length === 0 ? (
            <div className="bg-[#1A1A1A] rounded-2xl p-8 border border-white/5 text-center shadow-lg">
              <Utensils className="w-10 h-10 text-gray-500 mx-auto mb-2" />
              <h3 className="text-white font-bold text-sm mb-1">
                {isPromoter
                  ? `No Reservations for ${promoterStoreName}`
                  : 'No Reservations Found'}
              </h3>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                {isPromoter
                  ? `Orders made for other venues can ONLY be collected at their respective counters.`
                  : 'No reservations match your search.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {matchedReservations.map((res) => {
                const isCollected = res.status === 'collected';
                const isThisStore = !isPromoter || res.storeId === promoterStoreId;
                const cost = Number(res.price ?? res.total ?? 0);

                return (
                  <div
                    key={res.id}
                    className="bg-[#1A1A1A] rounded-2xl p-4 border border-white/5 shadow-xl relative overflow-hidden"
                  >
                    <div
                      className={`absolute top-0 left-0 right-0 h-1 ${
                        isCollected ? 'bg-zinc-600' : 'bg-[#FACC15]'
                      }`}
                    />

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="inline-flex items-center gap-1 bg-[#FACC15]/10 text-[#FACC15] border border-[#FACC15]/30 text-[10px] font-extrabold px-2 py-0.5 rounded-md mb-1">
                          <StoreIcon className="w-3 h-3 text-[#FACC15]" />
                          <span>Venue: {res.storeName || res.storeId}</span>
                        </span>
                        <h4 className="text-sm font-extrabold text-white">
                          {res.itemName}
                        </h4>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Wallet: <code className="text-[#FACC15] font-mono">{res.walletId}</code>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-black text-[#FACC15]">
                          R{cost.toFixed(0)}
                        </div>
                        <span
                          className={`inline-block text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            isCollected
                              ? 'bg-zinc-800 text-gray-400 border-white/10'
                              : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                          }`}
                        >
                          {isCollected ? 'COLLECTED' : 'PAID • READY'}
                        </span>
                      </div>
                    </div>

                    {/* Collection Action Button */}
                    <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between">
                      <div className="text-[11px] text-gray-400">
                        {isThisStore ? (
                          <span className="text-emerald-400 font-bold">Authorized for this counter</span>
                        ) : (
                          <span className="text-rose-400 font-bold">Must collect at {res.storeName}</span>
                        )}
                      </div>

                      {isCollected ? (
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                          <Check className="w-3.5 h-3.5 text-gray-500" />
                          <span>HANDED OVER</span>
                        </div>
                      ) : res.status === 'refunded' ? (
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-950/40 px-3 py-1.5 rounded-xl border border-rose-500/30">
                          <span>REFUNDED</span>
                        </div>
                      ) : isThisStore ? (
                        <button
                          type="button"
                          onClick={() => handleCollectReservation(res)}
                          className="bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>CONFIRM COLLECTION</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-rose-400 bg-rose-950/40 border border-rose-500/30 px-2 py-1 rounded-lg">
                          Wrong Venue Counter
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Camera QR Scanner Modal */}
      <TicketQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onTicketScanned={(ticket) => {
          setSearchTerm(ticket.bandCode || ticket.ticketId || ticket.id);
        }}
      />
    </div>
  );
};
