import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Store,
  Ticket as TicketIcon,
  Search,
  CheckCircle2,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Building,
  Radio,
  Trash2,
  Camera,
  Lock,
  Phone,
  LogIn,
  LogOut,
  Users,
  Activity,
  Beer,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Edit3,
  Smartphone,
  Send,
  Clock,
  Headphones,
  MessageSquare,
  AlertCircle,
  ArrowLeft,
  Volume2,
} from 'lucide-react';
import { TicketQrScannerModal } from './TicketQrScannerModal';
import { VendorPosScannerModal } from './VendorPosScannerModal';
import { TymebankSmsModal } from './TymebankSmsModal';
import { SendPayshapRequestModal } from './SendPayshapRequestModal';
import { maskPhoneNumber, normalizePhone } from '../../utils/attendanceService';
import { getEventTicketStats } from '../../utils/eventTicketLimit';
import { isTicketWaitingPayment, isTicketPaid } from '../../utils/ticketStatus';
import { AttendanceStatus, Ticket } from '../../types';

export const AdminConsoleModal: React.FC = () => {
  const {
    currentUser,
    stores,
    events,
    tickets,
    promoters,
    currentRoute,
    setActiveModal,
    navigateTo,
    checkInTicket,
    checkOutTicket,
    liveSales,
    totalLiveSalesAmount,
    storeWorkers,
    createStoreWorker,
    deleteStoreWorker,
    allRegisteredUsers,
    adminDeleteUser,
    approveUser,
    rejectUser,
    pendingApprovals,
    setIsAdminSecurityModalOpen,
    setEditingEvent,
    deleteEvent,
    markPayshapRequestSent,
    supportChats,
    unreadAdminSupportCount,
    activeAdminSupportChatId,
    setActiveAdminSupportChatId,
    sendAdminSupportReply,
    markChatAsReadByAdmin,
    approveTicketManuallyFromChat,
    rejectTicketFromChat,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'PENDING_APPROVALS' | 'LIVE_EVENTS' | 'LIVE_SALES' | 'USERS_LIST' | 'STORES' | 'STAFF_WORKERS' | 'TICKETS' | 'PHONE_TRACKER' | 'SUPPORT_INBOX'>('LIVE_EVENTS');
  const [adminReplyInput, setAdminReplyInput] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [rejectTicketPrompt, setRejectTicketPrompt] = useState<{ ticketId: string; chatId: string } | null>(null);
  const [rejectTicketReason, setRejectTicketReason] = useState<string>('');
  const [processingSupportTicketId, setProcessingSupportTicketId] = useState<string | null>(null);
  const [supportFullscreenImg, setSupportFullscreenImg] = useState<string | null>(null);
  const [ticketPaymentFilter, setTicketPaymentFilter] = useState<'ALL' | 'WAITING'>('ALL');
  const [selectedPayshapTicket, setSelectedPayshapTicket] = useState<Ticket | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [lastApprovedUser, setLastApprovedUser] = useState<any | null>(null);
  const [rejectModalUser, setRejectModalUser] = useState<any | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');
  const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('ALL');
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ id: string; name?: string; email?: string } | null>(null);
  const [confirmDeleteWorkerId, setConfirmDeleteWorkerId] = useState<string | null>(null);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState<boolean>(false);
  const [isVendorPosOpen, setIsVendorPosOpen] = useState<boolean>(false);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState<boolean>(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const handleClose = () => {
    setActiveModal(null);
    if (
      currentRoute === '/admin' ||
      currentRoute === '/admin/console' ||
      currentRoute === '/dashboard' ||
      currentRoute.startsWith('/admin') ||
      currentRoute.startsWith('/dashboard')
    ) {
      navigateTo('/');
    }
  };

  useEffect(() => {
    if (activeAdminSupportChatId === '__INBOX__') {
      setActiveTab('SUPPORT_INBOX');
      setActiveAdminSupportChatId(null);
    } else if (activeAdminSupportChatId) {
      setActiveTab('SUPPORT_INBOX');
    }
  }, [activeAdminSupportChatId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentRoute]);

  // Requirement 4: ADMIN view: Admin can see live status for EVERY event, all tickets, all promoters.
  // Admin dashboard shows total INSIDE count per event in real-time.
  const eventAttendanceStats = useMemo(() => {
    return events.map((ev) => {
      const evTickets = tickets.filter((t) => t.eventId === ev.id);
      let inside = 0;
      let outside = 0;
      let exited = 0;

      evTickets.forEach((t) => {
        const status: AttendanceStatus =
          t.attendanceStatus || (t.status === 'used' ? 'INSIDE' : 'OUTSIDE');
        if (status === 'INSIDE') inside++;
        else if (status === 'EXITED') exited++;
        else outside++;
      });

      const hostStore = stores.find((s) => s.id === ev.storeId);
      const promoter = promoters.find((p) => p.storeId === ev.storeId);
      const limitStats = getEventTicketStats(ev, tickets);

      return {
        event: ev,
        storeName: hostStore?.name || (ev.storeId ? ev.storeId : 'Standalone Event'),
        promoterName: promoter?.name || 'Assigned Promoter',
        totalTickets: limitStats.soldCount,
        limitStats,
        inside,
        outside,
        exited,
      };
    });
  }, [events, tickets, stores, promoters]);

  const waitingTicketsCount = useMemo(() => {
    return tickets.filter(isTicketWaitingPayment).length;
  }, [tickets]);

  // Tickets filtered by store dropdown & waiting filter, with WAITING FOR PAYMENT sorted first
  const filteredTickets = useMemo(() => {
    return tickets
      .filter((t) => selectedStoreFilter === 'ALL' || t.storeId === selectedStoreFilter)
      .filter((t) => (ticketPaymentFilter === 'WAITING' ? isTicketWaitingPayment(t) : true))
      .sort((a, b) => {
        const aWait = isTicketWaitingPayment(a) ? 0 : 1;
        const bWait = isTicketWaitingPayment(b) ? 0 : 1;
        if (aWait !== bWait) return aWait - bWait;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
  }, [tickets, selectedStoreFilter, ticketPaymentFilter]);

  // Phone & Gate Tracker search across all tickets and events
  const matchedPhoneTickets = useMemo(() => {
    if (!globalSearchQuery.trim()) return tickets;
    const term = globalSearchQuery.trim().toLowerCase();
    const cleanDigits = normalizePhone(globalSearchQuery.trim());

    return tickets.filter((t) => {
      const phone = normalizePhone(t.attendeePhone || t.customerPhone || '');
      const name = (t.attendeeName || t.customerName || '').toLowerCase();
      const code = (t.ticketId || t.bandCode || t.id).toLowerCase();

      return (
        (cleanDigits && (phone.includes(cleanDigits) || phone.endsWith(cleanDigits))) ||
        name.includes(term) ||
        code.includes(term)
      );
    });
  }, [tickets, globalSearchQuery]);

  const handleAdminCheckIn = async (ticketId: string) => {
    const res = await checkInTicket(ticketId);
    setActionMsg(res.message);
    setTimeout(() => setActionMsg(null), 3500);
  };

  const handleAdminCheckOut = async (ticketId: string) => {
    const res = await checkOutTicket(ticketId);
    setActionMsg(res.message);
    setTimeout(() => setActionMsg(null), 3500);
  };

  const approvedStaffUsers = useMemo(() => {
    return (allRegisteredUsers || [])
      .filter((u) => {
        if (u.role === 'Admin' || u.role === 'Customer') return false;
        return u.status === 'approved' || u.isApproved === true || u.status === 'active';
      })
      .sort((a, b) => (b.approvedAt || b.createdAt || '').localeCompare(a.approvedAt || a.createdAt || ''));
  }, [allRegisteredUsers]);

  const rejectedStaffUsers = useMemo(() => {
    return (allRegisteredUsers || [])
      .filter((u) => {
        if (u.role === 'Admin' || u.role === 'Customer') return false;
        return u.status === 'rejected';
      })
      .sort((a, b) => (b.rejectedAt || b.createdAt || '').localeCompare(a.rejectedAt || a.createdAt || ''));
  }, [allRegisteredUsers]);

  const filteredUsers = useMemo(() => {
    return (allRegisteredUsers || []).filter((u) => {
      if (userRoleFilter !== 'ALL') {
        const r = (u.role || '').toLowerCase();
        if (userRoleFilter === 'CUSTOMER' && r !== 'customer' && r !== 'user') return false;
        if (userRoleFilter === 'SELLER' && r !== 'seller' && r !== 'vendor') return false;
        if (userRoleFilter === 'ORGANISER' && r !== 'event organiser' && r !== 'promoter') return false;
        if (userRoleFilter === 'DRIVER' && r !== 'driver') return false;
        if (userRoleFilter === 'WORKER' && r !== 'shop worker' && r !== 'worker') return false;
        if (userRoleFilter === 'ADMIN' && r !== 'admin') return false;
      }
      if (userSearchQuery.trim()) {
        const q = userSearchQuery.toLowerCase().trim();
        const matchesName = (u.name || '').toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q);
        const matchesEmail = (u.email || '').toLowerCase().includes(q);
        const matchesPhone = (u.phone || '').toLowerCase().includes(q);
        const matchesRole = (u.role || '').toLowerCase().includes(q);
        const matchesMeta =
          (u.shopName || '').toLowerCase().includes(q) ||
          (u.organisationName || '').toLowerCase().includes(q) ||
          (u.assignedStoreName || '').toLowerCase().includes(q) ||
          (u.licensePlate || '').toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesPhone || matchesRole || matchesMeta;
      }
      return true;
    });
  }, [allRegisteredUsers, userSearchQuery, userRoleFilter]);

  const executeAdminDeleteUser = async (userToDelete: { id: string; name?: string; email?: string }) => {
    setDeletingUserId(userToDelete.id);
    const res = await adminDeleteUser(userToDelete.id, userToDelete.email);
    setDeletingUserId(null);
    setConfirmDeleteUser(null);

    if (res.success) {
      setActionMsg(`Account for ${userToDelete.email || userToDelete.name} deleted from Firestore & Firebase Auth.`);
      setTimeout(() => setActionMsg(null), 4000);
    } else {
      setActionMsg(`Error deleting user: ${res.error || 'Failed'}`);
      setTimeout(() => setActionMsg(null), 4000);
    }
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
      <div className="w-full max-w-xl bg-[#1A1A1A] rounded-3xl border border-white/10 p-4 sm:p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col my-auto overflow-hidden">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close Admin Console"
          title="Close Admin Console"
          className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-gray-300 hover:text-white flex items-center justify-center transition-all cursor-pointer z-20 shadow-md border border-white/10"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Title Header */}
        <div className="flex items-center gap-2.5 mb-2.5 shrink-0 pr-10">
          <div className="w-8 h-8 rounded-xl bg-[#FACC15] flex items-center justify-center text-black font-black text-sm shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Admin Console</span>
            </h2>
            <p className="text-[10px] text-gray-400">Real-Time Event Attendance & Global Oversight</p>
          </div>
        </div>

        {/* Quick Launch Cards (Compact quick bar) */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsQrScannerOpen(true)}
            className="p-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 hover:border-emerald-400 text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 group"
            title="Scan QR Ticket - Live camera check"
          >
            <div className="w-6 h-6 rounded-lg bg-emerald-500 text-black flex items-center justify-center shrink-0">
              <Camera className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-black text-white group-hover:text-emerald-400 block truncate w-full">
              Scan QR
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsVendorPosOpen(true)}
            className="p-1.5 rounded-xl bg-amber-500/15 border border-[#FACC15]/40 hover:border-[#FACC15] text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 group"
            title="Vendor POS - Scan customer pass"
          >
            <div className="w-6 h-6 rounded-lg bg-[#FACC15] text-black flex items-center justify-center shrink-0">
              <Beer className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-black text-white group-hover:text-[#FACC15] block truncate w-full">
              Vendor POS
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsAdminSecurityModalOpen(true)}
            className="p-1.5 rounded-xl bg-yellow-500/15 border border-white/10 hover:border-[#FACC15] text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 group"
            title="Admin Locks - PIN, Pass & Pattern"
          >
            <div className="w-6 h-6 rounded-lg bg-zinc-800 text-[#FACC15] flex items-center justify-center shrink-0">
              <Lock className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-black text-white group-hover:text-[#FACC15] block truncate w-full">
              Locks
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveModal(null);
              navigateTo('/admin/write-nfc');
            }}
            className="p-1.5 rounded-xl bg-blue-500/15 border border-blue-400/40 hover:border-blue-400 text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 group"
            title="Write NFC Tag - Phone & wristband"
          >
            <div className="w-6 h-6 rounded-lg bg-blue-500 text-black flex items-center justify-center shrink-0">
              <Radio className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-black text-white group-hover:text-blue-400 block truncate w-full">
              NFC Tag
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsSmsModalOpen(true)}
            className="p-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 hover:border-emerald-400 text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 group"
            title="GoTyme / TymeBank SMS Payment Alerts"
          >
            <div className="w-6 h-6 rounded-lg bg-emerald-500 text-black flex items-center justify-center shrink-0">
              <Smartphone className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-black text-white group-hover:text-emerald-400 block truncate w-full">
              PayShap SMS
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveModal(null);
              navigateTo('/admin/payshap-settings');
            }}
            className="p-1.5 rounded-xl bg-[#FACC15]/15 border border-[#FACC15]/40 hover:border-[#FACC15] text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 group"
            title="Admin Settings - Change TymeBank PayShap ID"
          >
            <div className="w-6 h-6 rounded-lg bg-[#FACC15] text-black flex items-center justify-center shrink-0">
              <Edit3 className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-black text-white group-hover:text-[#FACC15] block truncate w-full">
              PayShap ID
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveModal(null);
              navigateTo('/admin/logo-settings');
            }}
            className="p-1.5 rounded-xl bg-[#C9A86A]/15 border border-[#C9A86A]/40 hover:border-[#C9A86A] text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 group"
            title="Brand Logo - Upload & sync"
          >
            <div className="w-6 h-6 rounded-lg bg-[#C9A86A] text-black flex items-center justify-center shrink-0">
              <Camera className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-black text-white group-hover:text-[#C9A86A] block truncate w-full">
              Brand Logo
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveModal(null);
              navigateTo('/admin/buy-ticket-alarm');
            }}
            className="p-1.5 rounded-xl bg-amber-500/15 border border-amber-400/40 hover:border-amber-400 text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 group"
            title="Buy Ticket Alarm Song (Admin Only)"
          >
            <div className="w-6 h-6 rounded-lg bg-amber-400 text-black flex items-center justify-center shrink-0">
              <Volume2 className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-[9px] font-black text-white group-hover:text-amber-300 block truncate w-full">
              Ticket Song
            </span>
          </button>
        </div>

        {/* TABS BAR (Right at top below quick actions) */}
        <div className="flex items-center gap-1 p-1 bg-black/60 rounded-xl border border-white/10 mb-2.5 shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('LIVE_EVENTS')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'LIVE_EVENTS'
                ? 'bg-[#FACC15] text-black shadow-sm font-black'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Events</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('USERS_LIST')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'USERS_LIST'
                ? 'bg-rose-600 text-white shadow-sm font-extrabold'
                : 'text-rose-300 hover:text-rose-200'
            }`}
            title="Manage and Delete Registered Accounts from Firestore & Auth"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users ({allRegisteredUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LIVE_SALES')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'LIVE_SALES'
                ? 'bg-[#FACC15] text-black shadow-sm font-black'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Sales</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PENDING_APPROVALS')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'PENDING_APPROVALS'
                ? 'bg-[#FACC15] text-black shadow-sm font-black'
                : pendingApprovals.length > 0
                ? 'bg-yellow-400/20 text-[#FACC15] border border-yellow-400/40 animate-pulse'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Approvals ({pendingApprovals.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('STORES')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'STORES'
                ? 'bg-[#FACC15] text-black shadow-sm font-extrabold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Stores</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('STAFF_WORKERS')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'STAFF_WORKERS'
                ? 'bg-[#FACC15] text-black shadow-sm font-extrabold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staff</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('TICKETS')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'TICKETS'
                ? 'bg-[#FACC15] text-black shadow-sm font-extrabold'
                : waitingTicketsCount > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TicketIcon className="w-3.5 h-3.5" />
            <span>
              Tickets{waitingTicketsCount > 0 ? ` (${waitingTicketsCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PHONE_TRACKER')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'PHONE_TRACKER'
                ? 'bg-[#FACC15] text-black shadow-sm font-extrabold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Phones</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SUPPORT_INBOX')}
            className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black transition flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'SUPPORT_INBOX'
                ? 'bg-emerald-500 text-black shadow-sm font-black'
                : unreadAdminSupportCount > 0
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Support Inbox</span>
            {unreadAdminSupportCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[9px] font-black">
                {unreadAdminSupportCount}
              </span>
            )}
          </button>
        </div>

        {unreadAdminSupportCount > 0 && activeTab !== 'SUPPORT_INBOX' && (
          <div className="mb-2.5 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Headphones className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-bold text-emerald-200 truncate">
                {unreadAdminSupportCount} unread customer support {unreadAdminSupportCount === 1 ? 'message' : 'messages'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('SUPPORT_INBOX')}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] shrink-0 cursor-pointer"
            >
              Open Inbox
            </button>
          </div>
        )}

        {actionMsg && (
          <div className="p-2.5 mb-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-bold shrink-0">
            {actionMsg}
          </div>
        )}

        {waitingTicketsCount > 0 && activeTab !== 'TICKETS' && (
          <div className="mb-2.5 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="text-[11px] font-bold text-amber-200 truncate">
                {waitingTicketsCount} {waitingTicketsCount === 1 ? 'ticket' : 'tickets'} WAITING FOR PAYMENT
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setTicketPaymentFilter('WAITING');
                setActiveTab('TICKETS');
              }}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-black text-[10px] shrink-0 cursor-pointer"
            >
              Send PayShap Request
            </button>
          </div>
        )}

        {pendingApprovals.length > 0 && activeTab !== 'PENDING_APPROVALS' && (
          <div className="mb-2.5 p-2.5 rounded-xl bg-yellow-400/15 border border-[#FACC15]/40 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 text-[#FACC15] shrink-0" />
              <span className="text-[11px] font-bold text-yellow-200 truncate">
                {pendingApprovals.length} registration {pendingApprovals.length === 1 ? 'application' : 'applications'} waiting for approval
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setApprovalFilter('PENDING');
                setActiveTab('PENDING_APPROVALS');
              }}
              className="px-2.5 py-1 rounded-lg bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-[10px] shrink-0 cursor-pointer"
            >
              Review Now
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 0: ADMIN APPROVAL DASHBOARD (REQUIREMENT 5)                 */}
        {/* ================================================================ */}
        {activeTab === 'PENDING_APPROVALS' && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
            <div className="flex items-center justify-between text-xs text-gray-400 font-semibold mb-1">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#FACC15]" />
                <span className="font-black text-white uppercase">Applications & Approvals</span>
              </div>
              <span className="text-[10px] text-[#FACC15] font-mono bg-[#FACC15]/10 px-2 py-0.5 rounded-full border border-[#FACC15]/20 font-bold">
                {pendingApprovals.length} Pending Review
              </span>
            </div>

            {/* Sub-filter Tabs: Pending / Approved / Rejected */}
            <div className="grid grid-cols-3 gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setApprovalFilter('PENDING')}
                className={`py-1.5 px-2 rounded-lg text-[10px] font-black transition cursor-pointer ${
                  approvalFilter === 'PENDING'
                    ? 'bg-[#FACC15] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Pending ({pendingApprovals.length})
              </button>
              <button
                type="button"
                onClick={() => setApprovalFilter('APPROVED')}
                className={`py-1.5 px-2 rounded-lg text-[10px] font-black transition cursor-pointer ${
                  approvalFilter === 'APPROVED'
                    ? 'bg-emerald-500 text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Approved ({approvedStaffUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setApprovalFilter('REJECTED')}
                className={`py-1.5 px-2 rounded-lg text-[10px] font-black transition cursor-pointer ${
                  approvalFilter === 'REJECTED'
                    ? 'bg-rose-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Rejected ({rejectedStaffUsers.length})
              </button>
            </div>

            {/* Full Details Summary Card shown right after Admin approves an application */}
            {lastApprovedUser && (
              <div className="bg-emerald-950/60 border border-emerald-400/50 rounded-2xl p-4 space-y-2.5 shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <span className="text-xs font-black text-emerald-300 uppercase block">
                        Approved Account Details
                      </span>
                      <span className="text-[11px] text-white font-bold">
                        {lastApprovedUser.fullName || lastApprovedUser.name} ({lastApprovedUser.role})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLastApprovedUser(null)}
                    className="text-gray-400 hover:text-white p-1 cursor-pointer"
                    aria-label="Dismiss approved details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-black/50 p-3 rounded-xl border border-white/10 text-[11px]">
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase block font-bold">Full Name</span>
                    <span className="text-white font-bold">{lastApprovedUser.fullName || lastApprovedUser.name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase block font-bold">Role</span>
                    <span className="text-[#FACC15] font-black">{lastApprovedUser.role}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase block font-bold">Email Address</span>
                    <span className="text-gray-200 font-mono break-all">{lastApprovedUser.email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase block font-bold">Phone Number</span>
                    <span className="text-white font-mono font-bold">{lastApprovedUser.phone || '—'}</span>
                  </div>
                  {lastApprovedUser.role === 'Shop Worker' && (
                    <div className="col-span-2">
                      <span className="text-[9px] text-gray-400 uppercase block font-bold">Assigned Shop</span>
                      <span className="text-emerald-300 font-bold">{lastApprovedUser.assignedStoreName || lastApprovedUser.assignedStoreId || '—'}</span>
                    </div>
                  )}
                  {lastApprovedUser.role === 'Seller' && (
                    <>
                      <div>
                        <span className="text-[9px] text-gray-400 uppercase block font-bold">Shop Name</span>
                        <span className="text-[#FACC15] font-bold">{lastApprovedUser.shopName || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 uppercase block font-bold">What They Sell</span>
                        <span className="text-white font-bold">{lastApprovedUser.whatToSell || '—'}</span>
                      </div>
                    </>
                  )}
                  {lastApprovedUser.role === 'Event Organiser' && (
                    <div className="col-span-2">
                      <span className="text-[9px] text-gray-400 uppercase block font-bold">Organisation Name</span>
                      <span className="text-[#FACC15] font-bold">{lastApprovedUser.organisationName || '—'}</span>
                    </div>
                  )}
                  {lastApprovedUser.role === 'Driver' && (
                    <>
                      <div className="col-span-2">
                        <span className="text-[9px] text-gray-400 uppercase block font-bold">Delivery Vehicle</span>
                        <span className="text-[#FACC15] font-bold">{lastApprovedUser.vehicleType || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 uppercase block font-bold">License Plate</span>
                        <span className="text-white font-mono font-bold">{lastApprovedUser.licensePlate || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-400 uppercase block font-bold">Driver's License</span>
                        <span className="text-white font-mono font-bold">{lastApprovedUser.driverLicenseNumber || '—'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {(() => {
              const displayedList =
                approvalFilter === 'PENDING'
                  ? pendingApprovals
                  : approvalFilter === 'APPROVED'
                  ? approvedStaffUsers
                  : rejectedStaffUsers;

              if (displayedList.length === 0) {
                return (
                  <div className="bg-[#121212] p-8 rounded-2xl border border-white/5 text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                    <h4 className="text-sm font-bold text-white">
                      {approvalFilter === 'PENDING'
                        ? 'All Applications Reviewed'
                        : approvalFilter === 'APPROVED'
                        ? 'No Approved Staff Yet'
                        : 'No Rejected Applications'}
                    </h4>
                    <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                      {approvalFilter === 'PENDING'
                        ? 'There are no pending registrations waiting for review. New Event Organisers, Sellers, Drivers, and Shop Workers will appear here automatically.'
                        : approvalFilter === 'APPROVED'
                        ? 'Approved Event Organisers, Sellers, Drivers, and Shop Workers will stay listed here with all their captured details.'
                        : 'Rejected applications will appear here.'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {displayedList.map((user) => (
                    <div
                      key={user.id}
                      className="bg-[#141414] border border-white/10 hover:border-[#FACC15]/40 p-4 rounded-2xl space-y-3 shadow-lg transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-black text-white">{user.fullName || user.name || 'Unnamed Applicant'}</h4>
                            <span className="bg-[#FACC15] text-black text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                              {user.role}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Applied: {user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Recent'}
                          </p>
                        </div>

                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-full border shrink-0 uppercase ${
                            user.status === 'approved' || user.isApproved
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                              : user.status === 'rejected'
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                              : 'bg-yellow-400/10 text-yellow-300 border-yellow-400/30'
                          }`}
                        >
                          {user.status === 'approved' || user.isApproved ? 'Approved' : user.status === 'rejected' ? 'Rejected' : 'Pending'}
                        </span>
                      </div>

                      {/* Full Applicant Details Grid (Always visible before and after approval) */}
                      <div className="bg-black/60 p-3 rounded-xl border border-white/10 grid grid-cols-2 gap-2.5 text-[11px]">
                        <div>
                          <span className="text-[9px] text-gray-500 uppercase block font-bold">Full Name</span>
                          <span className="text-white font-bold">{user.fullName || user.name || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-gray-500 uppercase block font-bold">Phone Number</span>
                          <span className="text-[#FACC15] font-mono font-bold">{user.phone || 'Not provided'}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[9px] text-gray-500 uppercase block font-bold">Email Address</span>
                          <span className="text-gray-200 font-mono break-all">{user.email || '—'}</span>
                        </div>

                        {user.role === 'Shop Worker' && (
                          <div className="col-span-2 pt-1 border-t border-white/5">
                            <span className="text-[9px] text-gray-500 uppercase block font-bold">Assigned Shop</span>
                            <span className="text-emerald-300 font-bold">
                              🏪 {user.assignedStoreName || user.assignedStoreId || 'Unassigned'}
                            </span>
                          </div>
                        )}
                        {user.role === 'Seller' && (
                          <>
                            <div className="pt-1 border-t border-white/5">
                              <span className="text-[9px] text-gray-500 uppercase block font-bold">Shop Name</span>
                              <span className="text-[#FACC15] font-bold">🏬 {user.shopName || 'Not provided'}</span>
                            </div>
                            <div className="pt-1 border-t border-white/5">
                              <span className="text-[9px] text-gray-500 uppercase block font-bold">What They Sell</span>
                              <span className="text-white font-bold">{user.whatToSell || 'Not provided'}</span>
                            </div>
                          </>
                        )}
                        {(user.role === 'Event Organiser' || user.role === 'Promoter') && (
                          <div className="col-span-2 pt-1 border-t border-white/5">
                            <span className="text-[9px] text-gray-500 uppercase block font-bold">Organisation Name</span>
                            <span className="text-[#FACC15] font-bold">🎪 {user.organisationName || 'Not provided'}</span>
                          </div>
                        )}
                        {user.role === 'Driver' && (
                          <>
                            <div className="col-span-2 pt-1 border-t border-white/5">
                              <span className="text-[9px] text-gray-500 uppercase block font-bold">Delivery Vehicle</span>
                              <span className="text-[#FACC15] font-bold">🚗 {user.vehicleType || 'Not provided'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-gray-500 uppercase block font-bold">License Plate</span>
                              <span className="text-white font-mono font-bold">{user.licensePlate || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-gray-500 uppercase block font-bold">Driver's License No.</span>
                              <span className="text-white font-mono font-bold">{user.driverLicenseNumber || 'N/A'}</span>
                            </div>
                          </>
                        )}
                        {user.approvedAt && (
                          <div className="col-span-2 pt-1 border-t border-white/5">
                            <span className="text-[9px] text-emerald-400 uppercase block font-bold">Approved At</span>
                            <span className="text-emerald-200 text-[10px]">{new Date(user.approvedAt).toLocaleString()}</span>
                          </div>
                        )}
                        {user.rejectionReason && (
                          <div className="col-span-2 pt-1 border-t border-white/5">
                            <span className="text-[9px] text-rose-400 uppercase block font-bold">Rejection Reason</span>
                            <span className="text-rose-200 text-[10px]">{user.rejectionReason}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions: Approve & Reject for Pending / Re-Approve for Rejected */}
                      {(!user.isApproved && user.status !== 'approved') && (
                        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                          <button
                            type="button"
                            disabled={processingApprovalId === user.id}
                            onClick={async () => {
                              setProcessingApprovalId(user.id);
                              const res = await approveUser(user.id);
                              setProcessingApprovalId(null);
                              if (res.success) {
                                setLastApprovedUser({
                                  ...user,
                                  status: 'approved',
                                  isApproved: true,
                                  approvedAt: new Date().toISOString(),
                                });
                                setActionMsg(`Account for ${user.fullName || user.name} (${user.role}) approved!`);
                                setTimeout(() => setActionMsg(null), 5000);
                              } else {
                                setActionMsg(`Error approving user: ${res.error || 'Failed'}`);
                                setTimeout(() => setActionMsg(null), 4000);
                              }
                            }}
                            className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{processingApprovalId === user.id ? 'Approving...' : 'Approve'}</span>
                          </button>

                          {user.status !== 'rejected' && (
                            <button
                              type="button"
                              disabled={processingApprovalId === user.id}
                              onClick={() => {
                                setRejectModalUser(user);
                                setRejectReasonInput('');
                              }}
                              className="py-2 px-3 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-bold text-xs transition cursor-pointer"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 1: LIVE EVENT ATTENDANCE OVERVIEW (ADMIN DASHBOARD REAL-TIME) */}
        {/* ================================================================ */}
        {activeTab === 'LIVE_EVENTS' && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
            <div className="flex items-center justify-between text-xs text-gray-400 font-semibold mb-1">
              <span>All Events Real-Time Counts ({eventAttendanceStats.length})</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    navigateTo('/admin/events');
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg border border-white/15 transition cursor-pointer"
                >
                  Events Page
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(null);
                    setActiveModal('add-event');
                  }}
                  className="bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 shadow transition cursor-pointer"
                >
                  <Calendar className="w-3 h-3" />
                  <span>+ Create Event</span>
                </button>
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
            </div>

            {eventAttendanceStats.length === 0 ? (
              <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 text-center text-xs text-gray-400">
                No active events yet. Tap &quot;+ Create Event&quot; to publish one.
              </div>
            ) : (
              eventAttendanceStats.map((item) => {
                const { limitStats } = item;
                const isConfirmingDelete = confirmDeleteEventId === item.event.id;
                const isDeletingThis = deletingEventId === item.event.id;

                return (
                  <div
                    key={item.event.id}
                    className="bg-[#121212] p-3.5 rounded-2xl border border-white/5 space-y-2.5 shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-black text-white text-sm truncate">{item.event.title}</h4>
                          {item.event.status === 'Closed' && (
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md">
                              Closed
                            </span>
                          )}
                          {limitStats.isSoldOut && (
                            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md">
                              SOLD OUT
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-400 block mt-0.5">
                          📍 {item.storeName} • Promoter: {item.promoterName}
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          🗓️ {item.event.date} • 🎟️ {item.event.price} •{' '}
                          {limitStats.hasLimit ? (
                            <span className={limitStats.isSoldOut ? 'text-rose-400 font-bold' : 'text-[#FACC15] font-bold'}>
                              Limit: {limitStats.soldCount}/{limitStats.maxLimit} ({limitStats.remaining} left)
                            </span>
                          ) : (
                            <span className="text-amber-400 font-semibold">No ticket limit set (tap Edit)</span>
                          )}
                        </span>
                      </div>
                      <span className="bg-emerald-500/20 text-emerald-300 font-black text-xs px-2.5 py-1 rounded-xl border border-emerald-500/40 shrink-0">
                        {item.inside} INSIDE
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-white/5">
                      <div className="bg-black/50 p-2 rounded-xl">
                        <span className="text-[9px] text-gray-400 block font-bold">TOTAL SOLD</span>
                        <span className="text-sm font-black text-white">
                          {limitStats.hasLimit
                            ? `${item.totalTickets} / ${limitStats.maxLimit}`
                            : item.totalTickets}
                        </span>
                      </div>

                      <div className="bg-emerald-950/40 p-2 rounded-xl border border-emerald-500/30">
                        <span className="text-[9px] text-emerald-400 block font-bold">INSIDE NOW</span>
                        <span className="text-sm font-black text-emerald-400">{item.inside}</span>
                      </div>

                      <div className="bg-zinc-900/60 p-2 rounded-xl">
                        <span className="text-[9px] text-gray-400 block font-bold">OUTSIDE / LEFT</span>
                        <span className="text-sm font-black text-gray-300">{item.outside}</span>
                      </div>
                    </div>

                    {/* Event Prices & Code */}
                    <div className="grid grid-cols-4 gap-1.5 bg-black/40 p-2 rounded-xl border border-white/5 text-center text-[10px]">
                      <div>
                        <span className="text-gray-400 block font-bold">CODE</span>
                        <span className="text-[#FACC15] font-black font-mono">
                          {item.event.eventCode || item.event.title.replace(/\s+/g, '').slice(0, 6).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-bold">GENERAL</span>
                        <span className="text-white font-mono font-bold">
                          R{parseFloat(String(item.event.generalPrice || item.event.price || '0').replace(/[^0-9.]/g, '')) || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-bold">VIP</span>
                        <span className="text-[#FACC15] font-mono font-bold">
                          {item.event.vipPrice ? `R${item.event.vipPrice}` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-bold">KIDS</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {item.event.kidsPrice ? `R${item.event.kidsPrice}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* CONFIRMED PAYMENTS (Requirement 11) */}
                    <div className="pt-1.5 border-t border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-gray-400 uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Confirmed Payments</span>
                        </span>
                        <span className="text-emerald-400 font-bold text-[9px]">TymeBank SMS Verified</span>
                      </div>

                      {(() => {
                        const paidList = tickets.filter(
                          (t) => t.eventId === item.event.id && t.paymentStatus === 'PAID'
                        );
                        if (paidList.length === 0) {
                          return (
                            <div className="text-[10px] text-gray-500 italic bg-black/30 p-1.5 rounded-lg text-center">
                              No confirmed PayShap SMS payments yet for this event.
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {paidList.map((pt) => {
                              const amountClean =
                                pt.price.replace(/[^0-9.]/g, '') ||
                                String(item.event.generalPrice || item.event.price || 0);
                              return (
                                <div
                                  key={pt.id}
                                  className="text-[11px] font-bold text-emerald-300 bg-emerald-950/50 border border-emerald-500/30 p-1.5 rounded-lg flex items-center justify-between"
                                >
                                  <span>
                                    ✅ {pt.customerName || pt.attendeeName} - {pt.ticketTier || 'General'} - PAID - R{amountClean} - {item.event.title} {item.event.date}
                                  </span>
                                  <span className="text-[9px] font-mono text-gray-400 shrink-0 ml-1">
                                    {pt.ticketId || pt.id}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Admin Event Management Controls: Edit & Delete */}
                    <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEvent(item.event);
                          setActiveModal('add-event');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-[#FACC15] hover:text-black text-gray-200 font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Event &amp; Limit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteEventId(item.event.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer border border-rose-500/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>

                    {isConfirmingDelete && (
                      <div className="p-2.5 bg-rose-950/70 border border-rose-500/50 rounded-xl space-y-2 animate-in fade-in">
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-200 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>Delete event &quot;{item.event.title}&quot; permanently?</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={async () => {
                              setDeletingEventId(item.event.id);
                              await deleteEvent(item.event.id);
                              setDeletingEventId(null);
                              setConfirmDeleteEventId(null);
                              setActionMsg(`Event "${item.event.title}" deleted.`);
                              setTimeout(() => setActionMsg(null), 3500);
                            }}
                            className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px] rounded-lg cursor-pointer transition disabled:opacity-50"
                          >
                            {isDeletingThis ? 'Deleting...' : 'Yes, Delete Event'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEventId(null)}
                            className="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-[11px] rounded-lg cursor-pointer transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: LIVE CASHLESS SALES & VENDOR POS REVENUE FEED (REAL-TIME) */}
        {/* ================================================================ */}
        {activeTab === 'LIVE_SALES' && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
            <div className="flex items-center justify-between text-xs text-gray-400 font-semibold mb-1">
              <span>Live POS Cashless Terminal Sales</span>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Feed
              </span>
            </div>

            {/* Total Revenue Summary Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#121212] p-3 rounded-2xl border border-emerald-500/30">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">TOTAL LIVE REVENUE</span>
                <span className="text-xl font-black text-emerald-400 tracking-tight">
                  R{totalLiveSalesAmount.toFixed(2)}
                </span>
              </div>
              <div className="bg-[#121212] p-3 rounded-2xl border border-[#FACC15]/30">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">TOTAL ITEMS SOLD</span>
                <span className="text-xl font-black text-[#FACC15] tracking-tight">
                  {liveSales.length} items
                </span>
              </div>
            </div>

            {/* Quick Action Button to Open Vendor POS */}
            <button
              type="button"
              onClick={() => setIsVendorPosOpen(true)}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-[#FACC15] via-amber-400 to-yellow-500 hover:brightness-105 active:scale-98 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
            >
              <Beer className="w-4 h-4 stroke-[2.5]" />
              <span>Deduct R30 Beer from Band (Vendor POS Terminal)</span>
            </button>

            {/* Itemized Sales Feed */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Itemized Sales Feed ({liveSales.length})
              </span>

              {liveSales.length === 0 ? (
                <div className="p-6 text-center bg-black/40 rounded-2xl border border-white/5 text-gray-500 text-xs">
                  No sales recorded yet. Click "Deduct R30 Beer" or scan a customer band to see live sales update!
                </div>
              ) : (
                liveSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="bg-[#121212] p-3 rounded-xl border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                        🍺
                      </div>
                      <div>
                        <span className="font-black text-white block">{sale.itemName}</span>
                        <span className="text-[10px] text-gray-400 block">
                          Customer: <strong className="text-gray-200">{sale.customerName}</strong> •{' '}
                          {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-400 block">
                        +R{Number(sale.amount).toFixed(2)}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        VERIFIED
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2.5: REGISTERED USERS & ACCOUNTS (FIRESTORE & AUTH DELETION) */}
        {activeTab === 'USERS_LIST' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            <div className="bg-gradient-to-r from-rose-950/40 via-red-950/30 to-black p-3.5 rounded-2xl border border-rose-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-rose-400" />
                    <span>Registered Accounts ({allRegisteredUsers.length})</span>
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    Manage and delete registered accounts from Firestore &amp; Firebase Auth
                  </p>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="flex items-center gap-2 pt-1">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search name, email, phone, role..."
                    className="w-full pl-8 pr-3 py-1.5 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-400"
                  />
                </div>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="bg-black/60 border border-white/10 text-xs text-gray-300 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-rose-400"
                >
                  <option value="ALL">All Roles</option>
                  <option value="CUSTOMER">Customers</option>
                  <option value="ORGANISER">Event Organisers</option>
                  <option value="SELLER">Sellers / Vendors</option>
                  <option value="DRIVER">Drivers</option>
                  <option value="WORKER">Shop Workers</option>
                  <option value="ADMIN">Admins</option>
                </select>
              </div>
            </div>

            {/* Users List */}
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-gray-400 bg-white/5 rounded-2xl border border-white/5">
                <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-300">No registered users found</p>
                <p className="text-[10px] text-gray-500 mt-1">Users will appear here as soon as they register.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((u) => {
                  const roleBadgeColor =
                    u.role === 'Admin'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : u.role === 'Seller' || u.role === 'vendor' || u.role === 'Vendor'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : u.role === 'driver' || u.role === 'Driver'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : u.role === 'Event Organiser' || u.role === 'Promoter'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : u.role === 'Shop Worker'
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : 'bg-zinc-800 text-gray-300 border-zinc-700';

                  const isPendingUser =
                    u.role !== 'Admin' &&
                    u.role !== 'Customer' &&
                    (u.status === 'pending' || (!u.isApproved && u.status !== 'rejected' && u.status !== 'active'));

                  const isBeingDeleted = deletingUserId === u.id;

                  return (
                    <div
                      key={u.id}
                      className="p-3 bg-[#131313] hover:bg-[#181818] border border-white/5 rounded-2xl transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-500 to-amber-600 text-black font-black flex items-center justify-center text-xs shrink-0">
                            {(u.fullName || u.name || u.email || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-black text-white block truncate">
                              {u.fullName || u.name || 'Unnamed User'}
                            </span>
                            <span className="text-[10px] text-gray-400 block truncate font-mono">
                              {u.email || 'No email registered'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${roleBadgeColor}`}>
                            {u.role || 'Customer'}
                          </span>
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              isPendingUser
                                ? 'bg-yellow-400/15 text-yellow-300 border-yellow-400/40'
                                : u.status === 'rejected'
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                            }`}
                          >
                            {isPendingUser ? 'Pending' : u.status === 'rejected' ? 'Rejected' : u.isApproved || u.status === 'approved' ? 'Approved' : 'Active'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px] text-gray-300">
                        <div>
                          <span className="text-[9px] text-gray-500 block">Phone</span>
                          <span className="font-mono text-gray-200 text-xs font-bold">
                            {u.phone || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-gray-500 block">Wallet Balance</span>
                          <span className="text-[#FACC15] font-extrabold text-xs">
                            R{(u.walletBalance || 0).toFixed(2)}
                          </span>
                        </div>
                        {u.createdAt && (
                          <div className="col-span-2">
                            <span className="text-[9px] text-gray-500 block">Registered</span>
                            <span className="text-gray-300 text-[10px]">
                              {new Date(u.createdAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {(u.shopName || u.organisationName || u.assignedStoreName || u.vehicleType || u.licensePlate || u.driverLicenseNumber) && (
                        <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 text-[11px] space-y-1">
                          {u.assignedStoreName && (
                            <p className="text-gray-300">
                              Assigned Shop: <strong className="text-[#FACC15]">{u.assignedStoreName}</strong>
                            </p>
                          )}
                          {u.shopName && (
                            <p className="text-gray-300">
                              Shop: <strong className="text-[#FACC15]">{u.shopName}</strong>
                              {u.whatToSell ? ` • Selling: ${u.whatToSell}` : ''}
                            </p>
                          )}
                          {u.organisationName && (
                            <p className="text-gray-300">
                              Organisation: <strong className="text-[#FACC15]">{u.organisationName}</strong>
                            </p>
                          )}
                          {(u.vehicleType || u.licensePlate || u.driverLicenseNumber) && (
                            <p className="text-gray-300">
                              Vehicle: <strong className="text-[#FACC15]">{u.vehicleType || '—'}</strong>
                              {u.licensePlate ? ` • Plate: ${u.licensePlate}` : ''}
                              {u.driverLicenseNumber ? ` • License: ${u.driverLicenseNumber}` : ''}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                        <span className="text-[9px] text-gray-500 truncate max-w-[140px]">
                          UID: {u.id}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {isPendingUser && (
                            <button
                              type="button"
                              disabled={processingApprovalId === u.id}
                              onClick={async () => {
                                setProcessingApprovalId(u.id);
                                const res = await approveUser(u.id);
                                setProcessingApprovalId(null);
                                if (res.success) {
                                  setLastApprovedUser({
                                    ...u,
                                    status: 'approved',
                                    isApproved: true,
                                    approvedAt: new Date().toISOString(),
                                  });
                                  setActionMsg(`Approved ${u.fullName || u.name} (${u.role})!`);
                                  setTimeout(() => setActionMsg(null), 4000);
                                } else {
                                  setActionMsg(`Error approving user: ${res.error || 'Failed'}`);
                                  setTimeout(() => setActionMsg(null), 4000);
                                }
                              }}
                              className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{processingApprovalId === u.id ? '...' : 'Approve'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUser({ id: u.id, name: u.fullName || u.name, email: u.email })}
                            disabled={isBeingDeleted}
                            className="py-1 px-3 rounded-lg bg-rose-600/25 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 shadow-sm"
                            title="Delete user from Firestore & Firebase Auth"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{isBeingDeleted ? 'Deleting...' : 'Delete Account'}</span>
                          </button>
                        </div>
                      </div>

                      {confirmDeleteUser?.id === u.id && (
                        <div className="p-2.5 bg-rose-950/70 border border-rose-500/50 rounded-xl space-y-2 animate-in fade-in">
                          <p className="text-[11px] text-rose-200 font-bold">
                            Permanently delete {u.fullName || u.name || u.email} from Firestore, Wallets &amp; Firebase Auth?
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isBeingDeleted}
                              onClick={() => executeAdminDeleteUser({ id: u.id, name: u.fullName || u.name, email: u.email })}
                              className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] rounded-lg cursor-pointer transition"
                            >
                              {isBeingDeleted ? 'Deleting...' : 'Confirm Permanent Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUser(null)}
                              className="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-[10px] rounded-lg cursor-pointer transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ALL STORES */}
        {activeTab === 'STORES' && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-0">
            <div className="flex items-center justify-between text-xs text-gray-400 font-semibold mb-1">
              <span>Registered Venues ({stores.length})</span>
              <span className="text-[10px] text-[#FACC15]">Admin Oversight</span>
            </div>

            {stores.map((s) => {
              const storeTickets = tickets.filter((t) => t.storeId === s.id);
              const assignedPromoter = promoters.find((p) => p.storeId === s.id);

              return (
                <div
                  key={s.id}
                  className="bg-[#121212] p-3.5 rounded-2xl border border-white/5 space-y-2 hover:border-white/10 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={s.imageUrl}
                        alt={s.name}
                        className="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0"
                      />
                      <div>
                        <h4 className="font-bold text-white text-sm">{s.name}</h4>
                        <span className="text-xs text-gray-400">{s.location}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveModal(null);
                        navigateTo(`/store/${s.id}`);
                      }}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-[#FACC15] hover:text-black text-gray-300 transition"
                      title="Inspect Store"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
                    <span>
                      Promoter:{' '}
                      <strong className="text-gray-200">
                        {assignedPromoter ? assignedPromoter.name : 'Unassigned'}
                      </strong>
                    </span>
                    <span className="bg-[#FACC15]/10 text-[#FACC15] px-2 py-0.5 rounded font-mono font-bold">
                      {storeTickets.length} Passes Active
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB: STAFF & WORKERS (ADMIN OVERVIEW & REGISTRATION ACROSS ANY SHOP) */}
        {activeTab === 'STAFF_WORKERS' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  Global Staff & Worker Oversight ({storeWorkers.length})
                </h3>
                <p className="text-[10px] text-gray-400">
                  Register workers or managers under any shop as Admin
                </p>
              </div>
            </div>

            {/* Registration Form for Admin */}
            <div className="bg-[#141414] rounded-2xl p-3.5 border border-[#FACC15]/30 space-y-3 shadow-md">
              <span className="text-xs font-black text-[#FACC15] block">
                + Register Worker or Manager Under Any Shop
              </span>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const targetStoreId = (e.currentTarget.elements.namedItem('adminShopSelect') as HTMLSelectElement)?.value || stores[0]?.id;
                  const targetStore = stores.find((s) => s.id === targetStoreId) || stores[0];
                  const roleSelect = (e.currentTarget.elements.namedItem('adminRoleSelect') as HTMLSelectElement)?.value as 'Worker' | 'Manager' || 'Worker';
                  const nameInput = (e.currentTarget.elements.namedItem('adminStaffName') as HTMLInputElement)?.value;
                  const emailInput = (e.currentTarget.elements.namedItem('adminStaffEmail') as HTMLInputElement)?.value;
                  const phoneInput = (e.currentTarget.elements.namedItem('adminStaffPhone') as HTMLInputElement)?.value;
                  const passInput = (e.currentTarget.elements.namedItem('adminStaffPass') as HTMLInputElement)?.value || '';

                  if (!nameInput || !emailInput || !targetStore || passInput.trim().length < 6) {
                    setActionMsg('Please fill in staff name, email, select a shop, and enter a password (min 6 characters).');
                    setTimeout(() => setActionMsg(null), 4000);
                    return;
                  }

                  const res = await createStoreWorker({
                    storeId: targetStore.id,
                    storeName: targetStore.name,
                    name: nameInput.trim(),
                    email: emailInput.trim(),
                    phone: phoneInput?.trim() || '',
                    password: passInput.trim(),
                    role: roleSelect,
                  });

                  if (res.success) {
                    setActionMsg(`Successfully registered ${roleSelect} "${nameInput}" under "${targetStore.name}"!`);
                    e.currentTarget.reset();
                  } else {
                    setActionMsg(`Error registering staff: ${res.error}`);
                  }
                  setTimeout(() => setActionMsg(null), 4000);
                }}
                className="space-y-2.5 text-xs"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-1">Select Shop *</label>
                    <select
                      name="adminShopSelect"
                      className="w-full bg-[#1C1C1C] border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none focus:border-[#FACC15]"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id} className="bg-[#1C1C1C] text-white">
                          {s.name} ({s.location})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-1">Role Type *</label>
                    <select
                      name="adminRoleSelect"
                      className="w-full bg-[#1C1C1C] border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none focus:border-[#FACC15]"
                    >
                      <option value="Worker">Worker (Orders & Scans)</option>
                      <option value="Manager">Manager (Daily Sales + Orders)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-1">Full Name *</label>
                    <input
                      type="text"
                      name="adminStaffName"
                      required
                      placeholder="e.g. Thabo Mokoena"
                      className="w-full bg-[#1C1C1C] border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none focus:border-[#FACC15]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-1">Email Address *</label>
                    <input
                      type="email"
                      name="adminStaffEmail"
                      required
                      placeholder="thabo@ubmall.co.za"
                      className="w-full bg-[#1C1C1C] border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none focus:border-[#FACC15]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-1">Phone Number</label>
                    <input
                      type="tel"
                      name="adminStaffPhone"
                      placeholder="072 345 6789"
                      className="w-full bg-[#1C1C1C] border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none focus:border-[#FACC15]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-1">Password *</label>
                    <input
                      type="password"
                      name="adminStaffPass"
                      required
                      minLength={6}
                      placeholder="Min 6 characters"
                      className="w-full bg-[#1C1C1C] border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-mono font-bold focus:outline-none focus:border-[#FACC15]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black text-xs rounded-xl transition cursor-pointer shadow-md"
                >
                  Register Staff Under Selected Shop
                </button>
              </form>
            </div>

            {/* List of Workers Grouped / Listed with Shop Name */}
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                Registered Staff & Their Shops ({storeWorkers.length})
              </span>

              {storeWorkers.length === 0 ? (
                <div className="p-6 text-center text-gray-500 bg-[#121212] rounded-2xl border border-white/5 text-xs">
                  No staff accounts registered yet. Use the form above to register workers or managers under any shop.
                </div>
              ) : (
                <div className="space-y-2">
                  {storeWorkers.map((w) => (
                    <div
                      key={w.id}
                      className="bg-[#121212] rounded-2xl p-3 border border-white/10 flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-white truncate">{w.name}</span>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                              w.role === 'Manager' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {w.role || 'Worker'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#FACC15] font-bold mt-0.5 truncate">
                          Shop: {w.storeName}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {w.email} {w.phone ? `• ${w.phone}` : ''}
                        </div>
                      </div>

                      {confirmDeleteWorkerId === w.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteStoreWorker(w.id);
                              setConfirmDeleteWorkerId(null);
                              setActionMsg(`Deleted staff "${w.name}".`);
                              setTimeout(() => setActionMsg(null), 3000);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] transition cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteWorkerId(null)}
                            className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-[10px] transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteWorkerId(w.id)}
                          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition cursor-pointer"
                          title="Delete staff account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ALL TICKETS */}
        {activeTab === 'TICKETS' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="mb-2 bg-black/40 p-2 rounded-xl border border-white/5 flex items-center justify-between text-xs shrink-0 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Building className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                <select
                  value={selectedStoreFilter}
                  onChange={(e) => setSelectedStoreFilter(e.target.value)}
                  className="bg-[#1A1A1A] text-white px-2 py-1.5 rounded-lg border border-white/10 font-bold focus:outline-none focus:border-[#FACC15] text-xs max-w-[160px] truncate"
                >
                  <option value="ALL">All Stores ({tickets.length})</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsQrScannerOpen(true)}
                className="bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow-sm"
              >
                <Camera className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Scan QR</span>
              </button>
            </div>

            {/* Filter: All Tickets vs WAITING FOR PAYMENT */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/60 rounded-xl border border-white/10 mb-3 shrink-0 text-[11px]">
              <button
                type="button"
                onClick={() => setTicketPaymentFilter('ALL')}
                className={`min-h-[38px] rounded-lg font-bold transition cursor-pointer ${
                  ticketPaymentFilter === 'ALL'
                    ? 'bg-white/15 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                All Tickets ({tickets.length})
              </button>
              <button
                type="button"
                onClick={() => setTicketPaymentFilter('WAITING')}
                className={`min-h-[38px] rounded-lg font-black transition cursor-pointer ${
                  ticketPaymentFilter === 'WAITING'
                    ? 'bg-amber-400 text-black'
                    : waitingTicketsCount > 0
                    ? 'text-amber-300'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                WAITING FOR PAYMENT ({waitingTicketsCount})
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              {filteredTickets.length === 0 ? (
                <div className="bg-[#121212] p-6 rounded-xl border border-white/5 text-center text-xs text-gray-400">
                  No tickets match this filter.
                </div>
              ) : (
                filteredTickets.map((t) => {
                  const status: AttendanceStatus =
                    t.attendanceStatus || (t.status === 'used' ? 'INSIDE' : 'OUTSIDE');
                  const isInside = status === 'INSIDE';
                  const waiting = isTicketWaitingPayment(t);
                  const paid = isTicketPaid(t);

                  return (
                    <div
                      key={t.id}
                      className={`bg-[#121212] p-3 rounded-xl border text-xs space-y-2 ${
                        waiting
                          ? 'border-amber-500/40'
                          : paid
                          ? 'border-emerald-500/30'
                          : 'border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white text-xs truncate max-w-[180px]">
                          {t.attendeeName || t.customerName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {waiting ? (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50">
                              WAITING FOR PAYMENT
                            </span>
                          ) : paid ? (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                              PAID ✅
                            </span>
                          ) : null}
                          <span
                            className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                              isInside
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                                : 'bg-zinc-800 text-gray-400'
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span className="text-[#FACC15] font-bold">
                          {t.ticketTier || 'Ticket'} · {t.price}
                        </span>
                        <span className="font-mono text-gray-300">{t.ticketId || t.bandCode}</span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-white/5">
                        <span>
                          Phone:{' '}
                          {waiting
                            ? t.attendeePhone || t.customerPhone || 'Not provided'
                            : maskPhoneNumber(t.attendeePhone || t.customerPhone || '')}
                        </span>
                        <span className="truncate max-w-[150px]">{t.eventTitle}</span>
                      </div>

                      {waiting && t.payshapRequestSent && (
                        <div className="bg-amber-500/15 border border-amber-400/40 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-amber-200">
                          Request Sent - Waiting for customer to approve in their bank app
                        </div>
                      )}

                      {waiting && (
                        <button
                          type="button"
                          onClick={() => setSelectedPayshapTicket(t)}
                          className="w-full min-h-[44px] bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                        >
                          <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Send PayShap Request to Customer</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 4: PHONE & GATE TRACKER (GLOBAL SEARCH + CHECK IN / CHECK OUT) */}
        {activeTab === 'PHONE_TRACKER' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Search Input + Camera QR Scanner Button */}
            <div className="flex gap-2 mb-3 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#FACC15] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Enter phone or last 4 digits..."
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  className="w-full bg-[#121212] text-white pl-9 pr-3 py-2.5 rounded-xl border border-yellow-400/30 text-xs focus:border-[#FACC15] focus:outline-none font-mono"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsQrScannerOpen(true)}
                className="px-3 py-2.5 bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-md"
                title="Scan QR Ticket with Camera"
              >
                <Camera className="w-4 h-4 stroke-[2.5]" />
                <span>Scan</span>
              </button>
            </div>

            {/* Global Results with Live INSIDE / OUTSIDE status & Check In/Out */}
            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                Found Attendees ({matchedPhoneTickets.length})
              </span>

              {matchedPhoneTickets.map((t) => {
                const status: AttendanceStatus =
                  t.attendanceStatus || (t.status === 'used' ? 'INSIDE' : 'OUTSIDE');
                const isInside = status === 'INSIDE';

                return (
                  <div
                    key={t.id}
                    className="bg-[#121212] p-3 rounded-xl border border-white/5 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white text-xs block">
                          {t.attendeeName || t.customerName}
                        </span>
                        <span className="text-[10px] text-yellow-400 font-mono font-bold">
                          {maskPhoneNumber(t.attendeePhone || t.customerPhone || '')}
                        </span>
                      </div>
                      <span className="bg-[#FACC15] text-black font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                        {t.storeName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-300 pt-1 border-t border-white/5">
                      <span>Pass: {t.ticketId || t.bandCode}</span>
                      <span
                        className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          isInside
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                            : 'bg-zinc-800 text-gray-400'
                        }`}
                      >
                        {status} {isInside && t.insideSince ? `(${t.insideSince})` : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      {isInside ? (
                        <button
                          type="button"
                          onClick={() => handleAdminCheckOut(t.ticketId || t.id)}
                          className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-3 py-1 rounded-lg text-[10px] flex items-center gap-1 transition shadow-sm cursor-pointer"
                        >
                          <LogOut className="w-3 h-3 stroke-[2.5]" />
                          <span>Check Out</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAdminCheckIn(t.ticketId || t.id)}
                          className="bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold px-3 py-1 rounded-lg text-[10px] flex items-center gap-1 transition shadow-sm cursor-pointer"
                        >
                          <LogIn className="w-3 h-3 stroke-[2.5]" />
                          <span>Check In</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 8: CUSTOMER SUPPORT INBOX & MANUAL APPROVAL BACKUP           */}
        {/* ================================================================ */}
        {activeTab === 'SUPPORT_INBOX' && (() => {
          const selectedChat = supportChats.find((c) => c.id === activeAdminSupportChatId) || null;

          // Resolve pending tickets attached to or belonging to the selected customer
          const chatAttachedTicketIds = new Set<string>();
          if (selectedChat?.pendingTicketId) {
            chatAttachedTicketIds.add(selectedChat.pendingTicketId);
          }
          selectedChat?.messages.forEach((m) => {
            if (m.ticketAttachment?.ticketId) {
              chatAttachedTicketIds.add(m.ticketAttachment.ticketId);
            }
          });

          const customerTickets = selectedChat
            ? tickets.filter((t) => {
                if (chatAttachedTicketIds.has(t.id) || (t.ticketId && chatAttachedTicketIds.has(t.ticketId))) {
                  return true;
                }
                const matchesId =
                  selectedChat.customerId &&
                  selectedChat.customerId !== 'guest_user' &&
                  (t.userId === selectedChat.customerId || t.user_id === selectedChat.customerId);
                const cPhone = normalizePhone(selectedChat.customerPhone || '');
                const tPhone = normalizePhone(t.attendeePhone || t.customerPhone || '');
                const matchesPhone = Boolean(cPhone && tPhone && cPhone === tPhone);
                return matchesId || matchesPhone;
              })
            : [];

          const pendingTicketsForChat = customerTickets.filter(isTicketWaitingPayment);
          const approvedTicketsForChat = customerTickets.filter((t) => !isTicketWaitingPayment(t) && chatAttachedTicketIds.has(t.id));

          return (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {!selectedChat ? (
                <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
                  <div className="flex items-center justify-between text-xs text-gray-400 font-semibold">
                    <div className="flex items-center gap-1.5">
                      <Headphones className="w-4 h-4 text-emerald-400" />
                      <span className="font-black text-white uppercase">Customer Support Inbox</span>
                    </div>
                    <span className="text-[10px] text-emerald-300 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                      {supportChats.length} Conversations
                    </span>
                  </div>

                  {supportChats.length === 0 ? (
                    <div className="bg-black/40 border border-white/10 rounded-2xl p-8 text-center space-y-2">
                      <MessageSquare className="w-8 h-8 text-gray-500 mx-auto" />
                      <p className="text-sm font-bold text-white">No Customer Support Messages Yet</p>
                      <p className="text-xs text-gray-400">
                        When customers send a message or payment screenshot from the green Support button, it appears here with a loud ringtone alert.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {supportChats.map((chat) => {
                        const hasUnread = (chat.unreadAdminCount || 0) > 0;
                        return (
                          <button
                            key={chat.id}
                            type="button"
                            onClick={() => {
                              setActiveAdminSupportChatId(chat.id);
                              void markChatAsReadByAdmin(chat.id);
                            }}
                            className={`w-full text-left p-3 rounded-2xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                              hasUnread
                                ? 'bg-emerald-950/35 border-emerald-500/50 hover:border-emerald-400'
                                : 'bg-black/40 border-white/10 hover:border-white/25'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="relative shrink-0">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-sm flex items-center justify-center">
                                  {(chat.customerName || 'C').slice(0, 1).toUpperCase()}
                                </div>
                                {hasUnread && (
                                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-600 border-2 border-[#121214]" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-white truncate">
                                    {chat.customerName || 'Customer'}
                                  </span>
                                  {chat.pendingTicketId && (
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                                      Pending Ticket
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-300 truncate mt-0.5">
                                  {chat.lastMessage || 'New support inquiry'}
                                </p>
                                {chat.customerPhone && (
                                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                    {chat.customerPhone}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right space-y-1">
                              {hasUnread && (
                                <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-600 text-white text-[10px] font-black">
                                  {chat.unreadAdminCount}
                                </span>
                              )}
                              <div className="text-[10px] text-gray-500">
                                {chat.lastMessageAt
                                  ? new Date(chat.lastMessageAt).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : ''}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* Conversation Header */}
                  <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => setActiveAdminSupportChatId(null)}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white flex items-center justify-center shrink-0 cursor-pointer"
                        aria-label="Back to Support Inbox list"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-white truncate">
                          {selectedChat.customerName}
                        </h4>
                        <p className="text-[10px] text-gray-400 font-mono truncate">
                          {selectedChat.customerPhone || selectedChat.customerEmail || selectedChat.customerId}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold shrink-0">
                      Manual Backup Ready
                    </span>
                  </div>

                  {/* Pending Ticket Cards with Manual Approve / Reject Backup Actions */}
                  {pendingTicketsForChat.length > 0 && (
                    <div className="mb-2 space-y-2 max-h-48 overflow-y-auto shrink-0 pr-1">
                      {pendingTicketsForChat.map((ticket) => (
                        <div
                          key={ticket.id}
                          className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  WAITING FOR PAYMENT
                                </span>
                                <span className="text-[10px] font-mono text-[#FACC15]">
                                  {ticket.bandCode || ticket.ticketId}
                                </span>
                              </div>
                              <div className="text-xs font-black text-white">
                                {ticket.customerName || ticket.attendeeName} · {ticket.eventTitle || ticket.eventName}
                              </div>
                              <div className="text-[11px] text-gray-300">
                                Tier: <strong className="text-white">{ticket.ticketTier || ticket.tierName || 'General'}</strong> · Amount:{' '}
                                <strong className="text-[#FACC15]">{ticket.price}</strong>
                              </div>
                              <div className="text-[10px] text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
                                {ticket.payshapReference && (
                                  <span>
                                    PayShap Ref: <strong className="font-mono text-white">{ticket.payshapReference}</strong>
                                  </span>
                                )}
                                <span>
                                  Date:{' '}
                                  {ticket.purchaseDate || ticket.createdAt
                                    ? new Date(ticket.purchaseDate || ticket.createdAt).toLocaleString([], {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : ticket.eventDate}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Approve Manually (Green) & Reject - Payment Not Found (Red) */}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              disabled={processingSupportTicketId === ticket.id}
                              onClick={async () => {
                                setProcessingSupportTicketId(ticket.id);
                                const res = await approveTicketManuallyFromChat(ticket.id, selectedChat.id);
                                setProcessingSupportTicketId(null);
                                if (res.message) {
                                  setActionMsg(res.message);
                                  setTimeout(() => setActionMsg(null), 4000);
                                }
                              }}
                              className="py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-[11px] flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50 shadow"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Approve Manually</span>
                            </button>

                            <button
                              type="button"
                              disabled={processingSupportTicketId === ticket.id}
                              onClick={() => {
                                setRejectTicketPrompt({ ticketId: ticket.id, chatId: selectedChat.id });
                                setRejectTicketReason('Payment not reflecting in TymeBank yet');
                              }}
                              className="py-2 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-[11px] flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50 shadow"
                            >
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>Reject - Not Found</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Already Approved indicator (ensures manual approval buttons do not show for already PAID tickets) */}
                  {pendingTicketsForChat.length === 0 && approvedTicketsForChat.length > 0 && (
                    <div className="mb-2 p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 flex items-center justify-between text-[11px] shrink-0">
                      <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Ticket Already Approved & Paid (QR Active)
                      </span>
                      <span className="font-mono text-[10px] text-emerald-200">
                        {approvedTicketsForChat[0].bandCode}
                      </span>
                    </div>
                  )}

                  {/* Chat Messages List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-black/50 rounded-2xl border border-white/10">
                    {selectedChat.messages.map((msg) => {
                      const isAdminMsg = msg.senderRole === 'admin';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isAdminMsg ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] p-2.5 rounded-2xl space-y-1.5 text-xs ${
                              isAdminMsg
                                ? 'bg-emerald-700 text-white rounded-tr-xs'
                                : 'bg-[#1E1E24] border border-white/10 text-white rounded-tl-xs'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[10px] opacity-80 font-bold">
                              <span>{isAdminMsg ? 'You (Admin)' : selectedChat.customerName}</span>
                              <span>
                                {msg.timestamp
                                  ? new Date(msg.timestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : ''}
                              </span>
                            </div>

                            {msg.ticketAttachment && (
                              <div className="bg-black/50 border border-white/15 rounded-xl p-2 text-[11px] space-y-0.5">
                                <div className="flex items-center justify-between font-mono text-[10px] text-[#FACC15]">
                                  <span>{msg.ticketAttachment.ticketBandCode || msg.ticketAttachment.ticketId}</span>
                                  <span className="uppercase font-black">
                                    {tickets.find((t) => t.id === msg.ticketAttachment?.ticketId)?.paymentStatus ||
                                      msg.ticketAttachment.status}
                                  </span>
                                </div>
                                <div className="font-bold text-white">
                                  {msg.ticketAttachment.eventName} · {msg.ticketAttachment.ticketTier} ({msg.ticketAttachment.price})
                                </div>
                                {msg.ticketAttachment.payshapReference && (
                                  <div className="text-[10px] text-gray-400 font-mono">
                                    Ref: {msg.ticketAttachment.payshapReference}
                                  </div>
                                )}
                              </div>
                            )}

                            {msg.imageUrl && (
                              <div className="rounded-xl overflow-hidden border border-white/20 bg-black/40">
                                <img
                                  src={msg.imageUrl}
                                  alt="Customer Payment Proof"
                                  onClick={() => setSupportFullscreenImg(msg.imageUrl || null)}
                                  className="max-h-48 w-full object-cover cursor-pointer hover:opacity-90 transition"
                                />
                                <div className="px-2 py-1 text-[10px] text-emerald-300 bg-black/60 font-bold">
                                  Tap picture to inspect full proof
                                </div>
                              </div>
                            )}

                            {msg.audioUrl && (
                              <div className="rounded-xl overflow-hidden border border-white/20 bg-black/40 p-2">
                                <audio controls src={msg.audioUrl} className="w-full h-8" />
                              </div>
                            )}

                            {msg.text && (
                              <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                                {msg.text}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Admin Reply Form */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const text = adminReplyInput.trim();
                      if (!text || isSendingReply) return;
                      setIsSendingReply(true);
                      await sendAdminSupportReply({ chatId: selectedChat.id, text });
                      setAdminReplyInput('');
                      setIsSendingReply(false);
                    }}
                    className="pt-2 flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      value={adminReplyInput}
                      onChange={(e) => setAdminReplyInput(e.target.value)}
                      placeholder={`Reply to ${selectedChat.customerName}...`}
                      className="flex-1 bg-black/60 border border-white/15 rounded-full px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={isSendingReply || !adminReplyInput.trim()}
                      className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 cursor-pointer transition"
                      aria-label="Send Reply"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })()}

        {/* Bottom Exit Bar */}
        <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-xs shrink-0">
          <span className="text-[11px] text-gray-400">
            Realtime Firestore & Websocket Sync
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

      {/* Camera QR Code Ticket Scanner */}
      <TicketQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onTicketScanned={(scannedTicket) => {
          setGlobalSearchQuery(scannedTicket.attendeePhone || scannedTicket.ticketId || scannedTicket.id);
        }}
      />

      {/* Vendor POS Scanner Terminal */}
      <VendorPosScannerModal
        isOpen={isVendorPosOpen}
        onClose={() => setIsVendorPosOpen(false)}
      />

      {/* Reject Application Modal */}
      {rejectModalUser && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-white/10 rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl">
            <h4 className="text-sm font-black text-white">
              Reject Application: {rejectModalUser.fullName || rejectModalUser.name}
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Provide a reason for declining this {rejectModalUser.role} application. The user will be notified with this message.
            </p>
            <textarea
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder="e.g. Incomplete verification documents or vehicle license expired."
              rows={3}
              className="w-full bg-black/60 border border-white/20 rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRejectModalUser(null)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingApprovalId === rejectModalUser.id}
                onClick={async () => {
                  setProcessingApprovalId(rejectModalUser.id);
                  const res = await rejectUser(
                    rejectModalUser.id,
                    rejectReasonInput.trim() || 'Application declined by administrator.'
                  );
                  setProcessingApprovalId(null);
                  setRejectModalUser(null);
                  if (res.success) {
                    setActionMsg(`Application for ${rejectModalUser.fullName || rejectModalUser.name} rejected.`);
                    setTimeout(() => setActionMsg(null), 4000);
                  } else {
                    setActionMsg(`Error rejecting user: ${res.error || 'Failed'}`);
                    setTimeout(() => setActionMsg(null), 4000);
                  }
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl transition cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TymeBank PayShap SMS Auto-Confirmation Modal */}
      <TymebankSmsModal
        isOpen={isSmsModalOpen}
        onClose={() => setIsSmsModalOpen(false)}
      />

      {/* Manual PayShap Request Modal for WAITING FOR PAYMENT Tickets */}
      <SendPayshapRequestModal
        ticket={
          selectedPayshapTicket
            ? tickets.find((t) => t.id === selectedPayshapTicket.id) || selectedPayshapTicket
            : null
        }
        onClose={() => setSelectedPayshapTicket(null)}
        onMarkRequestSent={markPayshapRequestSent}
      />

      {/* Reject Payment Not Found Reason Modal */}
      {rejectTicketPrompt && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-rose-500/40 rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>Reject - Payment Not Found</span>
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Enter the reason why payment could not be verified. The customer will receive this message and their ticket stays unapproved.
            </p>
            <textarea
              value={rejectTicketReason}
              onChange={(e) => setRejectTicketReason(e.target.value)}
              placeholder="e.g. No deposit of R80 found on TymeBank statement yet"
              rows={3}
              className="w-full bg-black/60 border border-white/20 rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRejectTicketPrompt(null)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = rejectTicketPrompt;
                  setRejectTicketPrompt(null);
                  setProcessingSupportTicketId(target.ticketId);
                  await rejectTicketFromChat(target.ticketId, target.chatId, rejectTicketReason);
                  setProcessingSupportTicketId(null);
                  setActionMsg('Customer notified: Payment not found.');
                  setTimeout(() => setActionMsg(null), 4000);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl transition cursor-pointer"
              >
                Send Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Payment Proof Image Viewer */}
      {supportFullscreenImg && (
        <div
          className="fixed inset-0 z-60 bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setSupportFullscreenImg(null)}
        >
          <button
            type="button"
            onClick={() => setSupportFullscreenImg(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={supportFullscreenImg}
            alt="Customer Proof"
            className="max-h-[85vh] max-w-[95vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-xs text-gray-400 mt-3">Customer Proof of Payment</span>
        </div>
      )}
    </div>
  );
};
