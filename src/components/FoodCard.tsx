import React, { useState } from 'react';
import { db } from '../firebase';
import {
  doc,
  collection,
  runTransaction,
  increment,
  serverTimestamp,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { MenuItemDoc } from '../types';
import { useApp } from '../context/AppContext';
import { Check, Calendar, AlertCircle } from 'lucide-react';

export interface ReservationInfo {
  id: string;
  walletId: string;
  storeId?: string;
  storeName?: string;
  eventId?: string;
  eventName?: string;
  itemId?: string;
  itemName?: string;
  total: number;
  status: 'paid' | 'reserved' | 'reserved_for_event' | 'collected' | 'released' | 'cancelled';
  paidAt?: any;
  eventDate?: any;
}

interface FoodCardProps {
  item: MenuItemDoc;
  walletId: string;
  reservation?: ReservationInfo | null;
  onReservationUpdated?: () => void;
}

export default function FoodCard({
  item,
  walletId,
  reservation,
  onReservationUpdated,
}: FoodCardProps) {
  const { currentUser, addWalletTransaction, setActiveModal, stores, events } = useApp();
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [removedIngredients, setRemovedIngredients] = useState<string[]>([]);

  // Parse numeric price
  const parsePrice = (price: number | string): number => {
    if (typeof price === 'number') return price;
    const clean = String(price).replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  };

  const price = parsePrice(item.price);

  // Determine store and event metadata without cross-store leakage
  const store = item.storeId ? stores.find((s) => s.id === item.storeId) : undefined;
  const storeId = store?.id || item.storeId || '';
  const storeName = store?.name || item.storeName || 'Event Venue';

  const matchedEvent = storeId ? events.find((e) => e.storeId === storeId) : undefined;
  const eventId = matchedEvent?.id || '';
  const eventName = matchedEvent?.title || '';

  const rawEventDate = matchedEvent?.date || '';
  const eventDateObj = rawEventDate ? new Date(rawEventDate) : null;
  const hasValidDate = Boolean(eventDateObj && !isNaN(eventDateObj.getTime()));

  const today = new Date();
  const isPastOrEventDay = hasValidDate && eventDateObj ? today.getTime() >= eventDateObj.getTime() : true;

  // Button text automatically driven by date comparison:
  // If current date < eventDate show: RESERVE & PAY - R{price}
  // If date >= eventDate show: PAY - R{price}
  const customSuffix = removedIngredients.length > 0 ? ` (No ${removedIngredients.join(', ')})` : '';
  const buttonLabel = isPastOrEventDay
    ? `PAY - R${price.toFixed(0)}${customSuffix}`
    : `RESERVE & PAY - R${price.toFixed(0)}${customSuffix}`;

  // Run Firestore transaction to check wallet, decrement balance, and create reservation doc
  const handleReserveAndPay = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const wRef = doc(db, 'wallets', walletId);
      const uRef = doc(db, 'users', walletId);
      const rRef = doc(collection(db, 'reservations'));
      const txRef = doc(collection(db, 'transactions'));

      // Ensure wallet doc exists in Firestore with user balance if missing
      const wSnap = await getDoc(wRef);
      if (!wSnap.exists()) {
        await setDoc(wRef, {
          userId: walletId,
          balance: currentUser.walletBalance,
          updatedAt: new Date().toISOString(),
        });
      }

      const newBalance = await runTransaction(db, async (t) => {
        const w = await t.get(wRef);
        const curBal = w.exists() ? Number(w.data().balance ?? 0) : currentUser.walletBalance;

        if (curBal < price) {
          throw new Error('low funds');
        }

        const nextBal = Math.round(Math.max(0, curBal - price) * 100) / 100;
        t.update(wRef, { balance: increment(-price), updatedAt: new Date().toISOString() });
        t.set(uRef, { walletBalance: nextBal }, { merge: true });

        t.set(rRef, {
          walletId,
          storeId,
          storeName,
          eventId,
          eventName,
          itemId: item.id,
          itemName: item.name,
          total: price,
          status: 'paid',
          paymentStatus: 'PAID',
          paidAt: serverTimestamp(),
          eventDate: rawEventDate,
          ingredients: item.ingredients || [],
          allowIngredientRemoval: item.allowIngredientRemoval,
          removedIngredients,
        });

        t.set(txRef, {
          userId: walletId,
          customerId: currentUser.idNumber || walletId,
          customerName: currentUser.fullName || currentUser.name,
          type: item.category === 'drink' ? 'drink' : 'food',
          description: `${item.name} at ${storeName}`,
          amount: price,
          storeId,
          storeName,
          paymentMethod: 'Wallet',
          status: 'Paid',
          reference: rRef.id,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        });

        return nextBal;
      });

      localStorage.setItem('wallet_balance', String(newBalance));
      addWalletTransaction({
        type: 'purchase',
        title: `${item.name} (${storeName})`,
        subtitle: isPastOrEventDay ? 'Counter Pickup' : `Reserved for ${eventName}`,
        amount: -price,
        reference: rRef.id,
      });

      setFeedback({
        message: isPastOrEventDay
          ? `PAID R${price.toFixed(0)}! Order ready at counter.`
          : `RESERVED & PAID R${price.toFixed(0)} under ${storeName}!`,
        type: 'success',
      });

      if (onReservationUpdated) {
        onReservationUpdated();
      }
    } catch (e: any) {
      console.warn('Payment error:', e);
      if (e?.message?.includes?.('low funds') || e === 'low funds') {
        setFeedback({
          message: `Low funds! R${price.toFixed(0)} exceeds balance (R${currentUser.walletBalance.toFixed(2)}).`,
          type: 'error',
        });
      } else {
        setFeedback({
          message: String(e?.message || e || 'Payment failed'),
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const isPaid = reservation?.status === 'paid' || reservation?.status === 'reserved';

  return (
    <div className="rounded-2xl bg-white shadow-lg overflow-hidden flex flex-col justify-between select-none relative min-h-[310px]">
      {/* Category / Status Badge top-left */}
      <div className="absolute top-2 left-2 z-10">
        {isPaid ? (
          <span className="bg-[#FACC15] text-black text-[9px] font-black px-2 py-0.5 rounded shadow">
            PAID • RESERVED ✓
          </span>
        ) : (
          <span className="bg-black/80 backdrop-blur-sm text-white text-[9px] font-black px-2 py-0.5 rounded shadow uppercase">
            {item.category || 'FOOD'}
          </span>
        )}
      </div>

      {/* Top Image */}
      <div className="w-full h-32 relative overflow-hidden bg-zinc-200 shrink-0">
        <img
          src={
            item.image ||
            'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'
          }
          alt={item.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80';
          }}
        />
      </div>

      {/* Content */}
      <div className="p-3 bg-white flex flex-col justify-between flex-1">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-black text-xs leading-tight truncate">
              {item.name}
            </h3>
            <span className="text-[#0A0A0A] font-black text-sm">
              R{price.toFixed(0)}
            </span>
          </div>

          {/* Store & Event Scope info */}
          <div className="mt-1 text-[10px] text-gray-600 font-semibold truncate">
            {storeName}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-gray-500 font-medium truncate">
            <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
            <span>{eventName}</span>
          </div>

          {item.ingredients && item.ingredients.length > 0 && (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between text-[9px] font-bold text-gray-500">
                <span>Ingredients (Tap to cancel):</span>
                {removedIngredients.length > 0 && (
                  <span className="text-rose-600 font-black">
                    No {removedIngredients.join(', ')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {item.ingredients.map((ing) => {
                  const isRemoved = removedIngredients.includes(ing.toLowerCase());
                  return (
                    <button
                      key={ing}
                      type="button"
                      disabled={item.allowIngredientRemoval === false}
                      onClick={() => {
                        setRemovedIngredients((prev) =>
                          prev.includes(ing.toLowerCase())
                            ? prev.filter((i) => i !== ing.toLowerCase())
                            : [...prev, ing.toLowerCase()]
                        );
                      }}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition cursor-pointer select-none ${
                        isRemoved
                          ? 'bg-rose-100 text-rose-800 line-through border border-rose-400'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                      }`}
                    >
                      <span>{ing}</span>
                      {isRemoved && <span className="text-[7px] text-rose-700 font-black ml-0.5 no-underline">✗</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Feedback alert message */}
        {feedback && (
          <div
            className={`text-[10px] font-bold p-1 rounded leading-tight mt-1 truncate ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {/* Action Button: RESERVE = PAY */}
        <div className="mt-2 space-y-1.5">
          {isPaid ? (
            <div className="w-full py-2.5 px-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 border border-gray-200">
              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
              <span>Paid & Reserved</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={handleReserveAndPay}
              className="w-full bg-black text-white hover:bg-zinc-800 active:scale-95 py-2.5 px-2 rounded-xl font-bold text-xs shadow pointer-events-auto z-10 cursor-pointer disabled:opacity-50 transition touch-manipulation"
            >
              {loading ? 'Processing...' : buttonLabel}
            </button>
          )}

          {feedback?.type === 'error' && (
            <button
              type="button"
              onClick={() => setActiveModal('wallet')}
              className="w-full text-center text-[10px] text-blue-600 underline font-semibold cursor-pointer"
            >
              Top Up Wallet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
