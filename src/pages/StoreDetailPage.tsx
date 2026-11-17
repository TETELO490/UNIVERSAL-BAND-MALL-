import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { EventItem, MenuItemDoc } from '../types';
import { INITIAL_ITEMS } from '../data/seedData';
import { db } from '../firebase';
import { getUserAge, isAlcoholItem } from '../utils/ageHelper';
import { isEventExpired, getDefaultFutureEventDate } from '../utils/dateHelper';
import { fileToBase64 } from '../utils/imageUploadHelper';
import { ensurePhotosPermission } from '../utils/nativePermissions';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  runTransaction,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ChevronLeft,
  MapPin,
  Calendar,
  Ticket as TicketIcon,
  Utensils,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  X,
  Image as ImageIcon,
  ShieldAlert,
  Upload,
  Camera,
  Clock,
  Sparkles,
  QrCode,
  AlertTriangle,
  ShoppingBag,
  Bell,
  Package,
  Users,
  Wifi,
  WifiOff,
  Edit3,
  User,
} from 'lucide-react';
import { getEventTicketStats } from '../utils/eventTicketLimit';
import { FoodReserveModal } from '../components/modals/FoodReserveModal';
import { StoreCartDrawer } from '../components/mall/StoreCartDrawer';
import { MallOrderSuccessModal } from '../components/mall/MallOrderSuccessModal';
import { VendorOrderPickupModal } from '../components/mall/VendorOrderPickupModal';
import { StoreOwnerMessagesModal } from '../components/mall/StoreOwnerMessagesModal';
import { StoreWorkersModal } from '../components/mall/StoreWorkersModal';
import { DatePickerInput } from '../components/DatePickerInput';
import { isSameDay } from '../utils/dateHelper';
import { MallOrder } from '../types';
import { MealCustomizerModal } from '../components/modals/MealCustomizerModal';
import { EventQrShareCard } from '../components/events/EventQrShareCard';

