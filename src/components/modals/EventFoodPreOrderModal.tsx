import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { EventItem, MenuItemDoc, Ticket, CartItem, ReservationDoc } from '../../types';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getUserAge, isAlcoholItem } from '../../utils/ageHelper';
import { isEventExpired } from '../../utils/dateHelper';
import {
  X,
  Lock,
  Unlock,
  Ticket as TicketIcon,
  Utensils,
  ShoppingBag,
  CheckCircle,
  AlertCircle,
  Plus,
  Minus,
  Trash2,
  Calendar,
  MapPin,
  Sparkles,
  Zap,
  CreditCard,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { INITIAL_ITEMS } from '../../data/seedData';
import { calculatePlatformFee } from '../../utils/mallFees';
import { MealCustomizerModal } from './MealCustomizerModal';
import { resolveCustomerQrId } from '../../utils/customerQr';

interface EventFoodPreOrderModalProps {
  event: EventItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EventFoodPreOrderModal: React.FC<EventFoodPreOrderModalProps> = ({
  event,
  isOpen,
  onClose,
}) => {
  const {
    tickets,
    currentUser,
    currentWalletBalance,
    topUpWallet,
    setSelectedBuyingEvent,
    stores,
    createMallOrder,
    setActiveModal,
  } = useApp();

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'food' | 'drink'>('all');
  const [eventItems, setEventItems] = useState<MenuItemDoc[]>([]);
  const [itemsLoading, setItemsLoading] = useState<boolean>(true);

  // Cart for event pre-orders: { [itemId]: { item: MenuItemDoc, qty: number, removedIngredients?: string[] } }
  const [eventCart, setEventCart] = useState<Record<string, { item: MenuItemDoc; qty: number; removedIngredients?: string[] }>>({});
  const [paymentMethod, setPaymentMethod] = useState<'Capitec Pay' | 'Ozow' | 'PayShap' | 'Wallet'>('Capitec Pay');
  const [customerPhone, setCustomerPhone] = useState<string>(currentUser?.phone || '');
  const [customerName, setCustomerName] = useState<string>(currentUser?.fullName || currentUser?.name || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [useWalletBalance, setUseWalletBalance] = useState<boolean>(true);
  const [selectedCustomizingEventItem, setSelectedCustomizingEventItem] = useState<MenuItemDoc | null>(null);

  const userAge = getUserAge(currentUser);

  // Find matching user ticket for this event
  const userTicket = event
    ? tickets.find(
        (t) =>
          t.eventId === event.id &&
          (t.userId === currentUser?.id || (Boolean(currentUser?.phone) && t.customerPhone === currentUser?.phone))
      )
    : null;

  const hasTicket = Boolean(userTicket);

  // Fetch items for this event's store
  useEffect(() => {
    if (!event || !isOpen) return;

    const storeId = event.storeId || '';
    if (!storeId) {
      setEventItems([]);
      setItemsLoading(false);
      return;
    }

    setItemsLoading(true);
    const itemsCol = collection(db, 'items');
    const qStore = query(itemsCol, where('storeId', '==', storeId));

    const unsub = onSnapshot(
      qStore,
      (snap) => {
        if (snap.empty) {
          const fallback = INITIAL_ITEMS.filter((i) => i.storeId === storeId);
          setEventItems(fallback);
        } else {
          const list: MenuItemDoc[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setEventItems(list);
        }
        setItemsLoading(false);
      },
      () => {
        const fallback = INITIAL_ITEMS.filter((i) => i.storeId === storeId || !i.storeId);
        setEventItems(fallback);
        setItemsLoading(false);
      }
    );

    return () => unsub();
  }, [event, isOpen]);

  if (!isOpen || !event) return null;

  const hostStore = stores.find((s) => s.id === event.storeId);
  const storeName = hostStore?.name || event.location || 'Event Vendor';

  // Cart summary
  const cartEntries = Object.values(eventCart);
  const totalQty = cartEntries.reduce((sum, e) => sum + e.qty, 0);
  const subtotal = cartEntries.reduce((sum, e) => {
    const p = typeof e.item.price === 'number' ? e.item.price : parseFloat(String(e.item.price).replace(/[^0-9.]/g, '')) || 0;
    return sum + p * e.qty;
  }, 0);
  const platformFee = totalQty > 0 ? calculatePlatformFee(totalQty) : 0;
  const totalAmount = subtotal + platformFee;

  const addToEventCart = (item: MenuItemDoc) => {
    const isAlcohol = Boolean(item.isAlcohol === true || item.subCategory === 'alcohol' || isAlcoholItem(item));
    if (isAlcohol && userAge < 18) {
      setErrorMessage(`AGE RESTRICTION: You must be 18 or older to order alcohol for events. (Your age: ${userAge})`);
      return;
    }
    setErrorMessage(null);
    setEventCart((prev) => {
      const current = prev[item.id];
      const qty = current ? current.qty + 1 : 1;
      return { ...prev, [item.id]: { item, qty } };
    });
  };

  const updateEventCartQty = (itemId: string, qty: number) => {
    setEventCart((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { ...prev[itemId], qty } };
    });
  };

  const handleBuyTicketFirst = () => {
    onClose();
    setSelectedBuyingEvent(event);
  };

  // Split payment math
  const walletDeduction = useWalletBalance && paymentMethod !== 'Wallet'
    ? Math.min(currentWalletBalance, totalAmount)
    : (paymentMethod === 'Wallet' ? Math.min(currentWalletBalance, totalAmount) : 0);
  const externalAmount = paymentMethod === 'Wallet' ? 0 : Math.max(0, totalAmount - walletDeduction);

  const handlePreOrderCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!hasTicket || !userTicket) {
      setErrorMessage('You must purchase an Event Ticket first to unlock the event food menu.');
      return;
    }

    if (isEventExpired(event)) {
      setErrorMessage('This event has already passed. Food pre-orders are closed.');
      return;
    }

    const cleanPhone = customerPhone.trim();
    if (!cleanPhone || cleanPhone.replace(/[^0-9]/g, '').length < 7) {
      setErrorMessage('Phone number is required for event food pre-orders.');
      return;
    }

    if (totalQty === 0) {
      setErrorMessage('Please select at least 1 food or drink item.');
      return;
    }

    if (paymentMethod === 'Wallet' && currentWalletBalance < totalAmount) {
      setErrorMessage(`Insufficient wallet balance. Total is R${totalAmount.toFixed(2)}, but your wallet has R${currentWalletBalance.toFixed(2)}. Select Capitec Pay, Ozow, or PayShap to pay with Wallet + Gateway.`);
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Convert local event cart entries into custom CartItems
      const customItems: CartItem[] = cartEntries.map((e) => ({
        id: `cart_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        menuItemId: e.item.id,
        name: e.item.name,
        price: typeof e.item.price === 'number' ? e.item.price : parseFloat(String(e.item.price).replace(/[^0-9.]/g, '')) || 0,
        quantity: e.qty,
        image: e.item.image || e.item.imageUrl,
        category: e.item.category,
        subCategory: e.item.subCategory,
        isAlcohol: e.item.isAlcohol,
        storeId: event.storeId || '',
        storeName,
        ingredients: e.item.ingredients,
        allowIngredientRemoval: e.item.allowIngredientRemoval,
        removedIngredients: e.removedIngredients,
      }));

      // 2. Handle Split Payment (Wallet + External Method)
      if (externalAmount > 0) {
        const topupMemo = walletDeduction > 0
          ? `${paymentMethod} Top-up (Wallet R${walletDeduction.toFixed(2)} + ${paymentMethod} R${externalAmount.toFixed(2)})`
          : `${paymentMethod} Direct Pre-Order`;
        await topUpWallet(externalAmount, topupMemo);
      }

      // 3. Create Mall Order passing customItems so it does NOT fail with empty store cart
      const orderRes = await createMallOrder({
        storeId: event.storeId || '',
        storeName,
        storeLocation: event.location || 'Event Grounds',
        customerPhone: cleanPhone,
        customerName: customerName.trim() || currentUser?.name || 'Guest',
        collectionDate: event.date || 'Event Day',
        paymentMethod: 'wallet',
        customItems,
        eventId: event.id,
        checkoutType: 'COLLECTION',
      });

      if (!orderRes.success || !orderRes.order) {
        setErrorMessage(orderRes.error || 'Failed to place event food pre-order.');
        setIsSubmitting(false);
        return;
      }

      // Attach pre-order summary directly onto the Ticket record in Firestore
      const preorderedItemsSummary = cartEntries.map((e) => `${e.qty}x ${e.item.name}`).join(', ');
      try {
        await updateDoc(doc(db, 'tickets', userTicket.id), {
          hasFoodPreorder: true,
          preorderSummary: preorderedItemsSummary,
          preorderOrderId: orderRes.order.id,
          preorderTotal: totalAmount,
        });
      } catch (err) {
        console.warn('Ticket preorder sync notice:', err);
      }

      // Save each item as a ReservationDoc for the ReservedPage to show
      const wId = currentUser?.id && currentUser.id !== 'guest_user' ? currentUser.id : '';
      if (wId) {
        for (const item of customItems) {
          try {
            const resDoc: ReservationDoc = {
              walletId: wId,
              customerQrId: resolveCustomerQrId(wId, currentUser?.customerQrId) || undefined,
              storeId: item.storeId,
              storeName: item.storeName,
              eventId: event.id,
              eventName: event.title,
              itemId: item.menuItemId,
              itemName: item.name,
              quantity: item.quantity,
              price: item.price,
              total: item.price * item.quantity,
              status: 'reserved_for_event',
              paidAt: serverTimestamp(),
            };
            await setDoc(doc(collection(db, 'reservations')), resDoc);
          } catch (err) {
            console.warn('Failed to save reservation doc for item:', item.menuItemId, err);
          }
        }
      }

      setSuccessOrder(orderRes.order);
      setEventCart({});
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error completing event food pre-order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = eventItems.filter((i) => {
    const cat = (i.category || '').toLowerCase();
    if (categoryFilter === 'food') return cat === 'food';
    if (categoryFilter === 'drink') return cat === 'drink' || cat === 'alcohol' || cat === 'softdrink';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#161616] text-white rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Header - MODE 2: EVENT MODE */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 p-4 flex items-center justify-between shrink-0 border-b border-purple-500/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center">
              <Utensils className="w-5 h-5 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase bg-purple-500 text-black px-1.5 py-0.2 rounded">
                  MODE 2: EVENT FOOD
                </span>
                {hasTicket ? (
                  <span className="text-[9px] font-black uppercase bg-emerald-500 text-black px-1.5 py-0.2 rounded flex items-center gap-0.5">
                    <Unlock className="w-2.5 h-2.5" />
                    <span>Unlocked</span>
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase bg-amber-500 text-black px-1.5 py-0.2 rounded flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    <span>Ticket Required</span>
                  </span>
                )}
              </div>
              <h2 className="text-sm font-black tracking-tight text-white mt-0.5">
                {event.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* SUCCESS SCREEN */}
          {successOrder ? (
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                <CheckCircle className="w-10 h-10 stroke-[2.5]" />
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">
                  PRE-ORDER CONFIRMED FOR {event.date}
                </span>
                <h3 className="text-xl font-black text-white mt-1">
                  Event Food Pre-Order Paid!
                </h3>
                <p className="text-xs text-gray-300 mt-1 max-w-xs mx-auto">
                  Your food & drinks pre-order is attached to your ticket <strong>({userTicket?.bandCode || userTicket?.id})</strong> for {event.title}.
                </p>
              </div>

              <div className="bg-[#1F1F1F] p-3.5 rounded-2xl border border-emerald-500/40 text-left space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-gray-400">Order Ref:</span>
                  <span className="text-[#FACC15] font-mono">{successOrder.orderNumber}</span>
                </div>
                <div className="flex items-center justify-between font-bold">
                  <span className="text-gray-400">Event Date:</span>
                  <span className="text-white">{event.date}</span>
                </div>
                <div className="flex items-center justify-between font-bold">
                  <span className="text-gray-400">Items Pre-Ordered:</span>
                  <span className="text-emerald-400 font-mono">{successOrder.totalQuantity} items</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl shadow-lg transition cursor-pointer"
              >
                Done / View My Tickets
              </button>
            </div>
          ) : !hasTicket ? (
            /* LOCKED SCREEN: NO EVENT TICKET */
            <div className="bg-[#1F1F1F] border-2 border-amber-500/40 rounded-3xl p-5 text-center space-y-4 my-auto">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto shadow-lg">
                <Lock className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block mb-1">
                  TICKET REQUIRED TO PRE-ORDER EVENT FOOD
                </span>
                <h3 className="text-lg font-black text-white leading-tight">
                  Event Food Menu Locked 🔒
                </h3>
                <p className="text-xs text-gray-300 mt-2 leading-relaxed">
                  To pre-order food & drinks for <strong>"{event.title}"</strong> on <strong>{event.date}</strong>, you must purchase an Event Ticket first.
                </p>
              </div>

              <div className="bg-black/60 p-3 rounded-2xl border border-white/10 text-left space-y-1.5 text-[11px] text-gray-300">
                <div className="flex items-start gap-2 text-amber-300 font-bold">
                  <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Rule: Ticket = Key to unlock event food menu.</span>
                </div>
                <p className="text-[10px] text-gray-400 pl-6">
                  Once your ticket is confirmed, the event food & drink menu unlocks automatically so you can pre-order for event day!
                </p>
              </div>

              <button
                type="button"
                onClick={handleBuyTicketFirst}
                className="w-full py-3.5 px-4 bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold text-xs rounded-2xl shadow-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <TicketIcon className="w-4 h-4 stroke-[2.5]" />
                <span>Buy Ticket for {event.title} First 🎟️</span>
              </button>
            </div>
          ) : (
            /* UNLOCKED SCREEN: HAS TICKET -> EVENT FOOD MENU */
            <>
              <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-3 flex items-center justify-between text-emerald-300">
                <div className="flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-extrabold text-white text-[11px]">Event Ticket Verified 🎟️</p>
                    <p className="text-[10px] text-emerald-300/80">Ticket #{userTicket?.bandCode || userTicket?.id} unlocks event pre-orders.</p>
                  </div>
                </div>
                <span className="text-[10px] font-black uppercase bg-emerald-500 text-black px-2 py-0.5 rounded-full">
                  UNLOCKED
                </span>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider">
                  Select Event Food ({event.date})
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      categoryFilter === 'all' ? 'bg-[#FACC15] text-black' : 'bg-white/5 text-gray-400'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('food')}
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      categoryFilter === 'food' ? 'bg-[#FACC15] text-black' : 'bg-white/5 text-gray-400'
                    }`}
                  >
                    Food
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('drink')}
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      categoryFilter === 'drink' ? 'bg-[#FACC15] text-black' : 'bg-white/5 text-gray-400'
                    }`}
                  >
                    Drinks
                  </button>
                </div>
              </div>

              {/* Items List */}
              {itemsLoading ? (
                <div className="p-8 text-center text-gray-400 text-xs">
                  Loading event food menu...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-6 text-center text-gray-400 bg-[#1F1F1F] rounded-2xl border border-white/5">
                  No items found for this category.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredItems.map((item) => {
                    const priceNum = typeof item.price === 'number' ? item.price : parseFloat(String(item.price).replace(/[^0-9.]/g, '')) || 0;
                    const inCart = eventCart[item.id];
                    const inCartQty = inCart ? inCart.qty : 0;

                    return (
                      <div
                        key={item.id}
                        className="bg-[#1C1C1C] rounded-2xl p-3 border border-white/10 flex items-center justify-between gap-3 shadow-sm"
                      >
                        <img
                          src={item.image || item.imageUrl || 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'}
                          alt={item.name}
                          className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10"
                        />

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-black text-white truncate">{item.name}</h4>
                          <span className="text-[#FACC15] font-extrabold text-xs">
                            R{priceNum.toFixed(2)}
                          </span>
                        </div>

                        {/* Quantity Controls & Exclude Ingredients Button */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomizingEventItem(item)}
                            className="py-1.5 px-2 bg-amber-400 hover:bg-yellow-400 text-black font-black text-[10px] rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <Utensils className="w-3 h-3 text-black" />
                            <span>🚫 Exclude</span>
                          </button>

                          {inCartQty > 0 ? (
                            <div className="flex items-center gap-1 bg-[#0D47A1] text-white rounded-xl p-1">
                              <button
                                type="button"
                                onClick={() => updateEventCartQty(item.id, inCartQty - 1)}
                                className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs"
                              >
                                -
                              </button>
                              <span className="text-xs font-black px-1">{inCartQty}</span>
                              <button
                                type="button"
                                onClick={() => updateEventCartQty(item.id, inCartQty + 1)}
                                className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addToEventCart(item)}
                              className="py-1.5 px-2.5 bg-[#D32F2F] hover:bg-red-700 text-white font-black text-xs rounded-xl transition cursor-pointer shadow-sm flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pre-Order Cart & Checkout Form */}
              {totalQty > 0 && (
                <form onSubmit={handlePreOrderCheckout} className="bg-[#1C1C1C] rounded-2xl p-3.5 border border-purple-500/40 space-y-3 pt-3">
                  <div className="flex items-center justify-between text-xs font-black border-b border-white/10 pb-2">
                    <span className="text-[#FACC15] flex items-center gap-1">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Pre-Order Summary ({totalQty})</span>
                    </span>
                    <span className="text-base text-white font-black">
                      R{totalAmount.toFixed(2)}
                    </span>
                  </div>

                  {/* Ingredients Customization Block */}
                  {cartEntries.some((e) => (e.item.ingredients && e.item.ingredients.length > 0) || e.item.allowIngredientRemoval) && (
                    <div className="bg-[#141414] border border-[#FACC15]/30 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-[#FACC15] flex items-center gap-1.5 uppercase">
                          <Utensils className="w-3 h-3 text-[#FACC15]" />
                          <span>Customize Meal Ingredients</span>
                        </span>
                        <span className="text-[9px] text-gray-400">
                          Tap to cancel unwanted items
                        </span>
                      </div>

                      {cartEntries.filter((e) => (e.item.ingredients && e.item.ingredients.length > 0) || e.item.allowIngredientRemoval).map((entry) => {
                        const allIngs = entry.item.ingredients && entry.item.ingredients.length > 0
                          ? entry.item.ingredients
                          : ['rice', 'chicken', 'achaar', 'salad'];
                        const removed = entry.removedIngredients || [];

                        return (
                          <div key={entry.item.id} className="bg-black/60 rounded-lg p-2 border border-white/5 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-white">
                              <span>{entry.item.name}</span>
                              {removed.length > 0 ? (
                                <span className="text-[9px] font-bold text-rose-400">
                                  No {removed.join(', ')}
                                </span>
                              ) : (
                                <span className="text-[9px] text-emerald-400 font-bold">
                                  ✓ Standard
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {allIngs.map((ing) => {
                                const isRemoved = removed.some((r) => r.toLowerCase() === ing.toLowerCase());
                                return (
                                  <button
                                    key={ing}
                                    type="button"
                                    onClick={() => {
                                      const nextRemoved = isRemoved
                                        ? removed.filter((r) => r.toLowerCase() !== ing.toLowerCase())
                                        : [...removed, ing];
                                      setEventCart((prev) => ({
                                        ...prev,
                                        [entry.item.id]: {
                                          ...prev[entry.item.id],
                                          removedIngredients: nextRemoved,
                                        },
                                      }));
                                    }}
                                    className={`py-1 px-2 rounded-lg text-[10px] font-black transition flex items-center gap-1 cursor-pointer select-none active:scale-95 ${
                                      isRemoved
                                        ? 'bg-rose-950/80 border border-rose-500 text-rose-300 line-through'
                                        : 'bg-zinc-800 border border-white/10 text-white'
                                    }`}
                                  >
                                    <span>{ing.charAt(0).toUpperCase() + ing.slice(1)}</span>
                                    {isRemoved ? (
                                      <span className="text-[8px] font-black bg-rose-600 text-white px-1 py-0.2 rounded no-underline">
                                        CANCELED
                                      </span>
                                    ) : (
                                      <span className="text-[8px] text-emerald-400 font-bold">✓</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Payment Options */}
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-400 font-bold block">
                      Select Payment Method:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['Capitec Pay', 'Ozow', 'PayShap', 'Wallet'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPaymentMethod(m)}
                          className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition cursor-pointer text-left ${
                            paymentMethod === m
                              ? 'bg-purple-600 text-white border-purple-400 shadow'
                              : 'bg-white/5 text-gray-300 border-white/10'
                          }`}
                        >
                          <div>{m}</div>
                          {m === 'Wallet' && (
                            <div className="text-[9px] font-normal opacity-80">
                              R{currentWalletBalance.toFixed(2)} available
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Split Payment Toggle when paying via Gateway and wallet balance > 0 */}
                    {paymentMethod !== 'Wallet' && currentWalletBalance > 0 && (
                      <div className="bg-purple-950/60 border border-purple-500/30 rounded-xl p-2.5 space-y-1 text-[11px]">
                        <label className="flex items-center gap-2 font-bold text-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useWalletBalance}
                            onChange={(e) => setUseWalletBalance(e.target.checked)}
                            className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                          />
                          <span>
                            Wallet + {paymentMethod} (Split Payment)
                          </span>
                        </label>
                        <p className="text-[10px] text-purple-200 pl-6 leading-tight">
                          Uses <strong>R{walletDeduction.toFixed(2)}</strong> from your wallet + pays <strong>R{externalAmount.toFixed(2)}</strong> via {paymentMethod}.
                        </p>
                      </div>
                    )}

                    {/* Payment Summary Breakdown */}
                    <div className="bg-black/50 border border-white/10 rounded-xl p-2.5 text-[11px] space-y-1">
                      <div className="flex justify-between text-gray-300">
                        <span>Items Subtotal + Fee:</span>
                        <span className="font-bold text-white">R{totalAmount.toFixed(2)}</span>
                      </div>
                      {walletDeduction > 0 && (
                        <div className="flex justify-between text-emerald-400 font-bold">
                          <span>Deducted from Wallet:</span>
                          <span>-R{walletDeduction.toFixed(2)}</span>
                        </div>
                      )}
                      {externalAmount > 0 && (
                        <div className="flex justify-between text-purple-300 font-bold border-t border-white/10 pt-1">
                          <span>To Pay via {paymentMethod}:</span>
                          <span>R{externalAmount.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold block mb-1">Phone Number *</label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="071 234 5678"
                        className="w-full bg-black/60 border border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-purple-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold block mb-1">Customer Name</label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Name"
                        className="w-full bg-black/60 border border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:brightness-110 active:scale-95 text-white font-black text-xs rounded-xl shadow-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>
                      {isSubmitting
                        ? 'Processing Pre-Order...'
                        : walletDeduction > 0 && externalAmount > 0
                        ? `Pay R${totalAmount.toFixed(2)} (R${walletDeduction.toFixed(2)} Wallet + R${externalAmount.toFixed(2)} via ${paymentMethod})`
                        : `Pay R${totalAmount.toFixed(2)} for ${event.date}`}
                    </span>
                  </button>
                </form>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedCustomizingEventItem && (
        <MealCustomizerModal
          item={selectedCustomizingEventItem}
          storeId={event.storeId || ''}
          storeName={storeName}
          isOpen={Boolean(selectedCustomizingEventItem)}
          onClose={() => setSelectedCustomizingEventItem(null)}
          onAddToCart={(item, qty, customization) => {
            setEventCart((prev) => ({
              ...prev,
              [item.id]: {
                item,
                qty: (prev[item.id]?.qty || 0) + qty,
                removedIngredients: customization.removedIngredients,
              },
            }));
          }}
        />
      )}
    </div>
  );
};
