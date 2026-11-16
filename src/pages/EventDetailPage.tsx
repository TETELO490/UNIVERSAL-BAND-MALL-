import React, { useMemo, useState } from 'react';
import {
  Calendar,
  MapPin,
  Ticket as TicketIcon,
  ArrowLeft,
  Share2,
  Check,
  Store as StoreIcon,
  Clock,
  ShieldCheck,
  Utensils,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  findEventBySlugOrId,
  getEventShareUrl,
  copyTextToClipboard,
} from '../utils/eventLinkHelper';
import { getEventTicketStats, getEventTierStats } from '../utils/eventTicketLimit';
import { isEventExpired } from '../utils/dateHelper';

export const EventDetailPage: React.FC = () => {
  const {
    currentRoute,
    events,
    eventsLoaded,
    tickets,
    stores,
    navigateTo,
    setSelectedBuyingEvent,
    setSelectedStoreId,
    openEventFoodPreorder,
  } = useApp();

  const [copiedLink, setCopiedLink] = useState(false);

  const slugOrId = useMemo(() => {
    const raw =
      currentRoute.startsWith('/event/') || currentRoute.startsWith('/events/')
        ? currentRoute
        : typeof window !== 'undefined'
        ? window.location.pathname
        : '';
    return raw.replace(/^\/events?\//i, '');
  }, [currentRoute]);

  const event = useMemo(() => findEventBySlugOrId(events, slugOrId), [events, slugOrId]);

  const hostStore = useMemo(
    () => (event?.storeId ? stores.find((s) => s.id === event.storeId) : undefined),
    [event, stores]
  );

  const ticketStats = useMemo(
    () => getEventTicketStats(event, tickets),
    [event, tickets]
  );

  const tierStats = useMemo(
    () => getEventTierStats(event, tickets),
    [event, tickets]
  );

  if (!event && !eventsLoaded) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div className="w-10 h-10 border-2 border-[#FACC15]/25 border-t-[#FACC15] rounded-full animate-spin" />
        <p className="text-sm font-bold text-white">Opening Event on UNIVERSAL BAND MALL...</p>
        <p className="text-xs text-gray-400">Loading live ticket availability</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#FACC15]/15 border border-[#FACC15]/30 text-[#FACC15] flex items-center justify-center mx-auto">
          <TicketIcon className="w-7 h-7" />
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#FACC15]">
            UNIVERSAL BAND MALL
          </span>
          <h1 className="text-xl font-black text-white mt-1">Event Not Found</h1>
          <p className="text-xs text-gray-400 mt-1.5">
            This event link may have expired or been removed by the organiser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs px-5 py-3 rounded-xl inline-flex items-center gap-2 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Browse All Events</span>
        </button>
      </div>
    );
  }

  const isExpired = isEventExpired(event);
  const isClosed = event.status === 'Closed';
  const isSoldOut = ticketStats.isSoldOut;
  const salesBlocked = isExpired || isClosed || isSoldOut;

  const activeTiers = tierStats.availableTiers;
  const headlinePrice =
    activeTiers.length > 0
      ? activeTiers[0].formattedPrice
      : event.price || (event.generalPrice ? `R${event.generalPrice}` : '');

  const eventShareUrl = getEventShareUrl(event, events);

  const handleCopyEventLink = async () => {
    const ok = await copyTextToClipboard(eventShareUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div className="max-w-md mx-auto pt-3 pb-24 space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-[#FACC15] transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>All Events</span>
        </button>

        <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-2.5 py-1 rounded-full">
          UNIVERSAL BAND MALL
        </span>
      </div>

      {/* Main Direct Event Card */}
      <div className="bg-[#161616] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        {/* Event Poster */}
        <div className="relative h-56 sm:h-64 w-full bg-zinc-900 overflow-hidden">
          <img
            src={
              event.imageUrl ||
              'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'
            }
            alt={event.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

          {/* Status & Price Badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
            <span className="bg-black/80 backdrop-blur-sm text-white text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-lg border border-white/15">
              {event.category || 'Live Event'}
            </span>

            {isExpired ? (
              <span className="bg-zinc-900/95 text-gray-300 border border-white/20 text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                Event Passed
              </span>
            ) : isSoldOut ? (
              <span className="bg-rose-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow">
                Sold Out
              </span>
            ) : isClosed ? (
              <span className="bg-amber-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow">
                Sales Closed
              </span>
            ) : ticketStats.hasLimit && ticketStats.remaining !== null ? (
              <span className="bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 text-[10px] font-black px-2.5 py-1 rounded-full backdrop-blur-sm">
                {ticketStats.remaining} Tickets Left
              </span>
            ) : null}
          </div>

          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
                {event.title}
              </h1>
              {hostStore && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStoreId(hostStore.id);
                    navigateTo(`/store/${hostStore.id}`);
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#FACC15] hover:underline cursor-pointer"
                >
                  <StoreIcon className="w-3.5 h-3.5" />
                  <span>{hostStore.name}</span>
                </button>
              )}
            </div>

            {headlinePrice && (
              <div className="bg-[#FACC15] text-black px-3.5 py-1.5 rounded-2xl font-black text-base shadow-lg shrink-0 font-mono">
                {headlinePrice}
              </div>
            )}
          </div>
        </div>

        {/* Event Info & BUY TICKET Action */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Date, Location & Price Summary */}
          <div className="grid grid-cols-1 gap-2.5 bg-[#111111] border border-white/10 rounded-2xl p-3.5">
            <div className="flex items-center gap-2.5 text-xs">
              <div className="w-8 h-8 rounded-xl bg-[#FACC15]/15 text-[#FACC15] flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Date &amp; Time</span>
                <span className="text-sm font-black text-white">{event.date}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-xs">
              <div className="w-8 h-8 rounded-xl bg-[#FACC15]/15 text-[#FACC15] flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Venue / Location</span>
                <span className="text-sm font-bold text-gray-200">{event.location || 'South Africa Venue'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-xs">
              <div className="w-8 h-8 rounded-xl bg-[#FACC15]/15 text-[#FACC15] flex items-center justify-center shrink-0">
                <TicketIcon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Ticket Price</span>
                <span className="text-sm font-black text-[#FACC15] font-mono">
                  {headlinePrice || event.price}
                </span>
              </div>
              {ticketStats.hasLimit && ticketStats.maxLimit !== null && (
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Sold</span>
                  <span className="text-xs font-mono font-bold text-white">
                    {ticketStats.soldCount} / {ticketStats.maxLimit}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Active Ticket Tiers (strictly honoring optional & sequential rules) */}
          {activeTiers.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                Available Ticket Types
              </span>
              <div className={`grid ${activeTiers.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                {activeTiers.map((tier) => (
                  <div
                    key={tier.id}
                    className="bg-[#111111] border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] font-black text-white block truncate">
                        {tier.badge}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {tier.remaining} left ({tier.soldCount}/{tier.maxLimit})
                      </span>
                    </div>
                    <span className="text-sm font-black text-[#FACC15] font-mono shrink-0">
                      {tier.formattedPrice}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {event.description && (
            <div className="bg-black/40 border border-white/5 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                Event Details
              </span>
              <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                {event.description}
              </p>
            </div>
          )}

          {/* Primary BUY TICKET CTA */}
          <button
            type="button"
            disabled={salesBlocked}
            onClick={() => setSelectedBuyingEvent(event)}
            className={`w-full py-4 rounded-2xl font-black text-sm tracking-wide flex items-center justify-center gap-2 transition shadow-xl ${
              salesBlocked
                ? 'bg-zinc-800 text-gray-400 border border-zinc-700 cursor-not-allowed'
                : 'bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.98] text-black shadow-yellow-400/20 cursor-pointer'
            }`}
          >
            {isExpired ? (
              <>
                <Clock className="w-5 h-5" />
                <span>EVENT HAS PASSED</span>
              </>
            ) : isSoldOut ? (
              <>
                <TicketIcon className="w-5 h-5" />
                <span>SOLD OUT</span>
              </>
            ) : isClosed ? (
              <>
                <Clock className="w-5 h-5" />
                <span>TICKET SALES CLOSED</span>
              </>
            ) : (
              <>
                <TicketIcon className="w-5 h-5 stroke-[2.5]" />
                <span>BUY TICKET {headlinePrice ? `• ${headlinePrice}` : ''}</span>
              </>
            )}
          </button>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyEventLink}
              className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-gray-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-[#FACC15]" />}
              <span>{copiedLink ? 'Link Copied!' : 'Share Event Link'}</span>
            </button>

            <button
              type="button"
              onClick={() => openEventFoodPreorder(event)}
              className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-gray-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Utensils className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Pre-Order Menu</span>
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Official UNIVERSAL BAND MALL Direct Web Ticket Page</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventDetailPage;