export const StoreDetailPage: React.FC = () => {
  const {
    selectedStoreId,
    stores,
    events,
    tickets,
    currentUser,
    navigateTo,
    setSelectedBuyingEvent,
    topUpWallet,
    setActiveModal,
    addNewEvent,
    updateEvent,
    eventActionError,
    setEventActionError,
    deleteStore,
    deleteEvent,
    carts,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    getCartSummary,
    mallOrders,
    storeMessages,
    activePickupOrder,
    setActivePickupOrder,
    storeWorkers,
    storePresence,
    updateStorePresence,
    checkIsStoreOnline,
  } = useApp();

  const [showDeleteStoreConfirm, setShowDeleteStoreConfirm] = useState(false);
  const [isDeletingStore, setIsDeletingStore] = useState(false);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);

  // Universal Band Mall Modals State
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isPickupModalOpen, setIsPickupModalOpen] = useState<boolean>(false);
  const [isMessagesModalOpen, setIsMessagesModalOpen] = useState<boolean>(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState<boolean>(false);
  const [confirmedOrder, setConfirmedOrder] = useState<MallOrder | null>(null);
  const [isWorkersModalOpen, setIsWorkersModalOpen] = useState<boolean>(false);

  // Main Tabs: 'MENU' | 'EVENTS'
  const [mainTab, setMainTab] = useState<'MENU' | 'EVENTS'>(() => {
    if (
      typeof window !== 'undefined' &&
      (window.location.search.includes('tab=events') || window.location.hash === '#events')
    ) {
      return 'EVENTS';
    }
    return 'MENU';
  });

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      (window.location.search.includes('tab=events') || window.location.hash === '#events')
    ) {
      setMainTab('EVENTS');
    }
  }, []);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'food' | 'drink'>('all');
  // Drinks sub-tabs: 'all' | 'soft' | 'alcohol'
  const [drinkSubFilter, setDrinkSubFilter] = useState<'all' | 'soft' | 'alcohol'>('all');

  // Store-scoped items state: Query items where storeId == current storeId ONLY
  const [storeItems, setStoreItems] = useState<MenuItemDoc[]>([]);
  const [itemsLoading, setItemsLoading] = useState<boolean>(true);
  const [reservingItemId, setReservingItemId] = useState<string | null>(null);
  const [selectedReserveItem, setSelectedReserveItem] = useState<MenuItemDoc | null>(null);
  const [userStoreReservations, setUserStoreReservations] = useState<any[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Store Owner "Add Food / Drink" Form Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [itemName, setItemName] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [category, setCategory] = useState<'Food' | 'Drink'>('Food');
  const [subCategory, setSubCategory] = useState<'soft' | 'alcohol'>('soft');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [itemImageFileName, setItemImageFileName] = useState<string>('');
  const itemFileInputRef = useRef<HTMLInputElement>(null);
  const posterFileInputRef = useRef<HTMLInputElement>(null);

  const handleItemImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setItemImageFileName(file.name);
      const base64 = await fileToBase64(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
      setImageUrl(base64);
    } catch (err) {
      console.error('Image upload error:', err);
      setToast({ message: 'Failed to process image. Please try another photo.', type: 'error' });
    }
  };
  const [itemIngredientsText, setItemIngredientsText] = useState<string>('rice, chicken, achaar, salad');
  const [itemAllowRemoval, setItemAllowRemoval] = useState<boolean>(true);
  const [selectedCustomizingItem, setSelectedCustomizingItem] = useState<MenuItemDoc | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Store Owner "Add / Edit an Event" Form Modal State
  const [showAddEventModal, setShowAddEventModal] = useState<boolean>(false);
  const [editingStoreEvent, setEditingStoreEvent] = useState<EventItem | null>(null);
  const [eventName, setEventName] = useState<string>('');
  const [eventDateTime, setEventDateTime] = useState<string>('');
  const [eventDescription, setEventDescription] = useState<string>('');
  const [eventPosterImage, setEventPosterImage] = useState<string>('');
  const [eventPosterPreview, setEventPosterPreview] = useState<string>('');
  const [eventTicketPrice, setEventTicketPrice] = useState<string>('');
  const [ticketsAvailable, setTicketsAvailable] = useState<string>('200');
  const [eventStatus, setEventStatus] = useState<'Open' | 'Closed'>('Open');
  const [isSubmittingEvent, setIsSubmittingEvent] = useState<boolean>(false);
  const [isUploadingEventPoster, setIsUploadingEventPoster] = useState<boolean>(false);

  const openNewStoreEventModal = () => {
    setEventActionError(null);
    setEditingStoreEvent(null);
    setEventName('');
    setEventDateTime(getDefaultFutureEventDate(1, 18, 0));
    setEventDescription('');
    setEventPosterImage('');
    setEventPosterPreview('');
    setEventTicketPrice('');
    setTicketsAvailable('200');
    setEventStatus('Open');
    setShowAddEventModal(true);
  };

  const openEditStoreEventModal = (ev: EventItem) => {
    setEditingStoreEvent(ev);
    setEventName(ev.title || '');
    setEventDateTime(ev.date || '');
    setEventDescription(ev.description || '');
    setEventPosterImage(ev.imageUrl || '');
    setEventPosterPreview(ev.imageUrl || '');
    setEventTicketPrice(String(ev.price || '').replace(/^R/i, '').trim());
    setTicketsAvailable(
      ev.ticketsAvailable !== undefined && ev.ticketsAvailable !== null
        ? String(ev.ticketsAvailable)
        : '200'
    );
    setEventStatus(ev.status === 'Closed' ? 'Closed' : 'Open');
    setShowAddEventModal(true);
  };

  const handleDeleteStore = async () => {
    if (!store?.id) return;
    setIsDeletingStore(true);
    await deleteStore(store.id);
    setIsDeletingStore(false);
    setShowDeleteStoreConfirm(false);
    navigateTo('/');
  };

  const handleDeleteEvent = async (eventId: string, eventTitle: string) => {
    setIsDeletingEvent(true);
    await deleteEvent(eventId);
    setIsDeletingEvent(false);
    setConfirmDeleteEventId(null);
    setToast({
      message: `Event "${eventTitle}" deleted successfully.`,
      type: 'success',
    });
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setToast({ message: 'Please upload a valid image file (PNG, JPG, JPEG, WEBP).', type: 'error' });
      return;
    }

    setIsUploadingEventPoster(true);
    try {
      const optimizedBase64 = await fileToBase64(file, {
        maxWidth: 1080,
        maxHeight: 1080,
        quality: 0.82,
        maxBytes: 450 * 1024,
      });
      setEventPosterImage(optimizedBase64);
      setEventPosterPreview(optimizedBase64);
    } catch (err: any) {
      setToast({
        message: err?.message || 'Image is too large to process. Please select a smaller photo.',
        type: 'error',
      });
    } finally {
      setIsUploadingEventPoster(false);
      e.target.value = '';
    }
  };

  const store = stores.find((s) => s.id === selectedStoreId) || stores[0];
  const currentWalletId = currentUser?.id && currentUser.id !== 'guest_user' ? currentUser.id : '';
  const userAge = getUserAge(currentUser);

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isOwner = Boolean(
    roleLower === 'admin' ||
    roleLower === 'owner' ||
    roleLower === 'promoter' ||
    roleLower === 'event organiser' ||
    roleLower === 'organizer' ||
    roleLower === 'store manager' ||
    roleLower === 'manager' ||
    (roleLower === 'promoter' && (store?.ownerId === currentWalletId || store?.promoterId === currentUser.id || currentUser.assignedStoreId === store?.id)) ||
    store?.ownerId === currentWalletId ||
    currentUser?.assignedStoreId === store?.id
  );
  const isManager = Boolean(
    roleLower === 'manager' &&
    (currentUser?.assignedStoreId === store?.id || currentUser?.assignedStoreName === store?.name)
  );
  const isWorker = Boolean(
    (roleLower === 'worker' || roleLower === 'staff' || roleLower === 'shop worker') &&
    (currentUser?.assignedStoreId === store?.id || currentUser?.assignedStoreName === store?.name)
  );

  const isStoreStaff = isOwner || isManager || isWorker;

  // Presence Heartbeat: If store owner or worker has this shop page open on their phone, it is kept online!
  useEffect(() => {
    if (!store?.id || !isStoreStaff) return;

    updateStorePresence(store.id, true);
    const interval = setInterval(() => {
      updateStorePresence(store.id, true);
    }, 30000);

    return () => clearInterval(interval);
  }, [store?.id, isStoreStaff]);

  const isShopOnline = checkIsStoreOnline(store?.id || '');

  // Seed / sync items with storeId and storeName if missing, and listen where storeId == current storeId ONLY
  useEffect(() => {
    if (!store?.id) return;

    let unsubItems: (() => void) | undefined;
    let unsubRes: (() => void) | undefined;

    const setupStoreData = async () => {
      try {
        const itemsCol = collection(db, 'items');

        // Check if items collection has records for this store, seed if missing
        const qStore = query(itemsCol, where('storeId', '==', store.id));
        unsubItems = onSnapshot(
          qStore,
          async (snapshot) => {
            if (snapshot.empty) {
              // Populate initial store-scoped items with required storeId, storeName, subCategory, and isAlcohol
              const matchingSeed = INITIAL_ITEMS.filter((i) => i.storeId === store.id);
              for (const seedItem of matchingSeed) {
                try {
                  await setDoc(doc(db, 'items', seedItem.id), {
                    ...seedItem,
                    storeId: store.id,
                    storeName: store.name,
                    ownerId: store.ownerId || '',
                  });
                } catch (e) {
                  console.warn('Error seeding item to Firestore:', e);
                }
              }
              setStoreItems(matchingSeed);
            } else {
              const list: MenuItemDoc[] = [];
              snapshot.forEach((d) => {
                list.push({ id: d.id, ...(d.data() as any) });
              });
              setStoreItems(list);
            }
            setItemsLoading(false);
          },
          (error) => {
            console.warn('Error listening to store items:', error);
            const fallback = INITIAL_ITEMS.filter((i) => i.storeId === store.id);
            setStoreItems(fallback);
            setItemsLoading(false);
          }
        );

        // Listen to reservations made by current wallet for this store
        if (currentWalletId) {
          const qRes = query(
            collection(db, 'reservations'),
            where('walletId', '==', currentWalletId),
            where('storeId', '==', store.id)
          );
          unsubRes = onSnapshot(qRes, (snap) => {
            const resList: any[] = [];
            snap.forEach((d) => {
              resList.push({ id: d.id, ...d.data() });
            });
            setUserStoreReservations(resList);
          }, (err) => {
            console.warn('Store reservations listener warning:', err);
          });
        } else {
          setUserStoreReservations([]);
        }
      } catch (err) {
        console.warn('Error setting up store detail data:', err);
        const fallback = INITIAL_ITEMS.filter((i) => i.storeId === store.id);
        setStoreItems(fallback);
        setItemsLoading(false);
      }
    };

    setupStoreData();

    return () => {
      if (unsubItems) unsubItems();
      if (unsubRes) unsubRes();
    };
  }, [store?.id, store?.name, store?.ownerId, currentWalletId]);

  // Tickets and events under this store.
  // RULE: Customers only see active/upcoming events. Store staff & admins can see full event history.
  const storeEvents = events.filter((ev) => {
    const isMatch = Boolean(ev.storeId && store?.id && ev.storeId.trim().toLowerCase() === store.id.trim().toLowerCase());
    if (!isMatch) return false;
    if (isStoreStaff) return true; // Keep vendor history permanent
    return !isEventExpired(ev); // Hide past events from public customer view
  });

  const handleBuyTicket = (event: EventItem) => {
    if (isEventExpired(event)) {
      setToast({
        message: 'This event has already passed. Tickets are no longer available for purchase.',
        type: 'error',
      });
      return;
    }
    setSelectedBuyingEvent(event);
  };

  // Parse numeric price
  const parseNumericPrice = (p: number | string): number => {
    if (typeof p === 'number') return p;
    const clean = String(p).replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  };

  // Universal Band Mall helpers for this store
  const storeCartSummary = getCartSummary(store.id);
  const storeCartItems = carts[store.id] || [];
  const storeMessagesList = storeMessages.filter(
    (m) => m.storeId === store.id || m.storeName === store.name
  );
  const unreadMessagesCount = storeMessagesList.filter((m) => !m.read).length;
  const todayOrdersCount = storeMessagesList.filter((m) => m.type === 'ORDER_TODAY').length;

  const activeCustomerOrders = mallOrders.filter(
    (o) =>
      o.storeId === store.id &&
      (o.customerId === currentUser.id || (Boolean(currentUser.phone) && o.customerPhone === currentUser.phone)) &&
      o.status !== 'collected'
  );

  // Reserve button inside store page:
  // Requirement: Block reservation of subCategory=="alcohol" if user age < 18
  const handleReserveItem = async (item: MenuItemDoc) => {
    if (reservingItemId) return;
    if (!currentWalletId) {
      setToast({
        message: 'Please log in or create an account to reserve items.',
        type: 'error',
      });
      return;
    }

    const isAlcohol = Boolean(
      item.isAlcohol === true ||
      item.subCategory === 'alcohol' ||
      isAlcoholItem(item)
    );

    // Block reservation if user age < 18
    if (isAlcohol && userAge < 18) {
      setToast({
        message: `AGE RESTRICTION: You must be 18 or older to reserve alcohol. User age is ${userAge}.`,
        type: 'error',
      });
      return;
    }

    const itemPrice = parseNumericPrice(item.price);
    const wRef = doc(db, 'wallets', currentWalletId);
    const rRef = doc(collection(db, 'reservations'));

    setReservingItemId(item.id);
    setToast(null);

    try {
      const wSnap = await getDoc(wRef);
      if (!wSnap.exists()) {
        await setDoc(wRef, {
          userId: currentWalletId,
          balance: currentUser.walletBalance,
          updatedAt: new Date().toISOString(),
        });
      }

      await runTransaction(db, async (t) => {
        const w = await t.get(wRef);
        const curBal = w.exists() ? w.data().balance : currentUser.walletBalance;

        if (curBal < itemPrice) {
          throw new Error('low funds');
        }

        t.update(wRef, { balance: increment(-itemPrice) });

        t.set(rRef, {
          walletId: currentWalletId,
          storeId: store.id,
          storeName: store.name,
          itemId: item.id,
          itemName: item.name,
          price: itemPrice,
          total: itemPrice,
          category: item.category || 'drink',
          subCategory: item.subCategory || (isAlcohol ? 'alcohol' : 'soft'),
          isAlcohol: isAlcohol,
          status: 'paid',
          paidAt: serverTimestamp(),
        });
      });

      await topUpWallet(-itemPrice);

      setToast({
        message: `Reserved & Paid R${itemPrice.toFixed(0)}! To collect at ${store.name}.`,
        type: 'success',
      });
    } catch (err: any) {
      console.warn('Reserve error:', err);
      if (err?.message?.includes?.('low funds') || err === 'low funds') {
        setToast({
          message: `Low funds! R${itemPrice.toFixed(0)} exceeds wallet balance (R${currentUser.walletBalance.toFixed(2)}).`,
          type: 'error',
        });
      } else {
        setToast({
          message: String(err?.message || err || 'Reservation failed'),
          type: 'error',
        });
      }
    } finally {
      setReservingItemId(null);
    }
  };

  // Requirement: Store owner add item feature
  // When adding item, if category == "drink", show second dropdown: "Soft Drink" or "Alcohol".
  // Save as {category: "drink", subCategory: "soft"/"alcohol", isAlcohol: subCategory=="alcohol"}
  const handleAddItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !price) {
      setToast({ message: 'Please enter item name and price', type: 'error' });
      return;
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setToast({ message: 'Please enter a valid price', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const newItemRef = doc(collection(db, 'items'));
      const isDrink = category.toLowerCase() === 'drink';
      const itemSubCategory = isDrink ? subCategory : undefined;
      const isAlcohol = isDrink ? subCategory === 'alcohol' : false;

      const fallbackImage = !isDrink
        ? 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'
        : isAlcohol
        ? 'https://images.unsplash.com/photo-1608270119332-9cb76f1837b0?auto=format&fit=crop&w=400&q=80'
        : 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80';

      const finalImageUrl = imageUrl.trim() || fallbackImage;

      const newDoc: Record<string, any> = {
        storeId: store.id,
        storeName: store.name,
        name: itemName.trim(),
        price: parsedPrice,
        category: isDrink ? 'drink' : 'food',
        imageUrl: finalImageUrl,
        image: finalImageUrl,
        createdAt: serverTimestamp(),
        ownerId: currentWalletId,
        available: true,
      };

      if (isDrink) {
        newDoc.subCategory = itemSubCategory;
        newDoc.isAlcohol = isAlcohol;
      } else {
        const parsedIngredients = itemIngredientsText
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        newDoc.ingredients = parsedIngredients.length > 0 ? parsedIngredients : ['rice', 'chicken', 'achaar', 'salad'];
        newDoc.allowIngredientRemoval = itemAllowRemoval;
      }

      await setDoc(newItemRef, newDoc);

      // Auto refresh items list filtered where storeId == currentStoreId
      setStoreItems((prev) => [
        {
          id: newItemRef.id,
          ...newDoc,
        } as MenuItemDoc,
        ...prev,
      ]);

      setShowAddModal(false);
      setItemName('');
      setPrice('');
      setCategory('Food');
      setSubCategory('soft');
      setImageUrl('');
      setItemIngredientsText('rice, chicken, achaar, salad');
      setItemAllowRemoval(true);
      setToast({
        message: `Added "${itemName.trim()}" to ${store.name}!`,
        type: 'success',
      });
    } catch (err: any) {
      console.warn('Error adding item:', err);
      setToast({
        message: String(err?.message || err || 'Failed to add item'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Requirement: Also add delete button next to each item to delete it
  const handleDeleteItem = async (itemId: string, name: string) => {
    if (deletingItemId === itemId) return;
    setDeletingItemId(itemId);
    try {
      await deleteDoc(doc(db, 'items', itemId));

      // Auto refresh items list
      setStoreItems((prev) => prev.filter((i) => i.id !== itemId));

      setToast({
        message: `Deleted "${name}"`,
        type: 'success',
      });
    } catch (err: any) {
      console.warn('Error deleting item:', err);
      setToast({
        message: String(err?.message || err || 'Failed to delete item'),
        type: 'error',
      });
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleAddEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEventActionError(null);

    if (isUploadingEventPoster) {
      setToast({ message: 'Please wait while your poster image finishes optimizing.', type: 'error' });
      return;
    }

    if (!eventName.trim() || !eventDateTime.trim() || !eventTicketPrice.trim()) {
      setToast({ message: 'Please enter Event Name, Date & Time, and Ticket Price', type: 'error' });
      return;
    }

    if (!editingStoreEvent && isEventExpired(eventDateTime.trim())) {
      setToast({
        message: `Date "${eventDateTime.trim()}" is already in the past. Please choose a future date & time.`,
        type: 'error',
      });
      return;
    }

    const parsedLimit = Math.floor(Number(ticketsAvailable));
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      setToast({ message: 'Please enter a valid Ticket Sales Limit (min 1).', type: 'error' });
      return;
    }

    if (editingStoreEvent) {
      const currentStats = getEventTicketStats(editingStoreEvent, tickets);
      if (parsedLimit < currentStats.soldCount) {
        setToast({
          message: `${currentStats.soldCount} tickets already sold. Limit must be at least ${currentStats.soldCount}.`,
          type: 'error',
        });
        return;
      }
    }

    // RULE: Store cannot have two events on the same day (exclude edited event)
    const conflicting = events.find(
      (e) =>
        e.id !== editingStoreEvent?.id &&
        e.storeId === store.id &&
        isSameDay(e.date, eventDateTime)
    );
    if (conflicting) {
      setToast({
        message: `Schedule Conflict: ${store.name} already has an event ("${conflicting.title}") on this date. A store cannot have two events on the same day.`,
        type: 'error',
      });
      return;
    }

    setIsSubmittingEvent(true);
    try {
      const formattedPrice = eventTicketPrice.trim().startsWith('R')
        ? eventTicketPrice.trim()
        : `R${eventTicketPrice.trim()}`;
      const numericPrice = parseFloat(formattedPrice.replace(/[^0-9.]/g, '')) || 150;

      const fallbackPoster = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80';
      const finalPoster = eventPosterImage || eventPosterPreview || fallbackPoster;

      if (editingStoreEvent) {
        const updated = await updateEvent(editingStoreEvent.id, {
          title: eventName.trim(),
          date: eventDateTime.trim(),
          price: formattedPrice,
          generalPrice: numericPrice,
          imageUrl: finalPoster,
          status: eventStatus,
          description: eventDescription.trim() || `Official live event hosted at ${store.name}.`,
          ticketsAvailable: parsedLimit,
        });
        if (updated) {
          setToast({
            message: `Event "${eventName.trim()}" updated successfully!`,
            type: 'success',
          });
          setEditingStoreEvent(null);
          setShowAddEventModal(false);
        } else {
          setToast({
            message: eventActionError || 'Failed to update event. Please check your poster image and date.',
            type: 'error',
          });
        }
      } else {
        const newEventData: Omit<EventItem, 'id'> = {
          storeId: store.id,
          title: eventName.trim(),
          date: eventDateTime.trim(),
          location: store.location || store.name,
          price: formattedPrice,
          generalPrice: numericPrice,
          imageUrl: finalPoster,
          status: eventStatus,
          category: 'Events',
          creatorId: currentUser.id,
          description: eventDescription.trim() || `Official live event hosted at ${store.name}.`,
          ticketsAvailable: parsedLimit,
          ticketsSold: 0,
        };

        const added = await addNewEvent(newEventData);
        if (added) {
          setToast({
            message: `Event "${eventName.trim()}" published successfully for ${store.name}!`,
            type: 'success',
          });
          setEventName('');
          setEventDateTime('');
          setEventDescription('');
          setEventPosterImage('');
          setEventPosterPreview('');
          setEventTicketPrice('');
          setTicketsAvailable('200');
          setEventStatus('Open');
          setShowAddEventModal(false);
        } else {
          setToast({
            message: eventActionError || 'Failed to publish event. Please check your poster image size and future date.',
            type: 'error',
          });
        }
      }
    } catch (err: any) {
      console.warn('Error saving event:', err);
      setToast({
        message: String(err?.message || err || 'Failed to save event'),
        type: 'error',
      });
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  if (!store) {
    return (
      <div className="p-8 text-center text-white">
        <p>Store not found.</p>
        <button
          onClick={() => navigateTo('/')}
          className="mt-4 text-[#FACC15] font-bold text-sm"
        >
          &larr; Back to Stores
        </button>
      </div>
    );
  }

  // Filter items where category=="drink" && subCategory==selected
  const filteredItems = storeItems.filter((i) => {
    const itemCat = (i.category || '').toLowerCase();

    if (categoryFilter === 'food') {
      return itemCat === 'food';
    }

    if (categoryFilter === 'drink') {
      const isDrink = itemCat === 'drink' || itemCat === 'alcohol' || itemCat === 'softdrink';
      if (!isDrink) return false;

      if (drinkSubFilter === 'all') return true;

      const isAlc = Boolean(
        i.isAlcohol === true ||
        i.subCategory === 'alcohol' ||
        itemCat === 'alcohol' ||
        isAlcoholItem(i)
      );

      if (drinkSubFilter === 'soft') {
        return i.subCategory === 'soft' || !isAlc;
      }
      if (drinkSubFilter === 'alcohol') {
        return i.subCategory === 'alcohol' || isAlc;
      }
      return true;
    }

    // categoryFilter === 'all'
    return true;
  });

  return (
    <div className="pb-24 pt-3 px-4 max-w-md mx-auto relative">
      {/* Toast Notification */}
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
            {toast.type === 'error' ? (
              <button
                type="button"
                onClick={() => setActiveModal('wallet')}
                className="ml-2 bg-black text-white px-2 py-0.5 rounded text-[10px] cursor-pointer"
              >
                Top Up
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-black font-black text-sm ml-2 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Nav: Back to Stores & Reserved Food Link */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-white transition-colors focus:outline-none cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back to Stores</span>
        </button>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Active Orders Profile ONE QR shortcut for Customer */}
          {activeCustomerOrders.length > 0 && (
            <button
              type="button"
              onClick={() => navigateTo('/profile')}
              className="inline-flex items-center gap-1 text-[11px] font-black text-white bg-[#0D47A1] hover:bg-blue-800 border border-blue-400/40 px-2.5 py-1 rounded-xl transition cursor-pointer shadow-sm"
              title="Open My Profile ONE QR for collection"
            >
              <User className="w-3.5 h-3.5" />
              <span>Show ONE QR ({activeCustomerOrders.length})</span>
            </button>
          )}

          {/* Store Cart Button */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-xl transition cursor-pointer shadow-sm ${
              storeCartSummary.totalQuantity > 0
                ? 'bg-[#D32F2F] hover:bg-red-700 text-white'
                : 'bg-white/10 hover:bg-white/20 text-gray-200 border border-white/10'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Cart</span>
            {storeCartSummary.totalQuantity > 0 && (
              <span className="bg-white text-[#D32F2F] text-[9px] font-black px-1.5 py-0.2 rounded-full">
                {storeCartSummary.totalQuantity}
              </span>
            )}
          </button>

          {/* Age Indicator */}
          <span
            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${
              userAge >= 18
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
            }`}
          >
            Age: {userAge} {userAge < 18 ? '(Minor)' : '(18+)'}
          </span>

          <button
            onClick={() => navigateTo('/reserved')}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FACC15] bg-[#FACC15]/10 hover:bg-[#FACC15]/20 border border-[#FACC15]/30 px-2.5 py-1 rounded-xl transition cursor-pointer"
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Reserved Food</span>
          </button>
        </div>
      </div>

      {/* Store Header */}
      <div className="bg-[#1A1A1A] rounded-2xl p-4 border border-white/5 shadow-md flex items-center gap-3.5 mb-4">
        <img
          src={store.imageUrl}
          alt={store.name}
          className="w-[64px] h-[64px] rounded-2xl object-cover border border-white/10 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <h1 className="text-lg font-bold text-white tracking-tight truncate">
              {store.name}
            </h1>
            {isOwner ? (
              <span className="text-[9px] font-extrabold uppercase bg-[#FACC15]/20 text-[#FACC15] border border-[#FACC15]/40 px-1.5 py-0.5 rounded">
                Owner
              </span>
            ) : isManager ? (
              <span className="text-[9px] font-extrabold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded">
                Manager
              </span>
            ) : isWorker ? (
              <span className="text-[9px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                Worker
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            <span className="truncate">{store.location}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {/* Store Phone Online Status Badge */}
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border shadow-sm ${
                isShopOnline
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-950/80 text-rose-300 border-rose-500/40 animate-pulse'
              }`}
            >
              {isShopOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Phone Online • Open for Orders</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-rose-400 shrink-0" />
                  <span>Phone Offline • Sales Paused</span>
                </>
              )}
            </span>

            <span className="inline-block text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
              NFC Cashless Venue
            </span>
            <span className="inline-block text-[10px] font-extrabold text-[#FACC15] bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              Exclusive Menu
            </span>
          </div>
        </div>
      </div>

      {/* Shop Offline Warning Notice for Customers & Staff */}
      {!isShopOnline && (
        <div className="mb-4 p-3 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between gap-3 shadow-md animate-in fade-in">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <p className="font-extrabold text-white text-[11px]">Store Phone Is Currently Offline</p>
              <p className="text-[10px] text-rose-300">Sales are temporarily paused because no shop phone is active to receive orders.</p>
            </div>
          </div>
          {isStoreStaff && (
            <button
              type="button"
              onClick={() => updateStorePresence(store.id, true)}
              className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] rounded-lg shrink-0 cursor-pointer shadow transition"
            >
              Bring Online
            </button>
          )}
        </div>
      )}

      {/* Store Staff & Owner Controls Banner */}
      {isStoreStaff && (
        <div className="bg-[#151515] border border-[#FACC15]/30 rounded-2xl p-3.5 mb-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-[#FACC15] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isOwner ? 'Store Owner Controls' : isManager ? 'Store Manager Controls' : 'Shop Staff & Kitchen Orders'}</span>
              <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-white/10 text-gray-300 ml-1">
                {isOwner ? 'Owner Mode' : isManager ? 'Manager Mode' : 'Worker Mode'}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {isOwner
                ? `Manage workers, daily sales, menu items & live events for ${store.name}`
                : isManager
                ? `View daily sales, receive customer orders, notify when order ready & scan pickups`
                : `Receive customer orders, notify when order ready & scan pickups`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Store Orders & Alerts button (visible to both Owner and Worker) */}
            <button
              type="button"
              onClick={() => setIsMessagesModalOpen(true)}
              className="bg-[#0D47A1] hover:bg-blue-800 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer relative"
              title="Store Orders & Alerts"
            >
              <Bell className="w-4 h-4 text-white" />
              <span>Today Orders & Alerts</span>
              {unreadMessagesCount > 0 && (
                <span className="bg-[#D32F2F] text-white text-[9px] font-black px-1.5 py-0.2 rounded-full border border-white">
                  {unreadMessagesCount}
                </span>
              )}
            </button>

            {/* Vendor Pickup Scanner (visible to both Owner and Worker) */}
            <button
              type="button"
              onClick={() => setIsPickupModalOpen(true)}
              className="bg-[#D32F2F] hover:bg-red-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
              title="Scan Customer QR or Lookup Phone Number"
            >
              <QrCode className="w-4 h-4 text-white" />
              <span>Pickup Scanner</span>
            </button>

            {/* Worker Management Button - STRICTLY STORE OWNER ONLY */}
            {isOwner && (
              <button
                type="button"
                onClick={() => setIsWorkersModalOpen(true)}
                className="bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
                title="Create worker accounts for staff"
              >
                <Users className="w-4 h-4 stroke-[2.5]" />
                <span>👥 Staff Accounts</span>
              </button>
            )}

            {/* Menu Items & Events - Owner Only */}
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Add Food / Drink</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddEventModal(true)}
                  className="bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
                >
                  <Calendar className="w-4 h-4 stroke-[3]" />
                  <span>Add an Event</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteStoreConfirm(true)}
                  className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 font-extrabold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  title="Delete Store / Venue"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Venue</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Store Confirmation Box */}
      {showDeleteStoreConfirm && (
        <div className="mb-4 p-4 rounded-2xl bg-rose-950/70 border border-rose-500/50 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-black text-white">Delete "{store.name}"?</h4>
              <p className="text-xs text-rose-200 mt-1 leading-relaxed">
                This action is permanent and will delete this venue along with all its events and menu listings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleDeleteStore}
              disabled={isDeletingStore}
              className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl cursor-pointer transition shadow-md"
            >
              {isDeletingStore ? 'Deleting...' : 'Yes, Delete This Store'}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteStoreConfirm(false)}
              className="py-2 px-4 bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-xs rounded-xl cursor-pointer transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Exclusive Store Events Banner */}
      {storeEvents.length > 0 && (
        <div
          onClick={() => setMainTab('EVENTS')}
          className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-yellow-500/20 via-[#FACC15]/10 to-transparent border border-[#FACC15]/40 flex items-center justify-between cursor-pointer hover:border-[#FACC15] transition shadow-md active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FACC15] text-black flex items-center justify-center font-bold shrink-0">
              <Calendar className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-black text-white">
                {storeEvents.length} Live Event{storeEvents.length > 1 ? 's' : ''} at {store.name}
              </div>
              <p className="text-[10px] text-gray-300">
                Exclusive passes & tickets for this venue
              </p>
            </div>
          </div>
          <span className="text-xs font-black text-[#FACC15] bg-black/60 px-3 py-1.5 rounded-xl border border-[#FACC15]/30">
            {mainTab === 'EVENTS' ? 'Viewing Below ↓' : 'View Events ➔'}
          </span>
        </div>
      )}

      {/* 2 BIG BUTTONS UNDER STORE: RESERVED MENU & EVENTS */}
      <div className="flex items-center gap-2 p-1.5 bg-[#141414] rounded-2xl border border-white/10 mb-4 shadow-lg">
        <button
          type="button"
          onClick={() => setMainTab('MENU')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            mainTab === 'MENU'
              ? 'bg-[#FACC15] text-black shadow-md shadow-yellow-400/20 scale-[1.01]'
              : 'text-gray-400 hover:text-white bg-transparent hover:bg-white/5'
          }`}
        >
          <Utensils className={`w-4 h-4 ${mainTab === 'MENU' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span>Daily Menu</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('EVENTS')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            mainTab === 'EVENTS'
              ? 'bg-[#FACC15] text-black shadow-md shadow-yellow-400/20 scale-[1.01]'
              : 'text-gray-400 hover:text-white bg-transparent hover:bg-white/5'
          }`}
        >
          <Calendar className={`w-4 h-4 ${mainTab === 'EVENTS' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span>Events</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-0.5 ${
              mainTab === 'EVENTS'
                ? 'bg-black text-[#FACC15]'
                : storeEvents.length > 0
                ? 'bg-[#FACC15] text-black font-black'
                : 'bg-white/10 text-gray-400'
            }`}
          >
            {storeEvents.length}
          </span>
        </button>
      </div>

      {/* MENU TAB: STORE-SCOPED RESERVE LIST ONLY */}
      {mainTab === 'MENU' && (
        <div className="animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-2.5 gap-2">
            <div>
              <h2 className="text-xs font-bold tracking-widest text-[#FACC15] uppercase">
                {store.name} - DAILY MENU - Order for today
              </h2>
              <p className="text-[11px] text-gray-400">
                To collect at counter today
              </p>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('all');
                  setDrinkSubFilter('all');
                }}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg transition cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-[#FACC15] text-black font-extrabold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('food');
                  setDrinkSubFilter('all');
                }}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg transition cursor-pointer ${
                  categoryFilter === 'food'
                    ? 'bg-[#FACC15] text-black font-extrabold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                Food
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('drink')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  categoryFilter === 'drink'
                    ? 'bg-[#FACC15] text-black font-extrabold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                Drinks
              </button>
            </div>
          </div>

          {/* Requirement: On /store/[storeId] page, under Drinks tab show 2 sub-tabs: All | Soft Drinks | Alcohol */}
          {/* Filter items where category=="drink" && subCategory==selected */}
          {categoryFilter === 'drink' && (
            <div className="flex items-center gap-1.5 p-1 bg-[#141414] rounded-xl border border-white/5 mb-3.5 animate-in fade-in duration-150">
              <button
                type="button"
                onClick={() => setDrinkSubFilter('all')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer text-center ${
                  drinkSubFilter === 'all'
                    ? 'bg-[#FACC15] text-black shadow font-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDrinkSubFilter('soft')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer text-center ${
                  drinkSubFilter === 'soft'
                    ? 'bg-[#FACC15] text-black shadow font-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Soft Drinks
              </button>
              <button
                type="button"
                onClick={() => setDrinkSubFilter('alcohol')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer text-center flex items-center justify-center gap-1 ${
                  drinkSubFilter === 'alcohol'
                    ? 'bg-[#FACC15] text-black shadow font-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>Alcohol</span>
                <span className="text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1 rounded font-black">
                  18+
                </span>
              </button>
            </div>
          )}

          {itemsLoading ? (
            <div className="p-8 text-center text-gray-400 text-xs">
              Loading {store.name} menu...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs bg-[#1A1A1A] rounded-2xl border border-white/5">
              <p className="mb-2">No items found matching the selected filter.</p>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="mt-2 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs px-3.5 py-1.5 rounded-xl inline-flex items-center gap-1 shadow cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Add New Item</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active User Reservations Banner at this Store */}
              {userStoreReservations.filter((r) => r.status !== 'cancelled' && r.status !== 'refunded').length > 0 && (
                <div className="bg-[#181818] border border-[#FACC15]/30 rounded-2xl p-3.5 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-black text-[#FACC15] uppercase tracking-wider">
                        Your Reserved Items at {store.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {userStoreReservations.filter((r) => r.status !== 'cancelled' && r.status !== 'refunded').length} active
                    </span>
                  </div>

                  <div className="space-y-2">
                    {userStoreReservations
                      .filter((r) => r.status !== 'cancelled' && r.status !== 'refunded')
                      .map((res) => (
                        <div
                          key={res.id}
                          onClick={() => navigateTo('/profile')}
                          className="bg-[#202020] hover:bg-[#252525] p-2.5 rounded-xl border border-white/5 hover:border-[#FACC15]/40 flex items-center justify-between transition cursor-pointer group"
                        >
                          <div>
                            <span className="text-xs font-black text-white group-hover:text-[#FACC15] transition block">
                              {res.itemName}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              Qty: <strong className="text-white font-mono">{res.quantity || 1}</strong> · {res.status || 'PAID'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] font-black text-black bg-[#FACC15] px-2.5 py-1 rounded-lg shadow">
                            <User className="w-3 h-3 stroke-[2.5]" />
                            <span>Profile QR</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {filteredItems.map((item) => {
                  const numericPrice = parseNumericPrice(item.price);
                  const matchingRes = userStoreReservations.find(
                    (r) => (r.itemId === item.id || r.itemName === item.name) && r.status !== 'cancelled' && r.status !== 'refunded'
                  );
                  const isItemReserved = Boolean(matchingRes);
                  const isReserving = reservingItemId === item.id;
                  const isDeleting = deletingItemId === item.id;
                  const isAlcohol = Boolean(
                    item.isAlcohol === true ||
                    item.subCategory === 'alcohol' ||
                    isAlcoholItem(item)
                  );
                  const isAgeRestricted = isAlcohol && userAge < 18;

                  return (
                    <div
                      key={item.id}
                      className="bg-[#1A1A1A] rounded-2xl overflow-hidden border border-white/5 shadow-xl flex flex-col justify-between group relative"
                    >
                      {/* Item Photo */}
                      <div className="h-28 w-full bg-zinc-800 relative overflow-hidden shrink-0">
                        <img
                          src={
                            item.image ||
                            item.imageUrl ||
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
                        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                          <span className="bg-black/80 backdrop-blur-sm text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">
                            {item.subCategory
                              ? item.subCategory.toUpperCase()
                              : item.category || 'FOOD'}
                          </span>
                          {isAlcohol && (
                            <span className="bg-rose-600/90 text-white text-[8px] font-black px-1.5 py-0.2 rounded shadow">
                              18+ ALCOHOL
                            </span>
                          )}
                        </div>
                        {isItemReserved && (
                          <div className="absolute top-2 right-2">
                            <span className="bg-[#FACC15] text-black text-[9px] font-black px-2 py-0.5 rounded shadow">
                              RESERVED ✓
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Item Info */}
                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="font-bold text-white text-xs tracking-tight line-clamp-1">
                              {item.name}
                            </h3>
                            {item.allowIngredientRemoval && (
                              <span className="text-[9px] font-black text-amber-950 bg-amber-400 px-1.5 py-0.5 rounded shadow-xs shrink-0 flex items-center gap-1">
                                <Utensils className="w-2.5 h-2.5" />
                                <span>Cancel Items</span>
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-[10px] text-gray-400 line-clamp-2 mt-0.5 leading-snug">
                              {item.description}
                            </p>
                          )}

                          {/* Meal Ingredients Chips */}
                          {item.ingredients && item.ingredients.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.ingredients.map((ing) => (
                                <span
                                  key={ing}
                                  className="text-[9px] font-medium text-gray-300 bg-white/5 px-1.5 py-0.5 rounded border border-white/5"
                                >
                                  {ing}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="text-[#FACC15] font-black text-sm mt-1">
                            R{numericPrice.toFixed(0)}
                          </div>
                        </div>

                        {/* Add to Cart Controls & Store Owner Delete */}
                        <div className="mt-2.5 pt-2 border-t border-white/5 space-y-1.5">
                          {(() => {
                            const inCartItem = storeCartItems.find((ci) => ci.menuItemId === item.id);
                            const inCartQty = inCartItem?.quantity || 0;

                            if (isAgeRestricted) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleReserveItem(item)}
                                  className="w-full py-2 px-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-black text-[10px] flex items-center justify-center gap-1 transition cursor-pointer"
                                >
                                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                                  <span>18+ Restrict (Age {userAge})</span>
                                </button>
                              );
                            }

                            if (inCartQty > 0) {
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between bg-[#0D47A1] text-white rounded-xl p-1 shadow-md">
                                    <button
                                      type="button"
                                      onClick={() => updateCartQuantity(store.id, item.id, inCartQty - 1)}
                                      className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center font-black text-xs cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="text-xs font-black px-1">
                                      {inCartQty} in Cart
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => updateCartQuantity(store.id, item.id, inCartQty + 1)}
                                      className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center font-black text-xs cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                  {item.allowIngredientRemoval && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedCustomizingItem(item)}
                                      className="w-full py-1.5 px-2 rounded-xl bg-amber-400 text-black hover:bg-yellow-400 text-[10px] font-black flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                                    >
                                      <Utensils className="w-3 h-3 text-black" />
                                      <span>
                                        {inCartItem?.removedIngredients && inCartItem.removedIngredients.length > 0
                                          ? `Customized (No ${inCartItem.removedIngredients.join(', ')}) - Edit`
                                          : 'Customize Recipe (Cancel Items)'}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              );
                            }

                            if (item.allowIngredientRemoval || (item.category === 'food' && item.ingredients && item.ingredients.length > 0)) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => setSelectedCustomizingItem(item)}
                                  className="w-full py-2.5 px-2 rounded-xl bg-[#D32F2F] hover:bg-red-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer touch-manipulation"
                                >
                                  <Utensils className="w-3.5 h-3.5 text-[#FACC15]" />
                                  <span>Select Ingredients & Add • R{numericPrice.toFixed(0)}</span>
                                </button>
                              );
                            }

                            return (
                              <button
                                type="button"
                                onClick={() => addToCart(store.id, store.name, item, 1)}
                                className="w-full py-2 px-2 rounded-xl bg-[#D32F2F] hover:bg-red-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1 shadow-md transition cursor-pointer touch-manipulation"
                              >
                                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Add to Cart • R{numericPrice.toFixed(0)}</span>
                              </button>
                            );
                          })()}

                          {/* Secondary options: Reserved Status -> Profile ONE QR or Owner Delete */}
                          <div className="flex items-center gap-1.5 pt-0.5">
                            {isItemReserved && (
                              <button
                                type="button"
                                onClick={() => navigateTo('/profile')}
                                className="flex-1 py-1 px-1.5 rounded-lg bg-[#FACC15] text-black text-[9px] font-black flex items-center justify-center gap-1 shadow transition cursor-pointer"
                              >
                                <User className="w-2.5 h-2.5 stroke-[2.5]" />
                                <span>Paid · Profile QR</span>
                              </button>
                            )}

                            {/* Delete button only for store owner / admin */}
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id, item.name)}
                                disabled={isDeleting}
                                title={`Delete ${item.name}`}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 active:scale-95 border border-rose-500/30 text-rose-400 transition cursor-pointer ml-auto disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* EVENTS TAB: Shows the events that are there */}
      {mainTab === 'EVENTS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#FACC15]" />
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Events at {store.name}
                </h2>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Exclusive live events & ticket passes for this venue
              </p>
            </div>

            {isOwner && (
              <button
                type="button"
                onClick={openNewStoreEventModal}
                className="bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 shadow cursor-pointer transition"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add Event</span>
              </button>
            )}
          </div>

          {storeEvents.length === 0 ? (
            <div className="bg-[#161616] rounded-2xl p-8 border border-white/5 text-center shadow-md">
              <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-white font-bold text-sm mb-1">No Events Listed for {store.name} Yet</p>
              <p className="text-gray-400 text-xs mb-4">
                Events hosted at this venue will appear here.
              </p>
              {isOwner && (
                <button
                  type="button"
                  onClick={openNewStoreEventModal}
                  className="bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 shadow cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Create First Event</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {storeEvents.map((event) => {
                const stats = getEventTicketStats(event, tickets);
                const isClosed = event.status === 'Closed';
                const salesBlocked = stats.isSoldOut || isClosed;

                return (
                  <div
                    key={event.id}
                    className="bg-[#181818] hover:bg-[#202020] rounded-2xl overflow-hidden border border-white/10 hover:border-[#FACC15]/40 shadow-xl transition-all group"
                  >
                    <div className="w-full h-36 bg-zinc-800 relative overflow-hidden">
                      <img
                        src={
                          event.imageUrl ||
                          'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'
                        }
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full shadow backdrop-blur-sm border ${
                            stats.isSoldOut
                              ? 'bg-rose-950/90 text-rose-300 border-rose-500/50'
                              : isClosed
                              ? 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                              : 'bg-emerald-950/90 text-emerald-400 border-emerald-500/40'
                          }`}
                        >
                          {stats.isSoldOut
                            ? `SOLD OUT (${stats.soldCount}/${stats.maxLimit})`
                            : isClosed
                            ? 'Sales Closed'
                            : stats.hasLimit
                            ? `${stats.remaining} / ${stats.maxLimit} Tickets Left`
                            : 'Open Entry'}
                        </span>
                      </div>
                      <div className="absolute bottom-2 left-2.5">
                        <span className="bg-black/85 backdrop-blur-sm text-[#FACC15] text-[9px] font-extrabold px-2 py-0.5 rounded-md border border-white/10">
                          {store.name} EXCLUSIVE
                        </span>
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-black text-white leading-snug group-hover:text-[#FACC15] transition">
                          {event.title}
                        </h3>
                        <span className="text-lg font-black text-[#FACC15] shrink-0 font-mono">
                          {event.price}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 text-xs text-gray-300 flex-wrap">
                        <div className="flex items-center gap-1 text-[#FACC15]">
                          <Calendar className="w-3.5 h-3.5" />
                          <span className="font-semibold">{event.date}</span>
                        </div>
                        <span>•</span>
                        <div className="flex items-center gap-1 text-gray-400">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{event.location || store.location}</span>
                        </div>
                      </div>

                      {event.description && (
                        <p className="text-xs text-gray-400 leading-relaxed pt-1">
                          {event.description}
                        </p>
                      )}

                      <div className="pt-2.5 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-gray-500">
                          {stats.hasLimit
                            ? `Sold: ${stats.soldCount} / ${stats.maxLimit}`
                            : `Venue ID: ${store.id}`}
                        </span>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Edit Event Button */}
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => openEditStoreEventModal(event)}
                              className="py-2 px-2.5 rounded-xl bg-white/10 hover:bg-[#FACC15] hover:text-black text-gray-200 border border-white/15 transition cursor-pointer flex items-center gap-1 text-xs font-bold"
                              title="Edit this event"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          )}

                          {/* Delete Event Button */}
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEventId(event.id)}
                              className="py-2 px-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition cursor-pointer flex items-center gap-1 text-xs font-bold"
                              title="Delete this event"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}

                          {/* Event Menu Pre-Order Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedBuyingEvent(event)}
                            className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                            title="View event menu and pre-order food & drinks"
                          >
                            <Utensils className="w-3.5 h-3.5 text-[#FACC15]" />
                            <span>Menu</span>
                          </button>

                          <button
                            type="button"
                            disabled={salesBlocked}
                            onClick={() => handleBuyTicket(event)}
                            className={`px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow font-extrabold ${
                              salesBlocked
                                ? 'bg-zinc-800 text-gray-500 border border-zinc-700 cursor-not-allowed'
                                : 'bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black cursor-pointer'
                            }`}
                          >
                            <TicketIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>
                              {stats.isSoldOut
                                ? 'Sold Out'
                                : isClosed
                                ? 'Closed'
                                : 'Buy Ticket / Pass'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Inline Delete Event Confirmation */}
                      {confirmDeleteEventId === event.id && (
                        <div className="mt-2 p-3 bg-rose-950/70 border border-rose-500/50 rounded-xl space-y-2 animate-in fade-in">
                          <div className="flex items-center gap-1.5 text-xs text-rose-200 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>Are you sure you want to delete event "{event.title}"?</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(event.id, event.title)}
                              disabled={isDeletingEvent}
                              className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-lg cursor-pointer transition shadow"
                            >
                              {isDeletingEvent ? 'Deleting...' : 'Yes, Delete Event'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEventId(null)}
                              className="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-xs rounded-lg cursor-pointer transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {isOwner && (
                        <div className="pt-2">
                          <EventQrShareCard event={event} compact />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Store Owner "Add Food / Drink" Form Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-white animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#FACC15]/20 text-[#FACC15] flex items-center justify-center">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Add Food / Drink</h3>
                  <p className="text-[10px] text-gray-400">{store.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddItemSubmit} className="space-y-3.5">
              {/* Field 1: itemName */}
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flame Grilled Wings or Corona"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition"
                />
              </div>

              {/* Field 2: price (number) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  Price (Rands)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-[#FACC15]">R</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="e.g. 75"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-[#121212] border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition font-mono font-bold"
                  />
                </div>
              </div>

              {/* Field 3: category (dropdown Food/Drink) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as 'Food' | 'Drink')}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#FACC15] focus:outline-none transition"
                >
                  <option value="Food">Food</option>
                  <option value="Drink">Drink</option>
                </select>
              </div>

              {/* Requirement: When adding item, if category == "drink", show second dropdown: "Soft Drink" or "Alcohol" */}
              {category.toLowerCase() === 'drink' && (
                <div className="animate-in fade-in duration-150">
                  <label className="block text-[11px] font-bold text-[#FACC15] mb-1">
                    Drink Sub-Type
                  </label>
                  <select
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value as 'soft' | 'alcohol')}
                    className="w-full bg-[#121212] border border-[#FACC15]/40 rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#FACC15] focus:outline-none transition font-semibold"
                  >
                    <option value="soft">Soft Drink</option>
                    <option value="alcohol">Alcohol (18+)</option>
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {subCategory === 'alcohol'
                      ? 'Alcohol items require users to be 18+ and show ID at collection.'
                      : 'Soft drinks are available for all ages.'}
                  </p>
                </div>
              )}

              {/* Field 4: phone upload for item image */}
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1 flex items-center justify-between">
                  <span>Item Picture (Upload from Phone)</span>
                  <span className="text-[10px] text-emerald-400">Gallery & Camera</span>
                </label>
                <input
                  ref={itemFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleItemImageFileChange}
                  className="hidden"
                />
                <div
                  onClick={async () => {
                    const perm = await ensurePhotosPermission();
                    if (!perm.granted) return;
                    itemFileInputRef.current?.click();
                  }}
                  className="border-2 border-dashed border-white/20 hover:border-[#FACC15] rounded-xl p-3 text-center cursor-pointer transition bg-[#121212] hover:bg-[#1a1a1a] flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    {imageUrl && imageUrl.startsWith('data:') ? (
                      <img src={imageUrl} alt="Preview" className="w-10 h-10 object-cover rounded-lg" />
                    ) : (
                      <Upload className="w-5 h-5 text-[#FACC15]" />
                    )}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {itemImageFileName ? `Selected: ${itemImageFileName}` : 'Choose Photo or Take Picture'}
                    </p>
                    <p className="text-[10px] text-gray-400">Tap to open phone gallery or camera</p>
                  </div>
                </div>
              </div>

              {/* Meal Ingredients and Allow Removal for Food category */}
              {category === 'Food' && (
                <div className="space-y-2.5 animate-in fade-in duration-150">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-gray-300">
                        Meal Ingredients
                      </label>
                      <span className="text-[10px] text-gray-400">comma-separated</span>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. rice, chicken, achaar, salad"
                      value={itemIngredientsText}
                      onChange={(e) => setItemIngredientsText(e.target.value)}
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['rice', 'chicken', 'achaar', 'salad', 'chips', 'polony', 'cheese', 'beef patty'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => {
                            const current = itemIngredientsText
                              .split(',')
                              .map((s) => s.trim().toLowerCase())
                              .filter(Boolean);
                            if (!current.includes(chip)) {
                              setItemIngredientsText(current.concat(chip).join(', '));
                            }
                          }}
                          className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white text-[10px] font-medium border border-white/10 transition cursor-pointer"
                        >
                          +{chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#121212] p-2.5 rounded-xl border border-white/10 flex items-center justify-between">
                    <div>
                      <label
                        htmlFor="storeAllowRemovalToggle"
                        className="text-white font-bold text-xs block cursor-pointer"
                      >
                        Allow Ingredient Removal
                      </label>
                      <p className="text-[10px] text-gray-400">
                        Customers can uncheck ingredients (e.g. &quot;No salad&quot;, &quot;No achaar&quot;)
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                      <input
                        id="storeAllowRemovalToggle"
                        type="checkbox"
                        checked={itemAllowRemoval}
                        onChange={(e) => setItemAllowRemoval(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FACC15]"></div>
                    </label>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold text-xs transition cursor-pointer shadow disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Requirement 1: Store Owner "Add / Edit an Event" Form Modal */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-white animate-in zoom-in-95 duration-200 my-auto max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#FACC15] text-black flex items-center justify-center font-bold">
                  {editingStoreEvent ? (
                    <Edit3 className="w-4 h-4 stroke-[2.5]" />
                  ) : (
                    <Calendar className="w-4 h-4 stroke-[2.5]" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    {editingStoreEvent ? 'Edit Event' : 'Add an Event'}
                  </h3>
                  <p className="text-[10px] text-[#FACC15] font-semibold">{store.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEventActionError(null);
                  setEditingStoreEvent(null);
                  setShowAddEventModal(false);
                }}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddEventSubmit} className="space-y-3 text-xs overflow-y-auto pr-1 flex-1">
              {eventActionError && (
                <div className="p-2.5 bg-red-950/80 border border-red-500/40 rounded-xl text-red-200 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{eventActionError}</span>
                </div>
              )}

              {/* Field 1: Event Name */}
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  Event Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. All White Spring Festival"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition font-semibold"
                />
              </div>

              {/* Field 2: Event Date & Time */}
              <DatePickerInput
                label="Event Date & Time"
                value={eventDateTime}
                onChange={(val) => setEventDateTime(val)}
                includeTime={true}
                required={true}
              />

              {/* Field 3: Event Description */}
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  Event Description *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Describe DJ lineup, themes, VIP table booking, and gate policies..."
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition leading-relaxed resize-none"
                />
              </div>

              {/* Field 4: Event Poster Image upload (with preview) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-300 mb-1">
                  Event Poster Image (Upload or URL)
                </label>

                {/* Upload Button */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    disabled={isUploadingEventPoster}
                    onClick={async () => {
                      const perm = await ensurePhotosPermission();
                      if (!perm.granted) return;
                      posterFileInputRef.current?.click();
                    }}
                    className="flex-1 bg-[#222] hover:bg-[#2A2A2A] border border-white/10 hover:border-[#FACC15]/40 text-gray-200 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-60"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#FACC15]" />
                    <span>{isUploadingEventPoster ? 'Optimizing Poster...' : 'Upload Poster from Device'}</span>
                  </button>
                  <input
                    ref={posterFileInputRef}
                    id="event-poster-upload-input"
                    type="file"
                    accept="image/*"
                    disabled={isUploadingEventPoster}
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                </div>

                {/* Or URL input */}
                <div className="relative mb-2">
                  <input
                    type="url"
                    placeholder="Or paste poster URL (https://...)"
                    value={eventPosterImage}
                    onChange={(e) => {
                      setEventPosterImage(e.target.value);
                      setEventPosterPreview(e.target.value);
                    }}
                    className="w-full bg-[#121212] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-[11px] text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition"
                  />
                  <ImageIcon className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
                </div>

                {/* Image Live Preview */}
                {eventPosterPreview ? (
                  <div className="relative rounded-xl overflow-hidden border-2 border-[#FACC15] h-28 w-full bg-black/50 mb-2">
                    <img
                      src={eventPosterPreview}
                      alt="Poster Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1.5 left-1.5 bg-black/80 backdrop-blur-sm text-[#FACC15] text-[9px] font-black px-2 py-0.5 rounded">
                      LIVE PREVIEW
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEventPosterImage('');
                        setEventPosterPreview('');
                      }}
                      className="absolute top-1.5 right-1.5 bg-black/80 hover:bg-black text-rose-400 p-1 rounded-full border border-white/20 transition cursor-pointer"
                      title="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="p-2 bg-[#121212] rounded-xl border border-white/5 text-[10px] text-gray-500 text-center">
                    No image uploaded. A curated nightlife poster will be used as default.
                  </div>
                )}
              </div>

              {/* Field 5 & 6: Ticket Price & Number of tickets available */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">
                    Ticket Price *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-[#FACC15] font-bold text-xs font-mono">
                      R
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="150"
                      value={eventTicketPrice}
                      onChange={(e) => setEventTicketPrice(e.target.value)}
                      className="w-full bg-[#121212] border border-white/10 rounded-xl pl-7 pr-3 py-2 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-300 mb-1">
                    Ticket Sales Limit *
                  </label>
                  <input
                    type="number"
                    min={
                      editingStoreEvent
                        ? Math.max(1, getEventTicketStats(editingStoreEvent, tickets).soldCount)
                        : 1
                    }
                    required
                    placeholder="200"
                    value={ticketsAvailable}
                    onChange={(e) => setTicketsAvailable(e.target.value)}
                    className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:border-[#FACC15] focus:outline-none transition font-mono font-bold"
                  />
                </div>
              </div>

              {editingStoreEvent && (
                <div className="flex items-center justify-between gap-2 bg-[#121212] px-3 py-2 rounded-xl border border-white/10">
                  <span className="text-[11px] font-bold text-gray-300">Ticket Sales Status:</span>
                  <select
                    value={eventStatus}
                    onChange={(e) => setEventStatus(e.target.value as 'Open' | 'Closed')}
                    className="bg-[#1A1A1A] text-white px-2.5 py-1 rounded-lg border border-white/15 text-xs font-bold focus:outline-none focus:border-[#FACC15]"
                  >
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingStoreEvent(null);
                    setShowAddEventModal(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEvent}
                  className="flex-1 py-2.5 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold text-xs transition cursor-pointer shadow disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>
                    {isSubmittingEvent
                      ? editingStoreEvent
                        ? 'Saving...'
                        : 'Publishing...'
                      : editingStoreEvent
                      ? 'Save Changes'
                      : 'Save & Publish'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advanced Food & Drinks Reservation Modal with Customer ID & Reserve for Someone Else */}
      {selectedReserveItem && (
        <FoodReserveModal
          item={selectedReserveItem}
          store={store}
          onClose={() => setSelectedReserveItem(null)}
        />
      )}

      {/* Floating Bottom Store Cart Bar */}
      {storeCartSummary.totalQuantity > 0 && (
        <div className="fixed bottom-14 left-0 right-0 z-40 px-4 py-2 flex justify-center pointer-events-none">
          <div className="w-full max-w-md bg-[#0D47A1] text-white rounded-2xl p-3 shadow-2xl border-2 border-white/20 flex items-center justify-between gap-3 pointer-events-auto animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center relative">
                <ShoppingBag className="w-5 h-5 text-white" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#D32F2F] text-white text-[9px] font-black rounded-full flex items-center justify-center border border-white">
                  {storeCartSummary.totalQuantity}
                </span>
              </div>
              <div>
                <div className="text-xs font-black truncate max-w-[130px] sm:max-w-[160px]">
                  {store.name} Cart
                </div>
                <div className="text-[10px] text-blue-200">
                  {storeCartSummary.totalQuantity} items • R{storeCartSummary.subtotal.toFixed(2)} (+ R{storeCartSummary.platformFee} fee)
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="py-2.5 px-3.5 bg-[#D32F2F] hover:bg-red-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <span>View Cart • R{storeCartSummary.total.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Store Cart Drawer */}
      <StoreCartDrawer
        storeId={store.id}
        storeName={store.name}
        storeLocation={store.location}
        storeOwnerId={store.ownerId}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onOrderCreated={(order) => {
          setConfirmedOrder(order);
          setIsSuccessModalOpen(true);
        }}
      />

      {/* Meal Ingredients Customizer Modal */}
      {selectedCustomizingItem && (
        <MealCustomizerModal
          item={selectedCustomizingItem}
          storeId={store.id}
          storeName={store.name}
          isOpen={Boolean(selectedCustomizingItem)}
          onClose={() => setSelectedCustomizingItem(null)}
          onAddToCart={(item, qty, customization) => {
            addToCart(store.id, store.name, item, qty, customization);
            setToast({
              message: customization.removedIngredients.length > 0
                ? `Added customized ${item.name} (No ${customization.removedIngredients.join(', ')})`
                : `Added ${item.name} to cart`,
              type: 'success',
            });
          }}
        />
      )}

      {/* Order Success & Pickup QR Code Modal */}
      <MallOrderSuccessModal
        order={confirmedOrder}
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
      />

      {/* Vendor Order Pickup Scanner & Phone Lookup Modal */}
      <VendorOrderPickupModal
        storeId={store.id}
        storeName={store.name}
        isOpen={isPickupModalOpen}
        onClose={() => setIsPickupModalOpen(false)}
      />

      {/* Store Owner Messages & Today Orders Modal */}
      <StoreOwnerMessagesModal
        storeId={store.id}
        storeName={store.name}
        isOpen={isMessagesModalOpen}
        onClose={() => setIsMessagesModalOpen(false)}
        onOpenScanner={() => setIsPickupModalOpen(true)}
      />

      {/* Store Workers Accounts Modal (Store Owner only) */}
      <StoreWorkersModal
        storeId={store.id}
        storeName={store.name}
        isOpen={isWorkersModalOpen}
        onClose={() => setIsWorkersModalOpen(false)}
      />
    </div>
  );
};
export default StoreDetailPage;
