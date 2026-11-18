import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { ReservationDoc } from '../types';
import { isAlcoholItem } from '../utils/ageHelper';
import { doesUserOwnReservation } from '../utils/legacyCleanup';
import {
  Utensils,
  Store,
  Clock,
  ArrowLeft,
  CheckCircle2,
  Wallet,
  ShoppingBag,
  MapPin,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
  User,
} from 'lucide-react';

interface StoreReservedGroup {
  storeId: string;
  storeName: string;
  items: (ReservationDoc & { id: string })[];
  groupTotal: number;
}

export const ReservedPage: React.FC = () => {
  const { currentUser, navigateTo, setActiveModal, setSelectedStoreId, topUpWallet } = useApp();
  const [allReservations, setAllReservations] = useState<(ReservationDoc & { id: string })[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [filterMode, setFilterMode] = useState<'active' | 'all'>('active');

  const walletId = currentUser?.id && currentUser.id !== 'guest_user' ? currentUser.id : '';

  useEffect(() => {
    if (!walletId) {
      setAllReservations([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'reservations'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: (ReservationDoc & { id: string })[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ReservationDoc;
          if (!doesUserOwnReservation(data, currentUser)) return;
          list.push({
            id: docSnap.id,
            ...data,
          });
        });

        // Order by paidAt desc
        list.sort((a, b) => {
          const getTime = (val: any) => {
            if (!val) return 0;
            if (typeof val.toMillis === 'function') return val.toMillis();
            if (typeof val.seconds === 'number') return val.seconds * 1000;
            if (val instanceof Date) return val.getTime();
            const parsed = new Date(val).getTime();
            return isNaN(parsed) ? 0 : parsed;
          };
          return getTime(b.paidAt) - getTime(a.paidAt);
        });

        setAllReservations(list);
        setLoading(false);
      },
      (error) => {
        console.warn('Error querying reservations for /reserved:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [walletId, currentUser?.id, currentUser?.idNumber, currentUser?.phone, currentUser?.customerQrId]);

  // Active items: filter to show only status == "paid" or "reserved"
  const activeItems = allReservations.filter(
    (item) => item.status === 'paid' || item.status === 'reserved' || item.status === 'reserved_for_event'
  );

  const refundedCount = allReservations.filter((item) => item.status === 'refunded').length;

  // Selected display items based on filterMode
  const displayedItems = filterMode === 'active'
    ? activeItems
    : allReservations.filter((i) => i.status === 'paid' || i.status === 'reserved' || i.status === 'reserved_for_event' || i.status === 'refunded');

  // Group by storeName
  const groupedByStore = displayedItems.reduce<Record<string, StoreReservedGroup>>(
    (acc, item) => {
      const sName = item.storeName || 'Venue Store';
      const sId = item.storeId || '';

      if (!acc[sName]) {
        acc[sName] = {
          storeId: sId,
          storeName: sName,
          items: [],
          groupTotal: 0,
        };
      }

      acc[sName].items.push(item);
      const cost = Number(item.price ?? item.total ?? 0);
      acc[sName].groupTotal += cost;
      return acc;
    },
    {}
  );

  const groupsList = Object.values(groupedByStore);

  const formatPaidAt = (val: any) => {
    if (!val) return 'Recently';
    let dateObj: Date;
    if (typeof val.toDate === 'function') {
      dateObj = val.toDate();
    } else if (typeof val.seconds === 'number') {
      dateObj = new Date(val.seconds * 1000);
    } else if (val instanceof Date) {
      dateObj = val;
    } else {
      dateObj = new Date(val);
    }
    if (isNaN(dateObj.getTime())) return 'Recently';
    return dateObj.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleOpenStore = (storeId: string) => {
    setSelectedStoreId(storeId);
    navigateTo(`/store/${storeId}`);
  };

  // Run Firestore transaction for Refund:
  // - read wallets/{walletId}
  // - update balance with increment(refundAmount)
  // - update reservations/{reservationId} status to "refunded" and add refundedAt: serverTimestamp() and refundAmount field
  const handleRefund = async (item: ReservationDoc & { id: string }) => {
    if (refundingId || item.status === 'refunded') return;

    const itemPrice = Number(item.price ?? item.total ?? 0);
    const refundAmount = Number((itemPrice * 0.9).toFixed(2));

    setRefundingId(item.id);
    setToast(null);

    try {
      const wRef = doc(db, 'wallets', walletId);
      const rRef = doc(db, 'reservations', item.id);

      // Ensure wallet doc exists
      const wSnap = await getDoc(wRef);
      if (!wSnap.exists()) {
        await setDoc(wRef, {
          userId: walletId,
          balance: currentUser.walletBalance,
          updatedAt: new Date().toISOString(),
        });
      }

      await runTransaction(db, async (t) => {
        const w = await t.get(wRef);
        if (!w.exists()) {
          t.set(wRef, {
            userId: walletId,
            balance: currentUser.walletBalance + refundAmount,
            updatedAt: new Date().toISOString(),
          });
        } else {
          t.update(wRef, {
            balance: increment(refundAmount),
          });
        }

        t.update(rRef, {
          status: 'refunded',
          refundedAt: serverTimestamp(),
          refundAmount: refundAmount,
        });
      });

      // Update local wallet balance instantly
      await topUpWallet(refundAmount);

      setToast({
        message: `Refund of R${refundAmount.toFixed(2)} completed!`,
        type: 'success',
      });
    } catch (err: any) {
      console.warn('Refund transaction error:', err);
      setToast({
        message: String(err?.message || err || 'Refund failed'),
        type: 'error',
      });
    } finally {
      setRefundingId(null);
    }
  };

  return (
    <div className="pb-28 pt-3 px-4 max-w-lg mx-auto min-h-screen text-white">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`px-4 py-3 rounded-2xl font-black text-xs shadow-2xl flex items-center justify-between border-2 ${
              toast.type === 'success'
                ? 'bg-[#FACC15] text-black border-black'
                : 'bg-rose-500 text-white border-rose-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <span className="w-5 h-5 rounded-full bg-black text-[#FACC15] flex items-center justify-center text-[10px]">
                  ✓
                </span>
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-black font-black text-sm ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigateTo('/')}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Stores</span>
        </button>

        <div className="text-center">
          <h1 className="text-base font-extrabold text-white flex items-center justify-center gap-1.5">
            <Utensils className="w-4 h-4 text-[#FACC15]" />
            <span>Reserved Food & Drinks</span>
          </h1>
          <p className="text-[10px] text-gray-400">
            {walletId ? `${currentUser.fullName || currentUser.name}` : 'Personal Reservations'}
          </p>
        </div>

        <button
          onClick={() => setActiveModal('wallet')}
          className="flex items-center gap-1 text-xs font-black text-black bg-[#FACC15] hover:bg-yellow-400 px-3 py-1.5 rounded-xl transition cursor-pointer shadow-md"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>R{currentUser.walletBalance.toFixed(0)}</span>
        </button>
      </div>

      {/* View Filter Switcher (Active Reserved vs All including Refunded) */}
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-1 mb-4 flex items-center justify-between gap-1 shadow-inner">
        <button
          type="button"
          onClick={() => setFilterMode('active')}
          className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
            filterMode === 'active'
              ? 'bg-[#FACC15] text-black shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Utensils className="w-3.5 h-3.5" />
          <span>Active Reserved ({activeItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterMode('all')}
          className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
            filterMode === 'all'
              ? 'bg-[#FACC15] text-black shadow'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>All / Refunded ({refundedCount})</span>
        </button>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="text-center py-16 text-xs text-gray-400">
          Loading reserved items...
        </div>
      ) : displayedItems.length === 0 ? (
        /* Requirement: If no reservations show "No reserved items yet" */
        <div className="text-center py-16 px-4 bg-[#121212] border border-white/5 rounded-2xl">
          <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="text-base font-extrabold text-white mb-1">
            No reserved items yet
          </h3>
          <p className="text-xs text-gray-400 max-w-xs mx-auto mb-4">
            You do not have any active food or drinks pre-orders. Choose a store to reserve and pay ahead from your cashless wristband.
          </p>
          <button
            onClick={() => navigateTo('/')}
            className="inline-flex items-center gap-1.5 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs px-4 py-2.5 rounded-xl shadow transition cursor-pointer"
          >
            <span>Browse Store Menus</span>
            <ChevronRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {groupsList.map((group) => (
            <div
              key={group.storeName}
              className="bg-[#121212] border border-white/10 rounded-2xl overflow-hidden shadow-xl"
            >
              {/* Group Header: Store Name & Store ID */}
              <div className="bg-gradient-to-r from-zinc-900 to-black px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-black text-[#FACC15]">
                    <Store className="w-4 h-4" />
                    <span>{group.storeName}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5 font-mono">
                    <MapPin className="w-3 h-3 text-gray-500" />
                    <span>Store ID: {group.storeId}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">
                    Subtotal
                  </span>
                  <div className="text-sm font-black text-[#FACC15]">
                    R{group.groupTotal.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Items in this Store Group */}
              <div className="p-3 divide-y divide-white/5">
                {group.items.map((item) => {
                  const price = Number(item.price ?? item.total ?? 0);
                  const refundAmount = price * 0.9;
                  const isRefunded = item.status === 'refunded';
                  const isRefunding = refundingId === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => !isRefunded && navigateTo('/profile')}
                      className={`py-3.5 px-3 first:pt-2 last:pb-2 rounded-2xl transition border ${
                        !isRefunded
                          ? 'hover:bg-white/5 hover:border-[#FACC15]/40 border-transparent cursor-pointer group'
                          : 'border-transparent opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          {/* Exact format: "Reserved at [storeName]: [itemName]" */}
                          <div className="text-xs font-black text-white leading-snug group-hover:text-[#FACC15] transition">
                            <span>Reserved at </span>
                            <span className="text-[#FACC15]">{item.storeName || group.storeName}</span>
                            <span>: </span>
                            <span className="text-white underline decoration-[#FACC15] underline-offset-2">
                              {item.itemName}
                            </span>
                          </div>

                          {/* Details: {storeName, itemName, price, paidAt, status} */}
                          <div className="mt-2 space-y-1 text-[11px] text-gray-300">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-gray-400">Price:</span>
                              <span className="font-extrabold text-[#FACC15]">
                                R{price.toFixed(0)}
                              </span>
                              <span className="text-gray-500">•</span>
                              <span className="text-gray-400">Status:</span>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.2 rounded border ${
                                  isRefunded
                                    ? 'text-zinc-400 bg-zinc-800 border-zinc-700'
                                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                                }`}
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {item.status}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                              <Clock className="w-3 h-3 text-gray-500 shrink-0" />
                              <span>Paid At: {formatPaidAt(item.paidAt)}</span>
                            </div>

                            {/* Customer ID Display */}
                            <div className="bg-black/50 p-2 rounded-lg border border-white/5 space-y-0.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-gray-400 font-semibold">
                                  {item.reservedForOther ? 'Beneficiary Customer ID:' : 'Collection Customer ID:'}
                                </span>
                                <span className="font-mono font-bold text-[#FACC15]">
                                  {item.customerId || currentUser.idNumber || currentUser.id}
                                </span>
                              </div>
                              {item.reservedForOther && item.beneficiaryName && (
                                <div className="text-[10px] text-emerald-400 font-semibold">
                                  For: {item.beneficiaryName}
                                </div>
                              )}
                              <p className="text-[9px] text-gray-400 italic pt-0.5">
                                "Use this ID to collect your food if you don't have QR or NFC"
                              </p>
                            </div>

                            {/* Alcohol 18+ tag (soft drinks show normal) */}
                            {isAlcoholItem(item) && (
                              <div className="pt-1">
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 rounded-md">
                                  <span>18+ - Collect with ID</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Cost badge */}
                        <div className="text-right shrink-0">
                          <span
                            className={`text-base font-black ${
                              isRefunded ? 'text-gray-500 line-through' : 'text-[#FACC15]'
                            }`}
                          >
                            R{price.toFixed(0)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons: Collect at store + Refund */}
                      <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                        {/* Collect via Customer's single permanent Profile ONE QR */}
                        <button
                          type="button"
                          disabled={isRefunded}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateTo('/profile');
                          }}
                          className="min-h-[44px] bg-[#FACC15] hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-black font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
                        >
                          <User className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>SHOW PROFILE ONE QR</span>
                        </button>

                        {/* Requirement: Refund button showing label as "REFUND R{refundAmount.toFixed(2)}" only */}
                        {/* Disable refund button if already refunded */}
                        <button
                          type="button"
                          disabled={isRefunded || isRefunding}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefund(item);
                          }}
                          className={`font-black text-xs px-3.5 py-2 rounded-xl transition cursor-pointer shadow ${
                            isRefunded
                              ? 'bg-zinc-800 text-gray-500 border border-white/5 cursor-not-allowed opacity-60'
                              : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 active:scale-95 disabled:opacity-50'
                          }`}
                        >
                          {isRefunding
                            ? 'Processing...'
                            : `REFUND R${refundAmount.toFixed(2)}`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
export default ReservedPage;
