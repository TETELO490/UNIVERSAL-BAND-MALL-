import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  TrendingUp,
  Users,
  Ticket as TicketIcon,
  Radio,
  BarChart3,
  ShieldCheck,
  Store,
  Utensils,
  Wine,
  Search,
  Camera,
  Download,
  Phone,
  CheckCircle2,
  LogIn,
  LogOut,
  RefreshCw,
  Calendar,
  Plus,
} from 'lucide-react';
import { TicketQrScannerModal } from './TicketQrScannerModal';
import {
  maskPhoneNumber,
  downloadEventTicketsLocally,
  getPendingSyncCount,
  syncPendingMovementsWithFirestore,
} from '../../utils/attendanceService';
import { AttendanceStatus } from '../../types';
import { EventQrShareCard } from '../events/EventQrShareCard';
import { isEventExpired } from '../../utils/dateHelper';

export const PromoterDashboardModal: React.FC = () => {
  const {
    stores,
    events,
    tickets,
    currentUser,
    currentRoute,
    setActiveModal,
    navigateTo,
    checkInTicket,
    checkOutTicket,
    setSelectedStoreId,
    setEditingEvent,
  } = useApp();

  const [scanCode, setScanCode] = useState('');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState<boolean>(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => getPendingSyncCount());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const handleClose = () => {
    setActiveModal(null);
    if (
      currentRoute === '/promoter' ||
      currentRoute.startsWith('/promoter') ||
      currentRoute === '/dashboard' ||
      currentRoute.startsWith('/dashboard')
    ) {
      navigateTo('/');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentRoute]);

  // Scoped store for this promoter
  const assignedStore =
    stores.find((s) => s.id === currentUser.assignedStoreId) || stores[0];
  const assignedStoreId = assignedStore?.id || currentUser.assignedStoreId || '';

  // Promoter / Organiser can ONLY see live status for HIS OWN events/venue
  const storeTickets = useMemo(() => {
    if (!assignedStoreId) return [];
    return tickets.filter((t) => t.storeId === assignedStoreId);
  }, [tickets, assignedStoreId]);

  const organiserEvents = useMemo(() => {
    return events.filter((ev) => {
      if (isEventExpired(ev)) return false;
      if (ev.creatorId && currentUser?.id && ev.creatorId === currentUser.id) return true;
      if (assignedStoreId && ev.storeId === assignedStoreId) return true;
      return false;
    });
  }, [events, currentUser?.id, assignedStoreId]);

  // Live Attendance Counts for Promoter's Own Event
  const liveStats = useMemo(() => {
    let inside = 0;
    let outside = 0;
    let exited = 0;

    storeTickets.forEach((t) => {
      const status: AttendanceStatus =
        t.attendanceStatus || (t.status === 'used' ? 'INSIDE' : 'OUTSIDE');
      if (status === 'INSIDE') inside++;
      else if (status === 'EXITED') exited++;
      else outside++;
    });

    return {
      total: storeTickets.length,
      inside,
      outside,
      exited,
      revenue: storeTickets.length * 150,
    };
  }, [storeTickets]);

  const handleDirectTicketClearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanCode.trim()) return;

    const res = await checkInTicket(scanCode.trim());
    if (res.success && res.ticket) {
      const timeStr = res.ticket.insideSince || res.ticket.lastMovementAt || 'just now';
      setScanResult(
        `CHECK-IN APPROVED: ${res.ticket.attendeeName || res.ticket.customerName} - INSIDE THE EVENT - ${timeStr}`
      );
    } else {
      setScanResult(res.message);
    }
  };

  const handleGoToMyStore = () => {
    if (!assignedStore) return;
    setActiveModal(null);
    setSelectedStoreId(assignedStore.id);
    navigateTo(`/store/${assignedStore.id}`);
  };

  // Download Event Data
  const handleDownloadEventData = () => {
    if (!assignedStore) return;
    const res = downloadEventTicketsLocally(
      assignedStore.id,
      assignedStore.name,
      storeTickets
    );
    if (res.success) {
      setOfflineNotice(`✓ Cached ${res.count} tickets & phone numbers for offline gate scanning!`);
    } else {
      setOfflineNotice('Offline cache failed.');
    }
    setTimeout(() => setOfflineNotice(null), 4000);
  };

  const handleSyncOffline = async () => {
    setIsSyncing(true);
    const res = await syncPendingMovementsWithFirestore();
    setIsSyncing(false);
    setPendingSyncCount(getPendingSyncCount());
    if (res.success) {
      setOfflineNotice(`✓ Synced ${res.synced} offline timestamps with Firestore!`);
    }
    setTimeout(() => setOfflineNotice(null), 4000);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-sm bg-[#1A1A1A] rounded-3xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto my-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close Promoter Portal"
          title="Close Promoter Portal"
          className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-gray-300 hover:text-white flex items-center justify-center transition-all cursor-pointer z-20 shadow-md border border-white/10"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#FACC15] flex items-center justify-center text-black font-black text-xs">
            UB
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Promoter Portal
            </h2>
            <p className="text-[11px] text-gray-400">Scoped Venue Management</p>
          </div>
        </div>

        {/* Assigned Store Banner */}
        {assignedStore ? (
          <div className="bg-[#121212] rounded-2xl p-3.5 border border-white/5 mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {assignedStore.imageUrl ? (
                <img
                  src={assignedStore.imageUrl}
                  alt={assignedStore.name}
                  className="w-10 h-10 rounded-xl object-cover border border-white/10"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FACC15]">
                  <Store className="w-5 h-5" />
                </div>
              )}
              <div>
                <span className="text-[10px] text-[#FACC15] font-extrabold uppercase tracking-wider block">
                  My Assigned Store
                </span>
                <h3 className="text-sm font-bold text-white">{assignedStore.name}</h3>
                <p className="text-[11px] text-gray-400">{assignedStore.location}</p>
              </div>
            </div>
            <button
              onClick={handleGoToMyStore}
              className="text-[11px] bg-white/10 hover:bg-[#FACC15] hover:text-black text-gray-200 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer"
            >
              Visit &rarr;
            </button>
          </div>
        ) : (
          <div className="bg-[#121212] rounded-2xl p-3.5 border border-white/5 mb-3.5 text-xs text-gray-400">
            No venue assigned to your account yet. Ask an Admin to assign a venue.
          </div>
        )}

        {/* MY EVENTS & AUTO QR CODES (Organiser Dashboard) */}
        <div className="bg-[#121212] rounded-2xl p-3.5 border border-[#FACC15]/25 mb-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#FACC15]" />
              <span className="text-[11px] font-black uppercase tracking-wider text-white">
                My Events &amp; Auto QR ({organiserEvents.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingEvent(null);
                setActiveModal('add-event');
              }}
              className="bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition"
            >
              <Plus className="w-3 h-3 stroke-[3]" />
              <span>New Event</span>
            </button>
          </div>

          {organiserEvents.length === 0 ? (
            <p className="text-[11px] text-gray-400 bg-black/40 p-2.5 rounded-xl border border-white/5">
              No active events posted yet. Tap &quot;New Event&quot; to publish an event and automatically generate its unique QR code &amp; link.
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-0.5">
              {organiserEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="bg-[#181818] border border-white/10 rounded-xl p-2.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white truncate">{ev.title}</h4>
                      <p className="text-[10px] text-gray-400">
                        {ev.date} • {ev.price}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEvent(ev);
                        setActiveModal('add-event');
                      }}
                      className="text-[10px] bg-white/10 hover:bg-white/20 text-gray-200 font-bold px-2 py-1 rounded-lg cursor-pointer shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                  <EventQrShareCard event={ev} compact />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Offline Cache & Sync Banner */}
        <div className="mb-3 p-2.5 bg-black/60 rounded-2xl border border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[#FACC15]" />
            <div>
              <span className="font-extrabold text-white block text-[11px]">Offline Gate Data</span>
              <span className="text-[10px] text-gray-400">Cache tickets & phone list</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {pendingSyncCount > 0 && (
              <button
                type="button"
                onClick={handleSyncOffline}
                disabled={isSyncing}
                className="px-2 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold hover:bg-amber-500/30 transition flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync ({pendingSyncCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadEventData}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-lg text-[10px] font-black border border-white/10 transition cursor-pointer flex items-center gap-1"
            >
              <span>Download</span>
            </button>
          </div>
        </div>

        {offlineNotice && (
          <div className="mb-3 p-2 bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[11px] rounded-xl flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{offlineNotice}</span>
          </div>
        )}

        {/* LIVE ATTENDANCE BREAKDOWN: INSIDE / OUTSIDE / EXITED */}
        <div className="bg-[#121212] p-3 rounded-2xl border border-white/5 mb-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-300">
                Live Gate Status (My Venue)
              </span>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-black border border-emerald-500/30">
              {liveStats.inside} INSIDE NOW
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="bg-black/50 p-2 rounded-xl border border-white/5">
              <span className="text-[10px] text-gray-400 block font-semibold">Total Passes</span>
              <span className="text-base font-black text-white">{liveStats.total}</span>
            </div>

            <div className="bg-emerald-950/40 p-2 rounded-xl border border-emerald-500/30">
              <span className="text-[10px] text-emerald-400 block font-semibold">Inside Venue</span>
              <span className="text-base font-black text-emerald-400">{liveStats.inside}</span>
            </div>

            <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
              <span className="text-[10px] text-gray-400 block font-semibold">Outside / Left</span>
              <span className="text-base font-black text-gray-300">{liveStats.outside}</span>
            </div>
          </div>
        </div>

        {/* Primary 1: Live Camera QR Ticket Scanner Button */}
        <button
          type="button"
          onClick={() => setIsQrScannerOpen(true)}
          className="w-full mb-2.5 bg-gradient-to-r from-[#FACC15] via-yellow-400 to-amber-500 hover:brightness-105 active:scale-[0.98] text-black font-black p-3.5 rounded-2xl text-xs flex items-center justify-between shadow-xl shadow-yellow-400/20 cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black text-[#FACC15] flex items-center justify-center font-black shadow-md shrink-0">
              <Camera className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm tracking-tight">Open Gate Scanner</span>
                <span className="text-[9px] bg-black text-[#FACC15] px-1.5 py-0.2 rounded font-extrabold uppercase">
                  Live Camera
                </span>
              </div>
              <p className="text-[11px] text-black/80 font-semibold mt-0.5">
                Admit & track attendees for {assignedStore?.name || 'your venue'}
              </p>
            </div>
          </div>
          <div className="bg-black/15 group-hover:bg-black/25 px-2.5 py-1.5 rounded-xl font-extrabold text-[11px] flex items-center gap-1 transition">
            <span>Scan</span>
            <span className="text-xs">➔</span>
          </div>
        </button>

        {/* 2. Track by Phone Number Button (Fallback Search) */}
        <button
          type="button"
          onClick={() => {
            setIsQrScannerOpen(true);
          }}
          className="w-full mb-3 bg-white/10 hover:bg-white/15 active:scale-95 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 border border-white/10 cursor-pointer transition"
        >
          <Phone className="w-4 h-4 text-[#FACC15] stroke-[2.5]" />
          <span>Search by Phone Number (Gate Fallback)</span>
        </button>

        {/* Stats Grid Scoped to this Store */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-[#121212] p-3 rounded-xl border border-white/5">
            <div className="flex items-center gap-1.5 text-gray-400 text-[11px] mb-1">
              <TicketIcon className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Venue Passes</span>
            </div>
            <span className="text-xl font-black text-white">{storeTickets.length}</span>
            <span className="text-[10px] text-emerald-400 block mt-0.5">Active tickets</span>
          </div>

          <div className="bg-[#121212] p-3 rounded-xl border border-white/5">
            <div className="flex items-center gap-1.5 text-gray-400 text-[11px] mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Venue Sales</span>
            </div>
            <span className="text-xl font-black text-[#FACC15]">
              R{liveStats.revenue.toFixed(0)}
            </span>
            <span className="text-[10px] text-gray-400 block mt-0.5">Wristband ZAR</span>
          </div>
        </div>

        {/* Live Attendee Movement Roster (Scoped strictly to this store) */}
        <div className="bg-[#121212] rounded-2xl p-3 border border-white/5 mb-3.5 space-y-2">
          <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider block">
            Recent Attendee Movements ({storeTickets.length})
          </span>
          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
            {storeTickets.slice(0, 10).map((t) => {
              const status: AttendanceStatus =
                t.attendanceStatus || (t.status === 'used' ? 'INSIDE' : 'OUTSIDE');
              const isInside = status === 'INSIDE';
              const isExited = status === 'EXITED';

              return (
                <div
                  key={t.id}
                  className="bg-black/50 p-2 rounded-xl border border-white/5 flex items-center justify-between text-[11px]"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-bold text-white block truncate">
                      {t.attendeeName || t.customerName}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {maskPhoneNumber(t.attendeePhone || t.customerPhone || '')} • {t.ticketId || t.bandCode}
                    </span>
                  </div>
                  <span
                    className={`font-black uppercase text-[9px] px-2 py-0.5 rounded-full shrink-0 ${
                      isInside
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isExited
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-zinc-800 text-gray-400'
                    }`}
                  >
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Ticket Code Clearance */}
        <div className="bg-[#121212] rounded-xl p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-1.5">
            <Radio className="w-3.5 h-3.5 text-[#FACC15] animate-pulse" />
            <h4 className="text-xs font-bold text-white">Direct Ticket Code Clearance</h4>
          </div>
          <p className="text-[10px] text-gray-400 mb-2">
            Enter serial (e.g. UB-84729) or phone to admit guest to {assignedStore?.name || 'your venue'}
          </p>

          <form onSubmit={handleDirectTicketClearance} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. UB-84729 or phone..."
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              className="flex-1 bg-black text-white text-xs px-3 py-2 rounded-lg border border-white/10 font-mono focus:outline-none focus:border-[#FACC15]"
            />
            <button
              type="button"
              onClick={() => setIsQrScannerOpen(true)}
              className="bg-white/10 hover:bg-[#FACC15] hover:text-black text-[#FACC15] px-2.5 py-2 rounded-lg transition cursor-pointer flex items-center justify-center border border-white/10"
              title="Open Camera QR Scanner"
            >
              <Camera className="w-4 h-4 stroke-[2.5]" />
            </button>
            <button
              type="submit"
              className="bg-[#FACC15] hover:bg-yellow-400 text-black text-xs font-extrabold px-3 py-2 rounded-lg cursor-pointer transition active:scale-95"
            >
              Admit
            </button>
          </form>

          {scanResult && (
            <div className="mt-2.5 p-2 rounded-lg bg-black text-[11px] border border-white/10 text-gray-300">
              {scanResult}
            </div>
          )}
        </div>

        {/* Bottom Exit Bar */}
        <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-xs shrink-0">
          <span className="text-[11px] text-gray-400">
            Tap outside or click to leave
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border border-white/10"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close & Exit</span>
          </button>
        </div>
      </div>

      {/* Live Camera & Phone Search Scanner for Promoter */}
      <TicketQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onTicketScanned={(t) => {
          setScanCode(t.bandCode || t.ticketId || t.id);
        }}
        defaultEventId={assignedStore?.id || ''}
      />
    </div>
  );
};
