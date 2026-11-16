import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  PlusCircle,
  CheckCircle,
  Store,
  Sparkles,
  AlertCircle,
  Upload,
  Camera,
  Image as ImageIcon,
  Trash2,
  Ticket as TicketIcon,
  Edit3,
} from 'lucide-react';
import { isSameDay, getDefaultFutureEventDate, isEventExpired } from '../../utils/dateHelper';
import { fileToBase64 } from '../../utils/imageUploadHelper';
import { isAuthorizedAdminEmail } from '../../utils/cryptoHelper';
import { getEventTicketStats } from '../../utils/eventTicketLimit';
import { DatePickerInput } from '../DatePickerInput';
import { ensurePhotosPermission } from '../../utils/nativePermissions';
import { EventQrShareCard } from '../events/EventQrShareCard';
import { generateUniqueEventSlug, getPublicWebOrigin } from '../../utils/eventLinkHelper';
import { EventItem } from '../../types';

export const AddEventModal: React.FC = () => {
  const {
    events,
    stores,
    tickets,
    selectedStoreId,
    currentUser,
    addNewEvent,
    updateEvent,
    editingEvent,
    setEditingEvent,
    eventActionError,
    setEventActionError,
    setActiveModal,
  } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const roleLower = (currentUser?.role || '').toLowerCase();
  const has5LocksPassed =
    typeof window !== 'undefined' &&
    sessionStorage.getItem('ub_admin_5locks_passed') === 'true' &&
    localStorage.getItem('ub_admin_session') === 'true';

  const isAdmin =
    has5LocksPassed &&
    (roleLower === 'admin' ||
      isAuthorizedAdminEmail(currentUser?.email) ||
      localStorage.getItem('ub_admin_session') === 'true');

  const isEditing = Boolean(editingEvent);

  const userOwnedStores = isAdmin
    ? stores
    : stores.filter(
        (s) =>
          s.ownerId === currentUser.id ||
          (currentUser.assignedStoreId && s.id === currentUser.assignedStoreId) ||
          (selectedStoreId && s.id === selectedStoreId)
      );

  const storesToChoose = userOwnedStores.length > 0 ? userOwnedStores : stores;

  const defaultStoreId =
    selectedStoreId && stores.some((s) => s.id === selectedStoreId)
      ? selectedStoreId
      : storesToChoose.length > 0
      ? storesToChoose[0].id
      : '';

  const [hasStoreAttachment, setHasStoreAttachment] = useState<boolean>(
    Boolean(defaultStoreId) && !isAdmin
  );
  const [storeId, setStoreId] = useState<string>(defaultStoreId);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [date, setDate] = useState<string>(() => getDefaultFutureEventDate(1, 18, 0));
  const [location, setLocation] = useState<string>(
    storesToChoose[0] ? `${storesToChoose[0].name} (${storesToChoose[0].location})` : 'Pretoria CBD'
  );
  const [earlyBirdPrice, setEarlyBirdPrice] = useState<string>('');
  const [earlyBirdVipPrice, setEarlyBirdVipPrice] = useState<string>('');
  const [generalPrice, setGeneralPrice] = useState<string>('');
  const [vipPrice, setVipPrice] = useState<string>('');
  const [vvipPrice, setVvipPrice] = useState<string>('');
  const [kidsPrice, setKidsPrice] = useState<string>('');
  const [eventCode, setEventCode] = useState<string>('');
  const [ticketsAvailable, setTicketsAvailable] = useState<string>('200');
  const [category, setCategory] = useState<'Events' | 'Food' | 'Drinks'>('Events');
  const [status, setStatus] = useState<'Open' | 'Closed'>('Open');
  const [imageUrl, setImageUrl] = useState<string>(
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'
  );
  const [imageUploading, setImageUploading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [publishedEventSnapshot, setPublishedEventSnapshot] = useState<EventItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const soldStats = useMemo(() => {
    if (!editingEvent) return { soldCount: 0, maxLimit: null, remaining: null, hasLimit: false, isSoldOut: false };
    return getEventTicketStats(editingEvent, tickets);
  }, [editingEvent, tickets]);

  useEffect(() => {
    setFormError(null);
    setEventActionError(null);
    setSuccess(false);
    setPublishedEventSnapshot(null);
    if (editingEvent) {
      const hasAttachedStore = Boolean(editingEvent.storeId && editingEvent.storeId.trim() !== '');
      setHasStoreAttachment(hasAttachedStore);
      setStoreId(editingEvent.storeId || '');
      setTitle(editingEvent.title || '');
      setDescription(editingEvent.description || '');
      setDate(editingEvent.date || getDefaultFutureEventDate(1, 18, 0));
      setLocation(editingEvent.location || 'TBA');
      const parseTierStr = (v: string | number | undefined) => {
        const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
        return !isNaN(n) && n > 0 ? String(n) : '';
      };
      setEarlyBirdPrice(parseTierStr(editingEvent.earlyBirdPrice));
      setEarlyBirdVipPrice(parseTierStr(editingEvent.earlyBirdVipPrice));
      const parsedMainPrice = parseFloat(String(editingEvent.price || '').replace(/[^0-9.]/g, ''));
      setGeneralPrice(
        parseTierStr(editingEvent.generalPrice) ||
          (!isNaN(parsedMainPrice) && parsedMainPrice > 0 ? String(parsedMainPrice) : '')
      );
      setVipPrice(parseTierStr(editingEvent.vipPrice));
      setVvipPrice(parseTierStr(editingEvent.vvipPrice));
      setTicketsAvailable(
        editingEvent.ticketsAvailable !== undefined && editingEvent.ticketsAvailable !== null
          ? String(editingEvent.ticketsAvailable)
          : '200'
      );
      setEventCode(editingEvent.eventCode || '');
      setKidsPrice(parseTierStr(editingEvent.kidsPrice));
      setCategory(editingEvent.category || 'Events');
      setStatus(editingEvent.status === 'Closed' ? 'Closed' : 'Open');
      setImageUrl(
        editingEvent.imageUrl ||
          'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'
      );
    } else {
      setHasStoreAttachment(Boolean(defaultStoreId) && !isAdmin);
      setStoreId(defaultStoreId);
      setTitle('');
      setDescription('');
      setDate(getDefaultFutureEventDate(1, 18, 0));
      setLocation(
        storesToChoose[0]
          ? `${storesToChoose[0].name} (${storesToChoose[0].location})`
          : 'Pretoria CBD'
      );
      setEarlyBirdPrice('');
      setEarlyBirdVipPrice('');
      setGeneralPrice('');
      setVipPrice('');
      setVvipPrice('');
      setKidsPrice('');
      setEventCode('');
      setTicketsAvailable('200');
      setCategory('Events');
      setStatus('Open');
      setImageUrl(
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'
      );
    }
  }, [editingEvent]);

  const handleClose = () => {
    setFormError(null);
    setEventActionError(null);
    setEditingEvent(null);
    setActiveModal(null);
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Please upload a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }

    setFormError(null);
    setImageUploading(true);
    try {
      const optimizedBase64 = await fileToBase64(file, {
        maxWidth: 1080,
        maxHeight: 1080,
        quality: 0.82,
        maxBytes: 450 * 1024,
      });
      setImageUrl(optimizedBase64);
    } catch (err: any) {
      setFormError(
        err?.message || 'Could not process image. Please choose a smaller photo or paste an image URL.'
      );
    } finally {
      setImageUploading(false);
      e.target.value = '';
    }
  };

  // Check if target store already has an event on this date (exclude currently edited event)
  const finalTargetStoreId = hasStoreAttachment && storeId ? storeId : '';
  const conflictingEvent = useMemo(() => {
    if (!finalTargetStoreId) return null;
    return events.find(
      (e) =>
        e.id !== editingEvent?.id &&
        e.storeId === finalTargetStoreId &&
        isSameDay(e.date, date)
    );
  }, [events, finalTargetStoreId, date, editingEvent]);

  const targetStoreObj = stores.find((s) => s.id === finalTargetStoreId);

  const minAllowedLimit = Math.max(1, soldStats.soldCount);
  const parsedTicketLimitInput = Math.floor(Number(ticketsAvailable));
  const previewRemaining =
    Number.isFinite(parsedTicketLimitInput) && parsedTicketLimitInput >= soldStats.soldCount
      ? parsedTicketLimitInput - soldStats.soldCount
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setEventActionError(null);

    if (imageUploading) {
      setFormError('Please wait a moment while your poster image finishes optimizing.');
      return;
    }

    if (!title.trim()) {
      setFormError('Please enter an event title.');
      return;
    }

    if (!date.trim()) {
      setFormError('Please select an event date and time.');
      return;
    }

    if (!isEditing && isEventExpired(date.trim())) {
      setFormError(
        `The selected date & time (${date.trim()}) is in the past. Please choose a future date & time.`
      );
      return;
    }

    if (!Number.isFinite(parsedTicketLimitInput) || parsedTicketLimitInput < 1) {
      setFormError('Please enter a valid ticket sales limit (minimum 1 ticket).');
      return;
    }

    if (isEditing && parsedTicketLimitInput < soldStats.soldCount) {
      setFormError(
        `Ticket limit cannot be lower than already sold tickets (${soldStats.soldCount} sold).`
      );
      return;
    }

    if (conflictingEvent) {
      setFormError(
        `Schedule Conflict: ${targetStoreObj?.name || 'This store'} already has an event ("${conflictingEvent.title}") on ${date}.`
      );
      return;
    }

    setLoading(true);
    const finalStoreId = hasStoreAttachment && storeId ? storeId : '';

    const cleanNum = (val: string) => {
      const parsed = parseFloat(val.replace(/[^0-9.]/g, ''));
      return isNaN(parsed) || parsed <= 0 ? undefined : parsed;
    };

    const parsedEb = cleanNum(earlyBirdPrice);
    const parsedEbVip = cleanNum(earlyBirdVipPrice);
    const parsedGen = cleanNum(generalPrice);
    const parsedVip = cleanNum(vipPrice);
    const parsedVvip = cleanNum(vvipPrice);
    const parsedKids = cleanNum(kidsPrice);

    if (!parsedGen || parsedGen <= 0) {
      setLoading(false);
      setFormError('Please enter a valid General Ticket Price for this event.');
      return;
    }
    const finalEventCode = eventCode.trim().replace(/\s+/g, '').toUpperCase() || title.trim().replace(/\s+/g, '').slice(0, 6).toUpperCase();

    const baseDisplayPrice = parsedEb ? `R${parsedEb}` : `R${parsedGen}`;

    let ok = false;
    if (isEditing && editingEvent) {
      ok = await updateEvent(editingEvent.id, {
        storeId: finalStoreId,
        title: title.trim(),
        description: description.trim(),
        date: date.trim(),
        location: location.trim() || 'TBA',
        price: baseDisplayPrice,
        earlyBirdPrice: parsedEb ?? 0,
        earlyBirdVipPrice: parsedEbVip ?? 0,
        generalPrice: parsedGen,
        vipPrice: parsedVip ?? 0,
        vvipPrice: parsedVvip ?? 0,
        kidsPrice: parsedKids ?? 0,
        eventCode: finalEventCode,
        ticketsAvailable: parsedTicketLimitInput,
        category,
        status,
        imageUrl,
      });
    } else {
      ok = await addNewEvent({
        storeId: finalStoreId,
        title: title.trim(),
        description: description.trim() || undefined,
        date: date.trim(),
        location: location.trim() || 'TBA',
        price: baseDisplayPrice,
        earlyBirdPrice: parsedEb,
        generalPrice: parsedGen,
        vipPrice: parsedVip,
        vvipPrice: parsedVvip,
        kidsPrice: parsedKids,
        eventCode: finalEventCode,
        earlyBirdVipPrice: parsedEbVip,
        ticketsAvailable: parsedTicketLimitInput,
        ticketsSold: 0,
        category,
        status,
        imageUrl,
      });
    }

    setLoading(false);
    if (ok) {
      const matched =
        (isEditing && editingEvent
          ? events.find((ev) => ev.id === editingEvent.id)
          : events.find((ev) => ev.title.trim() === title.trim() && ev.date === date.trim())) || null;

      if (matched) {
        setPublishedEventSnapshot(matched);
      } else {
        const tempId = editingEvent?.id || `ev-${Date.now()}`;
        const slug = generateUniqueEventSlug(title.trim(), tempId, events);
        setPublishedEventSnapshot({
          id: tempId,
          storeId: finalStoreId,
          title: title.trim(),
          date: date.trim(),
          location: location.trim() || 'TBA',
          price: baseDisplayPrice,
          status,
          category,
          imageUrl,
          eventSlug: slug,
          eventLink: `${getPublicWebOrigin()}/event/${slug}`,
        });
      }
      setSuccess(true);
    }
  };

  const isStaff =
    isAdmin ||
    roleLower === 'admin' ||
    roleLower === 'promoter' ||
    roleLower === 'event organiser';

  if (!isStaff) {
    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#1A1A1A] rounded-2xl border border-white/10 p-6 shadow-2xl relative text-white text-center animate-in fade-in zoom-in-95">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white mb-1">Access Restricted</h2>
          <p className="text-gray-400 text-xs mb-5">
            Customers do not have permission to manage events. Only Admins and Organisers can create or edit events.
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold px-6 py-2 rounded-xl text-xs transition cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1A1A1A] rounded-2xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#FACC15] flex items-center justify-center text-black font-black text-xs">
            {isEditing ? <Edit3 className="w-4 h-4 stroke-[2.5]" /> : 'UB'}
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              {isEditing
                ? 'Edit Event'
                : isAdmin
                ? 'Publish Event (Admin)'
                : 'Promote Event'}
            </h2>
            <p className="text-[11px] text-gray-400">
              {isEditing
                ? `Update details & ticket limit for ${editingEvent?.title}`
                : 'Post & sell tickets on Universal Band'}
            </p>
          </div>
        </div>

        {success ? (
          <div className="py-4 space-y-4 animate-in zoom-in-95">
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-[#FACC15] mx-auto mb-2" />
              <h3 className="text-white font-bold text-base">
                {isEditing ? 'Event Updated Successfully!' : 'Published Successfully!'}
              </h3>
              <p className="text-xs text-gray-300 mt-1 max-w-xs mx-auto">
                {isEditing
                  ? `Changes and ticket limit (${parsedTicketLimitInput} max) are now live.`
                  : 'Your unique Event Link and QR Code have been created automatically.'}
              </p>
            </div>

            {publishedEventSnapshot && (
              <EventQrShareCard
                event={
                  events.find(
                    (ev) =>
                      ev.id === publishedEventSnapshot.id ||
                      (ev.title === publishedEventSnapshot.title &&
                        ev.date === publishedEventSnapshot.date)
                  ) || publishedEventSnapshot
                }
                compact
              />
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs cursor-pointer transition"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {(formError || eventActionError) && (
              <div className="p-2.5 bg-red-950/80 border border-red-500/40 rounded-xl text-red-200 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{formError || eventActionError}</span>
              </div>
            )}

            {/* Store Ownership Toggle / Selector */}
            <div className="bg-[#121212] p-3 rounded-xl border border-white/10 space-y-2">
              <span className="block text-gray-300 font-bold text-[11px]">
                Event Venue / Store Destination
              </span>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/40 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setHasStoreAttachment(false);
                      setStoreId('');
                    }}
                    className={`py-1.5 px-2 rounded-md font-bold text-[10px] transition cursor-pointer text-center ${
                      !hasStoreAttachment
                        ? 'bg-[#FACC15] text-black shadow font-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Standalone Event
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasStoreAttachment(true);
                      const targetId = storeId || storesToChoose[0]?.id || '';
                      setStoreId(targetId);
                      const sel = stores.find((s) => s.id === targetId);
                      if (sel && !isEditing) {
                        setLocation(sel.name + (sel.location ? ` - ${sel.location}` : ''));
                      }
                    }}
                    className={`py-1.5 px-2 rounded-md font-bold text-[10px] transition cursor-pointer text-center ${
                      hasStoreAttachment
                        ? 'bg-[#FACC15] text-black shadow font-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Under Shop / Store
                  </button>
                </div>

                {hasStoreAttachment && (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-300 mb-1">
                      Select Target Store / Venue:
                    </label>
                    <select
                      value={storeId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStoreId(val);
                        const sel = stores.find((s) => s.id === val);
                        if (sel) setLocation(sel.name + (sel.location ? ` - ${sel.location}` : ''));
                      }}
                      className="w-full bg-[#1A1A1A] text-white p-2 rounded-lg border border-white/10 focus:outline-none focus:border-[#FACC15]"
                    >
                      {storesToChoose.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.location || 'Store Venue'})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-[#FACC15] mt-1.5 flex items-start gap-1 font-medium bg-[#FACC15]/10 p-2 rounded-lg border border-[#FACC15]/20">
                      <Store className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        Event will show{' '}
                        <strong>under {stores.find((s) => s.id === storeId)?.name || 'this store'}</strong>.
                      </span>
                    </p>
                  </div>
                )}

                {!hasStoreAttachment && (
                  <p className="text-[10px] text-emerald-300 flex items-center gap-1.5 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                    <span>
                      <strong>Standalone Main Event:</strong> Appears directly on the main Discover feed &amp; Events page!
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Event Title <span className="text-[#FACC15]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. All White Soul Session or Neon Sunset"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            {/* Date & Location */}
            <div className="grid grid-cols-2 gap-2">
              <DatePickerInput
                label="Date & Time"
                value={date}
                onChange={(val) => setDate(val)}
                includeTime={true}
                required={true}
                hasError={Boolean(conflictingEvent)}
              />
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Location / Venue</label>
                <input
                  type="text"
                  required
                  placeholder="Venue or City"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Description <span className="text-[10px] text-gray-500">(Optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Lineup, dress code, VIP info..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15] resize-none"
              />
            </div>

            {/* Same-day Conflict Warning */}
            {conflictingEvent && (
              <div className="p-2.5 bg-red-950/70 border border-red-500/40 rounded-xl text-red-200 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-bold">1 Event Per Day Rule:</strong>
                  <span>
                    {targetStoreObj?.name || 'This store'} already has &quot;{conflictingEvent.title}&quot; on {date}. Choose another date.
                  </span>
                </div>
              </div>
            )}

            {/* Ticket Sales Limit */}
            <div className="bg-[#121212] p-3 rounded-xl border border-[#FACC15]/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[#FACC15] font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <TicketIcon className="w-3.5 h-3.5" />
                  <span>Ticket Sales Limit (Max Capacity) *</span>
                </label>
              </div>
              <input
                type="number"
                required
                min={minAllowedLimit}
                step="1"
                placeholder="e.g. 200"
                value={ticketsAvailable}
                onChange={(e) => setTicketsAvailable(e.target.value)}
                className="w-full bg-[#1A1A1A] text-white p-2.5 rounded-lg border border-white/15 focus:outline-none focus:border-[#FACC15] font-mono font-bold text-sm"
              />
              <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5">
                <span>Sales stop automatically once limit is reached.</span>
                {isEditing && (
                  <span className="text-emerald-400 font-bold">
                    Sold: {soldStats.soldCount} • Left: {previewRemaining}
                  </span>
                )}
              </div>
            </div>

            {/* Multi-Tier Ticket Pricing Box */}
            <div className="bg-[#121212] p-3 rounded-xl border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="block text-[#FACC15] font-black text-[11px] uppercase tracking-wider">
                  Ticket Tier Pricing (ZAR)
                </span>
                <span className="text-[9px] text-gray-400">Leave blank if tier not available</span>
              </div>

              {/* Early Bird Price Input (Optional) */}
              <div>
                <label className="block text-gray-300 font-semibold text-[11px] mb-0.5 flex items-center justify-between">
                  <span>🌅 Early Bird Price (ZAR)</span>
                  <span className="text-[9px] text-amber-400/90 font-bold">Optional (Hide if empty)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 100 (Leave empty if no Early Bird)"
                  value={earlyBirdPrice}
                  onChange={(e) => setEarlyBirdPrice(e.target.value)}
                  className="w-full bg-[#1A1A1A] text-white p-2 rounded-lg border border-white/10 focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              {/* Early Bird VIP Price Input (Optional) */}
              <div>
                <label className="block text-gray-300 font-semibold text-[11px] mb-0.5">
                  🌅 Early Bird VIP Price (ZAR)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 200 (Optional)"
                  value={earlyBirdVipPrice}
                  onChange={(e) => setEarlyBirdVipPrice(e.target.value)}
                  className="w-full bg-[#1A1A1A] text-white p-2 rounded-lg border border-white/10 focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              {/* Event Code Input */}
              <div>
                <label className="block text-gray-300 font-semibold text-[11px] mb-0.5">
                  🏷️ Event Code (Short code, no spaces) <span className="text-[#FACC15]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. JAZZ20"
                  value={eventCode}
                  onChange={(e) => setEventCode(e.target.value.replace(/\s+/g, '').toUpperCase())}
                  className="w-full bg-[#1A1A1A] text-white p-2 rounded-lg border border-white/10 focus:outline-none focus:border-[#FACC15] font-mono font-bold uppercase"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Used for PayShap SMS reference (e.g. JAZZ20 Sipho GENERAL)</p>
              </div>

              {/* General Price Input (Required) */}
              <div>
                <label className="block text-gray-300 font-semibold text-[11px] mb-0.5">
                  🎟️ General Ticket Price (ZAR) <span className="text-[#FACC15]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 150"
                  value={generalPrice}
                  onChange={(e) => setGeneralPrice(e.target.value)}
                  className="w-full bg-[#1A1A1A] text-white p-2 rounded-lg border border-white/10 focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              {/* VIP & Kids Prices */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 font-semibold text-[11px] mb-0.5">
                    ⭐ VIP Price (ZAR)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 350 (Optional)"
                    value={vipPrice}
                    onChange={(e) => setVipPrice(e.target.value)}
                    className="w-full bg-[#1A1A1A] text-white p-2 rounded-lg border border-white/10 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold text-[11px] mb-0.5">
                    👶 Kids Price (ZAR)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 50 (Optional)"
                    value={kidsPrice}
                    onChange={(e) => setKidsPrice(e.target.value)}
                    className="w-full bg-[#1A1A1A] text-white p-2 rounded-lg border border-white/10 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>

              {/* Entry Status */}
              <div className="pt-1 border-t border-white/5">
                <label className="block text-gray-300 font-semibold mb-1">Ticket Sales Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'Open' | 'Closed')}
                  className="w-full bg-[#1A1A1A] text-white p-2 rounded-lg border border-white/10 focus:outline-none focus:border-[#FACC15]"
                >
                  <option value="Open">Open (Tickets on Sale)</option>
                  <option value="Closed">Closed (Sales Paused)</option>
                </select>
              </div>
            </div>

            {/* Event Picture / Poster Upload */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1 flex items-center justify-between">
                <span>Event Picture / Poster</span>
                <span className="text-[10px] text-gray-400 font-normal">Add your own photo</span>
              </label>

              <div className="flex items-center gap-2 mb-2">
                <input
                  ref={fileInputRef}
                  id="add-event-photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={imageUploading}
                  onClick={async () => {
                    const perm = await ensurePhotosPermission();
                    if (!perm.granted) return;
                    fileInputRef.current?.click();
                  }}
                  className="flex-1 bg-[#1E1E1E] hover:bg-[#282828] border border-white/15 hover:border-[#FACC15]/50 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer shadow-sm disabled:opacity-60"
                >
                  <Upload className="w-4 h-4 text-[#FACC15]" />
                  <span>{imageUploading ? 'Optimizing Poster...' : 'Choose Picture from Device'}</span>
                </button>
              </div>

              {imageUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-[#FACC15]/50 h-36 w-full bg-black/60 mb-2 group">
                  <img
                    src={imageUrl}
                    alt="Event Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80';
                    }}
                  />
                  <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md text-[#FACC15] text-[10px] font-black px-2 py-0.5 rounded-md border border-[#FACC15]/30">
                    EVENT PICTURE PREVIEW
                  </div>
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-black/80 hover:bg-black text-gray-200 hover:text-white px-2 py-1 rounded-md text-[10px] font-bold border border-white/20 backdrop-blur-md transition cursor-pointer"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="bg-black/80 hover:bg-black text-rose-400 p-1 rounded-md border border-white/20 backdrop-blur-md transition cursor-pointer"
                      title="Remove picture"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 bg-[#121212] rounded-xl border border-dashed border-white/15 hover:border-[#FACC15]/50 text-center cursor-pointer transition mb-2"
                >
                  <Camera className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                  <p className="text-[11px] text-gray-300 font-bold">No picture selected</p>
                  <p className="text-[10px] text-gray-500">Tap to upload your event flyer or photo</p>
                </div>
              )}

              <div className="relative">
                <input
                  type="url"
                  placeholder="Or paste image URL (https://...)"
                  value={imageUrl.startsWith('data:') ? '' : imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-[11px] text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition"
                />
                <ImageIcon className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold py-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-yellow-400/10 text-xs disabled:opacity-50 cursor-pointer"
            >
              {isEditing ? (
                <Edit3 className="w-4 h-4" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
              <span>
                {loading
                  ? isEditing
                    ? 'Saving Changes...'
                    : 'Publishing Event...'
                  : isEditing
                  ? 'Save Event Changes'
                  : 'Publish Event'}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
export default AddEventModal;
