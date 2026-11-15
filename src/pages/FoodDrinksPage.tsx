import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ReservationDoc, MallOrder, CartItem } from '../types';
import {
  Utensils,
  Wine,
  ShoppingBag,
  Clock,
  MapPin,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Search,
  X,
  Store as StoreIcon,
  Bike,
  Trash2,
  Plus,
  Minus,
  User,
} from 'lucide-react';
import { MallOrderSuccessModal } from '../components/mall/MallOrderSuccessModal';
import { StoreCartDrawer } from '../components/mall/StoreCartDrawer';

export const FoodDrinksPage: React.FC = () => {
  const {
    currentUser,
    navigateTo,
    stores,
    mallOrders,
    carts,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    totalCartCount,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'cart' | 'food' | 'drink'>(() => {
    return totalCartCount > 0 ? 'cart' : 'food';
  });

  const [reservations, setReservations] = useState<(ReservationDoc & { id: string })[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMallOrder, setSelectedMallOrder] = useState<MallOrder | null>(null);
  const [checkoutStore, setCheckoutStore] = useState<{ id: string; name: string; location?: string; ownerId?: string } | null>(null);

  const currentId = currentUser?.id && currentUser.id !== 'guest_user' ? currentUser.id : '';
  const currentIdNum = currentUser?.idNumber;

  // Real-time listener for reservations from Firestore where customerId = current user
  useEffect(() => {
    if (!currentId && !currentIdNum) {
      setReservations([]);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'reservations'),
      (snapshot) => {
        const list: (ReservationDoc & { id: string })[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ReservationDoc;
          const isUserItem =
            data.walletId === currentId ||
            data.customerId === currentId ||
            (currentIdNum && data.customerId === currentIdNum) ||
            data.beneficiaryId === currentId;

          if (isUserItem) {
            list.push({
              id: docSnap.id,
              ...data,
            });
          }
        });

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

        setReservations(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Error fetching reservations:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentId, currentIdNum]);

  // Customer's active delivery orders
  const activeCustomerDeliveries = useMemo(() => {
    return mallOrders.filter(
      (o) =>
        o.collectionMethod === 'DELIVERY' &&
        (o.customerId === currentId || (currentUser?.phone && o.customerPhone === currentUser.phone)) &&
        o.status !== 'delivered' &&
        o.status !== 'cancelled'
    );
  }, [mallOrders, currentId, currentUser?.phone]);

  // Active shopping carts across stores
  const cartEntries = useMemo(() => {
    return Object.entries(carts).filter(([_, items]) => items && items.length > 0);
  }, [carts]);

  // Helper to resolve store name
  const getStoreNameForItem = (item: any): string => {
    if (item.storeName && item.storeName.trim() !== '') return item.storeName;
    if (item.storeId) {
      const s = stores.find((st) => st.id === item.storeId);
      if (s) return s.name;
    }
    return 'Venue Store';
  };

  const storesWithReservations = useMemo(() => {
    const map = new Map<string, string>();
    reservations.forEach((r) => {
      const name = getStoreNameForItem(r);
      const id = r.storeId || name;
      if (name) map.set(id, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [reservations, stores]);

  const isDrinkItem = (item: any): boolean => {
    const cat = (item.category || item.type || '').toLowerCase();
    const subCat = (item.subCategory || '').toLowerCase();
    return (
      cat === 'drink' ||
      cat === 'drinks' ||
      cat === 'beverage' ||
      subCat === 'soft' ||
      subCat === 'alcohol' ||
      Boolean(item.isAlcohol)
    );
  };

  const foodReservations = useMemo(() => {
    return reservations.filter((r) => !isDrinkItem(r));
  }, [reservations]);

  const drinkReservations = useMemo(() => {
    return reservations.filter((r) => isDrinkItem(r));
  }, [reservations]);

  const filteredFoodReservations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return foodReservations;
    return foodReservations.filter((item) => {
      const storeName = getStoreNameForItem(item).toLowerCase();
      const storeId = (item.storeId || '').toLowerCase();
      return storeName.includes(q) || storeId.includes(q);
    });
  }, [foodReservations, searchQuery]);

  const filteredDrinkReservations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return drinkReservations;
    return drinkReservations.filter((item) => {
      const storeName = getStoreNameForItem(item).toLowerCase();
      const storeId = (item.storeId || '').toLowerCase();
      return storeName.includes(q) || storeId.includes(q);
    });
  }, [drinkReservations, searchQuery]);

  const getItemImage = (item: any, isDrink: boolean) => {
    if (item.image && item.image.trim() !== '') return item.image;
    if (item.imageUrl && item.imageUrl.trim() !== '') return item.imageUrl;
    if (item.customerPhoto && item.customerPhoto.trim() !== '' && !item.customerPhoto.includes('unsplash.com/photo-1534528741775')) {
      return item.customerPhoto;
    }
    if (isDrink) {
      if (item.isAlcohol || item.subCategory === 'alcohol') {
        return 'https://images.unsplash.com/photo-1608270119332-9cb76f1837b0?auto=format&fit=crop&w=500&q=80';
      }
      return 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=500&q=80';
    }
    return 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=80';
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Food & Drinks</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Your shopping cart, reserved meals & beverage collections
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigateTo('/menu')}
          className="text-xs font-black text-black bg-[#FACC15] hover:bg-yellow-400 active:scale-95 px-3 py-1.5 rounded-full shadow-md transition flex items-center gap-1 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Menu</span>
        </button>
      </div>

      {/* Active Delivery Orders Banner */}
      {activeCustomerDeliveries.length > 0 && (
        <div className="mb-4 space-y-2">
          {activeCustomerDeliveries.map((ord) => (
            <div
              key={ord.id}
              onClick={() => setSelectedMallOrder(ord)}
              className="bg-gradient-to-r from-blue-900/60 to-indigo-950/80 border border-blue-400/40 rounded-2xl p-3 shadow-lg flex items-center justify-between cursor-pointer hover:border-[#FACC15] transition active:scale-95"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center shrink-0">
                  <Bike className="w-5 h-5 text-[#FACC15]" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-white">{ord.storeName}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-500 text-white rounded uppercase">
                      {ord.status === 'out_for_delivery'
                        ? 'On The Way'
                        : ord.deliveryDriverName
                        ? 'Driver Assigned'
                        : 'Preparing'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 mt-0.5">
                    {ord.deliveryDriverName
                      ? `Driver ${ord.deliveryDriverName} · View delivery PIN & order details`
                      : 'View delivery PIN & order details (show Profile ONE QR on drop-off)'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          ))}
        </div>
      )}

      {/* 3 TABS: [ CART ] | [ FOOD RESERVED ] | [ DRINKS RESERVED ] */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-[#141414] rounded-2xl border border-white/10 mb-4 shadow-inner">
        {/* CART TAB */}
        <button
          type="button"
          onClick={() => setActiveTab('cart')}
          className={`py-3 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'cart'
              ? 'bg-[#FACC15] text-black shadow-lg shadow-yellow-400/20 scale-[1.02]'
              : 'text-gray-400 hover:text-white bg-transparent hover:bg-white/5'
          }`}
        >
          <ShoppingBag className={`w-3.5 h-3.5 ${activeTab === 'cart' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span>CART</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5 ${
              activeTab === 'cart'
                ? 'bg-black text-[#FACC15]'
                : 'bg-white/10 text-gray-400'
            }`}
          >
            {totalCartCount}
          </span>
        </button>

        {/* FOOD TAB */}
        <button
          type="button"
          onClick={() => setActiveTab('food')}
          className={`py-3 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'food'
              ? 'bg-[#FACC15] text-black shadow-lg shadow-yellow-400/20 scale-[1.02]'
              : 'text-gray-400 hover:text-white bg-transparent hover:bg-white/5'
          }`}
        >
          <Utensils className={`w-3.5 h-3.5 ${activeTab === 'food' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span>FOOD</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5 ${
              activeTab === 'food'
                ? 'bg-black text-[#FACC15]'
                : 'bg-white/10 text-gray-400'
            }`}
          >
            {filteredFoodReservations.length}
          </span>
        </button>

        {/* DRINKS TAB */}
        <button
          type="button"
          onClick={() => setActiveTab('drink')}
          className={`py-3 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'drink'
              ? 'bg-[#FACC15] text-black shadow-lg shadow-yellow-400/20 scale-[1.02]'
              : 'text-gray-400 hover:text-white bg-transparent hover:bg-white/5'
          }`}
        >
          <Wine className={`w-3.5 h-3.5 ${activeTab === 'drink' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span>DRINKS</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5 ${
              activeTab === 'drink'
                ? 'bg-black text-[#FACC15]'
                : 'bg-white/10 text-gray-400'
            }`}
          >
            {filteredDrinkReservations.length}
          </span>
        </button>
      </div>

      {/* CART TAB CONTENT */}
      {activeTab === 'cart' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {cartEntries.length === 0 ? (
            <div className="bg-[#141414] rounded-3xl p-8 border border-white/5 text-center shadow-lg my-6">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3.5">
                <ShoppingBag className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-white font-black text-base mb-1">Your Shopping Cart is Empty</h3>
              <p className="text-gray-400 text-xs max-w-xs mx-auto mb-5">
                Explore our partner stores and menus to add delicious meals, snacks, and drinks to your cart.
              </p>
              <button
                type="button"
                onClick={() => navigateTo('/menu')}
                className="bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5 shadow-md shadow-yellow-400/20 transition cursor-pointer"
              >
                <span>Browse Menu & Stores</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {cartEntries.map(([storeId, storeItems]) => {
                const storeObj = stores.find((s) => s.id === storeId);
                const storeName = storeObj?.name || storeItems[0]?.storeName || 'Venue Store';
                const storeLocation = storeObj?.location || '';
                const storeOwnerId = storeObj?.ownerId;
                const subtotal = storeItems.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);

                return (
                  <div key={storeId} className="bg-[#141414] border border-white/10 rounded-2xl p-4 shadow-xl space-y-3">
                    {/* Store Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/30 flex items-center justify-center">
                          <StoreIcon className="w-4 h-4 text-[#FACC15]" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">{storeName}</h3>
                          {storeLocation && (
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-[#FACC15]" />
                              <span>{storeLocation}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => clearCart(storeId)}
                        className="text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-950/40 border border-red-500/20 px-2 py-1 rounded-lg transition cursor-pointer"
                      >
                        Clear Store Cart
                      </button>
                    </div>

                    {/* Cart Items List */}
                    <div className="space-y-2.5">
                      {storeItems.map((item) => {
                        const itemImg = item.image || 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80';
                        const qty = item.quantity || 1;
                        const itemTotal = item.price * qty;

                        return (
                          <div key={item.id} className="bg-[#1c1c1c] rounded-xl p-3 border border-white/5 flex gap-3 items-center">
                            <div className="w-14 h-14 rounded-lg overflow-hidden bg-black shrink-0 border border-white/10">
                              <img src={itemImg} alt={item.name} className="w-full h-full object-cover" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <h4 className="text-xs font-black text-white truncate">{item.name}</h4>
                                <span className="text-xs font-black text-[#FACC15] font-mono">R{itemTotal.toFixed(2)}</span>
                              </div>
                              <p className="text-[10px] text-gray-400">R{item.price.toFixed(2)} each</p>

                              {item.removedIngredients && item.removedIngredients.length > 0 && (
                                <p className="text-[9px] text-rose-300 bg-rose-950/60 px-1.5 py-0.5 rounded mt-1 inline-block">
                                  No {item.removedIngredients.join(', No ')}
                                </p>
                              )}

                              {/* Quantity Controls */}
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                                <div className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded-lg border border-white/10">
                                  <button
                                    type="button"
                                    onClick={() => updateCartQuantity(storeId, item.id, qty - 1)}
                                    className="text-gray-400 hover:text-white transition cursor-pointer"
                                    title="Decrease quantity"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="text-xs font-black text-white font-mono px-1">{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateCartQuantity(storeId, item.id, qty + 1)}
                                    className="text-gray-400 hover:text-white transition cursor-pointer"
                                    title="Increase quantity"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeFromCart(storeId, item.id)}
                                  className="text-gray-400 hover:text-red-400 p-1 rounded transition cursor-pointer"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Store Subtotal & Checkout Button */}
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-gray-400 block">Subtotal</span>
                        <span className="text-sm font-black text-white font-mono">R{subtotal.toFixed(2)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setCheckoutStore({
                            id: storeId,
                            name: storeName,
                            location: storeLocation,
                            ownerId: storeOwnerId,
                          })
                        }
                        className="bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Proceed to Checkout</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FOOD & DRINKS RESERVED TABS CONTENT */}
      {activeTab !== 'cart' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* SEARCH BAR */}
          <div className="mb-4 space-y-2.5">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search store name..."
                className="w-full bg-[#141414] hover:bg-[#181818] focus:bg-[#181818] border border-white/10 focus:border-[#FACC15] text-white text-xs rounded-xl pl-10 pr-9 py-3 transition placeholder:text-gray-500 focus:outline-none shadow-sm font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-gray-400 hover:text-white p-1 rounded-md transition cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick store suggestion filter chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
              <span className="text-[10px] text-gray-500 shrink-0 font-semibold mr-0.5 flex items-center gap-1">
                <StoreIcon className="w-3 h-3 text-[#FACC15]" />
                <span>Stores:</span>
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition shrink-0 cursor-pointer ${
                  !searchQuery
                    ? 'bg-[#FACC15] text-black font-extrabold shadow'
                    : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
                }`}
              >
                All Stores
              </button>
              {storesWithReservations.map(({ id, name }) => {
                const isSelected = searchQuery.toLowerCase().trim() === name.toLowerCase().trim();
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSearchQuery(name)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#FACC15] text-black font-extrabold shadow'
                        : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-500 text-xs">
              Loading your reservations...
            </div>
          ) : (activeTab === 'food' ? filteredFoodReservations : filteredDrinkReservations).length === 0 ? (
            <div className="bg-[#141414] rounded-3xl p-8 border border-white/5 text-center shadow-lg my-6">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3.5">
                {searchQuery.trim() ? (
                  <StoreIcon className="w-8 h-8 text-gray-500" />
                ) : activeTab === 'food' ? (
                  <Utensils className="w-8 h-8 text-gray-500" />
                ) : (
                  <Wine className="w-8 h-8 text-gray-500" />
                )}
              </div>
              <h3 className="text-white font-black text-base mb-1">
                {searchQuery.trim()
                  ? `No ${activeTab === 'food' ? 'Food' : 'Drinks'} for "${searchQuery}"`
                  : `No ${activeTab === 'food' ? 'Food' : 'Drinks'} Reserved Yet`}
              </h3>
              <p className="text-gray-400 text-xs max-w-xs mx-auto mb-5">
                {searchQuery.trim()
                  ? `You don't have any reserved ${activeTab} items for this store.`
                  : activeTab === 'food'
                  ? 'Pre-order delicious meals and platters for your event to skip the long venue queues.'
                  : 'Pre-order your favorite beers, wines, and soft drinks ready for collection at the bar.'}
              </p>
              <button
                type="button"
                onClick={() => navigateTo('/menu')}
                className="bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5 shadow-md shadow-yellow-400/20 transition cursor-pointer"
              >
                <span>Browse {activeTab === 'food' ? 'Food Menu' : 'Drinks Menu'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {(activeTab === 'food' ? filteredFoodReservations : filteredDrinkReservations).map((item) => {
                const isDrink = isDrinkItem(item);
                const imageSrc = getItemImage(item, isDrink);
                const qty = item.quantity || 1;
                const priceVal = item.total || (item.price ? item.price * qty : 0);
                const formattedPrice = `R${Number(priceVal).toFixed(2)}`;

                const statusNormalized = (item.status || 'paid').toLowerCase();
                const isPaid = statusNormalized === 'paid' || statusNormalized === 'reserved';
                const isCollected = statusNormalized === 'collected';
                const isRefunded = statusNormalized === 'refunded' || statusNormalized === 'cancelled';
                const resolvedStoreName = getStoreNameForItem(item);

                return (
                  <div
                    key={item.id}
                    onClick={() => navigateTo('/profile')}
                    className="bg-[#161616] hover:bg-[#1C1C1C] rounded-2xl border border-white/10 hover:border-[#FACC15]/40 p-3.5 shadow-xl transition-all duration-200 flex gap-3.5 cursor-pointer group relative"
                  >
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-black shrink-0 relative border border-white/10">
                      <img
                        src={imageSrc}
                        alt={item.itemName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = isDrink
                            ? 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80'
                            : 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80';
                        }}
                      />
                      {item.isAlcohol && (
                        <span className="absolute bottom-1 right-1 bg-red-950/90 text-red-300 text-[8px] font-black px-1 rounded border border-red-500/40">
                          18+
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-1.5">
                          <h3 className="text-sm font-black text-white leading-tight truncate group-hover:text-[#FACC15] transition">
                            {item.itemName}
                          </h3>
                          <span className="text-sm font-black text-[#FACC15] shrink-0 font-mono">
                            {formattedPrice}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-gray-300 mt-0.5">
                          <MapPin className="w-3 h-3 text-[#FACC15] shrink-0" />
                          <span className="truncate font-semibold">{resolvedStoreName}</span>
                        </div>

                        {(item as any).removedIngredients && (item as any).removedIngredients.length > 0 && (
                          <div className="mt-1">
                            <span className="text-[10px] font-bold text-rose-300 bg-rose-950/60 border border-rose-500/40 px-2 py-0.5 rounded-md inline-block">
                              Excluded: No {(item as any).removedIngredients.map((i: string) => i.charAt(0).toUpperCase() + i.slice(1)).join(', No ')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-1.5">
                        <span className="text-[11px] font-bold text-gray-300 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                          Qty: <span className="text-white font-mono">{qty}</span>
                        </span>

                        <span
                          className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            isPaid
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                              : isCollected
                              ? 'bg-blue-950/80 text-blue-400 border-blue-500/40'
                              : isRefunded
                              ? 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                              : 'bg-yellow-950/80 text-yellow-400 border-yellow-500/40'
                          }`}
                        >
                          {item.status || 'PAID'}
                        </span>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-black bg-[#FACC15] group-hover:bg-yellow-400 px-3 py-1.5 rounded-xl shadow-md transition">
                          <User className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>SHOW PROFILE ONE QR</span>
                        </div>
                        {(item as any).collectionCode && (
                          <span className="text-gray-400 font-mono text-[10px]">
                            Code: <strong className="text-white">{(item as any).collectionCode}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Store Cart Checkout Drawer */}
      {checkoutStore && (
        <StoreCartDrawer
          storeId={checkoutStore.id}
          storeName={checkoutStore.name}
          storeLocation={checkoutStore.location}
          storeOwnerId={checkoutStore.ownerId}
          isOpen={Boolean(checkoutStore)}
          onClose={() => setCheckoutStore(null)}
          onOrderCreated={(order) => {
            setCheckoutStore(null);
            setSelectedMallOrder(order);
          }}
        />
      )}

      {/* Order Confirmation Modal (no per-order QR; points to Profile ONE QR) */}
      {selectedMallOrder && (
        <MallOrderSuccessModal
          order={selectedMallOrder}
          isOpen={Boolean(selectedMallOrder)}
          onClose={() => setSelectedMallOrder(null)}
        />
      )}
    </div>
  );
};
export default FoodDrinksPage;
