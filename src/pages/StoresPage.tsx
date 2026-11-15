import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Store, EventItem, MenuItemDoc } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Search,
  X,
  Calendar,
  Ticket as TicketIcon,
  MapPin,
  Sparkles,
  ShoppingBag,
  Store as StoreIcon,
  Bike,
  Plus,
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  Building,
  Car,
  Clock,
  CheckCircle2,
  Lock,
  Utensils,
  Edit3,
  Trash2,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { Footer } from '../components/Footer';
import { isEventExpired } from '../utils/dateHelper';
import { getEventTicketStats } from '../utils/eventTicketLimit';

type CategoryFilter = 'ALL' | 'Shops' | 'Food' | 'Delivery' | 'Events';

export const StoresPage: React.FC = () => {
  const {
    stores,
    events,
    tickets,
    currentUser,
    currentWalletBalance,
    firebaseUser,
    navigateTo,
    setSelectedBuyingEvent,
    setEditingEvent,
    deleteEvent,
    setActiveModal,
    setEditingStore,
    addToCart,
    checkIsStoreOnline,
    setPendingCheckoutTarget,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);
  const [liveFoodItems, setLiveFoodItems] = useState<MenuItemDoc[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        const list: MenuItemDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          if ((data.category || '').toLowerCase() === 'food') {
            list.push({ id: d.id, ...data });
          }
        });
        setLiveFoodItems(list);
      },
      () => {
        setLiveFoodItems([]);
      }
    );
    return () => unsub();
  }, []);

  // "Create an account to continue" blocking modal state
  const [showAuthGateModal, setShowAuthGateModal] = useState<boolean>(false);
  const [authGateActionText, setAuthGateActionText] = useState<string>('buy a ticket');
  const [authGateTarget, setAuthGateTarget] = useState<any>(null);

  const isUserLoggedIn = Boolean(
    firebaseUser ||
    (currentUser?.isRegistered && currentUser?.id !== 'guest_user') ||
    localStorage.getItem('ub_admin_session') === 'true'
  );

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isAdmin = roleLower === 'admin' || localStorage.getItem('ub_admin_session') === 'true';
  const isPromoter = roleLower === 'promoter' || roleLower === 'event organiser';

  // Available upcoming events (filter out expired: events before today disappear from discovery)
  const safeEvents = Array.isArray(events) ? events : [];
  const safeStores = Array.isArray(stores) ? stores : [];

  const availableEvents = useMemo(() => {
    return safeEvents.filter((e) => e && !isEventExpired(e));
  }, [safeEvents]);

  // Featured events (top 4 for horizontal carousel)
  const featuredEvents = useMemo(() => {
    return availableEvents.slice(0, 4);
  }, [availableEvents]);

  // Filtered stores (Stores at the top)
  const filteredStores = useMemo(() => {
    if (activeCategory === 'Events' || activeCategory === 'Food' || activeCategory === 'Delivery') {
      return [];
    }
    return safeStores.filter((s) => {
      if (!s) return false;
      if (!searchQuery.trim()) return true;
      const term = searchQuery.toLowerCase().trim();
      return (
        String(s.name ?? '').toLowerCase().includes(term) ||
        String(s.location ?? '').toLowerCase().includes(term) ||
        String(s.description ?? '').toLowerCase().includes(term)
      );
    });
  }, [safeStores, activeCategory, searchQuery]);

  // Order Delivery Courier options (strictly delivering food/drinks/merch orders from stores to customers)
  const deliveryOptions = useMemo(() => {
    return [
      {
        id: 'deliv-store-to-gate',
        title: 'Fast Store-to-Gate Delivery',
        route: 'Mall Stores & Kitchens ➔ Festival Gate / Table Drop-off',
        vehicle: 'Motorbike / Scooter Courier',
        price: 'R35',
        available: 'Under 15 mins (Live GPS tracking)',
        badge: 'Fast Delivery',
      },
      {
        id: 'deliv-kasi-express',
        title: 'Express Food & Drinks Courier',
        route: 'Any Store in Mall ➔ Your Location / Camp / Venue Doorstep',
        vehicle: 'Delivery Car / Hatchback',
        price: 'R45',
        available: 'Instant driver assignment & PIN handoff',
        badge: 'Popular',
      },
      {
        id: 'deliv-bulk-orders',
        title: 'VIP & Bulk Order Delivery',
        route: 'Liquor Store & Braai Platters ➔ VIP Lounge / Groups',
        vehicle: 'Delivery Bakkie / Van Courier',
        price: 'R65',
        available: 'Large parcels & heavy order courier',
        badge: 'Bulk Orders',
      },
    ];
  }, []);

  // Filtered delivery couriers
  const filteredDelivery = useMemo(() => {
    if (activeCategory === 'Events' || activeCategory === 'Food' || activeCategory === 'Shops') {
      return [];
    }
    return deliveryOptions.filter((t) => {
      if (!searchQuery.trim()) return true;
      const term = searchQuery.toLowerCase().trim();
      return (
        t.title.toLowerCase().includes(term) ||
        t.route.toLowerCase().includes(term) ||
        t.vehicle.toLowerCase().includes(term)
      );
    });
  }, [deliveryOptions, activeCategory, searchQuery]);

  const filteredFood = useMemo(() => {
    if (activeCategory === 'Events' || activeCategory === 'Shops' || activeCategory === 'Delivery') {
      return [];
    }
    return liveFoodItems.filter((f) => {
      if (!f) return false;
      if (!searchQuery.trim()) return true;
      const term = searchQuery.toLowerCase().trim();
      return (
        String(f.name ?? '').toLowerCase().includes(term) ||
        String(f.storeName ?? '').toLowerCase().includes(term)
      );
    });
  }, [liveFoodItems, activeCategory, searchQuery]);

  // Filtered events matching search & category (Events at the bottom)
  const filteredEvents = useMemo(() => {
    if (activeCategory === 'Food' || activeCategory === 'Shops' || activeCategory === 'Delivery') {
      return [];
    }
    return availableEvents.filter((e) => {
      if (!e) return false;
      if (!searchQuery.trim()) return true;
      const term = searchQuery.toLowerCase().trim();
      return (
        String(e.title ?? '').toLowerCase().includes(term) ||
        String(e.location ?? '').toLowerCase().includes(term) ||
        String(e.price ?? '').toLowerCase().includes(term) ||
        String(e.date ?? '').toLowerCase().includes(term)
      );
    });
  }, [availableEvents, activeCategory, searchQuery]);

  // Click Buy Ticket handler
  const handleBuyTicket = (event: EventItem) => {
    if (isEventExpired(event)) {
      setExpiredNotice('This event has already passed. Tickets are no longer available for purchase.');
      setTimeout(() => setExpiredNotice(null), 3500);
      return;
    }
    const stats = getEventTicketStats(event, tickets);
    if (stats.isSoldOut || event.status === 'Closed') {
      return;
    }
    if (isUserLoggedIn) {
      setSelectedBuyingEvent(event);
    } else {
      setAuthGateActionText(`buy tickets for "${event.title}"`);
      setAuthGateTarget({ type: 'ticket', data: event });
      setShowAuthGateModal(true);
    }
  };

  // Click Add to Cart handler
  const handleAddToCart = (item: any) => {
    if (isUserLoggedIn) {
      addToCart(item.storeId, item.storeName, {
        id: item.id,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
      });
    } else {
      setAuthGateActionText(`add "${item.name}" to your cart`);
      setAuthGateTarget({ type: 'cart', data: item });
      setShowAuthGateModal(true);
    }
  };

  // Click Request Delivery handler
  const handleRequestDelivery = (delivery: any) => {
    if (isUserLoggedIn) {
      setActiveModal('driver-dashboard');
    } else {
      setAuthGateActionText(`request order delivery with "${delivery.title}"`);
      setAuthGateTarget({ type: 'book', data: delivery });
      setShowAuthGateModal(true);
    }
  };

  const handleProceedToRegister = () => {
    setShowAuthGateModal(false);
    if (authGateTarget) {
      setPendingCheckoutTarget(authGateTarget);
    }
    navigateTo('/register');
  };

  const handleProceedToLogin = () => {
    setShowAuthGateModal(false);
    if (authGateTarget) {
      setPendingCheckoutTarget(authGateTarget);
    }
    navigateTo('/login');
  };

  return (
    <div className="pb-20 pt-1">
      {expiredNotice && (
        <div className="mx-3 mt-2 p-2.5 rounded-xl bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center justify-between gap-2">
          <span>{expiredNotice}</span>
          <button type="button" onClick={() => setExpiredNotice(null)} className="text-rose-300 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* 1. TOP SEARCH BAR */}
      <section className="px-3 pt-1.5 pb-2.5">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[#FACC15] absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stores, food, order deliveries, or events..."
            className="w-full pl-9 pr-8 py-2 bg-[#161616] border border-white/10 rounded-xl text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#FACC15] focus:ring-1 focus:ring-[#FACC15] shadow-md transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 text-gray-400 hover:text-white p-1"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* 2. CATEGORIES: Stores first, Food, Delivery, Events */}
      <section className="px-3 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {(
            [
              { key: 'ALL', label: 'All', icon: Sparkles },
              { key: 'Shops', label: 'Stores', icon: StoreIcon },
              { key: 'Food', label: 'Food', icon: ShoppingBag },
              { key: 'Delivery', label: 'Delivery', icon: Bike },
              { key: 'Events', label: 'Events', icon: Calendar },
            ] as const
          ).map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer shadow-sm active:scale-95 ${
                  isActive
                    ? 'bg-[#FACC15] text-black shadow-yellow-400/20 shadow-md font-extrabold'
                    : 'bg-[#181818] text-gray-300 hover:text-white border border-white/10 hover:border-white/20'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2B. WALLET BALANCE & TOP UP WITH PAYSHAP */}
      <section className="px-3 pb-4">
        <div className="bg-[#141414] border border-[#FACC15]/30 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                Wallet Balance
              </span>
              <span className="text-2xl font-black text-[#FACC15] tracking-tight tabular-nums">
                R{(isUserLoggedIn ? Number(currentWalletBalance ?? currentUser?.walletBalance ?? 0) : 0).toFixed(2)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/30 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-[#FACC15]" />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isUserLoggedIn) {
                navigateTo('/top-up');
              } else {
                setAuthGateActionText('top up your wallet');
                setAuthGateTarget({ type: 'topup' });
                setShowAuthGateModal(true);
              }
            }}
            className="w-full min-h-[44px] bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
          >
            <span>Top Up</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </section>

      {/* 3. STORES & PARTNER VENUES SECTION (REQUIRED AT THE TOP) */}
      {(activeCategory === 'ALL' || activeCategory === 'Shops') && (
        <section id="stores-section" className="px-3 pb-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <StoreIcon className="w-3.5 h-3.5 text-[#FACC15]" />
                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight uppercase">
                  Stores & Partner Venues
                </h2>
              </div>
              <p className="text-[10px] text-gray-400">
                Official Universal Band cashless stores, bars & food stalls
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setEditingStore(null);
                  setActiveModal('store-manager');
                }}
                className="inline-flex items-center gap-1 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-[10px] px-2.5 py-1 rounded-full shadow-md transition cursor-pointer"
              >
                <Plus className="w-3 h-3 stroke-[3]" />
                <span>Add Store</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {filteredStores.map((store) => {
              const isOnline = checkIsStoreOnline(store.id);
              return (
                <div
                  key={store.id}
                  onClick={() => navigateTo(`/stores/${store.id}`)}
                  className="bg-[#141414] border border-white/10 hover:border-[#FACC15] rounded-xl overflow-hidden shadow-lg flex flex-col cursor-pointer transition active:scale-95 group"
                >
                  <div className="relative h-28 w-full bg-zinc-800">
                    <img
                      src={store.imageUrl}
                      alt={store.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                      loading="lazy"
                    />
                    <div className="absolute top-1.5 left-1.5">
                      <span className="bg-black/75 text-white text-[8px] font-bold uppercase px-1.5 py-0.5 rounded backdrop-blur-xs">
                        {store.location || 'Limpopo'}
                      </span>
                    </div>
                    <div className="absolute top-1.5 right-1.5">
                      <span
                        className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-xs shadow ${
                          isOnline ? 'bg-emerald-600/90 text-white' : 'bg-rose-600/90 text-white'
                        }`}
                      >
                        <span className={`w-1 h-1 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-rose-200'}`} />
                        <span>{isOnline ? 'Online' : 'Offline'}</span>
                      </span>
                    </div>
                  </div>
                  <div className="p-2">
                    <h4 className="text-xs font-bold text-white truncate">{store.name}</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{store.description || 'Cashless venue'}</p>
                    <span className="text-[#FACC15] font-bold text-[10px] mt-1 block">
                      Explore Store ➔
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. HORIZONTAL LIST OF FEATURED EVENTS (AT THE BOTTOM) */}
      {(activeCategory === 'ALL' || activeCategory === 'Events') && !searchQuery && featuredEvents.length > 0 && (
        <section className="pb-5">
          <div className="px-3 flex items-center justify-between mb-2.5">
            <div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FACC15]" />
                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight uppercase">
                  Featured Events
                </h2>
              </div>
              <p className="text-[10px] text-gray-400">
                Top South African concerts & festival experiences
              </p>
            </div>
            <span className="text-[9px] font-bold text-[#FACC15] bg-[#FACC15]/10 px-2 py-0.5 rounded-full border border-[#FACC15]/20">
              Featured
            </span>
          </div>

          {/* Horizontal Carousel */}
          <div className="flex gap-3 overflow-x-auto px-3 pb-2 no-scrollbar snap-x">
            {featuredEvents.map((event) => {
              const stats = getEventTicketStats(event, tickets);
              const isClosed = event.status === 'Closed';
              const salesBlocked = stats.isSoldOut || isClosed;

              return (
                <div
                  key={`feat-${event.id}`}
                  className="w-64 shrink-0 snap-start bg-[#141414] border border-white/10 hover:border-[#FACC15]/60 rounded-2xl overflow-hidden shadow-xl flex flex-col group transition"
                >
                  {/* Poster Image */}
                  <div className="relative h-36 w-full bg-zinc-900 overflow-hidden">
                    <img
                      src={
                        event.imageUrl ||
                        'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80'
                      }
                      alt={event.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                    {/* Price Badge in ZAR */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                      {stats.isSoldOut && (
                        <span className="bg-rose-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase shadow">
                          Sold Out
                        </span>
                      )}
                      <span className="bg-[#FACC15] text-black font-extrabold text-[11px] px-2.5 py-0.5 rounded-full shadow border border-black/20">
                        {event.price}
                      </span>
                    </div>

                    {/* Remaining Ticket Badge */}
                    {stats.hasLimit && !stats.isSoldOut && (
                      <div className="absolute top-2.5 left-2.5">
                        <span className="bg-black/80 text-emerald-300 border border-emerald-500/40 text-[9px] font-extrabold px-2 py-0.5 rounded-full backdrop-blur-xs">
                          {stats.remaining} left
                        </span>
                      </div>
                    )}

                    {/* Date Badge */}
                    <div className="absolute bottom-2 left-2.5 flex items-center gap-1 text-[10px] font-bold text-yellow-300">
                      <Calendar className="w-3 h-3" />
                      <span>{event.date}</span>
                    </div>
                  </div>

                  {/* Event Details */}
                  <div className="p-2.5 flex flex-col justify-between flex-1 space-y-2">
                    <div>
                      <h3 className="text-xs font-bold text-white leading-tight group-hover:text-[#FACC15] transition-colors truncate">
                        {event.title}
                      </h3>
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                        <span className="truncate">{event.location || 'South Africa Venue'}</span>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-white/5 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-gray-400 block">
                          {stats.hasLimit ? `${stats.soldCount}/${stats.maxLimit} Sold` : 'Pass'}
                        </span>
                        <span className="text-xs font-bold text-white">{event.price}</span>
                      </div>

                      <button
                        type="button"
                        disabled={salesBlocked}
                        onClick={() => handleBuyTicket(event)}
                        className={`py-1 px-3 rounded-lg font-extrabold text-[11px] shadow transition flex items-center gap-1 ${
                          salesBlocked
                            ? 'bg-zinc-800 text-gray-500 border border-zinc-700 cursor-not-allowed'
                            : 'bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black cursor-pointer'
                        }`}
                      >
                        <TicketIcon className="w-3 h-3 stroke-[2.5]" />
                        <span>
                          {stats.isSoldOut ? 'Sold Out' : isClosed ? 'Closed' : 'Buy Ticket'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7. LIST OF UPCOMING EVENTS NEAR THE USER (AT THE BOTTOM) */}
      {(activeCategory === 'ALL' || activeCategory === 'Events') && (
        <section id="upcoming-events" className="px-3 pb-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#FACC15]" />
                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight uppercase">
                  Upcoming Events Near You
                </h2>
              </div>
              <p className="text-[10px] text-gray-400">
                Explore, browse passes & book in South African Rands (ZAR)
              </p>
            </div>
            <span className="text-[10px] font-bold text-[#FACC15] bg-[#FACC15]/10 px-2 py-0.5 rounded-full border border-[#FACC15]/20">
              {filteredEvents.length} Events
            </span>
          </div>

          {/* Grid of cards for events */}
          {filteredEvents.length === 0 ? (
            <div className="py-10 px-3 text-center bg-[#141414] border border-white/5 rounded-2xl space-y-2">
              <Calendar className="w-7 h-7 text-gray-500 mx-auto" />
              <h3 className="text-xs font-bold text-white">0 Upcoming Events</h3>
              <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                No events are currently listed. Real events will appear here once published by organizers.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredEvents.map((event) => {
                const stats = getEventTicketStats(event, tickets);
                const isClosed = event.status === 'Closed';
                const salesBlocked = stats.isSoldOut || isClosed;
                const canManageEvent =
                  isAdmin ||
                  (isPromoter &&
                    (event.creatorId === currentUser.id ||
                      (event.storeId && currentUser.assignedStoreId === event.storeId)));

                return (
                  <div
                    key={event.id}
                    className="bg-[#141414] border border-white/10 hover:border-[#FACC15]/60 rounded-2xl overflow-hidden shadow-lg flex flex-col group transition"
                  >
                    {/* Event Poster Image */}
                    <div className="relative h-36 sm:h-40 w-full bg-zinc-900 overflow-hidden">
                      <img
                        src={
                          event.imageUrl ||
                          'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80'
                        }
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                      {/* Price & Limit Tag in ZAR */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                        {stats.isSoldOut ? (
                          <span className="bg-rose-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase shadow">
                            Sold Out
                          </span>
                        ) : stats.hasLimit ? (
                          <span className="bg-black/80 text-emerald-300 border border-emerald-500/40 font-extrabold text-[10px] px-2 py-0.5 rounded-full backdrop-blur-xs">
                            {stats.remaining} left
                          </span>
                        ) : null}
                        <span className="bg-[#FACC15] text-black font-extrabold text-xs px-3 py-0.5 rounded-full shadow border border-black/20">
                          {event.price}
                        </span>
                      </div>

                      {/* Category Pill */}
                      <div className="absolute top-2.5 left-2.5">
                        <span className="bg-black/75 backdrop-blur-xs text-white text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md border border-white/20">
                          {event.category || 'Live Event'}
                        </span>
                      </div>

                      {/* Date on image */}
                      <div className="absolute bottom-2 left-2.5 flex items-center gap-1 text-[11px] font-bold text-yellow-300">
                        <Calendar className="w-3 h-3" />
                        <span>{event.date}</span>
                      </div>
                    </div>

                    {/* Event Description & Actions */}
                    <div className="p-3 space-y-2">
                      <div>
                        <h3 className="text-sm font-extrabold text-white group-hover:text-[#FACC15] transition-colors leading-snug">
                          {event.title}
                        </h3>
                        <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                          <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                          <span className="truncate">{event.location || 'South Africa Venue'}</span>
                        </div>
                        {event.description && (
                          <p className="text-[11px] text-gray-300 mt-1.5 line-clamp-2 leading-relaxed">
                            {event.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <span className="text-[9px] text-gray-400 uppercase font-semibold block">
                            {stats.hasLimit
                              ? `Sold ${stats.soldCount} / ${stats.maxLimit}`
                              : 'Ticket Price'}
                          </span>
                          <span className="text-sm font-extrabold text-white">{event.price}</span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {canManageEvent && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEvent(event);
                                  setActiveModal('add-event');
                                }}
                                className="py-1.5 px-2 rounded-lg bg-white/10 hover:bg-[#FACC15] hover:text-black text-gray-200 border border-white/10 transition cursor-pointer"
                                title="Edit Event & Ticket Limit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteEventId(event.id)}
                                className="py-1.5 px-2 rounded-lg bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition cursor-pointer"
                                title="Delete Event"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedBuyingEvent(event)}
                            className="py-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition border border-white/10"
                            title="View event menu and pre-order food & drinks"
                          >
                            <Utensils className="w-3 h-3 text-[#FACC15]" />
                            <span>Menu</span>
                          </button>
                          <button
                            type="button"
                            disabled={salesBlocked}
                            onClick={() => handleBuyTicket(event)}
                            className={`py-1.5 px-3 rounded-lg font-extrabold text-[11px] shadow transition flex items-center gap-1 ${
                              salesBlocked
                                ? 'bg-zinc-800 text-gray-500 border border-zinc-700 cursor-not-allowed'
                                : 'bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black cursor-pointer'
                            }`}
                          >
                            <TicketIcon className="w-3 h-3 stroke-[2.5]" />
                            <span>
                              {stats.isSoldOut ? 'Sold Out' : isClosed ? 'Closed' : 'Buy Ticket'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {confirmDeleteEventId === event.id && (
                        <div className="p-2.5 bg-rose-950/70 border border-rose-500/50 rounded-xl space-y-2 animate-in fade-in">
                          <div className="flex items-center gap-1.5 text-[11px] text-rose-200 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>Delete event &quot;{event.title}&quot; permanently?</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={deletingEventId === event.id}
                              onClick={async () => {
                                setDeletingEventId(event.id);
                                await deleteEvent(event.id);
                                setDeletingEventId(null);
                                setConfirmDeleteEventId(null);
                              }}
                              className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px] rounded-lg cursor-pointer transition"
                            >
                              {deletingEventId === event.id ? 'Deleting...' : 'Yes, Delete'}
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
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 8. FOOTER */}
      <Footer />

      {/* 9. BLOCKING MODAL: "Create an account to continue" (REQUIREMENT 2) */}
      {showAuthGateModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#161616] border border-white/10 rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4 text-center relative animate-in zoom-in-95">
            <button
              type="button"
              onClick={() => setShowAuthGateModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-full bg-white/5 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-[#FACC15]/15 border border-[#FACC15]/30 text-[#FACC15] flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7 text-[#FACC15]" />
            </div>

            <div>
              <h3 className="text-lg font-black text-white tracking-tight">
                Create an account to continue
              </h3>
              <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
                You can browse discovery freely, but you must have an account to {authGateActionText}.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleProceedToRegister}
                className="w-full py-3 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-2xl shadow-xl transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <span>Create New Account</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </button>

              <button
                type="button"
                onClick={handleProceedToLogin}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-xs rounded-xl border border-white/10 transition cursor-pointer"
              >
                Already have an account? Log In
              </button>

              <button
                type="button"
                onClick={() => setShowAuthGateModal(false)}
                className="text-[11px] text-gray-400 hover:text-gray-200 underline pt-1 block mx-auto cursor-pointer"
              >
                Continue browsing Discovery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoresPage;
