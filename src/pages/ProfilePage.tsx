import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import {
  resolveCustomerQrId,
  encodeCustomerOneQr,
  normalizePhoneDigits,
  getDynamicQrWindowState,
  generateDynamicQrNonce,
} from '../utils/customerQr';
import {
  Store,
  ClipboardList,
  PlusCircle,
  LayoutGrid,
  Shield,
  ShieldCheck,
  Settings,
  LogOut,
  ChevronRight,
  Utensils,
  CheckCircle2,
  Clock,
  RotateCcw,
  Radio,
  Trash2,
  PieChart,
  User,
  KeyRound,
  FileText,
  Sparkles,
  Camera,
  Smartphone,
  History,
  AlertTriangle,
  Ticket as TicketIcon,
  ShoppingBag,
  RefreshCw,
  Fingerprint,
  Volume2,
} from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const {
    currentUser,
    userWalletDoc,
    firebaseUser,
    tickets,
    mallOrders,
    signInWithGoogle,
    signOutUser,
    deleteMyAccount,
    setActiveModal,
    setEditingEvent,
    navigateTo,
  } = useApp();

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [liveReservations, setLiveReservations] = useState<any[]>([]);

  const isUserLoggedIn = Boolean(
    firebaseUser ||
    (currentUser?.isRegistered && currentUser?.id && currentUser?.id !== 'guest_user')
  );

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isAdmin = Boolean(
    isUserLoggedIn &&
    (roleLower === 'admin' || isAuthorizedAdminEmail(currentUser?.email)) &&
    localStorage.getItem('ub_admin_session') === 'true' &&
    sessionStorage.getItem('ub_admin_5locks_passed') === 'true'
  );
  const isPromoter =
    isUserLoggedIn &&
    (roleLower === 'promoter' || roleLower === 'event organiser' || roleLower === 'organizer');
  const isStaffOrAbove = isAdmin || isPromoter;

  const [googleError, setGoogleError] = useState<string | null>(null);

  const customerQrId = useMemo(
    () => resolveCustomerQrId(currentUser?.id, currentUser?.customerQrId),
    [currentUser?.id, currentUser?.customerQrId]
  );

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [activeTokenMeta, setActiveTokenMeta] = useState<{
    slot: number;
    issuedAtMs: number;
    nonce: string;
  }>(() => {
    const initialNow = Date.now();
    return {
      slot: getDynamicQrWindowState(initialNow).slot,
      issuedAtMs: initialNow,
      nonce: generateDynamicQrNonce(),
    };
  });

  const refreshDynamicQr = () => {
    const now = Date.now();
    setNowMs(now);
    setActiveTokenMeta({
      slot: getDynamicQrWindowState(now).slot,
      issuedAtMs: now,
      nonce: generateDynamicQrNonce(),
    });
  };

  useEffect(() => {
    if (!isUserLoggedIn || !customerQrId) return;

    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      setActiveTokenMeta((prev) => {
        if (!getDynamicQrWindowState(current, prev.issuedAtMs).isRotationDue) {
          return prev;
        }
        return {
          slot: getDynamicQrWindowState(current).slot,
          issuedAtMs: current,
          nonce: generateDynamicQrNonce(),
        };
      });
    };

    const timer = setInterval(tick, 1000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [isUserLoggedIn, customerQrId]);

  const dynamicWindow = getDynamicQrWindowState(nowMs, activeTokenMeta.issuedAtMs);

  const customerQrPayload = useMemo(
    () =>
      customerQrId
        ? encodeCustomerOneQr(
            {
              id: currentUser?.id,
              customerQrId,
              fullName: currentUser?.fullName || currentUser?.name,
              name: currentUser?.name,
              phone: currentUser?.phone,
              email: currentUser?.email,
            },
            activeTokenMeta.issuedAtMs,
            activeTokenMeta.nonce
          )
        : '',
    [
      customerQrId,
      currentUser?.id,
      currentUser?.fullName,
      currentUser?.name,
      currentUser?.phone,
      currentUser?.email,
      activeTokenMeta.issuedAtMs,
      activeTokenMeta.nonce,
    ]
  );

  useEffect(() => {
    if (!isUserLoggedIn) {
      setLiveReservations([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'reservations'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setLiveReservations(list);
      },
      (err) => {
        console.warn('Profile reservations snapshot notice:', err);
      }
    );
    return () => unsub();
  }, [isUserLoggedIn]);

  const customerPhoneNorm = normalizePhoneDigits(currentUser?.phone || '');
  const uid = currentUser?.id && currentUser.id !== 'guest_user' ? currentUser.id : '';
  const idNum = userWalletDoc?.idNumber || '';

  const myOneQrTickets = useMemo(() => {
    if (!isUserLoggedIn) return [];
    return tickets.filter((t) => {
      if ((t as any).isBinned || t.status?.toLowerCase() === 'binned') return false;
      const tPhone = normalizePhoneDigits(t.customerPhone || t.attendeePhone || '');
      return (
        (uid && (t.userId === uid || t.user_id === uid)) ||
        (customerQrId && t.customerQrId === customerQrId) ||
        (customerPhoneNorm && tPhone && tPhone === customerPhoneNorm)
      );
    });
  }, [isUserLoggedIn, tickets, uid, customerQrId, customerPhoneNorm]);

  const myOneQrReservations = useMemo(() => {
    if (!isUserLoggedIn) return [];
    return liveReservations.filter((r) => {
      const rPhone = normalizePhoneDigits(r.customerPhone || '');
      return (
        (uid && (r.walletId === uid || r.customerId === uid || r.beneficiaryId === uid)) ||
        (idNum && r.customerId === idNum) ||
        (customerQrId && r.customerQrId === customerQrId) ||
        (customerPhoneNorm && rPhone && rPhone === customerPhoneNorm)
      );
    });
  }, [isUserLoggedIn, liveReservations, uid, idNum, customerQrId, customerPhoneNorm]);

  const myOneQrOrders = useMemo(() => {
    if (!isUserLoggedIn) return [];
    return mallOrders.filter((o) => {
      const oPhone = normalizePhoneDigits(o.customerPhone || '');
      return (
        (uid && o.customerId === uid) ||
        (customerQrId && o.customerQrId === customerQrId) ||
        (customerPhoneNorm && oPhone && oPhone === customerPhoneNorm)
      );
    });
  }, [isUserLoggedIn, mallOrders, uid, customerQrId, customerPhoneNorm]);

  const totalOneQrItems =
    myOneQrTickets.length + myOneQrReservations.length + myOneQrOrders.length;

  const menuItems = [
    // Admin Only Tools
    ...(isAdmin
      ? [
          {
            id: 'admin-logo-settings',
            title: 'Upload Brand Logo (Admin Logo Settings)',
            icon: Camera,
            iconColor: 'text-[#C9A86A]',
            action: () => navigateTo('/admin/logo-settings'),
          },
          {
            id: 'admin-icon-settings',
            title: 'Change App Icon (PWA & Favicon)',
            icon: Smartphone,
            iconColor: 'text-[#C9A86A]',
            action: () => navigateTo('/admin/icon-settings'),
          },
          {
            id: 'admin-payshap-settings',
            title: 'Admin Settings · Change PayShap ID',
            icon: Smartphone,
            iconColor: 'text-[#FACC15]',
            action: () => navigateTo('/admin/payshap-settings'),
          },
          {
            id: 'admin-snapscan-settings',
            title: 'Admin Settings · SnapScan Keys (PIN)',
            icon: Shield,
            iconColor: 'text-[#FACC15]',
            action: () => navigateTo('/admin/snapscan-settings'),
          },
          {
            id: 'admin-give-ticket',
            title: 'Give Backup Ticket (Any Event / Tier)',
            icon: Shield,
            iconColor: 'text-emerald-400',
            action: () => navigateTo('/admin/give-ticket'),
          },
          {
            id: 'admin-buy-ticket-alarm',
            title: 'Buy Ticket Alarm Song (Admin Only)',
            icon: Volume2,
            iconColor: 'text-[#FACC15]',
            action: () => navigateTo('/admin/buy-ticket-alarm'),
          },
          {
            id: 'admin-live-payments',
            title: 'Live Payments & SMS Confirmation',
            icon: Radio,
            iconColor: 'text-emerald-400',
            action: () => navigateTo('/admin/live-payments'),
          },
          {
            id: 'admin-console',
            title: 'Admin Console & Reports',
            icon: Shield,
            iconColor: 'text-[#FACC15]',
            action: () => setActiveModal('admin-console'),
          },
          {
            id: 'admin-verifications',
            title: 'ID Approvals & Liquor Control (Admin)',
            icon: ShieldCheck,
            iconColor: 'text-[#FACC15]',
            action: () => navigateTo('/admin/verifications'),
          },
          {
            id: 'store-requests',
            title: 'Store Applications & Requests',
            icon: ClipboardList,
            iconColor: 'text-[#FACC15]',
            action: () => setActiveModal('store-requests'),
          },
          {
            id: 'write-nfc',
            title: 'Write NFC Tag (Secure Link)',
            icon: Radio,
            iconColor: 'text-[#FACC15]',
            action: () => navigateTo('/admin/write-nfc'),
          },
          {
            id: 'admin-bin',
            title: 'Event Day Bin (Recycle Bin)',
            icon: Trash2,
            iconColor: 'text-rose-400',
            action: () => navigateTo('/admin/bin'),
          },
          {
            id: 'app-lock-settings',
            title: 'App Lock & Security PIN',
            icon: Settings,
            iconColor: 'text-[#FACC15]',
            action: () => setActiveModal('app-lock-settings'),
          },
        ]
      : []),

    // Promoter & Admin Only Tools
    ...(isStaffOrAbove
      ? [
          {
            id: 'promoter-dashboard',
            title: 'Promoter Dashboard & Sales',
            icon: LayoutGrid,
            iconColor: 'text-[#FACC15]',
            action: () => setActiveModal('promoter-dashboard'),
          },
          {
            id: 'my-stores',
            title: 'My Managed Stores',
            icon: Store,
            iconColor: 'text-[#FACC15]',
            action: () => setActiveModal('my-stores'),
          },
          {
            id: 'add-event',
            title: 'Publish New Event',
            icon: PlusCircle,
            iconColor: 'text-[#FACC15]',
            action: () => {
              setEditingEvent(null);
              setActiveModal('add-event');
            },
          },
          {
            id: 'gate-checkin',
            title: 'Gate Check-In (Scanner)',
            icon: ShieldCheck,
            iconColor: 'text-[#FACC15]',
            action: () => navigateTo('/check-in'),
          },
          {
            id: 'event-checkin-door',
            title: 'Event Check-In Door (NFC Tap)',
            icon: Radio,
            iconColor: 'text-emerald-400',
            action: () => navigateTo('/staff/check-in'),
          },
        ]
      : []),

    // Standard Customer Features (Visible to Everyone)
    {
      id: 'verify-id',
      title: 'SA ID Verification for Alcohol',
      icon: ShieldCheck,
      iconColor: userWalletDoc?.canBuyAlcohol ? 'text-emerald-400' : 'text-[#FACC15]',
      action: () => navigateTo('/verify-id'),
    },
    {
      id: 'reserved-items',
      title: 'Reserved Food & Drinks (To Collect)',
      icon: Utensils,
      iconColor: 'text-[#FACC15]',
      action: () => navigateTo('/reserved'),
    },
    {
      id: 'reservation-history',
      title: 'Reservation History (All Records)',
      icon: ClipboardList,
      iconColor: 'text-[#FACC15]',
      action: () => navigateTo('/history'),
    },
    {
      id: 'ticket-history',
      title: 'Ticket History (Expired & Past Passes)',
      icon: History,
      iconColor: 'text-[#C9A86A]',
      action: () => setActiveModal('ticket-history'),
    },
    {
      id: 'change-password-otp',
      title: 'Change Password (Email OTP)',
      icon: KeyRound,
      iconColor: 'text-[#FACC15]',
      action: () => setActiveModal('reset-password-otp'),
    },
    {
      id: 'terms-and-conditions',
      title: 'Terms & Conditions & Privacy',
      icon: FileText,
      iconColor: 'text-[#FACC15]',
      action: () => setActiveModal('terms'),
    },
    {
      id: 'app-lock-settings',
      title: 'App Lock & Security (Add Fingerprint / Add PIN)',
      icon: Fingerprint,
      iconColor: 'text-[#FACC15]',
      action: () => setActiveModal('app-lock-settings'),
    },
    {
      id: 'every-cent',
      title: 'Every Cent Spent (Audit & Breakdown)',
      icon: PieChart,
      iconColor: 'text-[#FACC15]',
      action: () => navigateTo('/every-cent'),
    },
  ];

  return (
    <div className="pb-24 pt-4 px-4 max-w-md mx-auto">
      {/* Title "Profile" */}
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Profile
        </h1>
        {customerQrId && (
          <span className="text-[11px] font-mono text-gray-400 tabular-nums">
            {customerQrId}
          </span>
        )}
      </div>

      {/* ONE QR HUB CARD: Top (Photo/Name/Phone) -> Middle (BIG ONE QR) -> Below QR (Instruction + Everything Inside Your ONE QR) */}
      <div className="bg-[#1A1A1A] rounded-2xl p-5 border border-white/10 shadow-xl mb-6">
        {/* TOP: Customer Profile Photo, Name, Phone */}
        <div className="flex items-center gap-4 pb-4 border-b border-white/10">
          {currentUser.photo ? (
            <img
              src={currentUser.photo}
              alt={currentUser.fullName || currentUser.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-[#FACC15]/50 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#383E2A] text-[#FACC15] border border-yellow-400/30 flex items-center justify-center font-extrabold text-2xl shadow-inner shrink-0">
              {(currentUser.fullName || currentUser.name || 'U').charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-white tracking-tight truncate">
              {currentUser.fullName || currentUser.name}
            </h2>
            <p className="text-xs text-gray-300 font-semibold mt-0.5 tabular-nums">
              {currentUser.phone || 'No phone number added'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
              {currentUser.role}
              {currentUser.email ? ` · ${currentUser.email}` : ''}
            </p>
          </div>
        </div>

        {/* MIDDLE: BIG DYNAMIC ONE QR CODE */}
        {isUserLoggedIn && customerQrPayload ? (
          <div className="py-5 flex flex-col items-center text-center border-b border-white/10">
            <div className="bg-white p-4 rounded-2xl shadow-2xl border-4 border-[#FACC15]/80">
              <QRCodeSVG
                value={customerQrPayload}
                size={232}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
              />
            </div>

            <div className="w-full max-w-[264px] mt-3 space-y-2">
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FACC15] transition-transform duration-300 ease-linear"
                  style={{
                    transform: `scaleX(${dynamicWindow.progressPct / 100})`,
                    transformOrigin: 'left',
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-300 tabular-nums">
                <span className="font-semibold text-[#FACC15]">
                  Dynamic QR · Refreshes in {dynamicWindow.formattedRemaining}
                </span>
                <span className="font-mono text-[11px] text-gray-400">
                  {activeTokenMeta.nonce.slice(0, 4)}
                </span>
              </div>
            </div>

            <p className="mt-2.5 text-xs font-mono font-bold text-gray-300 tracking-wider tabular-nums">
              {customerQrId}
            </p>
            <p className="mt-2 text-sm font-semibold text-white max-w-xs leading-snug">
              This is your ONE QR. Show this for tickets, food, merch.
            </p>
            <p className="mt-1 text-xs text-gray-400 max-w-xs leading-snug">
              Each code stays valid for 5 minutes and refreshes automatically.
            </p>

            <button
              type="button"
              onClick={refreshDynamicQr}
              className="mt-3 min-h-[44px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 text-xs font-bold text-white inline-flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Refresh Dynamic QR</span>
            </button>
          </div>
        ) : (
          <div className="py-5 text-center border-b border-white/10 space-y-3">
            <p className="text-sm font-bold text-white">
              Sign in or register to unlock your permanent ONE QR
            </p>
            <p className="text-xs text-gray-400">
              Your single permanent QR holds all tickets, food reservations, and merch orders.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => navigateTo('/register')}
                className="min-h-[44px] px-5 bg-[#FACC15] text-black font-black text-xs rounded-xl cursor-pointer"
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/login')}
                className="min-h-[44px] px-5 bg-white/10 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Log In
              </button>
            </div>
          </div>
        )}

        {/* BELOW QR: Everything This ONE QR Contains */}
        {isUserLoggedIn && (
          <div className="pt-4">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Everything Inside Your ONE QR
              </h3>
              <span className="text-xs font-bold text-[#FACC15] tabular-nums">
                {totalOneQrItems} {totalOneQrItems === 1 ? 'item' : 'items'}
              </span>
            </div>

            {totalOneQrItems === 0 ? (
              <div className="py-4 text-center bg-black/30 rounded-xl border border-white/5 px-3">
                <p className="text-xs text-gray-400">
                  No active tickets, food reservations, or merch orders linked yet. Purchases you make are added automatically to this ONE QR.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                {myOneQrTickets.map((tkt) => {
                  const isWaiting =
                    tkt.paymentStatus === 'WAITING FOR PAYMENT' ||
                    tkt.paymentStatus === 'PENDING_PAYMENT';
                  const isPaid = tkt.paymentStatus === 'PAID' || tkt.paymentStatus === 'VERIFIED';
                  const statusText = isWaiting
                    ? tkt.payshapRequestSent
                      ? 'WAITING FOR PAYMENT · Request Sent'
                      : 'WAITING FOR PAYMENT'
                    : isPaid
                    ? tkt.attendanceStatus === 'INSIDE'
                      ? 'Inside Event · PAID ✅'
                      : 'Ticket Confirmed - PAID ✅'
                    : tkt.attendanceStatus === 'INSIDE'
                    ? 'Inside Event'
                    : tkt.attendanceStatus === 'EXITED'
                    ? 'Exited'
                    : 'Ready for Entry';
                  return (
                    <div
                      key={`tkt-${tkt.id}`}
                      className="min-h-[44px] bg-black/40 rounded-xl px-3 py-2.5 border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TicketIcon className="w-4 h-4 text-[#FACC15] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {tkt.eventName || tkt.eventTitle}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">
                            Ticket · {tkt.ticketTier || tkt.tierName || 'General'} · {tkt.eventDate || tkt.storeName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-white tabular-nums">
                          {tkt.price}
                        </p>
                        <p className={`text-[11px] font-semibold ${isWaiting ? 'text-amber-300' : isPaid || tkt.attendanceStatus === 'INSIDE' ? 'text-emerald-400' : 'text-gray-300'}`}>
                          {statusText}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {myOneQrReservations.map((res) => {
                  const isCollected = res.status === 'collected' || res.status === 'delivered';
                  const isRefunded = res.status === 'refunded' || res.status === 'cancelled';
                  const qty = res.qty || res.quantity || 1;
                  const totalAmt = Number(res.totalAmount || res.amount || res.total || 0);
                  return (
                    <div
                      key={`res-${res.id}`}
                      className="min-h-[44px] bg-black/40 rounded-xl px-3 py-2.5 border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Utensils className="w-4 h-4 text-[#FACC15] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {qty}× {res.itemName || res.name || 'Food / Drink'}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">
                            Food & Drinks · {res.storeName || res.venueName || 'Venue Counter'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-white tabular-nums">
                          R{totalAmt.toFixed(2)}
                        </p>
                        <p className={`text-[11px] font-semibold ${isCollected ? 'text-emerald-400' : isRefunded ? 'text-gray-500' : 'text-[#FACC15]'}`}>
                          {isCollected ? 'Collected' : isRefunded ? 'Refunded' : 'Ready to Collect'}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {myOneQrOrders.map((ord) => {
                  const isWaitingPay =
                    ord.paymentStatus === 'WAITING FOR PAYMENT' ||
                    ord.paymentStatus === 'PENDING_PAYMENT';
                  const isDone = ord.status === 'collected' || ord.status === 'delivered';
                  const firstItem = ord.items?.[0]?.name || 'Order';
                  const summary =
                    ord.items && ord.items.length > 1
                      ? `${firstItem} +${ord.items.length - 1} more`
                      : firstItem;
                  return (
                    <div
                      key={`ord-${ord.id}`}
                      className="min-h-[44px] bg-black/40 rounded-xl px-3 py-2.5 border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ShoppingBag className="w-4 h-4 text-[#FACC15] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {summary}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {ord.storeName} · {ord.orderNumber} · {ord.collectionMethod === 'DELIVERY' ? 'Delivery' : 'Collection'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-white tabular-nums">
                          R{Number(ord.total || 0).toFixed(2)}
                        </p>
                        <p
                          className={`text-[11px] font-semibold ${
                            ord.status === 'cancelled'
                              ? 'text-rose-400'
                              : isWaitingPay
                              ? 'text-amber-300'
                              : isDone
                              ? 'text-emerald-400'
                              : 'text-[#FACC15]'
                          }`}
                        >
                          {ord.status === 'cancelled'
                            ? 'Cancelled'
                            : isWaitingPay
                            ? 'Waiting Payment'
                            : ord.status === 'delivered'
                            ? 'Delivered'
                            : ord.status === 'collected'
                            ? 'Collected'
                            : ord.status === 'out_for_delivery' || ord.status === 'collected_by_driver'
                            ? 'On The Way'
                            : ord.status === 'driver_assigned'
                            ? 'Driver Assigned'
                            : ord.status === 'ready_for_pickup'
                            ? 'Ready'
                            : 'Preparing'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Wristband Quick Balance Card */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Universal Band Balance
            </span>
            <span className="text-[#FACC15] font-black text-lg tabular-nums">
              R{currentUser.walletBalance.toFixed(2)}
            </span>
          </div>
          <button
            onClick={() => setActiveModal('wallet')}
            className="min-h-[44px] text-xs font-bold bg-[#FACC15]/10 hover:bg-[#FACC15]/20 text-[#FACC15] border border-[#FACC15]/30 px-4 py-2 rounded-xl transition cursor-pointer"
          >
            Manage Band
          </button>
        </div>
      </div>

      {/* Requirement: In /profile page show verification badge:
          If idVerified==false show big button "Verify ID to unlock Alcohol" linking to /verify-id.
          If pending show "Verification pending".
          If verified show green check "ID Verified - Can buy Alcohol". */}
      <div className="mb-6">
        {userWalletDoc?.idVerified || userWalletDoc?.verificationStatus === 'verified' ? (
          <div className="bg-emerald-500/10 border-2 border-emerald-500/40 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <span className="text-xs font-black text-emerald-400 block tracking-wide">
                  ID Verified - Can buy Alcohol
                </span>
                <span className="text-[11px] text-gray-300">
                  Legal age verified (Age: {userWalletDoc.age || 28}) • 18+ Unlocked
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('/verify-id')}
              className="text-[11px] font-bold text-emerald-400 hover:text-white underline cursor-pointer"
            >
              Details
            </button>
          </div>
        ) : userWalletDoc?.verificationStatus === 'pending' ? (
          <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
                <Clock className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <span className="text-xs font-black text-amber-300 block tracking-wide uppercase">
                  Verification pending
                </span>
                <span className="text-[11px] text-gray-300">
                  Under review by venue compliance team
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('/verify-id')}
              className="text-[11px] font-bold text-amber-300 hover:text-white underline cursor-pointer"
            >
              Status
            </button>
          </div>
        ) : (
          <div className="bg-[#161616] border-2 border-[#FACC15]/40 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🔞</span>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  Alcohol Access Locked
                </h3>
              </div>
              <span className="text-[10px] text-[#FACC15] font-bold">18+ Only</span>
            </div>
            <p className="text-[11px] text-gray-300 mb-3 leading-snug">
              To buy or reserve alcohol at venue counters, South African regulations require ID verification. Food and soft drinks are always available.
            </p>
            <button
              type="button"
              onClick={() => navigateTo('/verify-id')}
              className="w-full bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
              <span>Verify ID to unlock Alcohol</span>
            </button>
          </div>
        )}
      </div>

      {/* Menu List Cards: Each row is dark card with yellow icon and white text */}
      <div className="space-y-3">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={item.action}
              className="w-full bg-[#1A1A1A] hover:bg-[#222222] active:scale-[0.99] rounded-2xl p-4 border border-white/5 transition-all flex items-center justify-between text-left group shadow-sm focus:outline-none"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-black/40 flex items-center justify-center shrink-0 border border-white/5 group-hover:border-[#FACC15]/30 transition-colors">
                  <Icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <span className="text-sm font-semibold text-white tracking-tight group-hover:text-yellow-300 transition-colors">
                  {item.title}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
            </button>
          );
        })}

        {/* Account Management & Login / Register */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => navigateTo('/login')}
            className="bg-[#1A1A1A] hover:bg-[#222222] active:scale-[0.98] rounded-2xl p-3 border border-white/5 transition flex items-center gap-2.5 text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#FACC15]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Log In</span>
              <span className="text-[10px] text-gray-400 block">Switch user</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('/register')}
            className="bg-[#1A1A1A] hover:bg-[#222222] active:scale-[0.98] rounded-2xl p-3 border border-[#FACC15]/20 transition flex items-center gap-2.5 text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-[#FACC15]/10 flex items-center justify-center text-[#FACC15]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-yellow-400 block">Register</span>
              <span className="text-[10px] text-gray-400 block">New account</span>
            </div>
          </button>
        </div>

        {/* Google Cloud Auth Sync */}
        <div>
          <button
            onClick={async () => {
              setGoogleError(null);
              if (firebaseUser) {
                signOutUser();
              } else {
                const res = await signInWithGoogle();
                if (!res.success && res.error) {
                  setGoogleError(res.error);
                }
              }
            }}
            className="w-full bg-[#1A1A1A] hover:bg-[#222222] active:scale-[0.99] rounded-2xl p-4 border border-white/5 transition-all flex items-center justify-between text-left group shadow-sm focus:outline-none"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-yellow-400/10 flex items-center justify-center shrink-0 border border-yellow-400/20">
                <span className="font-black text-[#FACC15] text-xs">G</span>
              </div>
              <div>
                <span className="text-sm font-semibold text-white tracking-tight group-hover:text-yellow-300 transition-colors block">
                  {firebaseUser ? 'Google Account Connected' : 'Connect Google Firebase Account'}
                </span>
                <span className="text-[11px] text-gray-400 block">
                  {firebaseUser ? firebaseUser.email : 'Sync across devices & live cloud'}
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-[#FACC15]">
              {firebaseUser ? 'Disconnect' : 'Connect'}
            </span>
          </button>

          {googleError && (
            <div className="mt-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <span className="flex-1 leading-relaxed">{googleError}</span>
            </div>
          )}
        </div>

        {/* Delete My Account Button (Both Firestore & Firebase Auth) */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setDeleteAccountError(null);
              setShowDeleteConfirm((prev) => !prev);
            }}
            disabled={isDeletingAccount}
            className="w-full bg-rose-950/40 hover:bg-rose-900/60 active:scale-[0.99] rounded-2xl p-4 border border-rose-500/40 transition-all flex items-center justify-between text-left group shadow-sm focus:outline-none cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-extrabold text-rose-300 tracking-tight block">
                  {isDeletingAccount ? 'Deleting Account...' : 'Delete My Account'}
                </span>
                <span className="text-[10px] text-rose-200/70 block">
                  Permanently delete from Firestore users & Firebase Auth
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-rose-400/50" />
          </button>

          {showDeleteConfirm && (
            <div className="bg-rose-950/70 border border-rose-500/50 rounded-2xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-start gap-2.5 text-xs text-rose-100">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black text-rose-200">PERMANENTLY DELETE YOUR ACCOUNT?</p>
                  <p className="text-[11px] text-rose-200/80 leading-relaxed">
                    This will permanently remove your Firestore user profile, delete your Firebase Auth account, and clear cached login on this device. You will have to register again as a new user.
                  </p>
                </div>
              </div>
              {deleteAccountError && (
                <div className="p-2.5 rounded-xl bg-black/50 border border-rose-400/40 text-rose-200 text-xs">
                  {deleteAccountError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={async () => {
                    setDeleteAccountError(null);
                    setIsDeletingAccount(true);
                    const res = await deleteMyAccount();
                    setIsDeletingAccount(false);
                    if (!res.success && res.error) {
                      setDeleteAccountError(`Error deleting account: ${res.error}`);
                    }
                  }}
                  className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl cursor-pointer transition disabled:opacity-50"
                >
                  {isDeletingAccount ? 'Deleting...' : 'Yes, Delete Permanently'}
                </button>
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="py-2.5 px-4 bg-white/10 hover:bg-white/20 text-gray-200 font-bold text-xs rounded-xl cursor-pointer transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button
          type="button"
          onClick={async () => {
            await signOutUser();
          }}
          className="w-full bg-[#1A1A1A] hover:bg-red-950/20 active:scale-[0.99] rounded-2xl p-4 border border-red-500/20 transition-all flex items-center justify-between text-left group shadow-sm focus:outline-none cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-red-950/40 flex items-center justify-center shrink-0 border border-red-500/30">
              <LogOut className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <span className="text-sm font-bold text-red-500 tracking-tight block">
                Log Out
              </span>
              <span className="text-[10px] text-gray-500 block">
                Sign out properly, clear token & return to First Screen
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-red-500/50" />
        </button>
      </div>
    </div>
  );
};
