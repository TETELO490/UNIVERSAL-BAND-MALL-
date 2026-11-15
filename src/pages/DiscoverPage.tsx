import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatEventDate, isEventExpired } from '../utils/dateHelper';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import { getEventTicketStats } from '../utils/eventTicketLimit';
import { EventItem } from '../types';
import { Ticket as TicketIcon, Calendar, MapPin, Store as StoreIcon, Plus, Edit3, Camera, Trash2, AlertTriangle } from 'lucide-react';

export const DiscoverPage: React.FC = () => {
  const {
    stores,
    events,
    tickets,
    currentUser,
    firebaseUser,
    navigateTo,
    setSelectedBuyingEvent,
    setEditingEvent,
    deleteEvent,
    setActiveModal,
    setEditingStore,
    customLogoUrl,
  } = useApp();

  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);

  const isUserLoggedIn = Boolean(
    firebaseUser ||
    (currentUser?.isRegistered && currentUser?.id && currentUser?.id !== 'guest_user') ||
    localStorage.getItem('ub_admin_session') === 'true'
  );

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isAdmin = isUserLoggedIn && (roleLower === 'admin' || isAuthorizedAdminEmail(currentUser?.email) || localStorage.getItem('ub_admin_session') === 'true');
  const isPromoter = isUserLoggedIn && (roleLower === 'promoter' || roleLower === 'event organiser');

  const handleGetTicket = (e: React.MouseEvent, event: EventItem) => {
    e.stopPropagation();
    if (isEventExpired(event)) {
      setExpiredNotice('This event has already passed. Tickets are no longer available for purchase.');
      setTimeout(() => setExpiredNotice(null), 3500);
      return;
    }
    setSelectedBuyingEvent(event);
  };

  // If someone posts their events without having a store, the event stays on Discovery.
  // RULE: Automatically hide events whose date has passed from public discovery (e.g. if today is 10th, past events disappear)
  const discoveryEvents = events.filter(
    (event) =>
      (!event.storeId || event.storeId.trim() === '' || !stores.some((s) => s.id === event.storeId)) &&
      !isEventExpired(event)
  );

  return (
    <div className="pb-24 pt-4 px-4 max-w-md mx-auto">
      {expiredNotice && (
        <div className="mb-3 p-2.5 rounded-xl bg-rose-950/90 border border-rose-500/40 text-rose-200 text-xs font-bold">
          {expiredNotice}
        </div>
      )}
      {/* Title "Discover" big bold white */}
      <h1 className="text-3xl font-extrabold text-white tracking-tight mb-4">
        Discover
      </h1>

      {/* Featured Universal Band Hero Banner */}
      <div className="mb-6 rounded-3xl overflow-hidden border border-[#C9A86A]/30 bg-black shadow-2xl relative group">
        {/* Quick action button to change brand logo / banner */}
        <button
          onClick={() => navigateTo('/admin/logo-settings')}
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black text-[#C9A86A] border border-[#C9A86A]/60 text-xs font-bold backdrop-blur-md shadow-xl active:scale-95 transition-all cursor-pointer"
          title="Change App Logo & Banner"
        >
          <Camera className="w-3.5 h-3.5 text-[#C9A86A]" />
          <span>Change Logo</span>
        </button>

        <div className="aspect-[16/9] w-full overflow-hidden relative bg-black flex items-center justify-center p-4">
          <img
            src={customLogoUrl || '/universal-band-logo.svg'}
            alt="Universal Band Brand Emblem"
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.includes('universal-band-logo.svg')) {
                target.src = '/universal-band-logo.svg';
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex flex-col justify-end p-4 pointer-events-none">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#C9A86A] text-black font-black text-[10px] tracking-wider uppercase w-max mb-1.5 shadow">
              Official Brand Pass
            </span>
            <h2 className="text-lg font-black text-white tracking-tight">
              Universal Band Smart Access
            </h2>
            <p className="text-xs text-gray-300 mt-0.5 font-medium">
              Secure cashless payments, VIP event entry & real-time store tracking.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION "STORES" */}
      <section className="mb-7">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase">
              STORES & VENUES
            </h2>
            <span className="text-[10px] text-gray-500 font-medium">
              ({stores.length} active)
            </span>
          </div>
          
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setEditingStore(null);
                setActiveModal('store-manager');
              }}
              className="inline-flex items-center gap-1 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-[11px] px-3 py-1 rounded-full shadow-md transition cursor-pointer"
            >
              <Plus className="w-3 h-3 stroke-[3]" />
              <span>Add Store</span>
            </button>
          )}
        </div>

        {/* Horizontal list of stores */}
        <div className="flex items-start gap-4 overflow-x-auto pb-2 scrollbar-none no-scrollbar -mx-4 px-4">
          {stores.map((store) => {
            const canManageThisStore = isAdmin || (isPromoter && currentUser.assignedStoreId === store.id);

            return (
              <div
                key={store.id}
                onClick={() => {
                  navigateTo(`/store/${store.id}`);
                }}
                className="flex flex-col items-center flex-shrink-0 group focus:outline-none cursor-pointer relative"
                title={canManageThisStore ? `View or Manage ${store.name}` : `Browse ${store.name}`}
              >
                {/* Round image 70x70 */}
                <div className="w-[70px] h-[70px] rounded-2xl overflow-hidden border-2 border-[#262626] group-hover:border-[#FACC15] group-focus:border-[#FACC15] transition-all duration-200 bg-[#1A1A1A] relative shadow-md">
                  <img
                    src={store.imageUrl}
                    alt={store.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                  {canManageThisStore && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingStore(store);
                        setActiveModal('store-manager');
                      }}
                      className="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] font-bold text-center text-[#FACC15] py-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5 cursor-pointer"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      <span>Edit</span>
                    </div>
                  )}
                </div>
                {/* Name below */}
                <span className="mt-2 text-xs font-semibold text-gray-200 group-hover:text-[#FACC15] transition-colors text-center max-w-[80px] truncate">
                  {store.name}
                </span>
              </div>
            );
          })}

          {/* Add Store Button Card (Admin Only) */}
          {isAdmin && (
            <button
              onClick={() => {
                setEditingStore(null);
                setActiveModal('store-manager');
              }}
              className="flex flex-col items-center flex-shrink-0 group focus:outline-none cursor-pointer"
            >
              <div className="w-[70px] h-[70px] rounded-2xl border-2 border-dashed border-yellow-400/40 hover:border-[#FACC15] flex flex-col items-center justify-center bg-yellow-950/20 hover:bg-yellow-950/40 text-[#FACC15] transition-all">
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span className="text-[9px] font-black uppercase mt-0.5">Add</span>
              </div>
              <span className="mt-2 text-[11px] font-medium text-gray-400 group-hover:text-yellow-400 text-center">
                New Store
              </span>
            </button>
          )}
        </div>
      </section>

      {/* SECTION "EVENTS" small gray uppercase */}
      <section>
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase">
              DISCOVERY EVENTS
            </h2>
            <p className="text-[10px] text-gray-500">
              Events posted directly to Discovery (events with a store are under that store)
            </p>
          </div>
          {(isAdmin || isPromoter) && (
            <button
              onClick={() => {
                setEditingEvent(null);
                setActiveModal('add-event');
              }}
              className="text-[11px] font-bold text-[#FACC15] hover:underline cursor-pointer"
            >
              + Post Event
            </button>
          )}
        </div>

        {/* If no events: dark card with centered text "No events yet." */}
        {discoveryEvents.length === 0 ? (
          <div className="bg-[#1A1A1A] rounded-2xl p-8 border border-white/5 text-center shadow-lg">
            <StoreIcon className="w-10 h-10 text-gray-500 mx-auto mb-2" />
            <p className="text-white font-bold text-sm mb-1">No Independent Events in Discovery</p>
            <p className="text-gray-400 text-xs max-w-xs mx-auto mb-4">
              Events posted without having a store will stay directly on Discovery here.
            </p>
            {(isAdmin || isPromoter) && (
              <button
                onClick={() => {
                  setEditingEvent(null);
                  setActiveModal('add-event');
                }}
                className="bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                + Promote Your Event Now
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {discoveryEvents.map((event) => {
              const hostStore = stores.find((s) => s.id === event.storeId);
              const stats = getEventTicketStats(event, tickets);
              const isClosed = event.status === 'Closed';
              const salesBlocked = stats.isSoldOut || isClosed;
              const canManageEvent =
                isAdmin ||
                (isPromoter &&
                  (event.creatorId === currentUser.id ||
                    (hostStore && currentUser.assignedStoreId === hostStore.id)));

              return (
                <div
                  key={event.id}
                  onClick={() => {
                    if (isEventExpired(event)) {
                      setExpiredNotice('This event has already passed. Tickets are no longer available for purchase.');
                      setTimeout(() => setExpiredNotice(null), 3500);
                      return;
                    }
                    setSelectedBuyingEvent(event);
                  }}
                  className="bg-[#1A1A1A] rounded-2xl overflow-hidden border border-white/5 hover:border-white/10 transition-all duration-200 cursor-pointer shadow-lg group"
                >
                  {/* Image placeholder / top image */}
                  <div className="w-full h-44 bg-zinc-800 relative overflow-hidden">
                    {event.imageUrl ? (
                      <img
                        src={event.imageUrl}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-white flex items-center justify-center">
                        <span className="text-black font-extrabold text-xl tracking-wider">
                          {event.title}
                        </span>
                      </div>
                    )}

                    {/* Open / Ticket Limit Status Badge */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 border text-[11px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-sm shadow ${
                          stats.isSoldOut
                            ? 'bg-rose-950/90 text-rose-300 border-rose-500/40'
                            : isClosed
                            ? 'bg-amber-950/90 text-amber-300 border-amber-500/40'
                            : 'bg-emerald-950/90 text-emerald-400 border-emerald-500/40'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            stats.isSoldOut
                              ? 'bg-rose-400'
                              : isClosed
                              ? 'bg-amber-400'
                              : 'bg-emerald-400 animate-pulse'
                          }`}
                        />
                        {stats.isSoldOut
                          ? 'SOLD OUT'
                          : isClosed
                          ? 'Closed'
                          : stats.hasLimit
                          ? `${stats.remaining} Left`
                          : event.status}
                      </span>
                    </div>

                    {/* Hosting Store Pill */}
                    {hostStore && (
                      <div className="absolute top-3 left-3">
                        <span className="bg-black/80 backdrop-blur-md text-[#FACC15] text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-[#FACC15]/30 flex items-center gap-1 shadow-md">
                          <StoreIcon className="w-3 h-3 text-[#FACC15]" />
                          <span>{hostStore.name}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Event Body */}
                  <div className="p-4">
                    {hostStore && (
                      <div className="flex items-center gap-1 text-[11px] text-[#FACC15] font-bold mb-1">
                        <span>Store Venue: {hostStore.name}</span>
                      </div>
                    )}

                    <h3 className="text-lg font-bold text-white mb-1.5 tracking-tight group-hover:text-yellow-300 transition-colors">
                      {event.title}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-gray-400 mb-3.5 flex-wrap">
                      <div className="flex items-center gap-1 text-gray-300">
                        <Calendar className="w-3.5 h-3.5 text-[#FACC15]" />
                        <span>{formatEventDate(event.date)}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1 text-gray-300">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 gap-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                          {stats.hasLimit
                            ? `${stats.soldCount}/${stats.maxLimit} Sold`
                            : 'Band Access'}
                        </span>
                        <span className="text-[#FACC15] text-xl font-black">
                          {event.price}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {canManageEvent && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingEvent(event);
                                setActiveModal('add-event');
                              }}
                              className="p-2 rounded-xl bg-white/10 hover:bg-[#FACC15] hover:text-black text-gray-200 border border-white/10 transition cursor-pointer"
                              title="Edit Event"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteEventId(event.id);
                              }}
                              className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition cursor-pointer"
                              title="Delete Event"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          disabled={salesBlocked}
                          onClick={(e) => handleGetTicket(e, event)}
                          className={`px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all font-extrabold ${
                            salesBlocked
                              ? 'bg-zinc-800 text-gray-500 border border-zinc-700 cursor-not-allowed'
                              : 'bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black shadow-md shadow-yellow-400/10 cursor-pointer'
                          }`}
                        >
                          <TicketIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>
                            {stats.isSoldOut ? 'Sold Out' : isClosed ? 'Closed' : 'Get Ticket'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {confirmDeleteEventId === event.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3 p-2.5 bg-rose-950/70 border border-rose-500/50 rounded-xl space-y-2 animate-in fade-in"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-200 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>Delete &quot;{event.title}&quot;?</span>
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
    </div>
  );
};
