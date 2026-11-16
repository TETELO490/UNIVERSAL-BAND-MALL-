import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  increment,
  runTransaction,
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  deleteUser,
  GoogleAuthProvider,
  signInWithCredential,
  User as FirebaseUser,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { auth, googleProvider, db, handleFirestoreError, OperationType, testConnection, getActionCodeSettings } from '../firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '../firebase';
import { EventItem, MenuItem, MenuItemDoc, Promoter, Store, Ticket, UserProfile, StoreRequest, WalletDoc, WalletTransaction, AttendanceStatus, AttendanceLog, VendorSale, CartItem, MallOrder, StoreMessage, StoreWorker, StorePresence, NewOrderSoundConfig, BuyTicketAlarmConfig, ActivePaymentAlarm, ActiveBuyTicketAlarm, AppNotificationBanner, SupportChat, SupportMessage, SupportTicketAttachment } from '../types';
import { calculatePlatformFee, getPhoneLookupFeeSplit, MALL_FEES } from '../utils/mallFees';
import { isAlcoholItem } from '../utils/ageHelper';
import { isAuthorizedAdminEmail, addAuthorizedAdminEmail } from '../utils/cryptoHelper';
import { formatMovementTime, queueOfflineMovement } from '../utils/attendanceService';
import {
  generateUniqueEventSlug,
  getPublicWebOrigin,
  findEventBySlugOrId,
  getEventRoutePath,
} from '../utils/eventLinkHelper';
import {
  DEFAULT_NEW_ORDER_SOUND,
  playNewOrderSound,
  playTicketPaidSuccessSound,
  playSuccessChime,
  triggerBackgroundNotification,
  startLoopingPaymentAlarm,
  stopLoopingPaymentAlarm,
} from '../utils/audio';
import {
  isTicketWaitingPayment,
  isTicketPaid,
  parsePriceNumber,
  extractTymebankSmsDetails,
  extractLivePaymentSmsDetails,
  doesSmsMatchBankMessage,
  extractReferenceByFormat,
  findMatchingWaitingTicket,
  isTopUpPayshapReference,
  extractEventNameFromPayshapRef,
  checkIsTymeBankPaymentAlertSms,
} from '../utils/ticketStatus';
import {
  INITIAL_EVENTS,
  INITIAL_STORES,
  INITIAL_USER,
  INITIAL_PROMOTERS,
  INITIAL_FOOD,
  INITIAL_ALCOHOL,
  INITIAL_SOFTDRINKS,
} from '../data/seedData';
import confetti from 'canvas-confetti';
import { runAutoBinCheck } from '../utils/autoBinService';
import { sweepConcludedTicketsToBill } from '../utils/billingService';
import { isSameDay, hasEventDateArrived, isEventExpired } from '../utils/dateHelper';
import { estimateDocByteSize } from '../utils/imageUploadHelper';
import {
  sendFirebaseVerificationLink,
  checkFirebaseEmailVerified,
  isUserVerified,
} from '../utils/emailVerificationService';
import { isAccountSecurityRequired } from '../utils/multiLockSecurity';
import {
  resolveCustomerQrId,
  parseCustomerQrScan,
  doesTicketMatchCustomerQr,
  doesOrderMatchCustomerQr,
  normalizePhoneDigits,
} from '../utils/customerQr';
import {
  checkSmsPermissionGranted,
  ensureSmsPermission,
  ensureNotificationsPermission,
  readRealSmsInbox,
  startNativeSmsListener,
  configureBackgroundSmsConfirmation,
  getBackgroundSmsState,
  stopNativePaymentAlarm,
  isNativePaymentAlarmActive,
  configureNativePaymentAlarm,
  triggerNativeTestAlarm,
  consumePendingNotificationRoute,
  subscribeNativePaymentAlarmEvents,
  SmsInboxMessage,
} from '../utils/nativePermissions';

// Helper to strip undefined values before passing to Firestore setDoc
const cleanForFirestore = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result as Partial<T>;
};

const formatItemSummary = (itemsList: any[]) => {
  if (!itemsList || !Array.isArray(itemsList)) return '';
  return itemsList
    .map((i) => {
      const priceVal = i.price !== undefined && i.price !== null ? String(i.price) : '';
      const priceStr = priceVal ? (priceVal.startsWith('R') ? priceVal : `R${priceVal}`) : '';
      const removed = i.removedIngredients && i.removedIngredients.length > 0 ? ` [No ${i.removedIngredients.join(', ')}]` : '';
      return `${i.quantity || 1}x ${i.name || 'Item'}${removed}${priceStr ? ` (${priceStr})` : ''}`;
    })
    .join(', ');
};

interface AppContextType {
  isLocked: boolean;
  unlockApp: (pinInput: string, verifiedFactor?: boolean) => boolean;
  lockApp: () => void;
  attemptsLeft: number;
  resetPinWithEmail: () => Promise<boolean>;
  currentPin: string;
  updatePin: (newPin: string) => void;
  
  currentRoute: string;
  navigateTo: (route: string) => void;
  selectedStoreId: string | null;
  setSelectedStoreId: (id: string | null) => void;
  
  stores: Store[];
  events: EventItem[];
  tickets: Ticket[];
  promoters: Promoter[];
  menuFood: MenuItem[];
  menuAlcohol: MenuItem[];
  menuSoftDrinks: MenuItem[];
  currentUser: UserProfile;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  firebaseUser: FirebaseUser | null;
  welcomeMessage: string | null;
  setWelcomeMessage: (msg: string | null) => void;
  registerWithEmail: (params: {
    fullName: string;
    phone: string;
    email: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string; requireVerification?: boolean; email?: string; fullName?: string }>;
  loginWithEmailOrPhone: (
    identifier: string,
    password: string
  ) => Promise<{
    success: boolean;
    error?: string;
    requireVerification?: boolean;
    requireSecurityVerification?: boolean;
    requireAdminSecurity?: boolean;
    pendingUser?: UserProfile;
    email?: string;
    fullName?: string;
  }>;
  pendingSecurityAuth: {
    pendingUser: UserProfile;
    targetEmail: string;
    walletBal: number;
    isAdmin: boolean;
  } | null;
  completeSecurityLogin: (userToActivate?: UserProfile) => void;
  cancelSecurityLogin: () => Promise<void>;
  pendingVerification: { email: string; fullName?: string } | null;
  setPendingVerification: (val: { email: string; fullName?: string } | null) => void;
  loginAsAdminMaster: () => void;
  sendEmailOtp: (email: string) => Promise<{ success: boolean; otp?: string; error?: string }>;
  resetPasswordWithOtp: (
    email: string,
    otp: string,
    newPass: string
  ) => Promise<{ success: boolean; error?: string }>;
  resetPasswordDirectly: (
    email: string,
    newPass: string
  ) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: (options?: {
    role?: string;
    assignedStoreId?: string;
    assignedStoreName?: string;
    shopName?: string;
    whatToSell?: string;
    organisationName?: string;
    vehicleType?: string;
    licensePlate?: string;
    driverLicenseNumber?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  setAuthRegistrationLock: (locked: boolean) => void;
  signOutUser: () => Promise<void>;
  deleteMyAccount: () => Promise<{ success: boolean; error?: string }>;
  adminDeleteUser: (userId: string, userEmail?: string) => Promise<{ success: boolean; error?: string }>;
  approveUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  rejectUser: (userId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  pendingApprovals: UserProfile[];
  pendingCheckoutTarget: any | null;
  setPendingCheckoutTarget: React.Dispatch<React.SetStateAction<any | null>>;
  totalCartCount: number;
  allRegisteredUsers: UserProfile[];
  storeRequests: StoreRequest[];
  isAppReady: boolean;
  createOrAssignPromoter: (promoterData: Omit<Promoter, 'id'>) => Promise<boolean>;

  isAdminSecurityModalOpen: boolean;
  setIsAdminSecurityModalOpen: (open: boolean) => void;
  pendingAdminAuthUser: UserProfile | null;
  openAdminLoginFlow: () => void;
  handleAdminSecuritySuccess: () => void;
  cancelAdminLogin: () => Promise<void>;
  terminateAdminSession: () => Promise<void>;
  wipeAndReset: () => Promise<void>;
  
  buyTicket: (
    event: EventItem,
    customerData?: {
      fullName: string;
      phone: string;
      photo?: string;
      idNumber?: string;
      quantity?: number;
      ticketTier?: string;
      tierPrice?: string;
    }
  ) => Promise<{ success: boolean; tickets?: Ticket[]; ticket?: Ticket; error?: string }>;
  checkInTicket: (
    ticketIdOrCode: string
  ) => Promise<{ success: boolean; message: string; ticket?: Ticket; code?: string }>;
  checkOutTicket: (
    ticketIdOrCode: string
  ) => Promise<{ success: boolean; message: string; ticket?: Ticket; code?: string }>;
  buyTicketWithPayShap: (
    event: EventItem,
    customerData: {
      fullName: string;
      phone: string;
      quantity?: number;
      ticketTier?: string;
      tierPrice?: string;
      payshapReference: string;
    }
  ) => Promise<{ success: boolean; ticket?: Ticket; error?: string }>;
  updateTicketPaymentStatus: (
    ticketId: string,
    status: 'PAID' | 'VERIFIED',
    refText?: string,
    smsText?: string
  ) => Promise<boolean>;
  confirmTicketPaymentManually: (ticketId: string) => Promise<boolean>;
  confirmMallOrderPaymentManually: (orderId: string) => Promise<boolean>;
  markPayshapRequestSent: (ticketId: string) => Promise<boolean>;
  processTymebankSms: (
    smsText: string,
    sender?: string
  ) => { success: boolean; message: string; ticket?: Ticket; data?: any };
  scanRealSmsInbox: (options?: { promptIfNeeded?: boolean; sinceMs?: number }) => Promise<{
    granted: boolean;
    scannedCount: number;
    matchedCount: number;
    results: { success: boolean; message: string; data?: any }[];
  }>;
  tymebankPayshapNumber: string;
  updateTymebankPayshapNumber: (num: string) => Promise<void>;
  paymentBankMessage: string;
  paymentReferenceFormat: string;
  lastPaymentSmsText: string;
  lastPaymentSmsSender: string;
  lastPaymentSmsAt: string;
  lastPaymentAmount: string;
  lastConfirmedReference: string;
  smsPermissionActive: boolean;
  updatePaymentConfirmationSettings: (params: {
    bankMessage: string;
    referenceFormat: string;
  }) => Promise<void>;
  requestAdminSmsPermissionPopup: () => Promise<boolean>;
  newOrderSound: NewOrderSoundConfig;
  updateNewOrderSound: (config: NewOrderSoundConfig) => Promise<void>;
  buyTicketAlarm: BuyTicketAlarmConfig;
  updateBuyTicketAlarm: (config: BuyTicketAlarmConfig) => Promise<void>;
  activePaymentAlarm: ActivePaymentAlarm | null;
  dismissPaymentAlarm: () => Promise<void>;
  activeBuyTicketAlarm: ActiveBuyTicketAlarm | null;
  dismissBuyTicketAlarm: () => void;
  testPaymentAlarm: (overrideSound?: NewOrderSoundConfig) => Promise<void>;
  supportRingEnabled: boolean;
  setSupportRingEnabled: (enabled: boolean) => void;
  supportChats: SupportChat[];
  activeCustomerChat: SupportChat | null;
  unreadAdminSupportCount: number;
  unreadCustomerSupportCount: number;
  isSupportModalOpen: boolean;
  setIsSupportModalOpen: (open: boolean) => void;
  activeAdminSupportChatId: string | null;
  setActiveAdminSupportChatId: (id: string | null) => void;
  sendCustomerSupportMessage: (params: {
    text: string;
    imageUrl?: string;
    audioUrl?: string;
    ticketAttachment?: SupportTicketAttachment;
  }) => Promise<boolean>;
  sendAdminSupportReply: (params: {
    chatId: string;
    text: string;
    imageUrl?: string;
  }) => Promise<boolean>;
  markChatAsReadByCustomer: (chatId: string) => Promise<void>;
  markChatAsReadByAdmin: (chatId: string) => Promise<void>;
  approveTicketManuallyFromChat: (
    ticketId: string,
    chatId: string
  ) => Promise<{ success: boolean; message?: string }>;
  rejectTicketFromChat: (
    ticketId: string,
    chatId: string,
    reason: string
  ) => Promise<{ success: boolean; message?: string }>;
  notificationBanner: AppNotificationBanner | null;
  dismissNotificationBanner: () => void;
  tymebankSmsLogs: { id: string; text: string; time: string; status: string }[];
  clearTymebankSmsLogs: () => void;
  walletTopups: {
    id: string;
    userId: string;
    userName: string;
    userPhone?: string;
    amount: number;
    payshapId: string;
    payshapReference: string;
    status: 'PENDING_PAYMENT' | 'CREDITED';
    createdAt: string;
    creditedAt?: string;
    verifiedSmsText?: string;
  }[];
  submitPayshapTopUpRequest: (amount: number, payshapReference: string) => Promise<{
    id: string;
    userId: string;
    userName: string;
    userPhone?: string;
    amount: number;
    payshapId: string;
    payshapReference: string;
    status: 'PENDING_PAYMENT' | 'CREDITED';
    createdAt: string;
  }>;
  selectedBuyingEvent: EventItem | null;
  setSelectedBuyingEvent: (event: EventItem | null) => void;
  editingEvent: EventItem | null;
  setEditingEvent: (event: EventItem | null) => void;
  eventActionError: string | null;
  setEventActionError: (err: string | null) => void;
  eventsLoaded: boolean;
  addNewEvent: (eventData: Omit<EventItem, 'id'>) => Promise<boolean>;
  updateEvent: (eventId: string, updatedData: Partial<EventItem>) => Promise<boolean>;
  deleteEvent: (eventId: string) => Promise<boolean>;
  addNewStore: (storeData: Omit<Store, 'id'>) => Promise<boolean>;
  updateStore: (storeId: string, updatedData: Partial<Store>) => Promise<boolean>;
  deleteStore: (storeId: string) => Promise<boolean>;
  editingStore: Store | null;
  setEditingStore: (store: Store | null) => void;
  addMenuItem: (
    collectionName: 'menu_food' | 'menu_alcohol' | 'menu_softdrinks',
    item: Omit<MenuItem, 'id'>
  ) => Promise<boolean>;
  purchaseMenuItem: (item: MenuItem) => Promise<{ success: boolean; error?: string }>;
  updateStoreRequestStatus: (requestId: string, status: 'approved' | 'rejected') => void;
  submitPromoterApplication: (params: { userId: string; fullName: string; email: string; phone: string; storeName: string; reason: string }) => Promise<boolean>;
  currentWalletBalance: number;
  topUpWallet: (amount: number, ref?: string) => Promise<void>;
  walletTransactions: WalletTransaction[];
  addWalletTransaction: (tx: Omit<WalletTransaction, 'id' | 'date'>) => void;
  resetWallet: () => void;
  setUserAge: (age: number) => void;
  userWalletDoc: WalletDoc;
  updateUserWalletDoc: (data: Partial<WalletDoc>) => Promise<void>;
  
  activeStoreTab: 'Events' | 'Food' | 'Drinks';
  setActiveStoreTab: (tab: 'Events' | 'Food' | 'Drinks') => void;

  selectedTicket: Ticket | null;
  setSelectedTicket: (ticket: Ticket | null) => void;
  
  // Modals state
  activeModal: string | null;
  setActiveModal: (modalName: string | null) => void;
  resetPasswordCode: string | null;
  
  // Custom Logo & Branding
  customLogoUrl: string;
  updateCustomLogo: (logoUrl: string) => Promise<void>;
  customAppIconUrl: string;
  updateCustomAppIcon: (iconUrl: string) => Promise<void>;

  // Live Vendor Sales & Wallet Admin Reset
  resetAllCustomerBalances: () => Promise<{ success: boolean; count: number; error?: string }>;
  deductVendorSale: (params: {
    customerId: string;
    amount: number;
    itemName?: string;
    vendorName?: string;
    storeId?: string;
    storeName?: string;
  }) => Promise<{ success: boolean; previousBalance: number; newBalance: number; error?: string }>;
  liveSales: VendorSale[];
  totalLiveSalesAmount: number;

  // Universal Band Mall Carts, Orders, and Messaging
  carts: Record<string, CartItem[]>;
  addToCart: (
    storeId: string,
    storeName: string,
    item: {
      id: string;
      name: string;
      price: number | string;
      image?: string;
      imageUrl?: string;
      category?: string;
      subCategory?: string;
      isAlcohol?: boolean;
      ingredients?: string[];
      allowIngredientRemoval?: boolean;
    },
    quantity?: number,
    customization?: {
      removedIngredients?: string[];
      customizedIngredients?: string[];
    }
  ) => void;
  removeFromCart: (storeId: string, itemId: string) => void;
  updateCartQuantity: (storeId: string, itemId: string, quantity: number) => void;
  updateCartItemRemovedIngredients: (storeId: string, itemId: string, removedIngredients: string[]) => void;
  clearCart: (storeId: string) => void;
  getCartSummary: (storeId: string) => { subtotal: number; totalQuantity: number; platformFee: number; total: number; items: CartItem[] };
  
  mallOrders: MallOrder[];
  storeMessages: StoreMessage[];
  createMallOrder: (params: {
    storeId: string;
    storeName: string;
    storeLocation?: string;
    storeOwnerId?: string;
    customerPhone: string;
    customerName?: string;
    collectionDate: 'Today' | string;
    paymentMethod?: 'wallet' | 'card';
    customItems?: CartItem[];
    eventId?: string;
    checkoutType: 'COLLECTION' | 'DELIVERY';
    deliveryAddress?: string;
    deliveryPhone?: string;
    deliveryFee?: number;
    deliveryLat?: number;
    deliveryLng?: number;
    gpsAccuracy?: number;
  }) => Promise<{ success: boolean; order?: MallOrder; error?: string }>;
  releaseMallOrderByQr: (
    scannedCode: string,
    storeId?: string
  ) => Promise<{ success: boolean; order?: MallOrder; message: string }>;
  releaseMallOrderByPhone: (
    customerPhone: string,
    storeId: string,
    orderId?: string
  ) => Promise<{ success: boolean; order?: MallOrder; feeCharged: number; storeEarned: number; adminEarned: number; message: string }>;
  markStoreMessageRead: (messageId: string) => Promise<void>;
  activePickupOrder: MallOrder | null;
  setActivePickupOrder: (order: MallOrder | null) => void;

  // Store Worker management & Store Phone Presence
  storeWorkers: StoreWorker[];
  createStoreWorker: (data: {
    storeId: string;
    storeName: string;
    name: string;
    email: string;
    phone: string;
    password?: string;
    role?: 'Worker' | 'Manager';
  }) => Promise<{ success: boolean; worker?: StoreWorker; error?: string }>;
  deleteStoreWorker: (workerId: string) => Promise<boolean>;
  storePresence: Record<string, StorePresence>;
  updateStorePresence: (storeId: string, isOnline: boolean) => Promise<void>;
  checkIsStoreOnline: (storeId: string) => boolean;
  markOrderReady: (orderId: string) => Promise<{ success: boolean; message: string }>;
  
  eventPreorderEvent: EventItem | null;
  setEventPreorderEvent: (event: EventItem | null) => void;
  openEventFoodPreorder: (event: EventItem) => void;
  acceptOrder: (orderId: string, driver: { id: string; name: string; phone: string; plate: string; photo?: string }) => Promise<{ success: boolean; message: string; order?: MallOrder }>;
  verifyDriverStorePickup: (scannedCodeOrPin: string, storeId?: string) => Promise<{ success: boolean; message: string; order?: MallOrder; driver?: { name: string; photo: string; plate: string } }>;
  confirmStoreHandoverToDriver: (orderId: string) => Promise<{ success: boolean; message: string; order?: MallOrder }>;
  verifyCustomerDelivery: (scannedCodeOrPin: string, driverId?: string, gpsCoords?: { lat: number; lng: number }) => Promise<{ success: boolean; message: string; order?: MallOrder; customerVerified?: boolean }>;
  confirmCustomerDeliveryComplete: (orderId: string) => Promise<{ success: boolean; message: string; order?: MallOrder }>;
  markAsOnWay: (orderId: string) => Promise<{ success: boolean; message: string; order?: MallOrder }>;
  markAsDelivered: (orderId: string, proof?: any) => Promise<{ success: boolean; message: string; order?: MallOrder }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    return localStorage.getItem('ub_locked') === 'true';
  });
  const [currentPin, setCurrentPin] = useState<string>(() => {
    return localStorage.getItem('ub_pin') || '';
  });
  const [attemptsLeft, setAttemptsLeft] = useState<number>(5);
  
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    if (localStorage.getItem('ub_locked') === 'true') {
      return '/app-lock';
    }
    // Respect window pathname if directly navigating in browser (e.g. /about, /terms, /admin)
    if (typeof window !== 'undefined' && window.location.pathname && window.location.pathname !== '/') {
      const p = window.location.pathname;
      if (p.endsWith('/index.html') || p === '/index.html' || p.includes('/android_asset/')) {
        return '/';
      }
      return p;
    }
    // 100% PUBLIC HOMEPAGE - Default route for any visitor without login wall
    return '/';
  });
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [activeStoreTab, setActiveStoreTab] = useState<'Events' | 'Food' | 'Drinks'>('Events');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedBuyingEvent, setSelectedBuyingEvent] = useState<EventItem | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [eventActionError, setEventActionError] = useState<string | null>(null);
  const [eventPreorderEvent, setEventPreorderEvent] = useState<EventItem | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isAppReady, setIsAppReady] = useState<boolean>(false);
  const googleRegistrationLockRef = useRef<boolean>(false);
  const authRegistrationLockRef = useRef<boolean>(false);
  const setAuthRegistrationLock = (locked: boolean) => {
    authRegistrationLockRef.current = locked;
  };

  const openEventFoodPreorder = (event: EventItem) => {
    const role = (currentUser?.role || '').toLowerCase();
    const isAdmin = role === 'admin' || localStorage.getItem('ub_admin_session') === 'true';
    const userHasTicket = isAdmin || tickets.some(
      (t) =>
        t.eventId === event.id ||
        (t.eventName && t.eventName.toLowerCase().trim() === (event.title || '').toLowerCase().trim()) ||
        (t.eventTitle && t.eventTitle.toLowerCase().trim() === (event.title || '').toLowerCase().trim())
    );

    if (!userHasTicket) {
      if (isEventExpired(event)) {
        setWelcomeMessage('This event has already passed. Tickets and food pre-orders are no longer available.');
        return;
      }
      setWelcomeMessage(`Ticket Required: Purchase a ticket for "${event.title}" first before pre-ordering food & drinks.`);
      setSelectedBuyingEvent(event);
      setActiveModal('buy-ticket');
      return;
    }

    setEventPreorderEvent(event);
    setActiveModal('event-food-preorder');
  };
  const [isAdminSecurityModalOpen, setIsAdminSecurityModalOpen] = useState<boolean>(false);
  const [pendingSecurityAuth, setPendingSecurityAuth] = useState<{
    pendingUser: UserProfile;
    targetEmail: string;
    walletBal: number;
    isAdmin: boolean;
  } | null>(null);
  const pendingSecurityAuthRef = useRef(pendingSecurityAuth);
  useEffect(() => {
    pendingSecurityAuthRef.current = pendingSecurityAuth;
  }, [pendingSecurityAuth]);

  const [stores, setStores] = useState<Store[]>(() => {
    try {
      const saved = localStorage.getItem('ub_local_stores');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  });
  const [events, setEvents] = useState<EventItem[]>(() => {
    try {
      const saved = localStorage.getItem('ub_local_events');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  });
  const [eventsLoaded, setEventsLoaded] = useState<boolean>(false);
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    try {
      const saved = localStorage.getItem('ub_user_tickets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [menuFood, setMenuFood] = useState<MenuItem[]>([]);
  const [menuAlcohol, setMenuAlcohol] = useState<MenuItem[]>([]);
  const [menuSoftDrinks, setMenuSoftDrinks] = useState<MenuItem[]>([]);
  // Transactions state loaded from localStorage
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>(() => {
    try {
      const raw = localStorage.getItem('ub_wallet_transactions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Custom Logo state, defaults to the crisp luxury gold/black emblem or saved user logo
  const [customLogoUrl, setCustomLogoUrl] = useState<string>(() => {
    const saved = localStorage.getItem('ub_custom_logo');
    if (saved) {
      return saved;
    }
    return '/universal-band-logo.jpg';
  });

  const updateCustomLogo = async (newLogoUrl: string) => {
    setCustomLogoUrl(newLogoUrl);
    try {
      localStorage.setItem('ub_custom_logo', newLogoUrl);
      await setDoc(doc(db, 'settings', 'branding'), {
        logoUrl: newLogoUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Could not persist logo to Firestore:', e);
    }
  };

  // Custom App Icon state (for PWA, favicon, mobile home screen, app launcher)
  const [customAppIconUrl, setCustomAppIconUrl] = useState<string>(() => {
    const saved = localStorage.getItem('ub_app_icon');
    if (saved) {
      return saved;
    }
    const savedLogo = localStorage.getItem('ub_custom_logo');
    if (savedLogo) {
      return savedLogo;
    }
    return '/universal-band-logo.jpg';
  });

  const updateCustomAppIcon = async (newIconUrl: string) => {
    setCustomAppIconUrl(newIconUrl);
    try {
      localStorage.setItem('ub_app_icon', newIconUrl);
      await setDoc(doc(db, 'settings', 'branding'), {
        appIconUrl: newIconUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Could not persist app icon to Firestore:', e);
    }
  };

  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'settings', 'branding'), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && data.logoUrl) {
            setCustomLogoUrl(data.logoUrl);
            localStorage.setItem('ub_custom_logo', data.logoUrl);
          }
          if (data && data.appIconUrl) {
            setCustomAppIconUrl(data.appIconUrl);
            localStorage.setItem('ub_app_icon', data.appIconUrl);
          }
        }
      }, (err) => {
        // quiet fallback
      });
      return () => unsub();
    } catch (err) {}
  }, []);

  // Synchronize browser tab favicon, manifest, and mobile touch icons with app icon
  useEffect(() => {
    const activeIcon = customAppIconUrl || customLogoUrl || '/icon.svg';
    if (activeIcon) {
      try {
        const iconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon'], link[rel='apple-touch-icon']");
        iconLinks.forEach((link) => {
          link.href = activeIcon;
        });
      } catch (e) {}
    }
  }, [customAppIconUrl, customLogoUrl]);

  // TymeBank PayShap Account ID / Cell Number & LIVE SMS Payment Confirmation Settings
  const [tymebankPayshapNumber, setTymebankPayshapNumber] = useState<string>(() => {
    return localStorage.getItem('tymebank_payshap_number') || '0821234567';
  });
  const [paymentBankMessage, setPaymentBankMessage] = useState<string>(() => {
    return localStorage.getItem('ub_payment_bank_message') || 'TymeBank';
  });
  const [paymentReferenceFormat, setPaymentReferenceFormat] = useState<string>(() => {
    return localStorage.getItem('ub_payment_reference_format') || 'UB-';
  });
  const [lastPaymentSmsText, setLastPaymentSmsText] = useState<string>(() => {
    return localStorage.getItem('ub_last_payment_sms_text') || '';
  });
  const [lastPaymentSmsSender, setLastPaymentSmsSender] = useState<string>(() => {
    return localStorage.getItem('ub_last_payment_sms_sender') || '';
  });
  const [lastPaymentSmsAt, setLastPaymentSmsAt] = useState<string>(() => {
    return localStorage.getItem('ub_last_payment_sms_at') || '';
  });
  const [lastPaymentAmount, setLastPaymentAmount] = useState<string>(() => {
    return localStorage.getItem('ub_last_payment_amount') || '';
  });
  const [lastConfirmedReference, setLastConfirmedReference] = useState<string>(() => {
    return localStorage.getItem('ub_last_confirmed_reference') || '';
  });
  const [smsPermissionActive, setSmsPermissionActive] = useState<boolean>(() => {
    return localStorage.getItem('tymebank_sms_permission') === 'true';
  });
  const [activePaymentAlarm, setActivePaymentAlarm] = useState<ActivePaymentAlarm | null>(null);

  const paymentBankMessageRef = useRef<string>(paymentBankMessage);
  useEffect(() => {
    paymentBankMessageRef.current = paymentBankMessage;
  }, [paymentBankMessage]);

  const paymentReferenceFormatRef = useRef<string>(paymentReferenceFormat);
  useEffect(() => {
    paymentReferenceFormatRef.current = paymentReferenceFormat;
  }, [paymentReferenceFormat]);

  const [newOrderSound, setNewOrderSound] = useState<NewOrderSoundConfig>(() => {
    try {
      const saved = localStorage.getItem('ub_new_order_sound');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_NEW_ORDER_SOUND, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_NEW_ORDER_SOUND;
  });

  const [buyTicketAlarm, setBuyTicketAlarm] = useState<BuyTicketAlarmConfig>(() => {
    try {
      const saved = localStorage.getItem('ub_buy_ticket_alarm');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            ...DEFAULT_NEW_ORDER_SOUND,
            enabled: true,
            ...parsed,
          };
        }
      }
    } catch {}
    return {
      ...DEFAULT_NEW_ORDER_SOUND,
      enabled: true,
    };
  });
  const buyTicketAlarmRef = useRef<BuyTicketAlarmConfig>(buyTicketAlarm);
  useEffect(() => {
    buyTicketAlarmRef.current = buyTicketAlarm;
  }, [buyTicketAlarm]);

  const [activeBuyTicketAlarm, setActiveBuyTicketAlarm] = useState<ActiveBuyTicketAlarm | null>(null);
  const buyTicketAlarmTriggeredIdsRef = useRef<Set<string>>(new Set());

  const dismissBuyTicketAlarm = () => {
    stopLoopingPaymentAlarm();
    setActiveBuyTicketAlarm(null);
  };

  const updateBuyTicketAlarm = async (config: BuyTicketAlarmConfig) => {
    const normalized: BuyTicketAlarmConfig = {
      ...DEFAULT_NEW_ORDER_SOUND,
      ...config,
      enabled: config.enabled !== false,
    };
    setBuyTicketAlarm(normalized);
    buyTicketAlarmRef.current = normalized;
    try {
      localStorage.setItem('ub_buy_ticket_alarm', JSON.stringify(normalized));
    } catch {}
    try {
      const firestoreAlarm: BuyTicketAlarmConfig =
        normalized.customDataUrl && normalized.customDataUrl.length > 700_000
          ? {
              mode: normalized.mode,
              presetId: normalized.presetId,
              customName: normalized.customName,
              volume: normalized.volume,
              enabled: normalized.enabled,
            }
          : normalized;
      await setDoc(
        doc(db, 'settings', 'buyTicketAlarm'),
        {
          ...cleanForFirestore(firestoreAlarm),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Could not persist Buy Ticket Alarm settings to Firestore:', e);
    }
  };

  const [notificationBanner, setNotificationBanner] = useState<AppNotificationBanner | null>(null);
  const dismissNotificationBanner = () => setNotificationBanner(null);

  const [supportRingEnabled, setSupportRingEnabledState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ub_support_ring_enabled');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const supportRingEnabledRef = useRef<boolean>(supportRingEnabled);
  useEffect(() => {
    supportRingEnabledRef.current = supportRingEnabled;
  }, [supportRingEnabled]);

  const setSupportRingEnabled = (enabled: boolean) => {
    setSupportRingEnabledState(enabled);
    try {
      localStorage.setItem('ub_support_ring_enabled', enabled ? 'true' : 'false');
    } catch {}
    void setDoc(
      doc(db, 'settings', 'payshap'),
      { supportRingEnabled: enabled, updatedAt: new Date().toISOString() },
      { merge: true }
    ).catch(() => {});
  };

  const [isSupportModalOpen, setIsSupportModalOpen] = useState<boolean>(false);
  const [activeAdminSupportChatId, setActiveAdminSupportChatId] = useState<string | null>(null);

  const [supportChats, setSupportChats] = useState<SupportChat[]>(() => {
    try {
      const saved = localStorage.getItem('ub_support_chats');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const newOrderSoundRef = useRef<NewOrderSoundConfig>(newOrderSound);
  useEffect(() => {
    newOrderSoundRef.current = newOrderSound;
  }, [newOrderSound]);

  const currentUserRef = useRef<UserProfile>(INITIAL_USER);

  const isAdminSessionActive = () => {
    const cu = currentUserRef.current;
    const roleLower = (cu?.role || '').toLowerCase();
    return Boolean(
      roleLower === 'admin' ||
        isAuthorizedAdminEmail(cu?.email) ||
        localStorage.getItem('ub_admin_session') === 'true'
    );
  };

  const prevTicketMapRef = useRef<Map<string, Ticket>>(new Map());
  const ticketsSnapshotInitializedRef = useRef<boolean>(false);
  const notifiedTicketEventsRef = useRef<Set<string>>(new Set());

  const triggerAdminBuyTicketAlarmIfEnabled = (ticket: Ticket) => {
    const has5LocksPassed =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('ub_admin_5locks_passed') === 'true' &&
      localStorage.getItem('ub_admin_session') === 'true';
    if (!isAdminSessionActive() || !has5LocksPassed) return;

    const cfg = buyTicketAlarmRef.current;
    if (!cfg || !cfg.enabled) return;

    if (buyTicketAlarmTriggeredIdsRef.current.has(ticket.id)) return;
    buyTicketAlarmTriggeredIdsRef.current.add(ticket.id);

    const custName = ticket.attendeeName || ticket.customerName || 'Customer';
    const tierLabel = ticket.ticketTier || ticket.tierName || 'General';
    const eventTitle = ticket.eventTitle || ticket.eventName || 'Event';

    setActiveBuyTicketAlarm({
      id: `ticket_alarm_${ticket.id}_${Date.now()}`,
      ticketId: ticket.id,
      customer: custName,
      eventTitle,
      tier: tierLabel,
      price: ticket.price || '',
      timestamp: new Date().toISOString(),
    });
    startLoopingPaymentAlarm(cfg);
    void triggerBackgroundNotification(
      'New Ticket Purchased',
      `${custName} bought ${tierLabel} (${eventTitle})`,
      `ticket-alarm-${ticket.id}`
    );
  };

  const notifyTicketLifecycleEvent = (ticket: Ticket, kind: 'waiting' | 'paid') => {
    const dedupeKey = `${kind}:${ticket.id}`;
    if (notifiedTicketEventsRef.current.has(dedupeKey)) return;
    notifiedTicketEventsRef.current.add(dedupeKey);

    const custName = ticket.attendeeName || ticket.customerName || 'Customer';
    const tierLabel = ticket.ticketTier || ticket.tierName || 'General';
    const has5LocksPassed =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('ub_admin_5locks_passed') === 'true' &&
      localStorage.getItem('ub_admin_session') === 'true';
    const adminActive = isAdminSessionActive() && has5LocksPassed;
    const cu = currentUserRef.current;
    const cuPhone = normalizePhoneDigits(cu?.phone);
    const tPhone = normalizePhoneDigits(ticket.attendeePhone || ticket.customerPhone);
    const cuQr = resolveCustomerQrId(cu?.id, cu?.customerQrId);
    const customerOwnsTicket = Boolean(
      (cu?.id && cu.id !== 'guest_user' && (ticket.userId === cu.id || ticket.user_id === cu.id)) ||
        (cuPhone && tPhone && cuPhone === tPhone) ||
        (cuQr && ticket.customerQrId && ticket.customerQrId === cuQr)
    );

    if (kind === 'waiting') {
      if (adminActive) {
        const msg = `New Ticket - ${custName} - ${tierLabel} - Waiting for Payment`;
        triggerAdminBuyTicketAlarmIfEnabled(ticket);
        if (!buyTicketAlarmRef.current?.enabled) {
          playNewOrderSound(newOrderSoundRef.current);
          void triggerBackgroundNotification('New Ticket Waiting for Payment', msg, `waiting-${ticket.id}`);
        }
        setNotificationBanner({
          id: `waiting_${ticket.id}_${Date.now()}`,
          role: 'admin',
          title: 'New Ticket Order',
          message: msg,
          variant: 'waiting',
          ticketId: ticket.id,
        });
      }
      return;
    }

    if (kind === 'paid') {
      if (adminActive) {
        const msg = `Payment Received - ${custName} - Ticket PAID ✅`;
        triggerAdminBuyTicketAlarmIfEnabled(ticket);
        if (!buyTicketAlarmRef.current?.enabled) {
          playTicketPaidSuccessSound();
        }
        void triggerBackgroundNotification('Ticket Payment Received', msg, `paid-admin-${ticket.id}`);
        setNotificationBanner({
          id: `paid_admin_${ticket.id}_${Date.now()}`,
          role: 'admin',
          title: 'Ticket Purchase Confirmed',
          message: msg,
          variant: 'paid',
          ticketId: ticket.id,
        });
      } else if (customerOwnsTicket) {
        const msg = 'Ticket Confirmed - PAID ✅';
        playSuccessChime();
        void triggerBackgroundNotification('Ticket Confirmed', `${msg} (${ticket.eventTitle})`, `paid-cust-${ticket.id}`);
        setNotificationBanner({
          id: `paid_cust_${ticket.id}_${Date.now()}`,
          role: 'customer',
          title: ticket.eventTitle || 'Universal Band Pass',
          message: msg,
          variant: 'paid',
          ticketId: ticket.id,
        });
      }
    }
  };

  const [tymebankSmsLogs, setTymebankSmsLogs] = useState<{ id: string; text: string; time: string; status: string }[]>(() => {
    try {
      const saved = localStorage.getItem('tymebank_sms_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [walletTopups, setWalletTopups] = useState<
    {
      id: string;
      userId: string;
      userName: string;
      userPhone?: string;
      amount: number;
      payshapId: string;
      payshapReference: string;
      status: 'PENDING_PAYMENT' | 'CREDITED';
      createdAt: string;
      creditedAt?: string;
      verifiedSmsText?: string;
    }[]
  >(() => {
    try {
      const saved = localStorage.getItem('ub_wallet_topups');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const updateTymebankPayshapNumber = async (num: string) => {
    const clean = num.trim();
    setTymebankPayshapNumber(clean);
    try {
      localStorage.setItem('tymebank_payshap_number', clean);
    } catch {}
    try {
      await setDoc(doc(db, 'settings', 'payshap'), {
        tymebankPayshapNumber: clean,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Could not persist PayShap number to Firestore:', e);
    }
  };

  const updatePaymentConfirmationSettings = async (params: {
    bankMessage: string;
    referenceFormat: string;
  }) => {
    const cleanBank = params.bankMessage.trim() || 'TymeBank';
    const cleanRef = params.referenceFormat.trim() || 'UB-';
    setPaymentBankMessage(cleanBank);
    setPaymentReferenceFormat(cleanRef);
    paymentBankMessageRef.current = cleanBank;
    paymentReferenceFormatRef.current = cleanRef;
    try {
      localStorage.setItem('ub_payment_bank_message', cleanBank);
      localStorage.setItem('ub_payment_reference_format', cleanRef);
    } catch {}
    try {
      await setDoc(
        doc(db, 'settings', 'payshap'),
        {
          paymentBankMessage: cleanBank,
          paymentReferenceFormat: cleanRef,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Could not persist Payment Confirmation settings to Firestore:', e);
    }
    if (Capacitor.isNativePlatform()) {
      void configureBackgroundSmsConfirmation({
        enabled: true,
        isAdminDevice: isAdminSessionActive(),
        bankMessage: cleanBank,
        referenceFormat: cleanRef,
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
        apiKey: firebaseConfig.apiKey,
        refreshToken: (auth.currentUser as any)?.refreshToken || '',
      });
    }
  };

  const recordLivePaymentTelemetry = (params: {
    smsText: string;
    sender?: string;
    amount?: string;
    confirmedReference?: string;
  }) => {
    const cleanText = String(params.smsText || '').trim();
    const cleanSender = String(params.sender || '').trim();
    const cleanAmount = String(params.amount || '').trim();
    const nowIso = new Date().toISOString();
    const cleanRef = params.confirmedReference ? params.confirmedReference.trim() : '';

    if (cleanText) {
      setLastPaymentSmsText(cleanText);
      setLastPaymentSmsSender(cleanSender);
      setLastPaymentSmsAt(nowIso);
      try {
        localStorage.setItem('ub_last_payment_sms_text', cleanText);
        localStorage.setItem('ub_last_payment_sms_sender', cleanSender);
        localStorage.setItem('ub_last_payment_sms_at', nowIso);
      } catch {}
    }

    if (cleanAmount) {
      setLastPaymentAmount(cleanAmount);
      try {
        localStorage.setItem('ub_last_payment_amount', cleanAmount);
      } catch {}
    }

    if (cleanRef) {
      setLastConfirmedReference(cleanRef);
      try {
        localStorage.setItem('ub_last_confirmed_reference', cleanRef);
      } catch {}
    }

    const payload: Record<string, any> = {
      updatedAt: nowIso,
    };
    if (cleanText) {
      payload.lastPaymentSmsText = cleanText;
      payload.lastPaymentSmsSender = cleanSender;
      payload.lastPaymentSmsAt = nowIso;
    }
    if (cleanAmount) {
      payload.lastPaymentAmount = cleanAmount;
    }
    if (cleanRef) {
      payload.lastConfirmedReference = cleanRef;
    }

    if (Object.keys(payload).length > 1) {
      void setDoc(doc(db, 'settings', 'payshap'), payload, { merge: true }).catch(() => {});
    }
  };

  const requestAdminSmsPermissionPopup = async (): Promise<boolean> => {
    const res = await ensureSmsPermission();
    setSmsPermissionActive(Boolean(res.granted));
    if (Capacitor.isNativePlatform()) {
      void ensureNotificationsPermission().catch(() => {});
    }
    if (res.granted && Capacitor.isNativePlatform()) {
      void configureBackgroundSmsConfirmation({
        enabled: true,
        isAdminDevice: isAdminSessionActive(),
        bankMessage: paymentBankMessageRef.current || 'TymeBank',
        referenceFormat: paymentReferenceFormatRef.current || 'UB-',
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
        apiKey: firebaseConfig.apiKey,
        refreshToken: (auth.currentUser as any)?.refreshToken || '',
      });
    }
    return Boolean(res.granted);
  };

  const updateNewOrderSound = async (config: NewOrderSoundConfig) => {
    const normalized: NewOrderSoundConfig = {
      ...DEFAULT_NEW_ORDER_SOUND,
      ...config,
    };
    setNewOrderSound(normalized);
    newOrderSoundRef.current = normalized;
    try {
      localStorage.setItem('ub_new_order_sound', JSON.stringify(normalized));
    } catch {}
    if (Capacitor.isNativePlatform()) {
      void configureNativePaymentAlarm({
        mode: normalized.mode,
        presetId: normalized.presetId,
        volume: normalized.volume ?? 1,
        customDataUrl: normalized.customDataUrl,
      });
    }
    try {
      // Guard Firestore document size (<700KB for customDataUrl; full audio remains in localStorage)
      const firestoreSound: NewOrderSoundConfig =
        normalized.customDataUrl && normalized.customDataUrl.length > 700_000
          ? {
              mode: normalized.mode,
              presetId: normalized.presetId,
              customName: normalized.customName,
              volume: normalized.volume,
            }
          : normalized;
      await setDoc(
        doc(db, 'settings', 'payshap'),
        {
          newOrderSound: cleanForFirestore(firestoreSound),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Could not persist New Order Sound to Firestore:', e);
    }
  };

  const dismissPaymentAlarm = async () => {
    stopLoopingPaymentAlarm();
    setActivePaymentAlarm(null);
    if (Capacitor.isNativePlatform()) {
      await stopNativePaymentAlarm();
    }
    try {
      await setDoc(
        doc(db, 'settings', 'payshap'),
        { alarmActive: false, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch {}
  };

  const testPaymentAlarm = async (overrideSound?: NewOrderSoundConfig) => {
    const soundCfg = overrideSound || newOrderSoundRef.current;
    playNewOrderSound(soundCfg);
    if (Capacitor.isNativePlatform()) {
      await configureNativePaymentAlarm({
        mode: soundCfg.mode,
        presetId: soundCfg.presetId,
        volume: soundCfg.volume ?? 1,
        customDataUrl: soundCfg.customDataUrl,
      });
      await triggerNativeTestAlarm({ volume: soundCfg.volume ?? 1 });
    }
  };

  const clearTymebankSmsLogs = () => {
    setTymebankSmsLogs([]);
    try {
      localStorage.removeItem('tymebank_sms_logs');
    } catch {}
  };

  const submitPayshapTopUpRequest = async (amount: number, payshapReference: string) => {
    const nowIso = new Date().toISOString();
    const req = {
      id: `topup_${Date.now()}`,
      userId: currentUser?.id || 'guest_user',
      userName: currentUser?.fullName || currentUser?.name || 'Customer',
      userPhone: currentUser?.phone || '',
      amount: Math.round(amount * 100) / 100,
      payshapId: tymebankPayshapNumber || '0821234567',
      payshapReference: payshapReference.trim(),
      status: 'PENDING_PAYMENT' as const,
      createdAt: nowIso,
    };

    setWalletTopups((prev) => {
      const updated = [req, ...prev.slice(0, 49)];
      try {
        localStorage.setItem('ub_wallet_topups', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    try {
      await setDoc(doc(db, 'wallet_topups', req.id), cleanForFirestore(req), { merge: true });
    } catch (e) {
      console.warn('Could not persist wallet top-up request to Firestore:', e);
    }

    return req;
  };

  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'settings', 'payshap'), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && data.tymebankPayshapNumber) {
            setTymebankPayshapNumber(data.tymebankPayshapNumber);
            try {
              localStorage.setItem('tymebank_payshap_number', data.tymebankPayshapNumber);
            } catch {}
          }
          if (data && typeof data.paymentBankMessage === 'string' && data.paymentBankMessage.trim()) {
            const cleanBank = data.paymentBankMessage.trim();
            setPaymentBankMessage(cleanBank);
            paymentBankMessageRef.current = cleanBank;
            try {
              localStorage.setItem('ub_payment_bank_message', cleanBank);
            } catch {}
          }
          if (data && typeof data.paymentReferenceFormat === 'string' && data.paymentReferenceFormat.trim()) {
            const cleanRefFmt = data.paymentReferenceFormat.trim();
            setPaymentReferenceFormat(cleanRefFmt);
            paymentReferenceFormatRef.current = cleanRefFmt;
            try {
              localStorage.setItem('ub_payment_reference_format', cleanRefFmt);
            } catch {}
          }
          if (data && typeof data.lastPaymentSmsText === 'string' && data.lastPaymentSmsText.trim()) {
            setLastPaymentSmsText(data.lastPaymentSmsText);
            try {
              localStorage.setItem('ub_last_payment_sms_text', data.lastPaymentSmsText);
            } catch {}
          }
          if (data && typeof data.lastPaymentSmsSender === 'string') {
            setLastPaymentSmsSender(data.lastPaymentSmsSender);
            try {
              localStorage.setItem('ub_last_payment_sms_sender', data.lastPaymentSmsSender);
            } catch {}
          }
          if (data && typeof data.lastPaymentSmsAt === 'string') {
            setLastPaymentSmsAt(data.lastPaymentSmsAt);
            try {
              localStorage.setItem('ub_last_payment_sms_at', data.lastPaymentSmsAt);
            } catch {}
          }
          if (data && typeof data.lastPaymentAmount === 'string' && data.lastPaymentAmount.trim()) {
            setLastPaymentAmount(data.lastPaymentAmount);
            try {
              localStorage.setItem('ub_last_payment_amount', data.lastPaymentAmount);
            } catch {}
          }
          if (data && typeof data.lastConfirmedReference === 'string' && data.lastConfirmedReference.trim()) {
            setLastConfirmedReference(data.lastConfirmedReference);
            try {
              localStorage.setItem('ub_last_confirmed_reference', data.lastConfirmedReference);
            } catch {}
          }
          if (data && data.newOrderSound && typeof data.newOrderSound === 'object') {
            setNewOrderSound((prev) => {
              const merged: NewOrderSoundConfig = {
                ...DEFAULT_NEW_ORDER_SOUND,
                ...data.newOrderSound,
                // Preserve local large customDataUrl if Firestore omitted oversized payload
                customDataUrl: data.newOrderSound.customDataUrl || prev.customDataUrl,
              };
              try {
                localStorage.setItem('ub_new_order_sound', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
          if (typeof data.supportRingEnabled === 'boolean') {
            setSupportRingEnabledState(data.supportRingEnabled);
            try {
              localStorage.setItem('ub_support_ring_enabled', data.supportRingEnabled ? 'true' : 'false');
            } catch {}
          }
        }
      }, () => {});
      return () => unsub();
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        doc(db, 'settings', 'buyTicketAlarm'),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setBuyTicketAlarm((prev) => {
              const merged: BuyTicketAlarmConfig = {
                ...DEFAULT_NEW_ORDER_SOUND,
                enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
                ...data,
                customDataUrl: data.customDataUrl || prev.customDataUrl,
              };
              try {
                localStorage.setItem('ub_buy_ticket_alarm', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        },
        () => {}
      );
      return () => unsub();
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'wallet_topups'), (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        if (list.length > 0) {
          setWalletTopups(list);
          try {
            localStorage.setItem('ub_wallet_topups', JSON.stringify(list));
          } catch {}
        }
      }, () => {});
      return () => unsub();
    } catch {}
  }, []);

  // Real-time Customer Support Chats Listener & Ringtone Notification
  const supportChatsInitRef = useRef<boolean>(false);
  const alertedSupportMsgIdsRef = useRef<Set<string>>(new Set());

  const getActiveCustomerSupportChatId = (cu?: UserProfile) => {
    const userObj = cu || currentUserRef.current;
    if (userObj?.id && userObj.id !== 'guest_user') {
      return `chat_${userObj.id}`;
    }
    try {
      let guestChatId = localStorage.getItem('ub_guest_support_chat_id');
      if (!guestChatId) {
        guestChatId = `chat_guest_${Date.now()}`;
        localStorage.setItem('ub_guest_support_chat_id', guestChatId);
      }
      return guestChatId;
    } catch {
      return 'chat_guest_default';
    }
  };

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        collection(db, 'supportChats'),
        (snapshot) => {
          const list: SupportChat[] = snapshot.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .sort((a, b) => {
              const unreadA = (a.unreadAdminCount || 0) > 0 ? 1 : 0;
              const unreadB = (b.unreadAdminCount || 0) > 0 ? 1 : 0;
              if (unreadA !== unreadB) return unreadB - unreadA;
              return String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''));
            });

          setSupportChats(list);
          try {
            localStorage.setItem('ub_support_chats', JSON.stringify(list));
          } catch {}

          const adminActive = isAdminSessionActive();
          const myChatId = getActiveCustomerSupportChatId();

          if (!supportChatsInitRef.current) {
            list.forEach((chat) => {
              const lastMsg = chat.messages?.[chat.messages.length - 1];
              if (lastMsg?.id) alertedSupportMsgIdsRef.current.add(lastMsg.id);
            });
            supportChatsInitRef.current = true;
            return;
          }

          list.forEach((chat) => {
            const lastMsg = chat.messages?.[chat.messages.length - 1];
            if (!lastMsg?.id || alertedSupportMsgIdsRef.current.has(lastMsg.id)) return;
            alertedSupportMsgIdsRef.current.add(lastMsg.id);

            if (adminActive && lastMsg.senderRole === 'customer' && (chat.unreadAdminCount || 0) > 0) {
              if (supportRingEnabledRef.current) {
                playNewOrderSound(newOrderSoundRef.current);
              } else {
                try {
                  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                    navigator.vibrate([300, 120, 300]);
                  }
                } catch {}
              }
              const previewText = lastMsg.text || (lastMsg.imageUrl ? 'Sent a payment screenshot' : 'New support message');
              void triggerBackgroundNotification(
                `Support: ${chat.customerName}`,
                previewText,
                `support-admin-${lastMsg.id}`
              );
              setNotificationBanner({
                id: `support_admin_${lastMsg.id}`,
                role: 'admin',
                title: `Customer Support - ${chat.customerName}`,
                message: previewText,
                variant: 'waiting',
              });
            } else if (!adminActive && chat.id === myChatId && lastMsg.senderRole === 'admin' && (chat.unreadCustomerCount || 0) > 0) {
              playSuccessChime();
              void triggerBackgroundNotification(
                'Universal Band Support',
                lastMsg.text || 'Admin replied to your support message',
                `support-cust-${lastMsg.id}`
              );
              setNotificationBanner({
                id: `support_cust_${lastMsg.id}`,
                role: 'customer',
                title: 'Support Reply',
                message: lastMsg.text || 'Admin sent you a reply',
                variant: 'paid',
              });
            }
          });
        },
        () => {}
      );
      return () => unsub();
    } catch {}
  }, []);

  // Universal Band Mall Carts State (storeId -> CartItem[])
  const [carts, setCarts] = useState<Record<string, CartItem[]>>(() => {
    try {
      const saved = localStorage.getItem('ub_mall_carts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const sanitized: Record<string, CartItem[]> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (Array.isArray(v)) sanitized[k] = v;
          }
          return sanitized;
        }
      }
    } catch (e) {}
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem('ub_mall_carts', JSON.stringify(carts));
    } catch (e) {}
  }, [carts]);

  // Universal Band Mall Orders State
  const [mallOrders, setMallOrders] = useState<MallOrder[]>(() => {
    try {
      const saved = localStorage.getItem('ub_mall_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Store Messages State (e.g. TODAY collection order alerts)
  const [storeMessages, setStoreMessages] = useState<StoreMessage[]>(() => {
    try {
      const saved = localStorage.getItem('ub_store_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Store Workers State
  const [storeWorkers, setStoreWorkers] = useState<StoreWorker[]>(() => {
    try {
      const saved = localStorage.getItem('ub_store_workers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Store Phone Presence State (storeId -> StorePresence)
  const [storePresence, setStorePresence] = useState<Record<string, StorePresence>>(() => {
    try {
      const saved = localStorage.getItem('ub_store_presence');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return {};
  });

  const [activePickupOrder, setActivePickupOrder] = useState<MallOrder | null>(null);

  // Real-time Firestore sync for mall_orders, store_messages, store_workers, store_presence
  useEffect(() => {
    let unsubOrders: (() => void) | undefined;
    let unsubMessages: (() => void) | undefined;
    let unsubWorkers: (() => void) | undefined;
    let unsubPresence: (() => void) | undefined;

    try {
      unsubOrders = onSnapshot(collection(db, 'mall_orders'), (snapshot) => {
        const list: MallOrder[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        if (list.length > 0) {
          list.sort((a, b) => new Date(b.paidAt || 0).getTime() - new Date(a.paidAt || 0).getTime());
          setMallOrders(list);
          try {
            localStorage.setItem('ub_mall_orders', JSON.stringify(list));
          } catch (e) {}
        }
      }, (err) => {
        console.warn('Notice: Firestore mall_orders offline/fallback listener:', err);
      });

      unsubMessages = onSnapshot(collection(db, 'store_messages'), (snapshot) => {
        const list: StoreMessage[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        if (list.length > 0) {
          list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          setStoreMessages(list);
          try {
            localStorage.setItem('ub_store_messages', JSON.stringify(list));
          } catch (e) {}
        }
      }, (err) => {
        console.warn('Notice: Firestore store_messages offline/fallback listener:', err);
      });

      unsubWorkers = onSnapshot(collection(db, 'store_workers'), (snapshot) => {
        const list: StoreWorker[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        if (list.length > 0) {
          setStoreWorkers(list);
          try {
            localStorage.setItem('ub_store_workers', JSON.stringify(list));
          } catch (e) {}
        }
      }, (err) => {
        console.warn('Notice: Firestore store_workers listener:', err);
      });

      unsubPresence = onSnapshot(collection(db, 'store_presence'), (snapshot) => {
        const map: Record<string, StorePresence> = {};
        snapshot.forEach((d) => {
          map[d.id] = { storeId: d.id, ...(d.data() as any) };
        });
        if (Object.keys(map).length > 0) {
          setStorePresence((prev) => ({ ...prev, ...map }));
          try {
            localStorage.setItem('ub_store_presence', JSON.stringify(map));
          } catch (e) {}
        }
      }, (err) => {
        console.warn('Notice: Firestore store_presence listener:', err);
      });
    } catch (e) {
      console.warn('Notice setting up mall listeners:', e);
    }

    return () => {
      if (unsubOrders) unsubOrders();
      if (unsubMessages) unsubMessages();
      if (unsubWorkers) unsubWorkers();
      if (unsubPresence) unsubPresence();
    };
  }, []);

  // Pending Checkout Target (for guest buy flow: returns back to action once registered)
  const [pendingCheckoutTarget, setPendingCheckoutTarget] = useState<any | null>(null);

  // Total items in cart across all stores
  const totalCartCount = useMemo(() => {
    if (!carts || typeof carts !== 'object') return 0;
    return Object.values(carts).reduce((total, storeItems) => {
      if (!Array.isArray(storeItems)) return total;
      return total + storeItems.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0);
    }, 0);
  }, [carts]);

  // Wallet balance is synchronized with localStorage 'wallet_balance'
  // Wallet balance is synchronized with localStorage 'wallet_balance'
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    // CRITICAL RULE 2: Admin session must NOT survive app exit, restart, or phone restart!
    const locksPassed = typeof window !== 'undefined' && sessionStorage.getItem('ub_admin_5locks_passed') === 'true';
    if (!locksPassed && typeof window !== 'undefined') {
      localStorage.removeItem('ub_admin_session');
    }

    const isRegistered = localStorage.getItem('ub_has_registered') === 'true';
    const rawBal = localStorage.getItem('wallet_balance');
    const storedBal = rawBal !== null && !isNaN(Number(rawBal)) && Number(rawBal) >= 0 ? Number(rawBal) : 0;
    if (isRegistered) {
      try {
        const saved = localStorage.getItem('ub_user_profile');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.email) {
            const clean = (parsed.email || '').toLowerCase().trim();
            const isAdmin =
              clean === 'tetelophokwane98@gmail.com' ||
              clean === 'admin@universalband.co.za' ||
              clean === 'admin@ub.co.za' ||
              parsed.role === 'Admin' ||
              parsed.role === 'admin' ||
              isAuthorizedAdminEmail(clean);

            // If account is admin, it MUST be logged out on fresh app open/restart.
            // Admin must log in and unlock all 5 logs every time from scratch.
            if (isAdmin && !locksPassed) {
              localStorage.removeItem('ub_admin_session');
              localStorage.removeItem('ub_user_profile');
              localStorage.removeItem('ub_has_registered');
              sessionStorage.removeItem('ub_admin_5locks_passed');
              return {
                id: 'guest_user',
                name: 'New User',
                fullName: 'New User',
                email: '',
                phone: '',
                role: 'Customer',
                assignedStoreId: '',
                assignedStoreName: '',
                walletBalance: 0,
                isRegistered: false,
              };
            }

            const fallbackName = clean.split('@')[0];
            const resolvedName =
              parsed.name && parsed.name !== 'New User'
                ? parsed.name
                : (parsed.fullName && parsed.fullName !== 'New User' ? parsed.fullName : fallbackName);

            const effectiveBal =
              typeof parsed.walletBalance === 'number' && Number.isFinite(parsed.walletBalance)
                ? parsed.walletBalance
                : storedBal;

            const resolvedQrId = resolveCustomerQrId(parsed.id, parsed.customerQrId);
            const hydratedProfile = {
              ...parsed,
              name: resolvedName,
              fullName: parsed.fullName && parsed.fullName !== 'New User' ? parsed.fullName : resolvedName,
              role: parsed.role || 'Customer',
              walletBalance: effectiveBal,
              customerQrId: resolvedQrId || undefined,
              isRegistered: true,
            };
            return hydratedProfile;
          }
        }
      } catch (e) {}
    }

    // Default Customer / Guest State
    return {
      id: 'guest_user',
      name: 'New User',
      fullName: 'New User',
      email: '',
      phone: '',
      role: 'Customer',
      assignedStoreId: '',
      assignedStoreName: '',
      walletBalance: 0,
      isRegistered: false,
    };
  });

  const [pendingAdminAuthUser, setPendingAdminAuthUser] = useState<UserProfile | null>(null);

  // Clear admin session on app exit, close, kill, or restart (Strict Rule 2)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const clearAdminSession = () => {
        localStorage.removeItem('ub_admin_session');
        localStorage.removeItem('ub_admin_email');
        sessionStorage.removeItem('ub_admin_5locks_passed');
        sessionStorage.removeItem('ub_app_active');
        const profileRaw = localStorage.getItem('ub_user_profile');
        if (profileRaw) {
          try {
            const p = JSON.parse(profileRaw);
            if (p?.role === 'Admin' || isAuthorizedAdminEmail(p?.email)) {
              localStorage.removeItem('ub_user_profile');
              localStorage.removeItem('ub_has_registered');
            }
          } catch {}
        }
      };

      window.addEventListener('beforeunload', clearAdminSession);
      window.addEventListener('pagehide', clearAdminSession);
      return () => {
        window.removeEventListener('beforeunload', clearAdminSession);
        window.removeEventListener('pagehide', clearAdminSession);
      };
    }
  }, []);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [pendingVerification, setPendingVerification] = useState<{ email: string; fullName?: string } | null>(() => {
    try {
      const raw = localStorage.getItem('ub_pending_verification');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  });

  const handleSetPendingVerification = (val: { email: string; fullName?: string } | null) => {
    setPendingVerification(val);
    if (val) {
      try {
        localStorage.setItem('ub_pending_verification', JSON.stringify(val));
      } catch (e) {}
    } else {
      try {
        localStorage.removeItem('ub_pending_verification');
      } catch (e) {}
    }
  };

  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [resetPasswordCode, setResetPasswordCode] = useState<string | null>(null);

  const routeHistoryRef = useRef<string[]>(['/']);
  const lastBackPressTimeRef = useRef<number>(0);

  const cancelAdminLogin = async () => {
    localStorage.removeItem('ub_admin_session');
    localStorage.removeItem('ub_admin_email');
    sessionStorage.removeItem('ub_admin_5locks_passed');
    sessionStorage.removeItem('ub_app_active');
    setPendingAdminAuthUser(null);
    setIsAdminSecurityModalOpen(false);
    if (auth?.currentUser) {
      await signOut(auth).catch(() => {});
    }
    setFirebaseUser(null);
    setCurrentUser({
      id: 'guest_user',
      name: 'New User',
      fullName: 'New User',
      email: '',
      phone: '',
      role: 'Customer',
      assignedStoreId: '',
      assignedStoreName: '',
      walletBalance: 0,
      isRegistered: false,
    });
    setCurrentRoute('/login');
  };

  const terminateAdminSession = async () => {
    localStorage.removeItem('ub_admin_session');
    localStorage.removeItem('ub_admin_email');
    sessionStorage.removeItem('ub_admin_5locks_passed');
    sessionStorage.removeItem('ub_app_active');
    setPendingAdminAuthUser(null);
    setIsAdminSecurityModalOpen(false);
    const profileRaw = localStorage.getItem('ub_user_profile');
    if (profileRaw) {
      try {
        const p = JSON.parse(profileRaw);
        if (p?.role === 'Admin' || isAuthorizedAdminEmail(p?.email)) {
          localStorage.removeItem('ub_user_profile');
          localStorage.removeItem('ub_has_registered');
        }
      } catch {}
    }
    if (auth?.currentUser) {
      await signOut(auth).catch(() => {});
    }
    setFirebaseUser(null);
    setCurrentUser({
      id: 'guest_user',
      name: 'New User',
      fullName: 'New User',
      email: '',
      phone: '',
      role: 'Customer',
      assignedStoreId: '',
      assignedStoreName: '',
      walletBalance: 0,
      isRegistered: false,
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBackPress = () => {
      // 1. If admin security modal is open, back press cancels admin login and returns to login
      if (isAdminSecurityModalOpen) {
        void cancelAdminLogin();
        return;
      }

      // 2. If inside admin-console modal, back press exits admin console and logs out admin account
      if (activeModal === 'admin-console') {
        setActiveModal(null);
        void terminateAdminSession();
        setCurrentRoute('/login');
        return;
      }

      if (activeModal) {
        setActiveModal(null);
        return;
      }

      const isHome = currentRoute === '/' || currentRoute === '/home' || currentRoute === '/stores' || currentRoute === '/discovery';
      if (!isHome) {
        if (currentRoute.startsWith('/admin')) {
          void terminateAdminSession();
          setCurrentRoute('/login');
          return;
        }

        if (routeHistoryRef.current.length > 1) {
          routeHistoryRef.current.pop();
          const prev = routeHistoryRef.current[routeHistoryRef.current.length - 1] || '/';
          setCurrentRoute(prev);
        } else {
          setCurrentRoute('/');
          setSelectedStoreId(null);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        void terminateAdminSession();
        try {
          CapacitorApp.exitApp();
        } catch {
          try {
            (navigator as any).app?.exitApp?.();
          } catch {
            window.close();
          }
        }
      } else {
        lastBackPressTimeRef.current = now;
        setWelcomeMessage('Press back again to exit');
        setTimeout(() => setWelcomeMessage(null), 2000);
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleBackPress();
    };
    window.addEventListener('popstate', handlePopState);

    let capacitorListener: any = null;
    try {
      CapacitorApp.addListener('backButton', () => {
        handleBackPress();
      }).then((listener) => {
        capacitorListener = listener;
      });
    } catch {}

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (capacitorListener && typeof capacitorListener.remove === 'function') {
        capacitorListener.remove();
      }
    };
  }, [activeModal, currentRoute, setActiveModal, setWelcomeMessage, setCurrentRoute, setSelectedStoreId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      const oobCode = params.get('oobCode');
      if (mode === 'resetPassword' && oobCode) {
        setResetPasswordCode(oobCode);
        setActiveModal('new-password');
      }
    }
  }, []);

  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          let pendingRoleOptions: any = null;
          try {
            const rawPending = sessionStorage.getItem('ub_pending_google_role');
            if (rawPending) {
              pendingRoleOptions = JSON.parse(rawPending);
              sessionStorage.removeItem('ub_pending_google_role');
            }
          } catch (e) {}

          const u = result.user;
          const cleanEmail = (u.email || '').toLowerCase().trim();
          const displayName = u.displayName || cleanEmail.split('@')[0] || 'Google User';
          setFirebaseUser(u);

          let existingData: any = null;
          const userDocRef = doc(db, 'users', u.uid);
          try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
              existingData = docSnap.data();
            }
          } catch (dbErr) {
            console.warn('Firestore redirect user fetch:', dbErr);
          }

          const explicitRole = pendingRoleOptions?.role;
          if (explicitRole && explicitRole !== 'Customer') {
            await signOut(auth).catch(() => {});
            setFirebaseUser(null);
            return;
          }

          const existingRole = existingData?.role || 'Customer';
          const isExistingNonCustomer =
            existingRole === 'Event Organiser' ||
            existingRole === 'Seller' ||
            existingRole === 'Driver' ||
            existingRole === 'Shop Worker' ||
            (existingRole === 'Promoter' && !INITIAL_PROMOTERS.some((p) => p.email.toLowerCase() === cleanEmail));
          const isExistingApproved =
            existingData?.isApproved === true ||
            existingData?.status === 'approved' ||
            existingData?.status === 'active';

          if (!isEmailAdmin(cleanEmail) && isExistingNonCustomer && !isExistingApproved) {
            await signOut(auth).catch(() => {});
            setFirebaseUser(null);
            return;
          }

          const userRole = explicitRole === 'Customer'
            ? 'Customer'
            : (isEmailAdmin(cleanEmail)
                ? 'Admin'
                : (existingData?.role && existingData.role !== 'Customer' ? existingData.role : 'Customer'));

          const initialBal = typeof existingData?.walletBalance === 'number'
            ? existingData.walletBalance
            : 0;
          const createdAtIso = existingData?.createdAt || new Date().toISOString();

          const custQrId = resolveCustomerQrId(u.uid, existingData?.customerQrId);
          const userDocPayload: Record<string, any> = {
            id: u.uid,
            name: existingData?.name || displayName,
            fullName: existingData?.fullName || displayName,
            email: cleanEmail,
            phone: existingData?.phone || '',
            role: userRole,
            status: existingData?.status || 'active',
            isApproved: true,
            walletBalance: initialBal,
            createdAt: createdAtIso,
            emailVerified: true,
            isRegistered: true,
            customerQrId: custQrId || undefined,
          };

          try {
            if (!existingData || explicitRole === 'Customer') {
              await setDoc(userDocRef, cleanForFirestore(userDocPayload), { merge: true });
              await setDoc(doc(db, 'wallets', u.uid), {
                userId: u.uid,
                balance: initialBal,
                createdAt: createdAtIso,
              }, { merge: true });
            } else if (custQrId && !existingData.customerQrId) {
              await setDoc(userDocRef, { customerQrId: custQrId }, { merge: true });
            }
          } catch (dbErr) {
            console.warn('Firestore redirect user sync:', dbErr);
          }

          const gProfile: UserProfile = {
            id: u.uid,
            name: existingData?.name || displayName,
            fullName: existingData?.fullName || displayName,
            email: cleanEmail,
            phone: existingData?.phone || '',
            role: userRole,
            status: existingData?.status || 'active',
            isApproved: true,
            assignedStoreId: existingData?.assignedStoreId || '',
            assignedStoreName: existingData?.assignedStoreName || '',
            organisationName: existingData?.organisationName || '',
            shopName: existingData?.shopName || '',
            whatToSell: existingData?.whatToSell || '',
            vehicleType: existingData?.vehicleType || '',
            licensePlate: existingData?.licensePlate || '',
            driverLicenseNumber: existingData?.driverLicenseNumber || '',
            createdAt: createdAtIso,
            walletBalance: initialBal,
            isRegistered: true,
            emailVerified: true,
            customerQrId: custQrId || undefined,
            photo: u.photoURL || existingData?.photo || undefined,
          };

          if (userRole === 'Admin' || isEmailAdmin(cleanEmail)) {
            localStorage.removeItem('ub_admin_session');
            sessionStorage.removeItem('ub_admin_5locks_passed');
            if (cleanEmail) {
              localStorage.setItem('ub_admin_email', cleanEmail);
            }
            setPendingAdminAuthUser({ ...gProfile, role: 'Admin' });
            setIsAdminSecurityModalOpen(true);
            return;
          }

          setCurrentUser(gProfile);
          localStorage.setItem('ub_user_profile', JSON.stringify(gProfile));
          localStorage.setItem('ub_has_registered', 'true');
          localStorage.setItem('wallet_balance', String(initialBal));
          if (cleanEmail) {
            localStorage.setItem(`ub_wallet_balance_${cleanEmail}`, String(initialBal));
          }
          setWelcomeMessage(`Welcome ${gProfile.name}!`);

          if (userRole === 'Event Organiser' || userRole === 'Promoter') {
            setCurrentRoute('/');
            setActiveModal('promoter-dashboard');
          } else if (userRole === 'Seller') {
            setCurrentRoute('/');
            setActiveModal('store-manager');
          } else if (userRole === 'Driver') {
            setCurrentRoute('/driver');
            setActiveModal('driver-dashboard');
          } else if (userRole === 'Shop Worker') {
            const targetStoreId = gProfile.assignedStoreId || stores[0]?.id || '';
            setSelectedStoreId(targetStoreId);
            setActiveModal(null);
            setCurrentRoute(targetStoreId ? `/stores/${targetStoreId}` : '/');
          } else if (explicitRole === 'Customer') {
            setActiveModal(null);
            setCurrentRoute('/');
          } else {
            setCurrentRoute('/dashboard');
          }
        }
      })
      .catch((error: any) => {
        console.error('getRedirectResult error:', error?.code, error?.message, error);
      });
  }, []);

  // Canonical wallet balance accessible throughout the entire app
  const rawWalletNum =
    typeof currentUser?.walletBalance === 'number' && Number.isFinite(currentUser.walletBalance)
      ? currentUser.walletBalance
      : Number(localStorage.getItem('wallet_balance') || 0);
  const currentWalletBalance = Number.isFinite(rawWalletNum) ? rawWalletNum : 0;

  // Sync wallet balance across browser tabs / storage events
  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('wallet_balance');
      const num = stored !== null && !isNaN(Number(stored)) ? Number(stored) : 0;
      setCurrentUser((prev) => {
        if (prev.walletBalance !== num) {
          const updated = { ...prev, walletBalance: num };
          try {
            localStorage.setItem('ub_user_profile', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        }
        return prev;
      });
      setUserWalletDoc((prev) => (prev.balance !== num ? { ...prev, balance: num } : prev));
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Auto-dismiss welcome toast after 4.5 seconds
  useEffect(() => {
    if (welcomeMessage) {
      const timer = setTimeout(() => setWelcomeMessage(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [welcomeMessage]);

  // Wallets document state & listener
  const [userWalletDoc, setUserWalletDoc] = useState<WalletDoc>(() => {
    const stored = localStorage.getItem('wallet_balance');
    const startingBalance = stored !== null && !isNaN(Number(stored)) ? Number(stored) : 0;
    return {
      userId: INITIAL_USER.id,
      balance: startingBalance,
      idNumber: INITIAL_USER.idNumber || null,
      idFrontImageUrl: null,
      idSelfieImageUrl: null,
      idVerified: false,
      verificationStatus: 'none',
      dateOfBirth: null,
      age: INITIAL_USER.age || 28,
      canBuyAlcohol: false,
    };
  });

  useEffect(() => {
    const wId = currentUser.id;
    if (!wId || wId === 'guest_user') return;
    const wRef = doc(db, 'wallets', wId);
    const unsub = onSnapshot(wRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data() as any;
        const firestoreBal = typeof d.balance === 'number' ? d.balance : 0;

        localStorage.setItem('wallet_balance', String(firestoreBal));

        setCurrentUser((prev) => {
          if (prev.walletBalance !== firestoreBal) {
            const updated = {
              ...prev,
              walletBalance: firestoreBal,
            };
            try {
              localStorage.setItem('ub_user_profile', JSON.stringify(updated));
            } catch (e) {}
            return updated;
          }
          return prev;
        });

        setUserWalletDoc({
          userId: wId,
          balance: firestoreBal,
          idNumber: d.idNumber ?? currentUser.idNumber ?? null,
          idFrontImageUrl: d.idFrontImageUrl ?? null,
          idSelfieImageUrl: d.idSelfieImageUrl ?? null,
          idVerified: Boolean(d.idVerified),
          verificationStatus: d.verificationStatus || (d.idVerified ? 'verified' : 'none'),
          dateOfBirth: d.dateOfBirth ?? null,
          age: typeof d.age === 'number' ? d.age : (currentUser.age || 28),
          canBuyAlcohol: Boolean(d.canBuyAlcohol),
          updatedAt: d.updatedAt,
        });
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `wallets/${wId}`);
    });
    return () => unsub();
  }, [currentUser.id, currentUser.idNumber, currentUser.age]);

  // Live collection listener for all registered users (for Admin Dashboard)
  const [allRegisteredUsers, setAllRegisteredUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.deleted !== true && data.status !== 'deleted') {
          const isApproved = data.isApproved === true || data.status === 'approved';
          list.push({
            id: d.id,
            name: data.name || data.fullName || 'User',
            fullName: data.fullName || data.name || 'User',
            email: data.email || '',
            phone: data.phone || '',
            role: data.role || 'Customer',
            walletBalance: typeof data.walletBalance === 'number' ? data.walletBalance : 0,
            assignedStoreId: data.assignedStoreId || '',
            assignedStoreName: data.assignedStoreName || '',
            createdAt: data.createdAt || '',
            isRegistered: true,
            status: data.status || (isApproved ? 'approved' : (data.role === 'Customer' ? 'active' : 'pending')),
            isApproved: isApproved,
            approvedAt: data.approvedAt,
            rejectionReason: data.rejectionReason,
            organisationName: data.organisationName || '',
            shopName: data.shopName || '',
            whatToSell: data.whatToSell || '',
            vehicleType: data.vehicleType || '',
            licensePlate: data.licensePlate || '',
            driverLicenseNumber: data.driverLicenseNumber || '',
            idNumber: data.idNumber,
            photo: data.photo,
          });
        }
      });
      setAllRegisteredUsers(list);
    }, (err) => {
      console.warn('Live users listener warning:', err);
    });
    return () => unsub();
  }, []);

  // Filter pending approvals for Admin Approval Dashboard
  const pendingApprovals = useMemo(() => {
    return allRegisteredUsers
      .filter((u) => {
        if (u.role === 'Admin' || u.role === 'Customer') return false;
        return u.status === 'pending' || (!u.isApproved && u.status !== 'rejected' && u.status !== 'active');
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [allRegisteredUsers]);

  // Verify active user still exists in Firestore and has not been deleted/revoked
  useEffect(() => {
    if (!currentUser.isRegistered || !currentUser.id || currentUser.id === 'guest_user') return;
    if (authRegistrationLockRef.current || googleRegistrationLockRef.current) return;
    let isCancelled = false;

    const checkActiveUser = async () => {
      try {
        const uDoc = await getDoc(doc(db, 'users', currentUser.id));
        const revokedDoc = await getDoc(doc(db, 'revoked_users', currentUser.id));
        if (isCancelled) return;

        if (revokedDoc.exists() || uDoc.data()?.deleted === true || uDoc.data()?.status === 'deleted') {
          console.log('User was explicitly deleted or revoked in Firestore. Executing purge.');
          if (auth.currentUser) {
            await deleteUser(auth.currentUser).catch(() => {});
          }
          await signOut(auth).catch(() => {});
          localStorage.removeItem('ub_admin_session');
          localStorage.removeItem('ub_has_registered');
          localStorage.removeItem('ub_user_profile');
          localStorage.removeItem('wallet_balance');
          localStorage.removeItem('ub_pending_verification');
          localStorage.removeItem('ub_recovery_email');
          if (currentUser.email) {
            localStorage.removeItem(`ub_wallet_balance_${currentUser.email.toLowerCase().trim()}`);
          }
          setWelcomeMessage(null);
          setFirebaseUser(null);
          setTickets([]);
          setCurrentUser({
            id: 'guest_user',
            name: 'New User',
            fullName: 'New User',
            email: '',
            phone: '',
            role: 'Customer',
            walletBalance: 0,
            isRegistered: false,
          });
          setCurrentRoute('/');
        } else if (!uDoc.exists() && currentUser.isRegistered && currentUser.id !== 'guest_user') {
          // Auto-provision Firestore document for website/app user so account exists seamlessly across web and app
          const cleanEmail = (currentUser.email || '').toLowerCase().trim();
          const syncDoc = {
            id: currentUser.id,
            name: currentUser.name || currentUser.fullName || 'User',
            fullName: currentUser.fullName || currentUser.name || 'User',
            email: cleanEmail,
            phone: currentUser.phone || '',
            role: currentUser.role || 'Customer',
            status: 'active',
            walletBalance: typeof currentUser.walletBalance === 'number' ? currentUser.walletBalance : 0,
            createdAt: new Date().toISOString(),
            isRegistered: true,
            emailVerified: true,
          };
          await setDoc(doc(db, 'users', currentUser.id), cleanForFirestore(syncDoc), { merge: true }).catch(() => {});
          await setDoc(doc(db, 'wallets', currentUser.id), {
            userId: currentUser.id,
            balance: syncDoc.walletBalance,
            createdAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        }
      } catch (err) {
        console.warn('checkActiveUser notice:', err);
      }
    };

    checkActiveUser();
    return () => { isCancelled = true; };
  }, [currentUser.id, currentUser.isRegistered]);

  // Also listen to users document for live walletBalance changes and live deletion
  useEffect(() => {
    if (!currentUser.id || currentUser.id === 'guest_user') return;
    const uRef = doc(db, 'users', currentUser.id);
    const unsubUser = onSnapshot(uRef, async (snap) => {
      if (!snap.exists()) {
        if (currentUser.isRegistered) {
          console.log('User document missing in Firestore during live watch. Auto-provisioning.');
          const cleanEmail = (currentUser.email || '').toLowerCase().trim();
          const syncDoc = {
            id: currentUser.id,
            name: currentUser.name || currentUser.fullName || 'User',
            fullName: currentUser.fullName || currentUser.name || 'User',
            email: cleanEmail,
            phone: currentUser.phone || '',
            role: currentUser.role || 'Customer',
            status: 'active',
            walletBalance: typeof currentUser.walletBalance === 'number' ? currentUser.walletBalance : 0,
            createdAt: new Date().toISOString(),
            isRegistered: true,
            emailVerified: true,
          };
          await setDoc(doc(db, 'users', currentUser.id), cleanForFirestore(syncDoc), { merge: true }).catch(() => {});
        }
        return;
      }
      const d = snap.data() as any;
      if (d.deleted === true || d.status === 'deleted') {
        if (currentUser.isRegistered) {
          console.log('User marked as deleted in Firestore. Force logout & clear token.');
          if (auth.currentUser) {
            await deleteUser(auth.currentUser).catch(() => {});
          }
          await signOut(auth).catch(() => {});
          localStorage.removeItem('ub_admin_session');
          localStorage.removeItem('ub_has_registered');
          localStorage.removeItem('ub_user_profile');
          localStorage.removeItem('wallet_balance');
          setWelcomeMessage(null);
          setFirebaseUser(null);
          setTickets([]);
          setCurrentUser({
            id: 'guest_user',
            name: 'New User',
            fullName: 'New User',
            email: '',
            phone: '',
            role: 'Customer',
            walletBalance: 0,
            isRegistered: false,
          });
          setCurrentRoute('/');
        }
        return;
      }
      if (typeof d.walletBalance === 'number') {
        const bal = d.walletBalance;
        localStorage.setItem('wallet_balance', String(bal));
        setCurrentUser((prev) => {
          if (prev.walletBalance !== bal) {
            const updated = {
              ...prev,
              walletBalance: bal,
            };
            try {
              localStorage.setItem('ub_user_profile', JSON.stringify(updated));
            } catch (e) {}
            return updated;
          }
          return prev;
        });
        setUserWalletDoc((prev) => (prev.balance !== bal ? { ...prev, balance: bal } : prev));
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${currentUser.id}`);
    });
    return () => unsubUser();
  }, [currentUser.id, currentUser.isRegistered]);

  const updateUserWalletDoc = async (data: Partial<WalletDoc>) => {
    const wId = currentUser.id;
    if (!wId || wId === 'guest_user') return;
    const wRef = doc(db, 'wallets', wId);
    await setDoc(wRef, data, { merge: true });
    setUserWalletDoc((prev) => ({
      ...prev,
      ...data,
    }));
  };
  const [storeRequests, setStoreRequests] = useState<StoreRequest[]>([]);

  useEffect(() => {
    try {
      const unsubReqs = onSnapshot(collection(db, 'store_requests'), (snapshot) => {
        const list: StoreRequest[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<StoreRequest, 'id'>) }));
        setStoreRequests(list);
      }, (err) => {
        console.warn('store_requests listener notice:', err);
      });
      return () => unsubReqs();
    } catch (e) {}
  }, []);

  // Navigate helper
  const navigateTo = (route: string) => {
    // If routing to admin area without verified admin credentials, require 5-lock security
    if (route.startsWith('/admin') && currentUser.role !== 'Admin') {
      openAdminLoginFlow();
      return;
    }

    const resolvedRoute = route.startsWith('/store/')
      ? route
      : route.startsWith('/stores/')
      ? route.replace('/stores/', '/store/')
      : route;

    if (resolvedRoute !== currentRoute) {
      if (resolvedRoute === '/' || resolvedRoute === '/home' || resolvedRoute === '/stores' || resolvedRoute === '/discovery') {
        routeHistoryRef.current = ['/'];
      } else {
        routeHistoryRef.current.push(resolvedRoute);
      }
    }

    let finalRoute = resolvedRoute;
    if (resolvedRoute.startsWith('/store/')) {
      const storeId = resolvedRoute.replace('/store/', '');
      setSelectedStoreId(storeId);
      finalRoute = '/store/' + storeId;
      setCurrentRoute(finalRoute);
    } else if (resolvedRoute.startsWith('/event/') || resolvedRoute.startsWith('/events/')) {
      const slugOrId = resolvedRoute.replace(/^\/events?\//i, '');
      const ev = findEventBySlugOrId(events, slugOrId);
      finalRoute = ev ? getEventRoutePath(ev, events) : `/event/${slugOrId}`;
      setSelectedStoreId(null);
      setCurrentRoute(finalRoute);
    } else {
      setCurrentRoute(resolvedRoute);
      if (resolvedRoute === '/' || resolvedRoute === '/stores') {
        setSelectedStoreId(null);
      }
    }

    if (
      typeof window !== 'undefined' &&
      window.location.protocol.startsWith('http') &&
      !window.location.pathname.includes('/android_asset/') &&
      window.location.pathname !== finalRoute
    ) {
      try {
        window.history.pushState({}, '', finalRoute);
      } catch {}
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const archiveExpiredEvents = async () => {
    try {
      const evSnap = await getDocs(collection(db, 'events'));
      for (const evDoc of evSnap.docs) {
        const evData = { id: evDoc.id, ...(evDoc.data() as Omit<EventItem, 'id'>) };
        const rawDateStr = evData.date || evData.event_date || '';
        if (!rawDateStr || !isEventExpired(rawDateStr)) continue;
        try {
          await setDoc(doc(db, 'archived_events', evData.id), cleanForFirestore(evData));
          await deleteDoc(doc(db, 'events', evData.id));
          const ticketsQ = query(collection(db, 'tickets'), where('eventId', '==', evData.id));
          const ticketSnap = await getDocs(ticketsQ);
          for (const tDoc of ticketSnap.docs) {
            await setDoc(doc(db, 'archived_tickets', tDoc.id), tDoc.data());
            await deleteDoc(tDoc.ref);
          }
        } catch (err) {
          console.warn(`Error archiving event ${evData.id}:`, err);
        }
      }
    } catch (err) {
      console.warn('Error fetching events for auto-archive:', err);
    }
  };

  // Seed & synchronize Firestore (Non-blocking parallel listener attachment)
  useEffect(() => {
    let unsubscribeStores: (() => void) | undefined;
    let unsubscribeEvents: (() => void) | undefined;
    let unsubscribeTickets: (() => void) | undefined;
    let unsubscribeFood: (() => void) | undefined;
    let unsubscribeAlcohol: (() => void) | undefined;
    let unsubscribeSoftDrinks: (() => void) | undefined;

    try {
      // 1. Stores listener (instant non-blocking attach)
      const storesRef = collection(db, 'stores');
      unsubscribeStores = onSnapshot(
        storesRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const loadedStores: Store[] = [];
            snapshot.forEach((docSnap) => {
              loadedStores.push({ id: docSnap.id, ...(docSnap.data() as Omit<Store, 'id'>) });
            });
            setStores(loadedStores);
            try {
              localStorage.setItem('ub_local_stores', JSON.stringify(loadedStores));
            } catch (e) {}
          } else {
            setStores([]);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'stores')
      );

      // 2. Events listener (filter strictly by expired date, keep paused/Closed upcoming events synced)
      const eventsRef = collection(db, 'events');
      unsubscribeEvents = onSnapshot(
        eventsRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const loadedEvents: EventItem[] = [];
            snapshot.forEach((docSnap) => {
              loadedEvents.push({ id: docSnap.id, ...(docSnap.data() as Omit<EventItem, 'id'>) });
            });
            const activeEvents = loadedEvents.filter(
              (ev) => !isEventExpired(ev.date || ev.event_date || '')
            );
            setEvents(activeEvents);
            try {
              localStorage.setItem('ub_local_events', JSON.stringify(activeEvents));
            } catch (e) {}
          } else {
            setEvents([]);
            try {
              localStorage.setItem('ub_local_events', '[]');
            } catch (e) {}
          }
          setEventsLoaded(true);
        },
        (err) => {
          setEventsLoaded(true);
          handleFirestoreError(err, OperationType.LIST, 'events');
        }
      );

      // 3. Tickets listener (also drives Admin New-Order alerts and PAID auto-confirmation banners)
      const ticketsRef = collection(db, 'tickets');
      unsubscribeTickets = onSnapshot(
        ticketsRef,
        (snapshot) => {
          const loadedTickets: Ticket[] = [];
          snapshot.forEach((docSnap) => {
            loadedTickets.push({ id: docSnap.id, ...(docSnap.data() as Omit<Ticket, 'id'>) });
          });

          const nextMap = new Map<string, Ticket>();
          for (const t of loadedTickets) {
            nextMap.set(t.id, t);
          }

          if (!ticketsSnapshotInitializedRef.current) {
            for (const t of loadedTickets) {
              if (isTicketWaitingPayment(t)) {
                notifiedTicketEventsRef.current.add(`waiting:${t.id}`);
              }
              if (isTicketPaid(t)) {
                notifiedTicketEventsRef.current.add(`paid:${t.id}`);
              }
            }
            ticketsSnapshotInitializedRef.current = true;
          } else {
            for (const t of loadedTickets) {
              const prevT = prevTicketMapRef.current.get(t.id);
              if (!prevT && isTicketWaitingPayment(t)) {
                notifyTicketLifecycleEvent(t, 'waiting');
              } else if (isTicketPaid(t) && (!prevT || isTicketWaitingPayment(prevT))) {
                notifyTicketLifecycleEvent(t, 'paid');
              }
            }
          }

          prevTicketMapRef.current = nextMap;
          setTickets(loadedTickets);
          try {
            localStorage.setItem('ub_user_tickets', JSON.stringify(loadedTickets));
          } catch {}
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'tickets')
      );

      // 4. Menu Food listener
      const foodRef = collection(db, 'menu_food');
      unsubscribeFood = onSnapshot(
        foodRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const loaded: MenuItem[] = [];
            snapshot.forEach((docSnap) => {
              loaded.push({ id: docSnap.id, ...(docSnap.data() as Omit<MenuItem, 'id'>) });
            });
            setMenuFood(loaded);
          } else {
            setMenuFood([]);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'menu_food')
      );

      // 5. Menu Alcohol listener
      const alcoholRef = collection(db, 'menu_alcohol');
      unsubscribeAlcohol = onSnapshot(
        alcoholRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const loaded: MenuItem[] = [];
            snapshot.forEach((docSnap) => {
              loaded.push({ id: docSnap.id, ...(docSnap.data() as Omit<MenuItem, 'id'>) });
            });
            setMenuAlcohol(loaded);
          } else {
            setMenuAlcohol([]);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'menu_alcohol')
      );

      // 6. Menu Soft Drinks listener
      const softRef = collection(db, 'menu_softdrinks');
      unsubscribeSoftDrinks = onSnapshot(
        softRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const loaded: MenuItem[] = [];
            snapshot.forEach((docSnap) => {
              loaded.push({ id: docSnap.id, ...(docSnap.data() as Omit<MenuItem, 'id'>) });
            });
            setMenuSoftDrinks(loaded);
          } else {
            setMenuSoftDrinks([]);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'menu_softdrinks')
      );

      // Deferred background tasks (1s after initial mount to keep first render instantaneous)
      const timer = setTimeout(() => {
        testConnection().catch(() => {});
        runAutoBinCheck().catch((err) => console.warn('Startup auto-bin sweep:', err));
        archiveExpiredEvents().catch((err) => console.warn('Startup auto-archive sweep:', err));
      }, 1000);

      return () => {
        clearTimeout(timer);
        if (unsubscribeStores) unsubscribeStores();
        if (unsubscribeEvents) unsubscribeEvents();
        if (unsubscribeTickets) unsubscribeTickets();
        if (unsubscribeFood) unsubscribeFood();
        if (unsubscribeAlcohol) unsubscribeAlcohol();
        if (unsubscribeSoftDrinks) unsubscribeSoftDrinks();
      };
    } catch (err) {
      console.warn('Firebase sync notice (app functional with robust offline fallback):', err);
    }
  }, []);

  const unlockApp = (pinInput: string, verifiedFactor = false): boolean => {
    if (verifiedFactor || (Boolean(currentPin) && pinInput === currentPin)) {
      setIsLocked(false);
      localStorage.setItem('ub_locked', 'false');
      setAttemptsLeft(5);
      setCurrentRoute('/');
      return true;
    } else {
      setAttemptsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        return next;
      });
      return false;
    }
  };

  const lockApp = () => {
    setIsLocked(true);
    localStorage.setItem('ub_locked', 'true');
    setCurrentRoute('/app-lock');
  };

  const resetPinWithEmail = async (): Promise<boolean> => {
    const targetEmail = (currentUser?.email || auth.currentUser?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return false;
    }
    try {
      await sendPasswordResetEmail(auth, targetEmail, getActionCodeSettings());
      setWelcomeMessage(`Security reset email sent to ${targetEmail}.`);
      return true;
    } catch (err) {
      console.warn('resetPinWithEmail failed:', err);
      return false;
    }
  };

  const updatePin = (newPin: string) => {
    setCurrentPin(newPin);
    localStorage.setItem('ub_pin', newPin);
  };

  const buyTicket = async (
    event: EventItem,
    customerData?: {
      fullName: string;
      phone: string;
      photo?: string;
      idNumber?: string;
      quantity?: number;
      ticketTier?: string;
      tierPrice?: string;
    }
  ): Promise<{ success: boolean; tickets?: Ticket[]; ticket?: Ticket; error?: string }> => {
    const liveEvent = events.find((e) => e.id === event.id) || event;
    // Strict date & expiry guard: if current date is after event date, the ticket must not be bought
    if (isEventExpired(liveEvent)) {
      return {
        success: false,
        error: 'This event has already passed. Tickets are no longer available for purchase.',
      };
    }
    if (liveEvent.status === 'Closed') {
      return {
        success: false,
        error: 'Ticket sales for this event are closed.',
      };
    }

    const qty = Math.max(1, customerData?.quantity || 1);
    const localSoldCount = tickets.filter((t) => t.eventId === liveEvent.id).length;
    const preSoldCount = Math.max(Number(liveEvent.ticketsSold || 0), localSoldCount);
    const preLimit =
      liveEvent.ticketsAvailable !== undefined && liveEvent.ticketsAvailable !== null
        ? Number(liveEvent.ticketsAvailable)
        : null;

    if (preLimit !== null && Number.isFinite(preLimit)) {
      const remaining = Math.max(0, preLimit - preSoldCount);
      if (remaining <= 0) {
        return {
          success: false,
          error: `Sold Out! All ${preLimit} tickets for "${liveEvent.title}" have been sold.`,
        };
      }
      if (qty > remaining) {
        return {
          success: false,
          error: `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining for "${liveEvent.title}". Please reduce your quantity.`,
        };
      }
    }

    const unitPriceStr = customerData?.tierPrice || liveEvent.price;
    const unitPrice = parseFloat(unitPriceStr.replace(/[^0-9.]/g, '')) || 0;
    const totalCost = unitPrice * qty;

    if (currentUser.walletBalance < totalCost) {
      return {
        success: false,
        error: `Insufficient wallet balance (Current: R${currentUser.walletBalance.toFixed(2)}, Required: R${totalCost.toFixed(2)} for ${qty} ticket${qty > 1 ? 's' : ''}). Please top up your wristband.`,
      };
    }

    // Atomically verify and increment ticket limit in Firestore before deducting wallet / issuing tickets
    let updatedTicketsSold = preSoldCount + qty;
    try {
      await runTransaction(db, async (tx) => {
        const eventRef = doc(db, 'events', liveEvent.id);
        const evSnap = await tx.get(eventRef);
        const remoteEvent = evSnap.exists() ? (evSnap.data() as EventItem) : liveEvent;

        if (remoteEvent.status === 'Closed') {
          throw new Error('LIMIT_CLOSED:Ticket sales for this event are closed.');
        }

        const serverSold = Math.max(Number(remoteEvent.ticketsSold || 0), localSoldCount);
        const limitVal =
          remoteEvent.ticketsAvailable !== undefined && remoteEvent.ticketsAvailable !== null
            ? Number(remoteEvent.ticketsAvailable)
            : null;

        if (limitVal !== null && Number.isFinite(limitVal)) {
          const remaining = Math.max(0, limitVal - serverSold);
          if (remaining <= 0) {
            throw new Error(`LIMIT_SOLDOUT:Sold Out! All ${limitVal} tickets for "${liveEvent.title}" have been sold.`);
          }
          if (qty > remaining) {
            throw new Error(
              `LIMIT_QTY:Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining for "${liveEvent.title}". Please lower your quantity.`
            );
          }
        }

        updatedTicketsSold = serverSold + qty;
        if (evSnap.exists()) {
          tx.update(eventRef, { ticketsSold: updatedTicketsSold });
        } else {
          tx.set(eventRef, cleanForFirestore({ ...liveEvent, ticketsSold: updatedTicketsSold }), { merge: true });
        }
      });
    } catch (txErr: any) {
      const msg = String(txErr?.message || '');
      if (msg.startsWith('LIMIT_')) {
        return {
          success: false,
          error: msg.replace(/^LIMIT_[A-Z]+:/, ''),
        };
      }
      console.warn('Firestore ticket limit transaction warning:', txErr);
    }

    const custName = customerData?.fullName?.trim() || currentUser.fullName || currentUser.name || 'Universal Band Guest';
    const custPhone = customerData?.phone?.trim() || currentUser.phone || '0820000000';
    const custPhoto = customerData?.photo?.trim() || currentUser.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';

    const hostStore =
      stores.find((s) => s.id === liveEvent.storeId) ||
      stores.find((s) => s.id === selectedStoreId) ||
      stores[0];

    const resolvedEventLocation =
      liveEvent.location?.trim() ||
      hostStore?.location?.trim() ||
      (hostStore ? hostStore.name : 'South Africa');

    const createdTickets: Ticket[] = [];
    const nowIso = new Date().toISOString();
    const resolvedTier = customerData?.ticketTier || 'General Admission';
    const custQrId = resolveCustomerQrId(currentUser.id, currentUser.customerQrId);

    for (let i = 0; i < qty; i++) {
      const randomFiveDigits = Math.floor(10000 + Math.random() * 90000);
      const uniqueTicketCode = `UB-${randomFiveDigits}`;
      const newTicket: Ticket = {
        id: uniqueTicketCode,
        ticketId: uniqueTicketCode,
        eventId: liveEvent.id,
        storeId: hostStore ? hostStore.id : '',
        storeName: hostStore ? hostStore.name : 'Event Venue',
        userId: currentUser.id,
        user_id: currentUser.id,
        customerQrId: custQrId || undefined,
        eventName: liveEvent.title,
        eventTitle: liveEvent.title,
        eventDate: liveEvent.date,
        event_date: liveEvent.event_date || liveEvent.date,
        eventLocation: resolvedEventLocation,
        price: unitPriceStr.startsWith('R') ? unitPriceStr : `R${unitPriceStr}`,
        ticketTier: resolvedTier,
        tierName: resolvedTier,
        attendeeName: custName,
        attendeePhone: custPhone,
        customerName: custName,
        customerPhone: custPhone,
        customerPhoto: custPhoto,
        qrCode: custQrId || uniqueTicketCode,
        bandCode: uniqueTicketCode,
        status: 'valid',
        attendanceStatus: 'OUTSIDE',
        attendanceLogs: [],
        purchaseDate: nowIso,
        purchase_date: nowIso,
        createdAt: nowIso,
      };
      createdTickets.push(newTicket);
    }

    // Deduct from wallet
    const currentStoredBal = Number(localStorage.getItem('wallet_balance') || 0);
    const updatedBalance = Math.max(0, currentStoredBal - totalCost);
    localStorage.setItem('wallet_balance', String(updatedBalance));

    addWalletTransaction({
      type: 'purchase',
      title: `Pass (${qty}x): ${liveEvent.title}`,
      subtitle: `${hostStore ? hostStore.name : 'Universal Band'} • Gate Entry`,
      amount: -totalCost,
    });

    setCurrentUser((prev) => ({
      ...prev,
      walletBalance: updatedBalance,
      fullName: custName,
      phone: custPhone,
      customerQrId: custQrId || prev.customerQrId,
    }));
    setUserWalletDoc((prev) => ({
      ...prev,
      balance: updatedBalance,
    }));
    setTickets((prev) => [...createdTickets, ...prev]);
    setEvents((prev) => {
      const updated = prev.map((ev) =>
        ev.id === liveEvent.id ? { ...ev, ticketsSold: updatedTicketsSold } : ev
      );
      try {
        localStorage.setItem('ub_local_events', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // Firestore persistence
    try {
      for (const tkt of createdTickets) {
        await setDoc(doc(db, 'tickets', tkt.id), cleanForFirestore(tkt));
      }
      await setDoc(
        doc(db, 'users', currentUser.id),
        cleanForFirestore({
          walletBalance: updatedBalance,
          fullName: custName,
          phone: custPhone,
          customerQrId: custQrId || undefined,
        }),
        { merge: true }
      );

      const txRef = doc(collection(db, 'transactions'));
      await setDoc(txRef, {
        userId: currentUser.id,
        customerName: custName,
        attendeePhone: custPhone,
        type: 'ticket',
        description: `Ticket (${qty}x): ${liveEvent.title}`,
        amount: totalCost,
        storeId: liveEvent.storeId,
        storeName: hostStore ? hostStore.name : 'Universal Band',
        paymentMethod: 'Wallet',
        status: 'Paid',
        reference: createdTickets.map((t) => t.ticketId).join(', '),
        timestamp: nowIso,
        createdAt: nowIso,
      });
    } catch (err) {
      console.warn('Firestore ticket purchase warning:', err);
    }

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FACC15', '#FFFFFF', '#10B981'],
      });
    } catch {}

    return {
      success: true,
      ticket: createdTickets[0],
      tickets: createdTickets,
    };
  };

  const buyTicketWithPayShap = async (
    event: EventItem,
    customerData: {
      fullName: string;
      phone: string;
      quantity?: number;
      ticketTier?: string;
      tierPrice?: string;
      payshapReference: string;
    }
  ): Promise<{ success: boolean; ticket?: Ticket; error?: string }> => {
    const liveEvent = events.find((e) => e.id === event.id) || event;
    if (isEventExpired(liveEvent)) {
      return { success: false, error: 'This event has already passed.' };
    }
    if (liveEvent.status === 'Closed') {
      return { success: false, error: 'Ticket sales for this event are closed.' };
    }

    const qty = Math.max(1, customerData.quantity || 1);
    const unitPriceNum = parsePriceNumber(customerData.tierPrice || liveEvent.price);
    const totalPriceNum = Math.round(unitPriceNum * qty * 100) / 100;
    const formattedTotalPrice = `R${totalPriceNum % 1 === 0 ? totalPriceNum.toFixed(0) : totalPriceNum.toFixed(2)}`;
    const custName = customerData.fullName.trim() || 'Attendee';
    const custPhone = customerData.phone.trim() || '0820000000';
    const resolvedTier = customerData.ticketTier || 'General';
    const hostStore = stores.find((s) => s.id === liveEvent.storeId) || stores[0];
    const nowIso = new Date().toISOString();

    const custQrId = resolveCustomerQrId(currentUser.id, currentUser.customerQrId);
    const randomFiveDigits = Math.floor(10000 + Math.random() * 90000);
    const uniqueTicketCode = `UB-${randomFiveDigits}`;
    const newTicket: Ticket = {
      id: uniqueTicketCode,
      ticketId: uniqueTicketCode,
      eventId: liveEvent.id,
      storeId: hostStore ? hostStore.id : '',
      storeName: hostStore ? hostStore.name : 'Event Venue',
      userId: currentUser.id || 'guest_user',
      user_id: currentUser.id || 'guest_user',
      customerQrId: custQrId || undefined,
      eventName: liveEvent.title,
      eventTitle: liveEvent.title,
      eventDate: liveEvent.date,
      event_date: liveEvent.event_date || liveEvent.date,
      eventLocation: liveEvent.location || 'Pretoria',
      price: formattedTotalPrice,
      quantity: qty,
      ticketTier: resolvedTier,
      tierName: resolvedTier,
      attendeeName: custName,
      attendeePhone: custPhone,
      customerName: custName,
      customerPhone: custPhone,
      qrCode: custQrId || uniqueTicketCode,
      bandCode: uniqueTicketCode,
      status: 'valid',
      attendanceStatus: 'OUTSIDE',
      attendanceLogs: [],
      purchaseDate: nowIso,
      purchase_date: nowIso,
      createdAt: nowIso,
      paymentStatus: 'WAITING FOR PAYMENT',
      payshapReference: customerData.payshapReference,
      payshapRequestSent: false,
    };

    try {
      await setDoc(doc(db, 'tickets', newTicket.id), cleanForFirestore(newTicket));
    } catch (e) {
      console.warn('Could not write ticket to Firestore:', e);
    }

    setTickets((prev) => [newTicket, ...prev]);
    notifyTicketLifecycleEvent(newTicket, 'waiting');

    return {
      success: true,
      ticket: newTicket,
    };
  };

  const markPayshapRequestSent = async (ticketId: string): Promise<boolean> => {
    const nowIso = new Date().toISOString();
    const updates: Partial<Ticket> = {
      payshapRequestSent: true,
      payshapRequestSentAt: nowIso,
    };

    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId || t.ticketId === ticketId ? { ...t, ...updates } : t
      )
    );

    try {
      await updateDoc(doc(db, 'tickets', ticketId), cleanForFirestore(updates));
      return true;
    } catch (e) {
      console.warn('Failed to update payshapRequestSent in Firestore:', e);
      return true;
    }
  };

  const updateTicketPaymentStatus = async (
    ticketId: string,
    status: 'PAID' | 'VERIFIED',
    refText?: string,
    smsText?: string
  ): Promise<boolean> => {
    const nowIso = new Date().toISOString();
    const updates: Partial<Ticket> = {
      paymentStatus: status,
      paidAt: nowIso,
      ...(refText ? { payshapReference: refText } : {}),
      ...(smsText ? { verifiedSmsText: smsText } : {}),
    };

    let updatedTicket: Ticket | null = null;
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId || t.ticketId === ticketId) {
          updatedTicket = { ...t, ...updates };
          return updatedTicket;
        }
        return t;
      })
    );

    if (updatedTicket && isTicketPaid(updatedTicket)) {
      notifyTicketLifecycleEvent(updatedTicket, 'paid');
    }

    try {
      await updateDoc(doc(db, 'tickets', ticketId), cleanForFirestore(updates));
      return true;
    } catch (e) {
      console.warn('Failed to update ticket payment status in Firestore:', e);
      return true;
    }
  };

  // --- Customer Support Chat & Manual Approval Backup ---
  const activeCustomerChat = useMemo(() => {
    const myChatId = getActiveCustomerSupportChatId(currentUser);
    return supportChats.find((c) => c.id === myChatId || (currentUser?.id && currentUser.id !== 'guest_user' && c.customerId === currentUser.id)) || null;
  }, [supportChats, currentUser?.id]);

  const unreadAdminSupportCount = useMemo(() => {
    return supportChats.reduce((sum, c) => sum + (Number(c.unreadAdminCount) || 0), 0);
  }, [supportChats]);

  const unreadCustomerSupportCount = useMemo(() => {
    return Number(activeCustomerChat?.unreadCustomerCount) || 0;
  }, [activeCustomerChat]);

  const persistSupportChat = async (updatedChat: SupportChat) => {
    // Keep doc under Firestore 1MB safety margin if many screenshots were uploaded
    let safeChat = { ...updatedChat };
    if (estimateDocByteSize(safeChat) > 850_000 && safeChat.messages.length > 6) {
      safeChat = {
        ...safeChat,
        messages: safeChat.messages.map((m, idx) =>
          idx < safeChat.messages.length - 4 && m.imageUrl ? { ...m, imageUrl: undefined } : m
        ),
      };
    }

    setSupportChats((prev) => {
      const exists = prev.some((c) => c.id === safeChat.id);
      const next = exists
        ? prev.map((c) => (c.id === safeChat.id ? safeChat : c))
        : [safeChat, ...prev];
      next.sort((a, b) => {
        const unreadA = (a.unreadAdminCount || 0) > 0 ? 1 : 0;
        const unreadB = (b.unreadAdminCount || 0) > 0 ? 1 : 0;
        if (unreadA !== unreadB) return unreadB - unreadA;
        return String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''));
      });
      try {
        localStorage.setItem('ub_support_chats', JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      await setDoc(doc(db, 'supportChats', safeChat.id), cleanForFirestore(safeChat), { merge: true });
    } catch (e) {
      console.warn('Could not persist support chat to Firestore:', e);
    }
  };

  const sendCustomerSupportMessage = async (params: {
    text: string;
    imageUrl?: string;
    audioUrl?: string;
    ticketAttachment?: SupportTicketAttachment;
  }): Promise<boolean> => {
    const nowIso = new Date().toISOString();
    const chatId = getActiveCustomerSupportChatId(currentUser);
    const existing = supportChats.find((c) => c.id === chatId);

    const newMessage: SupportMessage = cleanForFirestore({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      chatId,
      senderRole: 'customer',
      senderName: currentUser?.fullName || currentUser?.name || 'Customer',
      senderId: currentUser?.id || 'guest_user',
      text: params.text.trim(),
      imageUrl: params.imageUrl,
      audioUrl: params.audioUrl,
      timestamp: nowIso,
      ticketAttachment: params.ticketAttachment,
    }) as SupportMessage;

    alertedSupportMsgIdsRef.current.add(newMessage.id);

    const updatedChat: SupportChat = {
      id: chatId,
      customerId: currentUser?.id || chatId.replace(/^chat_/, ''),
      customerName:
        params.ticketAttachment?.customerName ||
        currentUser?.fullName ||
        currentUser?.name ||
        'Customer',
      customerPhone: params.ticketAttachment?.customerPhone || currentUser?.phone || '',
      customerEmail: currentUser?.email || '',
      customerPhoto: currentUser?.photo || currentUser?.avatarUrl || '',
      unreadAdminCount: (existing?.unreadAdminCount || 0) + 1,
      unreadCustomerCount: 0,
      lastMessage:
        params.text.trim() ||
        (params.imageUrl ? '📷 Sent payment proof' : params.audioUrl ? '🎤 Voice message' : 'Message'),
      lastMessageAt: nowIso,
      lastSenderRole: 'customer',
      pendingTicketId: params.ticketAttachment?.ticketId || existing?.pendingTicketId || '',
      messages: [...(existing?.messages || []), newMessage],
      updatedAt: nowIso,
    };

    await persistSupportChat(updatedChat);
    return true;
  };

  const sendAdminSupportReply = async (params: {
    chatId: string;
    text: string;
    imageUrl?: string;
  }): Promise<boolean> => {
    const nowIso = new Date().toISOString();
    const existing = supportChats.find((c) => c.id === params.chatId);
    if (!existing) return false;

    const newMessage: SupportMessage = cleanForFirestore({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      chatId: params.chatId,
      senderRole: 'admin',
      senderName: 'Admin (Universal Band)',
      senderId: currentUser?.id || 'admin_master',
      text: params.text.trim(),
      imageUrl: params.imageUrl,
      timestamp: nowIso,
    }) as SupportMessage;

    alertedSupportMsgIdsRef.current.add(newMessage.id);

    const updatedChat: SupportChat = {
      ...existing,
      unreadAdminCount: 0,
      unreadCustomerCount: (existing.unreadCustomerCount || 0) + 1,
      lastMessage: params.text.trim() || 'Admin replied',
      lastMessageAt: nowIso,
      lastSenderRole: 'admin',
      messages: [...existing.messages, newMessage],
      updatedAt: nowIso,
    };

    await persistSupportChat(updatedChat);
    return true;
  };

  const markChatAsReadByCustomer = async (chatId: string) => {
    const existing = supportChats.find((c) => c.id === chatId);
    if (!existing || !existing.unreadCustomerCount) return;

    setSupportChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadCustomerCount: 0 } : c))
    );
    try {
      await setDoc(doc(db, 'supportChats', chatId), { unreadCustomerCount: 0 }, { merge: true });
    } catch {}
  };

  const markChatAsReadByAdmin = async (chatId: string) => {
    const existing = supportChats.find((c) => c.id === chatId);
    if (!existing || !existing.unreadAdminCount) return;

    setSupportChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadAdminCount: 0 } : c))
    );
    try {
      await setDoc(doc(db, 'supportChats', chatId), { unreadAdminCount: 0 }, { merge: true });
    } catch {}
  };

  const approveTicketManuallyFromChat = async (
    ticketId: string,
    chatId: string
  ): Promise<{ success: boolean; message?: string }> => {
    const targetTicket = tickets.find((t) => t.id === ticketId || t.ticketId === ticketId);
    if (!targetTicket) {
      return { success: false, message: 'Ticket not found.' };
    }
    if (!isTicketWaitingPayment(targetTicket)) {
      return { success: false, message: 'Ticket is already PAID.' };
    }

    await updateTicketPaymentStatus(
      targetTicket.id,
      'PAID',
      targetTicket.payshapReference || targetTicket.bandCode,
      'MANUAL ADMIN APPROVAL VIA CUSTOMER SUPPORT'
    );

    const nowIso = new Date().toISOString();
    const existing = supportChats.find((c) => c.id === chatId);
    if (existing) {
      const approvalText = `Admin approved your ticket! Here is your QR code.`;
      const approvalMessage: SupportMessage = {
        id: `msg_app_${Date.now()}`,
        chatId,
        senderRole: 'admin',
        senderName: 'Admin (Universal Band)',
        senderId: currentUser?.id || 'admin_master',
        text: approvalText,
        timestamp: nowIso,
        isSystemNotification: true,
        ticketAttachment: {
          ticketId: targetTicket.id,
          ticketBandCode: targetTicket.bandCode || targetTicket.ticketId,
          eventName: targetTicket.eventTitle || targetTicket.eventName || 'Event',
          ticketTier: targetTicket.ticketTier || targetTicket.tierName || 'General',
          price: targetTicket.price || '',
          payshapReference: targetTicket.payshapReference || '',
          purchaseDate: targetTicket.purchaseDate || targetTicket.createdAt || '',
          customerName: targetTicket.customerName || targetTicket.attendeeName || existing.customerName,
          customerPhone: targetTicket.customerPhone || targetTicket.attendeePhone || existing.customerPhone,
          status: 'PAID',
        },
      };

      alertedSupportMsgIdsRef.current.add(approvalMessage.id);

      const updatedChat: SupportChat = {
        ...existing,
        unreadAdminCount: 0,
        unreadCustomerCount: (existing.unreadCustomerCount || 0) + 1,
        lastMessage: approvalText,
        lastMessageAt: nowIso,
        lastSenderRole: 'admin',
        pendingTicketId: '',
        messages: [...existing.messages, approvalMessage],
        updatedAt: nowIso,
      };
      await persistSupportChat(updatedChat);
    }

    return { success: true, message: 'Ticket approved manually and QR code activated.' };
  };

  const rejectTicketFromChat = async (
    ticketId: string,
    chatId: string,
    reason: string
  ): Promise<{ success: boolean; message?: string }> => {
    const cleanReason = reason.trim() || 'No matching TymeBank deposit found';
    const targetTicket = tickets.find((t) => t.id === ticketId || t.ticketId === ticketId);
    const nowIso = new Date().toISOString();
    const existing = supportChats.find((c) => c.id === chatId);

    if (existing) {
      const rejectText = `Admin checked, payment not found: ${cleanReason}. Please send correct proof or try again.`;
      const rejectMessage: SupportMessage = {
        id: `msg_rej_${Date.now()}`,
        chatId,
        senderRole: 'admin',
        senderName: 'Admin (Universal Band)',
        senderId: currentUser?.id || 'admin_master',
        text: rejectText,
        timestamp: nowIso,
        isSystemNotification: true,
        ...(targetTicket
          ? {
              ticketAttachment: {
                ticketId: targetTicket.id,
                ticketBandCode: targetTicket.bandCode || targetTicket.ticketId,
                eventName: targetTicket.eventTitle || targetTicket.eventName || 'Event',
                ticketTier: targetTicket.ticketTier || targetTicket.tierName || 'General',
                price: targetTicket.price || '',
                payshapReference: targetTicket.payshapReference || '',
                purchaseDate: targetTicket.purchaseDate || targetTicket.createdAt || '',
                customerName: targetTicket.customerName || targetTicket.attendeeName || existing.customerName,
                customerPhone: targetTicket.customerPhone || targetTicket.attendeePhone || existing.customerPhone,
                status: targetTicket.paymentStatus || 'WAITING FOR PAYMENT',
              },
            }
          : {}),
      };

      alertedSupportMsgIdsRef.current.add(rejectMessage.id);

      const updatedChat: SupportChat = {
        ...existing,
        unreadAdminCount: 0,
        unreadCustomerCount: (existing.unreadCustomerCount || 0) + 1,
        lastMessage: rejectText,
        lastMessageAt: nowIso,
        lastSenderRole: 'admin',
        messages: [...existing.messages, rejectMessage],
        updatedAt: nowIso,
      };
      await persistSupportChat(updatedChat);
    }

    return { success: true, message: 'Customer notified that payment was not found.' };
  };

  const mallOrdersRef = useRef<MallOrder[]>(mallOrders);
  useEffect(() => {
    mallOrdersRef.current = mallOrders;
  }, [mallOrders]);

  const markMallOrderPaidFromSms = async (
    order: MallOrder,
    refText: string,
    smsText: string
  ): Promise<MallOrder> => {
    const nowIso = new Date().toISOString();
    const updatedOrder: MallOrder = {
      ...order,
      status: order.status === 'new_order' ? 'paid' : order.status,
      paymentStatus: 'PAID',
      paidAt: order.paidAt || nowIso,
      payshapReference: refText,
      verifiedSmsText: smsText,
    };

    setMallOrders((prev) => {
      const updated = prev.map((o) => (o.id === order.id ? updatedOrder : o));
      try {
        localStorage.setItem('ub_mall_orders', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    try {
      await setDoc(doc(db, 'mall_orders', order.id), cleanForFirestore(updatedOrder), { merge: true });
    } catch (e) {
      console.warn('Could not mark mall order PAID in Firestore:', e);
    }

    if (isAdminSessionActive()) {
      const msg = `Payment Received - ${order.customerName} (${refText}) - Order PAID ✅`;
      playTicketPaidSuccessSound();
      void triggerBackgroundNotification('Order Payment Confirmed', msg, `paid-order-${order.id}`);
      setNotificationBanner({
        id: `paid_order_${order.id}_${Date.now()}`,
        role: 'admin',
        title: 'Live Payment Confirmed',
        message: msg,
        variant: 'paid',
      });
    }

    return updatedOrder;
  };

  const confirmTicketPaymentManually = async (ticketId: string): Promise<boolean> => {
    const targetTicket = tickets.find((t) => t.id === ticketId || t.ticketId === ticketId);
    const refText = targetTicket?.payshapReference || targetTicket?.bandCode || ticketId;
    const smsText = lastPaymentSmsText || 'MANUAL ADMIN CONFIRMATION AFTER SMS CHECK';
    const ok = await updateTicketPaymentStatus(ticketId, 'PAID', refText, smsText);
    if (ok) {
      recordLivePaymentTelemetry({
        smsText: lastPaymentSmsText,
        sender: lastPaymentSmsSender,
        amount: lastPaymentAmount,
        confirmedReference: refText,
      });
    }
    return ok;
  };

  const confirmMallOrderPaymentManually = async (orderId: string): Promise<boolean> => {
    const order = mallOrdersRef.current.find((o) => o.id === orderId);
    if (!order) return false;
    await markMallOrderPaidFromSms(
      order,
      order.payshapReference || order.collectionCode || order.orderNumber,
      lastPaymentSmsText || 'MANUAL ADMIN CONFIRMATION AFTER SMS CHECK'
    );
    return true;
  };

  /**
   * MANUAL APPROVAL ONLY:
   * Real GoTyme / TymeBank incoming SMS NEVER auto-approves tickets or wallet balances.
   * Instead, for ANY amount (R1, R5, R50, R100, R1000, etc.) it triggers a LOUD LOOPING ALARM
   * and notification ("PAYMENT RECEIVED - Check SMS") until the Admin stops it & approves manually.
   */
  const processTymebankSms = (
    smsText: string,
    sender: string = 'TYMEBANK'
  ): { success: boolean; message: string; ticket?: Ticket; data?: any } => {
    const parsed = checkIsTymeBankPaymentAlertSms(smsText, sender);
    if (!parsed.isPayment) {
      return {
        success: false,
        message: 'Ignored SMS: must be from GoTyme Bank / TymeBank and contain "You received" and "from".',
      };
    }

    const nowMs = Date.now();
    recordLivePaymentTelemetry({
      smsText: parsed.rawText,
      sender: parsed.senderName || sender,
      amount: parsed.amount,
    });

    const alarmData: ActivePaymentAlarm = {
      id: `alarm_${nowMs}`,
      amount: parsed.amount,
      numericAmount: parsed.numericAmount,
      customer: parsed.senderName,
      rawSms: parsed.rawText,
      dateMs: nowMs,
    };

    setActivePaymentAlarm(alarmData);
    startLoopingPaymentAlarm(newOrderSoundRef.current);
    void triggerBackgroundNotification(
      'PAYMENT RECEIVED - Check SMS',
      `${parsed.amount} from ${parsed.senderName}`,
      'payment-received-alarm'
    );

    const logMsg = `ALARM RINGING — ${parsed.amount} from ${parsed.senderName} — Manual approval required`;
    const logItem = {
      id: `sms_${nowMs}`,
      text: parsed.rawText,
      time: new Date(nowMs).toLocaleTimeString(),
      status: logMsg,
    };
    setTymebankSmsLogs((prev) => {
      const updated = [logItem, ...prev.slice(0, 49)];
      try {
        localStorage.setItem('tymebank_sms_logs', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    return {
      success: true,
      message: logMsg,
      data: {
        paidAmount: parsed.numericAmount,
        amountLabel: parsed.amount,
        customerName: parsed.senderName,
      },
    };
  };

  const processTymebankSmsRef = useRef(processTymebankSms);
  useEffect(() => {
    processTymebankSmsRef.current = processTymebankSms;
  });

  const tymebankSmsLogsRef = useRef(tymebankSmsLogs);
  useEffect(() => {
    tymebankSmsLogsRef.current = tymebankSmsLogs;
  }, [tymebankSmsLogs]);

  const processedSmsKeysRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem('ub_processed_sms_ids');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return new Set<string>(parsed.map((x) => String(x)));
          }
        }
      } catch {}
      return new Set<string>();
    })()
  );
  const isScanningSmsRef = useRef(false);

  const markSmsKeyProcessed = (smsKey: string, contentKey?: string) => {
    processedSmsKeysRef.current.add(smsKey);
    if (contentKey) {
      processedSmsKeysRef.current.add(contentKey);
    }
    try {
      const list = Array.from(processedSmsKeysRef.current).slice(-300);
      processedSmsKeysRef.current = new Set(list);
      localStorage.setItem('ub_processed_sms_ids', JSON.stringify(list));
    } catch {}
  };

  const syncNativeBackgroundSmsState = async () => {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
    try {
      const [bgState, ringingNow] = await Promise.all([
        getBackgroundSmsState(),
        isNativePaymentAlarmActive(),
      ]);
      if (!bgState) return;
      setSmsPermissionActive(Boolean(bgState.smsGranted));
      localStorage.setItem('tymebank_sms_permission', bgState.smsGranted ? 'true' : 'false');

      if (bgState.lastPaymentSmsText && (!lastPaymentSmsText || bgState.lastPaymentSmsAt >= lastPaymentSmsAt)) {
        setLastPaymentSmsText(bgState.lastPaymentSmsText);
        setLastPaymentSmsSender(bgState.lastPaymentSmsSender || '');
        setLastPaymentSmsAt(bgState.lastPaymentSmsAt || '');
        if (bgState.lastPaymentAmount) {
          setLastPaymentAmount(bgState.lastPaymentAmount);
        }
        try {
          localStorage.setItem('ub_last_payment_sms_text', bgState.lastPaymentSmsText);
          localStorage.setItem('ub_last_payment_sms_sender', bgState.lastPaymentSmsSender || '');
          localStorage.setItem('ub_last_payment_sms_at', bgState.lastPaymentSmsAt || '');
          if (bgState.lastPaymentAmount) {
            localStorage.setItem('ub_last_payment_amount', bgState.lastPaymentAmount);
          }
        } catch {}
      }
      if (bgState.lastConfirmedReference) {
        setLastConfirmedReference(bgState.lastConfirmedReference);
        try {
          localStorage.setItem('ub_last_confirmed_reference', bgState.lastConfirmedReference);
        } catch {}
      }

      if (ringingNow || bgState.alarmActive) {
        const parsedFallback = checkIsTymeBankPaymentAlertSms(
          bgState.lastPaymentSmsText || '',
          bgState.lastPaymentSmsSender || 'TymeBank'
        );
        setActivePaymentAlarm({
          id: `native_alarm_${Date.now()}`,
          amount: bgState.lastPaymentAmount || parsedFallback.amount || 'Payment',
          numericAmount: parsedFallback.numericAmount,
          customer: bgState.lastPaymentSmsSender || parsedFallback.senderName || 'Customer',
          rawSms: bgState.lastPaymentSmsText || '',
          dateMs: bgState.lastPaymentSmsAt ? Date.parse(bgState.lastPaymentSmsAt) || Date.now() : Date.now(),
        });
      }
    } catch {}
  };

  /**
   * Scans real phone SMS inbox ONLY for telemetry / payment alarm detection.
   * NEVER auto-approves tickets or wallet balances.
   */
  const scanRealSmsInbox = async (options?: {
    promptIfNeeded?: boolean;
    sinceMs?: number;
  }): Promise<{
    granted: boolean;
    scannedCount: number;
    matchedCount: number;
    results: { success: boolean; message: string; data?: any }[];
  }> => {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
      return { granted: false, scannedCount: 0, matchedCount: 0, results: [] };
    }

    if (isScanningSmsRef.current) {
      const grantedNow = await checkSmsPermissionGranted();
      setSmsPermissionActive(grantedNow);
      return { granted: grantedNow, scannedCount: 0, matchedCount: 0, results: [] };
    }

    isScanningSmsRef.current = true;
    try {
      await syncNativeBackgroundSmsState();
      let granted = await checkSmsPermissionGranted();
      if (!granted && options?.promptIfNeeded) {
        const req = await ensureSmsPermission();
        granted = req.granted;
      }
      setSmsPermissionActive(granted);
      if (!granted) {
        return { granted: false, scannedCount: 0, matchedCount: 0, results: [] };
      }

      const sinceMs = options?.sinceMs ?? Date.now() - 24 * 60 * 60 * 1000;
      const inbox = await readRealSmsInbox({ limit: 50, sinceMs });
      if (!inbox.granted) {
        setSmsPermissionActive(false);
        return { granted: false, scannedCount: 0, matchedCount: 0, results: [] };
      }

      const ordered = [...inbox.messages].sort((a, b) => a.dateMs - b.dateMs);
      const results: { success: boolean; message: string; data?: any }[] = [];
      let matchedCount = 0;
      const nowMs = Date.now();

      for (const msg of ordered) {
        const smsKey = `sms_${msg.id}_${msg.dateMs}`;
        const contentKey = `norm_${String(msg.sender || '').trim().toLowerCase()}_${String(msg.body || '').trim()}_${Math.floor((msg.dateMs || 0) / 15000)}`;
        if (processedSmsKeysRef.current.has(smsKey) || processedSmsKeysRef.current.has(contentKey)) {
          continue;
        }
        if (tymebankSmsLogsRef.current.some((l) => l.text === msg.body)) {
          markSmsKeyProcessed(smsKey, contentKey);
          continue;
        }

        const parsed = checkIsTymeBankPaymentAlertSms(msg.body, msg.sender);
        markSmsKeyProcessed(smsKey, contentKey);
        if (!parsed.isPayment) {
          continue;
        }

        // Only ring alarm automatically for recent incoming SMS (within last 10 mins) or manual check
        const isRecent = nowMs - (msg.dateMs || 0) <= 10 * 60 * 1000;
        if (isRecent || options?.promptIfNeeded) {
          const res = processTymebankSmsRef.current(msg.body, msg.sender);
          if (res.success) {
            matchedCount += 1;
            results.push({ success: true, message: res.message, data: res.data });
          }
        } else {
          // Historical SMS found during inbox read: log quietly without auto-approving or blaring old alarms
          recordLivePaymentTelemetry({
            smsText: parsed.rawText,
            sender: parsed.senderName || msg.sender,
            amount: parsed.amount,
          });
          matchedCount += 1;
          results.push({
            success: true,
            message: `Found SMS: ${parsed.amount} from ${parsed.senderName}`,
            data: { paidAmount: parsed.numericAmount, amountLabel: parsed.amount, customerName: parsed.senderName },
          });
        }
      }

      return {
        granted: true,
        scannedCount: ordered.length,
        matchedCount,
        results,
      };
    } finally {
      isScanningSmsRef.current = false;
    }
  };

  const scanRealSmsInboxRef = useRef(scanRealSmsInbox);
  useEffect(() => {
    scanRealSmsInboxRef.current = scanRealSmsInbox;
  });

  // Real Android SMS Broadcast Receiver + Native Payment Alarm Event Subscriptions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let stopNativeSms: (() => void) | null = null;
    let stopAlarmSub: (() => void) | null = null;
    let appStateHandle: { remove: () => Promise<void> } | null = null;

    const handleNotificationRoute = (route: string) => {
      const cleanRoute = String(route || '').trim();
      if (!cleanRoute) return;
      const canAccessAdmin =
        isAdminSessionActive() && sessionStorage.getItem('ub_admin_5locks_passed') === 'true';
      if (canAccessAdmin) {
        setActiveModal(null);
        navigateTo(cleanRoute);
      } else {
        try {
          sessionStorage.setItem('ub_pending_admin_route', cleanRoute);
        } catch {}
        navigateTo('/login');
      }
    };

    const handleSmsMessage = (msg: SmsInboxMessage) => {
      try {
        const smsKey = `sms_${msg.id}_${msg.dateMs}`;
        const contentKey = `norm_${String(msg.sender || '').trim().toLowerCase()}_${String(msg.body || '').trim()}_${Math.floor((msg.dateMs || 0) / 15000)}`;
        if (processedSmsKeysRef.current.has(smsKey) || processedSmsKeysRef.current.has(contentKey)) {
          return;
        }
        if (tymebankSmsLogsRef.current.some((l) => l.text === msg.body)) {
          markSmsKeyProcessed(smsKey, contentKey);
          return;
        }
        const res = processTymebankSmsRef.current(msg.body, msg.sender);
        if (res.success) {
          markSmsKeyProcessed(smsKey, contentKey);
        }
      } catch (err) {
        console.warn('Incoming SMS processing error:', err);
      }
    };

    const handleWindowSmsEvent = (evt: any) => {
      try {
        const payload = evt?.data || evt?.detail || evt;
        const sender = String(
          payload?.address || payload?.sender || payload?.originatingAddress || ''
        );
        const body = String(payload?.body || payload?.messageBody || payload?.message || '');
        if (!sender && !body) return;
        handleSmsMessage({
          id: String(payload?.id || `${Date.now()}`),
          sender,
          body,
          dateMs: Number(payload?.dateMs || Date.now()),
        });
      } catch (err) {
        console.warn('SMS event error:', err);
      }
    };

    window.addEventListener('onSMSArrive', handleWindowSmsEvent as EventListener);
    window.addEventListener('tymebankSmsReceived', handleWindowSmsEvent as EventListener);

    if (Capacitor.isNativePlatform()) {
      void configureNativePaymentAlarm({
        mode: newOrderSoundRef.current.mode,
        presetId: newOrderSoundRef.current.presetId,
        volume: newOrderSoundRef.current.volume ?? 1,
        customDataUrl: newOrderSoundRef.current.customDataUrl,
      });

      void (async () => {
        await syncNativeBackgroundSmsState();
        const pendingRoute = await consumePendingNotificationRoute();
        if (pendingRoute) {
          handleNotificationRoute(pendingRoute);
        }

        stopAlarmSub = await subscribeNativePaymentAlarmEvents({
          onAlarm: (data) => {
            const amt = data.amount || 'Payment';
            const cust = data.customer || data.sender || 'Customer';
            const raw = data.body || '';
            recordLivePaymentTelemetry({
              smsText: raw,
              sender: cust,
              amount: amt,
            });
            setActivePaymentAlarm({
              id: data.id || `alarm_${Date.now()}`,
              amount: amt,
              customer: cust,
              rawSms: raw,
              dateMs: data.dateMs || Date.now(),
            });
            startLoopingPaymentAlarm(newOrderSoundRef.current);
          },
          onStopped: () => {
            stopLoopingPaymentAlarm();
            setActivePaymentAlarm(null);
          },
          onNavigate: (route) => {
            handleNotificationRoute(route);
          },
        });

        const granted = await checkSmsPermissionGranted();
        setSmsPermissionActive(granted);
        if (granted) {
          stopNativeSms = await startNativeSmsListener(handleSmsMessage);
        }
        try {
          appStateHandle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
              void (async () => {
                await syncNativeBackgroundSmsState();
                const routeFromNotif = await consumePendingNotificationRoute();
                if (routeFromNotif) {
                  handleNotificationRoute(routeFromNotif);
                }
                const nowGranted = await checkSmsPermissionGranted();
                setSmsPermissionActive(nowGranted);
                if (nowGranted && !stopNativeSms) {
                  stopNativeSms = await startNativeSmsListener(handleSmsMessage);
                }
              })();
            }
          });
        } catch {}
      })();
    }

    return () => {
      window.removeEventListener('onSMSArrive', handleWindowSmsEvent as EventListener);
      window.removeEventListener('tymebankSmsReceived', handleWindowSmsEvent as EventListener);
      if (stopNativeSms) stopNativeSms();
      if (stopAlarmSub) stopAlarmSub();
      if (appStateHandle) void appStateHandle.remove();
    };
  }, []);

  // Auto-prompt Admin for Android SMS + Notification permissions when entering Admin views
  const adminSmsAutoPromptedRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform() || !isAppReady) return;
    const isAdminNow = isAdminSessionActive();

    void configureBackgroundSmsConfirmation({
      enabled: true,
      isAdminDevice: isAdminNow,
      bankMessage: paymentBankMessage || 'TymeBank',
      referenceFormat: paymentReferenceFormat || 'UB-',
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      apiKey: firebaseConfig.apiKey,
      refreshToken: (auth.currentUser as any)?.refreshToken || '',
    });

    if (!isAdminNow) return;
    if (currentRoute === '/login' || currentRoute === '/app-lock') return;

    void (async () => {
      const granted = await checkSmsPermissionGranted();
      setSmsPermissionActive(granted);
      if (!granted && !adminSmsAutoPromptedRef.current) {
        adminSmsAutoPromptedRef.current = true;
        const reqRes = await ensureSmsPermission();
        setSmsPermissionActive(reqRes.granted);
        await ensureNotificationsPermission().catch(() => {});
      }
    })();
  }, [isAppReady, currentUser?.role, currentUser?.email, currentRoute, paymentBankMessage, paymentReferenceFormat]);

  const checkInTicket = async (
    ticketIdOrCode: string
  ): Promise<{ success: boolean; message: string; ticket?: Ticket; code?: string }> => {
    const scan = parseCustomerQrScan(ticketIdOrCode);
    if (scan.dynamicError) {
      return {
        success: false,
        code: scan.dynamicError,
        message: scan.dynamicErrorMessage,
      };
    }
    const matches = tickets.filter((t) => doesTicketMatchCustomerQr(t, scan));
    const existing =
      matches.find((t) => {
        const att = t.attendanceStatus || (t.status === 'used' || (t.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
        const isExp = t.status?.toLowerCase() === 'expired' || (t.status as string)?.toLowerCase() === 'binned' || (t as any).isBinned;
        return att !== 'INSIDE' && !isExp;
      }) || matches[0];

    if (!existing) {
      return {
        success: false,
        code: 'NOT_FOUND',
        message: `Ticket code "${ticketIdOrCode}" not found in system.`,
      };
    }

    // Role check: If current user is Promoter, enforce storeId scope!
    if (currentUser.role === 'Promoter') {
      const allowedStoreId = currentUser.assignedStoreId;
      if (allowedStoreId && existing.storeId !== allowedStoreId) {
        return {
          success: false,
          code: 'UNAUTHORIZED_VENUE',
          message: `UNAUTHORIZED VENUE: This ticket is for "${existing.storeName}". Promoters can only track and check-in tickets for their own venue ("${currentUser.assignedStoreName || allowedStoreId}").`,
        };
      }
    }

    if (existing.status?.toLowerCase() === 'expired' || (existing.status as string)?.toLowerCase() === 'binned' || (existing as any).isBinned) {
      return {
        success: false,
        code: 'EXPIRED',
        message: `UNUSABLE / EXPIRED: Pass ${existing.ticketId} was moved to the Recycle Bin on the event day and cannot be checked in.`,
        ticket: existing,
      };
    }

    // Check if event date has not yet arrived
    const targetEvent = events.find((e) => e.id === existing.eventId);
    const dateToCheck = existing.eventDate || targetEvent?.date;
    const arrivalCheck = hasEventDateArrived(dateToCheck);

    if (!arrivalCheck.arrived) {
      return {
        success: false,
        code: 'EVENT_NOT_ARRIVED',
        message: `The date for this event has not yet arrived (${arrivalCheck.eventDateDisplay}). Scanning is disabled until the event date.`,
        ticket: existing,
      };
    }

    const currentAttendance = existing.attendanceStatus || (existing.status === 'used' || (existing.status as string) === 'inside' ? 'INSIDE' : 'OUTSIDE');
    const timeFormatted = formatMovementTime(new Date());
    const nowIso = new Date().toISOString();
    const bouncerName = currentUser.fullName || currentUser.name || 'Gate Bouncer';

    // Prevent duplicate INSIDE: if ticket is already INSIDE, show "ALREADY INSIDE - Since HH:mm" with option to CHECK OUT!
    if (currentAttendance === 'INSIDE') {
      return {
        success: false,
        code: 'ALREADY_INSIDE',
        message: `ALREADY INSIDE - Since ${existing.insideSince || existing.lastMovementAt || 'earlier'}`,
        ticket: existing,
      };
    }

    // Previous status was EXITED or OUTSIDE
    const isReentry = currentAttendance === 'EXITED';
    const logEntry: AttendanceLog = {
      action: 'CHECK_IN',
      timestamp: nowIso,
      timeFormatted,
      bouncerName,
      bouncerRole: currentUser.role,
      notes: isReentry ? 'Re-entry approved' : 'First-time gate entry',
    };

    const updatedLogs = [...(existing.attendanceLogs || []), logEntry];

    const updatedTicket: Ticket = {
      ...existing,
      status: 'inside',
      attendanceStatus: 'INSIDE',
      insideSince: timeFormatted,
      lastMovementAt: timeFormatted,
      attendanceLogs: updatedLogs,
      checkedAt: nowIso,
      checkedBy: bouncerName,
    };

    setTickets((prev) =>
      prev.map((t) => (t.id === existing.id ? updatedTicket : t))
    );

    // Sync to Firestore & offline queue
    try {
      await setDoc(doc(db, 'tickets', existing.id), updatedTicket, { merge: true });
    } catch (err) {
      console.warn('Firestore ticket checkin sync notice (queueing offline):', err);
      queueOfflineMovement({
        ticketId: existing.id,
        action: 'CHECK_IN',
        newStatus: 'INSIDE',
        timestamp: nowIso,
        timeFormatted,
        bouncerName,
        bouncerRole: currentUser.role,
      });
    }

    try {
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10B981', '#FACC15', '#FFFFFF'],
      });
    } catch {}

    const attendeeDisplayName = existing.attendeeName || existing.customerName;
    return {
      success: true,
      code: 'CHECKED_IN',
      message: `${attendeeDisplayName} - INSIDE THE EVENT - ${timeFormatted}`,
      ticket: updatedTicket,
    };
  };

  const checkOutTicket = async (
    ticketIdOrCode: string
  ): Promise<{ success: boolean; message: string; ticket?: Ticket; code?: string }> => {
    const scan = parseCustomerQrScan(ticketIdOrCode);
    if (scan.dynamicError) {
      return {
        success: false,
        code: scan.dynamicError,
        message: scan.dynamicErrorMessage,
      };
    }
    const matches = tickets.filter((t) => doesTicketMatchCustomerQr(t, scan));
    const existing =
      matches.find((t) => t.attendanceStatus === 'INSIDE' || t.status === 'used' || (t.status as string) === 'inside') ||
      matches[0];

    if (!existing) {
      return {
        success: false,
        code: 'NOT_FOUND',
        message: `Ticket code "${ticketIdOrCode}" not found in system.`,
      };
    }

    // Role check: If current user is Promoter, enforce storeId scope
    if (currentUser.role === 'Promoter') {
      const allowedStoreId = currentUser.assignedStoreId;
      if (allowedStoreId && existing.storeId !== allowedStoreId) {
        return {
          success: false,
          code: 'UNAUTHORIZED_VENUE',
          message: `UNAUTHORIZED VENUE: This ticket is for "${existing.storeName}". Promoters can only track tickets for their own venue.`,
        };
      }
    }

    const timeFormatted = formatMovementTime(new Date());
    const nowIso = new Date().toISOString();
    const bouncerName = currentUser.fullName || currentUser.name || 'Gate Bouncer';

    const logEntry: AttendanceLog = {
      action: 'CHECK_OUT',
      timestamp: nowIso,
      timeFormatted,
      bouncerName,
      bouncerRole: currentUser.role,
      notes: 'Customer exited event',
    };

    const updatedLogs = [...(existing.attendanceLogs || []), logEntry];

    const updatedTicket: Ticket = {
      ...existing,
      attendanceStatus: 'EXITED',
      exitedAt: timeFormatted,
      lastMovementAt: timeFormatted,
      attendanceLogs: updatedLogs,
    };

    setTickets((prev) =>
      prev.map((t) => (t.id === existing.id ? updatedTicket : t))
    );

    try {
      await setDoc(doc(db, 'tickets', existing.id), updatedTicket, { merge: true });
    } catch (err) {
      console.warn('Firestore ticket checkout sync notice (queueing offline):', err);
      queueOfflineMovement({
        ticketId: existing.id,
        action: 'CHECK_OUT',
        newStatus: 'EXITED',
        timestamp: nowIso,
        timeFormatted,
        bouncerName,
        bouncerRole: currentUser.role,
      });
    }

    const attendeeDisplayName = existing.attendeeName || existing.customerName;
    return {
      success: true,
      code: 'CHECKED_OUT',
      message: `${attendeeDisplayName} - EXITED at ${timeFormatted} - ALLOWED TO RE-ENTER`,
      ticket: updatedTicket,
    };
  };

  const openAdminLoginFlow = () => {
    setIsAdminSecurityModalOpen(true);
  };

  const handleAdminSecuritySuccess = () => {
    const curBal = Number(localStorage.getItem('wallet_balance') || 0);
    localStorage.setItem('wallet_balance', String(curBal));
    localStorage.setItem('ub_admin_session', 'true');
    sessionStorage.setItem('ub_admin_5locks_passed', 'true');
    sessionStorage.setItem('ub_app_active', 'true');

    const adminUser: UserProfile = pendingAdminAuthUser || {
      ...currentUser,
      role: 'Admin',
      walletBalance: curBal,
      assignedStoreId: '',
      assignedStoreName: '',
      isRegistered: true,
    };
    adminUser.role = 'Admin';
    adminUser.isRegistered = true;
    setCurrentUser(adminUser);
    localStorage.setItem('ub_user_profile', JSON.stringify(adminUser));
    localStorage.setItem('ub_has_registered', 'true');
    setUserWalletDoc((prev) => ({
      ...prev,
      balance: curBal,
    }));
    setIsAdminSecurityModalOpen(false);
    let pendingRoute = '';
    try {
      pendingRoute = sessionStorage.getItem('ub_pending_admin_route') || '';
      if (pendingRoute) sessionStorage.removeItem('ub_pending_admin_route');
    } catch {}
    if (pendingRoute) {
      setActiveModal(null);
      navigateTo(pendingRoute);
    } else {
      setActiveModal('admin-console');
      navigateTo('/');
    }
  };

  const wipeAndReset = async () => {
    try {
      if (auth.currentUser) {
        await deleteUser(auth.currentUser).catch(() => {});
      }
      if (auth) {
        await signOut(auth);
      }
    } catch (e) {
      console.warn('Auth signOut error:', e);
    }
    setFirebaseUser(null);

    // Delete users and wallets from Firestore
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const d of usersSnap.docs) {
        await deleteDoc(doc(db, 'users', d.id)).catch(() => {});
        await deleteDoc(doc(db, 'wallets', d.id)).catch(() => {});
        await setDoc(doc(db, 'revoked_users', d.id), {
          uid: d.id,
          deletedAt: new Date().toISOString(),
          reason: 'wipe_and_reset_all',
        }, { merge: true }).catch(() => {});
      }
    } catch (dbErr) {
      console.warn('Firestore wipe notice:', dbErr);
    }

    // Clear all local storage and session storage
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}

    setWelcomeMessage(null);
    setTickets([]);
    setCurrentUser({
      id: 'guest_user',
      name: 'New User',
      fullName: 'New User',
      email: '',
      phone: '',
      role: 'Customer',
      assignedStoreId: '',
      assignedStoreName: '',
      walletId: 'UB-000000',
      walletBalance: 0,
      isRegistered: false,
      age: 28,
    });

    setIsAdminSecurityModalOpen(false);
    setActiveModal(null);
    setSelectedTicket(null);
    setIsLocked(false);
    setCurrentRoute('/');
  };

  // Auto-sweep concluded tickets whose event day passed midnight into the Bill
  useEffect(() => {
    if (tickets.length > 0 && currentUser.id && currentUser.id !== 'guest_user') {
      sweepConcludedTicketsToBill(tickets, currentUser.id).then(({ billedCount, updatedTickets }) => {
        if (billedCount > 0) {
          setTickets(updatedTickets);
        }
      });
    }
  }, [tickets.length, currentUser.id]);

  const createOrAssignPromoter = async (
    promoterData: Omit<Promoter, 'id'>
  ): Promise<boolean> => {
    const newId = `promoter-${Date.now()}`;
    const fullPromoter: Promoter = {
      id: newId,
      ...promoterData,
      createdAt: new Date().toISOString(),
    };
    setPromoters((prev) => [fullPromoter, ...prev]);
    try {
      await setDoc(doc(db, 'promoters', newId), fullPromoter);
    } catch (err) {
      console.warn('Firestore promoter creation warning:', err);
    }
    return true;
  };

  const addNewEvent = async (eventData: Omit<EventItem, 'id'>): Promise<boolean> => {
    setEventActionError(null);
    const roleLower = (currentUser.role || '').toLowerCase();
    const isAdminUser =
      roleLower === 'admin' ||
      isAuthorizedAdminEmail(currentUser?.email) ||
      localStorage.getItem('ub_admin_session') === 'true';

    if (!isAdminUser && (roleLower === 'promoter' || roleLower === 'event organiser')) {
      const allowedStore = currentUser.assignedStoreId;
      if (allowedStore && eventData.storeId && eventData.storeId !== allowedStore) {
        setEventActionError(
          `Unauthorized: You are assigned to manage ${currentUser.assignedStoreName || allowedStore}. You cannot create events for another promoter's store.`
        );
        return false;
      }
    }

    // RULE: Do not allow publishing an event whose date/time is already in the past
    const rawDateStr = eventData.date || eventData.event_date || '';
    if (rawDateStr && isEventExpired(rawDateStr)) {
      setEventActionError(
        `Event date "${rawDateStr}" has already passed. Please choose an upcoming date & time.`
      );
      return false;
    }

    // RULE: Every event has its own day. A store cannot host two events on the same day.
    if (eventData.storeId && eventData.storeId.trim() !== '') {
      const conflictingEvent = events.find(
        (e) => e.storeId === eventData.storeId && isSameDay(e.date, eventData.date)
      );

      if (conflictingEvent) {
        const storeObj = stores.find((s) => s.id === eventData.storeId);
        const storeName = storeObj ? storeObj.name : 'this store';
        setEventActionError(
          `Schedule Conflict: ${storeName} already has an event ("${conflictingEvent.title}") scheduled for ${eventData.date}. A store can only have ONE event per day.`
        );
        return false;
      }
    }

    const newId = `ev-${Date.now()}`;
    const parsedLimit =
      eventData.ticketsAvailable !== undefined && eventData.ticketsAvailable !== null
        ? Math.max(1, Math.floor(Number(eventData.ticketsAvailable)))
        : 200;

    const eventSlug = generateUniqueEventSlug(eventData.title, newId, events);
    const eventLink = `${getPublicWebOrigin()}/event/${eventSlug}`;

    const fullEvent: EventItem = {
      id: newId,
      ...eventData,
      eventSlug,
      eventLink,
      ticketsAvailable: Number.isFinite(parsedLimit) ? parsedLimit : 200,
      ticketsSold: eventData.ticketsSold ?? 0,
      creatorId: currentUser.id,
    };

    const cleanPayload = cleanForFirestore(fullEvent);
    const payloadBytes = estimateDocByteSize(cleanPayload);
    if (payloadBytes > 950_000) {
      setEventActionError(
        'Event poster image is too large to save (exceeds 950KB limit). Please pick a smaller photo or paste an image URL.'
      );
      return false;
    }

    try {
      await setDoc(doc(db, 'events', newId), cleanPayload);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `events/${newId}`);
      const msg = String(err?.message || err || '');
      if (msg.toLowerCase().includes('maximum') || msg.toLowerCase().includes('size') || msg.toLowerCase().includes('too large')) {
        setEventActionError('Event poster image exceeds database size limits. Please choose a smaller photo or paste an image URL.');
      } else {
        setEventActionError(`Could not publish event to server: ${msg || 'Network or permission error. Please try again.'}`);
      }
      return false;
    }

    setEvents((prev) => {
      const deduped = prev.filter((e) => e.id !== newId);
      const updated = [fullEvent, ...deduped];
      try {
        localStorage.setItem('ub_local_events', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    return true;
  };

  const updateEvent = async (eventId: string, updatedData: Partial<EventItem>): Promise<boolean> => {
    setEventActionError(null);
    const existingEvent = events.find((e) => e.id === eventId);
    const roleLower = (currentUser.role || '').toLowerCase();
    const isAdminUser =
      roleLower === 'admin' ||
      isAuthorizedAdminEmail(currentUser?.email) ||
      localStorage.getItem('ub_admin_session') === 'true';

    if (!isAdminUser) {
      const isCreator = existingEvent?.creatorId && existingEvent.creatorId === currentUser.id;
      const isAssignedStore =
        currentUser.assignedStoreId &&
        (existingEvent?.storeId === currentUser.assignedStoreId ||
          updatedData.storeId === currentUser.assignedStoreId);
      if (!isCreator && !isAssignedStore) {
        setEventActionError('Unauthorized: You do not have permission to edit this event.');
        return false;
      }
    }

    const nextStoreId =
      updatedData.storeId !== undefined ? updatedData.storeId : existingEvent?.storeId || '';
    const nextDate = updatedData.date !== undefined ? updatedData.date : existingEvent?.date || '';

    // RULE: Store cannot host two events on the same day (exclude current eventId)
    if (nextStoreId && nextStoreId.trim() !== '' && nextDate) {
      const conflictingEvent = events.find(
        (e) => e.id !== eventId && e.storeId === nextStoreId && isSameDay(e.date, nextDate)
      );
      if (conflictingEvent) {
        const storeObj = stores.find((s) => s.id === nextStoreId);
        const storeName = storeObj ? storeObj.name : 'this store';
        setEventActionError(
          `Schedule Conflict: ${storeName} already has an event ("${conflictingEvent.title}") scheduled for ${nextDate}. A store can only have ONE event per day.`
        );
        return false;
      }
    }

    // Prevent setting ticket limit lower than tickets already sold
    const soldFromTickets = tickets.filter((t) => t.eventId === eventId).length;
    const currentSold = Math.max(Number(existingEvent?.ticketsSold || 0), soldFromTickets);
    if (
      updatedData.ticketsAvailable !== undefined &&
      updatedData.ticketsAvailable !== null
    ) {
      const nextLimit = Math.floor(Number(updatedData.ticketsAvailable));
      if (!Number.isFinite(nextLimit) || nextLimit < 1) {
        setEventActionError('Ticket limit must be at least 1.');
        return false;
      }
      if (nextLimit < currentSold) {
        setEventActionError(
          `Invalid Ticket Limit: ${currentSold} ticket${currentSold === 1 ? ' has' : 's have'} already been sold for this event. Limit must be at least ${currentSold}.`
        );
        return false;
      }
    }

    const nextTitle = updatedData.title !== undefined ? updatedData.title : existingEvent?.title || 'event';
    const shouldRefreshSlug = updatedData.title !== undefined || !existingEvent?.eventSlug;
    const nextEventSlug = shouldRefreshSlug
      ? generateUniqueEventSlug(nextTitle, eventId, events)
      : existingEvent?.eventSlug || generateUniqueEventSlug(nextTitle, eventId, events);
    const nextEventLink = `${getPublicWebOrigin()}/event/${nextEventSlug}`;

    const cleanUpdates = cleanForFirestore({
      ...updatedData,
      eventSlug: nextEventSlug,
      eventLink: nextEventLink,
    });
    const mergedEstimate = existingEvent ? { ...existingEvent, ...cleanUpdates } : cleanUpdates;
    if (estimateDocByteSize(mergedEstimate) > 950_000) {
      setEventActionError(
        'Updated poster image is too large to save (exceeds 950KB limit). Please pick a smaller photo or use an image URL.'
      );
      return false;
    }

    try {
      await setDoc(doc(db, 'events', eventId), cleanUpdates, { merge: true });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `events/${eventId}`);
      const msg = String(err?.message || err || '');
      setEventActionError(`Could not save event changes: ${msg || 'Network or permission error.'}`);
      return false;
    }

    setEvents((prev) => {
      const updated = prev.map((e) => (e.id === eventId ? { ...e, ...cleanUpdates } : e));
      try {
        localStorage.setItem('ub_local_events', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    setSelectedBuyingEvent((prev) =>
      prev && prev.id === eventId ? { ...prev, ...cleanUpdates } : prev
    );

    return true;
  };

  const deleteEvent = async (eventId: string): Promise<boolean> => {
    setEvents((prev) => {
      const updated = prev.filter((e) => e.id !== eventId);
      try {
        localStorage.setItem('ub_local_events', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    setSelectedBuyingEvent((prev) => (prev && prev.id === eventId ? null : prev));
    setEditingEvent((prev) => (prev && prev.id === eventId ? null : prev));

    try {
      await deleteDoc(doc(db, 'events', eventId));
    } catch (err) {
      console.warn('Firestore delete event error:', err);
    }
    return true;
  };

  const addNewStore = async (storeData: Omit<Store, 'id'>): Promise<boolean> => {
    const newId = `store-${Date.now()}`;
    const fullStore: Store = {
      id: newId,
      ...storeData,
      ownerId: currentUser.id,
      createdAt: new Date().toISOString(),
    };

    setStores((prev) => {
      const updated = [fullStore, ...prev];
      try {
        localStorage.setItem('ub_local_stores', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await setDoc(doc(db, 'stores', newId), fullStore);
    } catch (err) {
      console.warn('Firestore save store error:', err);
    }
    return true;
  };

  const updateStore = async (storeId: string, updatedData: Partial<Store>): Promise<boolean> => {
    setStores((prev) => {
      const updated = prev.map((s) => (s.id === storeId ? { ...s, ...updatedData } : s));
      try {
        localStorage.setItem('ub_local_stores', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    try {
      const cleanData = cleanForFirestore(updatedData);
      await updateDoc(doc(db, 'stores', storeId), cleanData);
    } catch (err) {
      console.warn('Firestore update store error:', err);
    }
    return true;
  };

  const deleteStore = async (storeId: string): Promise<boolean> => {
    setStores((prev) => {
      const updated = prev.filter((s) => s.id !== storeId);
      try {
        localStorage.setItem('ub_local_stores', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // Also remove events linked to this store
    setEvents((prev) => {
      const updated = prev.filter((e) => e.storeId !== storeId);
      try {
        localStorage.setItem('ub_local_events', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await deleteDoc(doc(db, 'stores', storeId));
    } catch (err) {
      console.warn('Firestore delete store error:', err);
    }

    if (selectedStoreId === storeId) {
      setSelectedStoreId(null);
    }

    return true;
  };

  const updateStoreRequestStatus = (requestId: string, status: 'approved' | 'rejected') => {
    setStoreRequests((prev) =>
      prev.map((req) => (req.id === requestId ? { ...req, status } : req))
    );
    updateDoc(doc(db, 'store_requests', requestId), { status }).catch(() => {});
  };

  const submitPromoterApplication = async (params: {
    userId: string;
    fullName: string;
    email: string;
    phone: string;
    storeName: string;
    reason: string;
  }): Promise<boolean> => {
    const reqId = 'req-' + Date.now();
    const newReq: StoreRequest = {
      id: reqId,
      storeName: params.storeName,
      ownerName: params.fullName,
      location: params.reason || 'General Promoter Application',
      status: 'pending',
      submittedAt: new Date().toISOString().split('T')[0],
    };
    setStoreRequests((prev) => [newReq, ...prev]);
    await setDoc(doc(db, 'store_requests', reqId), newReq, { merge: true }).catch(() => {});
    return true;
  };

  const addWalletTransaction = (tx: Omit<WalletTransaction, 'id' | 'date'>) => {
    const newTx: WalletTransaction = {
      id: 'tx-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...tx,
    };
    setWalletTransactions((prev) => {
      const updated = [newTx, ...prev];
      try {
        localStorage.setItem('ub_wallet_transactions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const resetWallet = () => {
    localStorage.setItem('wallet_balance', '0');
    localStorage.setItem('ub_wallet_transactions', JSON.stringify([]));
    setWalletTransactions([]);
    setCurrentUser((prev) => {
      const updated = { ...prev, walletBalance: 0 };
      try {
        localStorage.setItem('ub_user_profile', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    setUserWalletDoc((prev) => ({
      ...prev,
      balance: 0,
    }));
    try {
      setDoc(doc(db, 'users', currentUser.id), { walletBalance: 0 }, { merge: true });
      setDoc(
        doc(db, 'wallets', currentUser.id),
        { userId: currentUser.id, balance: 0, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (e) {}
  };

  const topUpWallet = async (amount: number, ref?: string) => {
    const currentStoredBal = Number(localStorage.getItem('wallet_balance') || 0);
    const newBalance = Math.max(0, currentStoredBal + amount);
    const userEmail = (currentUser?.email || '').toLowerCase().trim();

    localStorage.setItem('wallet_balance', String(newBalance));
    if (userEmail) {
      try {
        localStorage.setItem(`ub_wallet_balance_${userEmail}`, String(newBalance));
      } catch (e) {}
    }

    // Persist in ub_registered_users
    try {
      const raw = localStorage.getItem('ub_registered_users');
      if (raw) {
        const list = JSON.parse(raw);
        const idx = list.findIndex((u: any) =>
          (userEmail && u.email?.toLowerCase() === userEmail) ||
          (u.id && u.id === currentUser.id)
        );
        if (idx >= 0) {
          list[idx].walletBalance = newBalance;
          localStorage.setItem('ub_registered_users', JSON.stringify(list));
        }
      }
    } catch (e) {}

    setCurrentUser((prev) => {
      const updated = { ...prev, walletBalance: newBalance };
      try {
        localStorage.setItem('ub_user_profile', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    setUserWalletDoc((prev) => ({
      ...prev,
      balance: newBalance,
    }));
    addWalletTransaction({
      type: 'topup',
      title: 'Card Top-Up',
      subtitle: ref ? `Card • Ref: ${ref}` : 'Cashless Credit',
      amount: amount,
      reference: ref,
    });
    try {
      await setDoc(doc(db, 'users', currentUser.id), { walletBalance: newBalance }, { merge: true });
      await setDoc(
        doc(db, 'wallets', currentUser.id),
        { userId: currentUser.id, balance: newBalance, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      console.log('TopUpWallet: Firebase updated successfully');
    } catch (err) {
      console.error('Firestore balance update error:', err);
    }
  };

  // Helper to check admin email
  const isEmailAdmin = (email?: string) => {
    if (!email) return false;
    const clean = email.trim().toLowerCase();
    return (
      clean === 'tetelophokwane98@gmail.com' ||
      clean === 'admin@universalband.co.za' ||
      clean === 'admin@ub.co.za' ||
      isAuthorizedAdminEmail(clean)
    );
  };

  // Firebase Auth listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setIsAppReady(true); // App ready once auth state resolved
      if (!user) return;

      // Do not overwrite session if secondary security verification or registration is actively in progress
      if (pendingSecurityAuthRef.current || googleRegistrationLockRef.current || authRegistrationLockRef.current) return;

      const isRegistered = localStorage.getItem('ub_has_registered') === 'true';
      const isAdminSession = localStorage.getItem('ub_admin_session') === 'true';

      try {
        let userDocData: any = null;
        const uDoc = await getDoc(doc(db, 'users', user.uid));
        const revokedDoc = await getDoc(doc(db, 'revoked_users', user.uid));

        // If the user's Firestore document was deleted or marked revoked, purge from Auth and localStorage
        const cleanUserEmail = (user.email || '').toLowerCase().trim();
        const isMasterAdmin = isEmailAdmin(cleanUserEmail);

        if (!isMasterAdmin && (revokedDoc.exists() || uDoc.data()?.deleted === true || uDoc.data()?.status === 'deleted')) {
          console.log('onAuthStateChanged: User document was explicitly revoked or deleted in Firestore. Purging session.');
          await deleteUser(user).catch(() => {});
          await signOut(auth).catch(() => {});
          localStorage.removeItem('ub_admin_session');
          localStorage.removeItem('ub_has_registered');
          localStorage.removeItem('ub_user_profile');
          localStorage.removeItem('wallet_balance');
          localStorage.removeItem('ub_pending_verification');
          localStorage.removeItem('ub_recovery_email');
          if (cleanUserEmail) {
            localStorage.removeItem(`ub_wallet_balance_${cleanUserEmail}`);
          }
          setWelcomeMessage(null);
          setFirebaseUser(null);
          setTickets([]);
          setCurrentUser({
            id: 'guest_user',
            name: 'New User',
            fullName: 'New User',
            email: '',
            phone: '',
            role: 'Customer',
            walletBalance: 0,
            isRegistered: false,
          });
          setCurrentRoute('/');
          return;
        }

        if (uDoc.exists()) {
          userDocData = uDoc.data();
        } else if (user.email) {
          const cleanEmail = user.email.toLowerCase().trim();
          const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
          const snap = await getDocs(q);
          if (!snap.empty) {
            userDocData = snap.docs[0].data();
          } else if (isEmailAdmin(cleanEmail)) {
            const adminDoc = await getDoc(doc(db, 'users', 'user_admin'));
            if (adminDoc.exists()) {
              userDocData = adminDoc.data();
            }
          }

          // Auto-provision missing Firestore document for authentic Firebase Auth users
          const displayName = user.displayName || userDocData?.fullName || userDocData?.name || cleanEmail.split('@')[0] || 'User';
          const autoCustQrId = resolveCustomerQrId(user.uid, userDocData?.customerQrId);
          const newDoc = {
            id: user.uid,
            name: displayName,
            fullName: displayName,
            email: cleanEmail,
            phone: userDocData?.phone || '',
            role: isEmailAdmin(cleanEmail) ? 'Admin' : (userDocData?.role || 'Customer'),
            status: 'active',
            walletBalance: typeof userDocData?.walletBalance === 'number' ? userDocData.walletBalance : 0,
            createdAt: userDocData?.createdAt || new Date().toISOString(),
            isRegistered: true,
            emailVerified: user.emailVerified || true,
            customerQrId: autoCustQrId || undefined,
          };
          await setDoc(doc(db, 'users', user.uid), cleanForFirestore(newDoc), { merge: true }).catch(() => {});
          await setDoc(doc(db, 'wallets', user.uid), {
            userId: user.uid,
            balance: newDoc.walletBalance,
            createdAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});

          if (!userDocData) {
            userDocData = newDoc;
          }
        }

        const email = (user.email || userDocData?.email || '').toLowerCase().trim();
        const isDocAdmin =
          userDocData?.role === 'Admin' ||
          userDocData?.role === 'admin' ||
          userDocData?.isAdmin === true;
        const isAdmin = isEmailAdmin(email) || isDocAdmin || isAdminSession;
        if (isAdmin && email) {
          addAuthorizedAdminEmail(email);
          if (localStorage.getItem('ub_admin_session') !== 'true') {
            await signOut(auth).catch(() => {});
            setFirebaseUser(null);
            return;
          }
        }

        const isKnownPromoter = email
          ? INITIAL_PROMOTERS.some((p) => p.email.toLowerCase() === email)
          : false;

        const role = isAdmin
          ? 'Admin'
          : (userDocData?.role === 'Promoter' || isKnownPromoter
              ? 'Promoter'
              : (userDocData?.role || 'Customer'));

        const isNonCustomerRole =
          role === 'Event Organiser' ||
          role === 'Seller' ||
          role === 'Driver' ||
          role === 'Shop Worker' ||
          (role === 'Promoter' && !isKnownPromoter);
        const isApprovedOrActive =
          userDocData?.isApproved === true ||
          userDocData?.status === 'approved' ||
          userDocData?.status === 'active';

        if (!isAdmin && isNonCustomerRole && !isApprovedOrActive) {
          await signOut(auth).catch(() => {});
          localStorage.removeItem('ub_admin_session');
          localStorage.removeItem('ub_has_registered');
          localStorage.removeItem('ub_user_profile');
          setFirebaseUser(null);
          return;
        }

        const fallbackName =
          email === 'tetelophokwane98@gmail.com'
            ? 'Tetelo Phokwane'
            : (isAdmin ? 'System Admin' : (email ? email.split('@')[0] : 'User'));

        const resolvedName =
          userDocData?.fullName && userDocData.fullName !== 'New User'
            ? userDocData.fullName
            : (userDocData?.name && userDocData.name !== 'New User'
                ? userDocData.name
                : (user.displayName || fallbackName));

        const balance = typeof userDocData?.walletBalance === 'number' ? userDocData.walletBalance : 0;
        const resolvedCustomerQrId = resolveCustomerQrId(user.uid, userDocData?.customerQrId);

        if (uDoc.exists() && resolvedCustomerQrId && !userDocData?.customerQrId) {
          await setDoc(doc(db, 'users', user.uid), { customerQrId: resolvedCustomerQrId }, { merge: true }).catch(() => {});
        }

        const updatedProfile: UserProfile = {
          id: user.uid,
          name: resolvedName,
          fullName: resolvedName,
          email: email,
          phone: userDocData?.phone || '',
          role,
          status: userDocData?.status || (isApprovedOrActive ? 'approved' : 'active'),
          isApproved: isApprovedOrActive || isAdmin || role === 'Customer',
          approvedAt: userDocData?.approvedAt,
          createdAt: userDocData?.createdAt,
          walletBalance: balance,
          assignedStoreId: userDocData?.assignedStoreId || '',
          assignedStoreName: userDocData?.assignedStoreName || '',
          organisationName: userDocData?.organisationName || '',
          shopName: userDocData?.shopName || '',
          whatToSell: userDocData?.whatToSell || '',
          vehicleType: userDocData?.vehicleType || '',
          licensePlate: userDocData?.licensePlate || '',
          driverLicenseNumber: userDocData?.driverLicenseNumber || '',
          isRegistered: true,
          emailVerified: true,
          customerQrId: resolvedCustomerQrId || undefined,
          photo: user.photoURL || userDocData?.photo,
        };

        if (Boolean(user) || isRegistered || isAdminSession || userDocData || isAdmin) {
          setCurrentUser(updatedProfile);
          localStorage.setItem('ub_user_profile', JSON.stringify(updatedProfile));
          localStorage.setItem('ub_has_registered', 'true');
          localStorage.setItem('wallet_balance', String(balance));
          if (email) {
            localStorage.setItem(`ub_wallet_balance_${email}`, String(balance));
          }
        }
      } catch (err) {
        console.warn('onAuthStateChanged profile sync notice:', err);
      }
    });
    return () => unsubAuth();
  }, []);

  const loginAsAdminMaster = () => {
    setCurrentRoute('/login');
  };

  const sendEmailOtp = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail, getActionCodeSettings());
      setWelcomeMessage(`Password reset email sent to ${cleanEmail}. Please check your inbox.`);
      return { success: true };
    } catch (err: any) {
      console.warn('Firebase sendPasswordResetEmail notice:', err);
      return { success: false, error: err?.message || 'Failed to send password reset email. Please try again.' };
    }
  };

  const resetPasswordWithOtp = async (
    email: string,
    otp: string,
    newPass: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (!cleanEmail) {
      return { success: false, error: 'Email address is required.' };
    }
    if (!cleanOtp || cleanOtp.length !== 6) {
      return { success: false, error: 'Please enter a valid 6-digit OTP code.' };
    }
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'New password must be at least 6 characters.' };
    }

    const rawOtp = localStorage.getItem(`ub_otp_${cleanEmail}`);
    if (!rawOtp) {
      return { success: false, error: 'No active OTP session found. Please request a new OTP code.' };
    }

    try {
      const payload = JSON.parse(rawOtp);
      if (payload.otp !== cleanOtp) {
        return { success: false, error: 'Invalid 6-digit OTP code. Please check and try again.' };
      }
      if (Date.now() > payload.expiresAt) {
        return { success: false, error: 'OTP code has expired. Please request a new OTP.' };
      }
    } catch (e) {
      return { success: false, error: 'Invalid OTP session data.' };
    }

    // Update password in local registered users array
    try {
      const rawUsers = localStorage.getItem('ub_registered_users');
      if (rawUsers) {
        const usersList: any[] = JSON.parse(rawUsers);
        const updated = usersList.map((u) => {
          if (u.email?.toLowerCase() === cleanEmail) {
            return { ...u, password: newPass };
          }
          return u;
        });
        localStorage.setItem('ub_registered_users', JSON.stringify(updated));
      }
    } catch (e) {}

    // Update current user profile if matching email
    if (currentUser.email?.toLowerCase() === cleanEmail) {
      const updatedProf = { ...currentUser, isRegistered: true };
      setCurrentUser(updatedProf);
      localStorage.setItem('ub_user_profile', JSON.stringify(updatedProf));
    }

    // Update in Firebase Auth if currently logged in
    if (auth.currentUser && auth.currentUser.email?.toLowerCase() === cleanEmail) {
      try {
        await updatePassword(auth.currentUser, newPass);
      } catch (e) {
        console.warn('Firebase Auth update password notice:', e);
      }
    }

    localStorage.removeItem(`ub_otp_${cleanEmail}`);
    setWelcomeMessage('Password changed successfully! You can now log in.');
    return { success: true };
  };

  const resetPasswordDirectly = async (
    email: string,
    newPass: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'New password must be at least 6 characters.' };
    }

    // Update password in local registered users array
    try {
      const rawUsers = localStorage.getItem('ub_registered_users');
      if (rawUsers) {
        const usersList: any[] = JSON.parse(rawUsers);
        const updated = usersList.map((u) => {
          if (u.email?.toLowerCase() === cleanEmail) {
            return { ...u, password: newPass };
          }
          return u;
        });
        localStorage.setItem('ub_registered_users', JSON.stringify(updated));
      }
    } catch (e) {}

    // Update current user profile if matching email
    if (currentUser.email?.toLowerCase() === cleanEmail) {
      const updatedProf = { ...currentUser, isRegistered: true };
      setCurrentUser(updatedProf);
      localStorage.setItem('ub_user_profile', JSON.stringify(updatedProf));
    }

    // Also attempt Firebase password reset email in background
    try {
      await sendPasswordResetEmail(auth, cleanEmail, getActionCodeSettings());
    } catch (e) {}

    setWelcomeMessage('Password updated successfully! You can now log in.');
    return { success: true };
  };

  const registerWithEmail = async (params: {
    fullName: string;
    phone: string;
    email: string;
    password: string;
  }): Promise<{ success: boolean; error?: string; requireVerification?: boolean; email?: string; fullName?: string }> => {
    const cleanName = params.fullName.trim();
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanPhone = params.phone.trim();
    const password = params.password;

    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: 'Please enter your full name.' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    const rawPhone = cleanPhone.replace(/[\s-]/g, '');
    const saPhoneRegex = /^(?:(?:\+27)|0)[6-8][0-9]{8}$/;
    if (!saPhoneRegex.test(rawPhone)) {
      return {
        success: false,
        error: 'Please enter a valid South African phone number (e.g. 082 123 4567 or +27 82 123 4567).',
      };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    let uid = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Check if email is already registered locally
    try {
      const existingRaw = localStorage.getItem('ub_registered_users');
      if (existingRaw) {
        const existingList: any[] = JSON.parse(existingRaw);
        if (existingList.some((u) => u.email?.toLowerCase() === cleanEmail)) {
          return { success: false, error: 'Email already exists. Please log in.' };
        }
      }
    } catch (e) {}

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      uid = userCredential.user.uid;
      try {
        await updateProfile(userCredential.user, {
          displayName: cleanName,
        });
      } catch (e) {}

      // 2. Immediately call sendEmailVerification(auth.currentUser)
      await sendEmailVerification(userCredential.user, getActionCodeSettings());

      // 3. Save user to Firestore starting with R0.00 balance
      const signupBal = 0;

      const newProfile: UserProfile = {
        id: uid,
        name: cleanName,
        fullName: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        role: isEmailAdmin(cleanEmail) ? 'Admin' : 'Customer',
        walletBalance: signupBal,
        customerQrId: resolveCustomerQrId(uid),
        isRegistered: true,
        emailVerified: isEmailAdmin(cleanEmail),
      };

      try {
        await setDoc(doc(db, 'users', uid), cleanForFirestore(newProfile), { merge: true });
        await setDoc(doc(db, 'wallets', uid), {
          userId: uid,
          balance: signupBal,
          createdAt: new Date().toISOString(),
        }, { merge: true });
      } catch (dbErr) {
        console.warn('Firestore user doc write:', dbErr);
      }

      try {
        const existingRaw = localStorage.getItem('ub_registered_users');
        const existingList: any[] = existingRaw ? JSON.parse(existingRaw) : [];
        const existingIdx = existingList.findIndex((u) => u.email?.toLowerCase() === cleanEmail);
        if (existingIdx >= 0) {
          existingList[existingIdx] = { ...newProfile, password };
        } else {
          existingList.push({ ...newProfile, password });
        }
        localStorage.setItem('ub_registered_users', JSON.stringify(existingList));
      } catch (e) {}

      // 4. Auto-login user and grant immediate access
      setFirebaseUser(userCredential.user);
      setCurrentUser(newProfile);
      localStorage.setItem('wallet_balance', String(signupBal));
      localStorage.setItem(`ub_wallet_balance_${cleanEmail}`, String(signupBal));
      localStorage.setItem('ub_user_profile', JSON.stringify(newProfile));
      localStorage.setItem('ub_has_registered', 'true');
      localStorage.setItem(`ub_email_verified_${cleanEmail}`, 'true');
      handleSetPendingVerification(null);
      setWelcomeMessage(`Welcome ${cleanName}! Account created successfully.`);

      return {
        success: true,
        email: cleanEmail,
        fullName: cleanName,
      };
    } catch (authErr: any) {
      console.warn('Firebase Auth Registration Notice:', authErr?.code, authErr?.message);
      if (authErr?.code === 'auth/email-already-in-use') {
        return { success: false, error: 'Email already exists. Please log in.' };
      } else if (authErr?.code === 'auth/invalid-email') {
        return { success: false, error: 'Invalid email address provided.' };
      } else if (authErr?.code === 'auth/weak-password') {
        return { success: false, error: 'Password must be at least 6 characters.' };
      } else if (authErr?.code === 'auth/network-request-failed') {
        return { success: false, error: 'Network error. Please check your internet connection.' };
      }
      return { success: false, error: authErr?.message || 'Failed to create account.' };
    }
  };

  const loginWithEmailOrPhone = async (
    identifier: string,
    pass: string
  ): Promise<{
    success: boolean;
    error?: string;
    requireVerification?: boolean;
    requireSecurityVerification?: boolean;
    requireAdminSecurity?: boolean;
    pendingUser?: UserProfile;
    email?: string;
    fullName?: string;
  }> => {
    const cleanId = identifier.trim();
    if (!cleanId) {
      return { success: false, error: 'Please enter your email or South African phone number.' };
    }
    if (!pass) {
      return { success: false, error: 'Please enter your password.' };
    }

    const isEmail = cleanId.includes('@');
    let targetEmail = cleanId.toLowerCase();

    if (!isEmail) {
      const cleanPhone = cleanId.replace(/[\s-]/g, '');
      try {
        const q = query(collection(db, 'users'), where('phone', '==', cleanId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const u = snap.docs[0].data() as UserProfile;
          if (u.email) {
            targetEmail = u.email;
          }
        }
      } catch (e) {}

      try {
        const raw = localStorage.getItem('ub_registered_users');
        if (raw) {
          const list: any[] = JSON.parse(raw);
          const match = list.find((u) => {
            const uPhone = (u.phone || '').replace(/[\s-]/g, '');
            return uPhone === cleanPhone || u.phone === cleanId;
          });
          if (match && match.email) {
            targetEmail = match.email;
          }
        }
      } catch (e) {}
    }

    // 1. Authenticate exclusively with Firebase Auth
    try {
      const res = await signInWithEmailAndPassword(auth, targetEmail, pass);
      if (res.user) {
        // Genuine Firebase Auth user confirmed!
        setFirebaseUser(res.user);

        // Load profile from Firestore
        let userDocData: Partial<UserProfile> | null = null;
        try {
          const uDoc = await getDoc(doc(db, 'users', res.user.uid));
          if (uDoc.exists()) {
            userDocData = uDoc.data() as UserProfile;
          } else {
            const cleanTarget = targetEmail.toLowerCase().trim();
            const q = query(collection(db, 'users'), where('email', '==', cleanTarget));
            const snap = await getDocs(q);
            if (!snap.empty) {
              userDocData = snap.docs[0].data() as UserProfile;
            } else if (isEmailAdmin(cleanTarget)) {
              const adminDoc = await getDoc(doc(db, 'users', 'user_admin'));
              if (adminDoc.exists()) {
                userDocData = adminDoc.data() as UserProfile;
              }
            }
          }
        } catch (dbErr) {
          console.warn('Firestore user fetch notice:', dbErr);
        }

        // Determine if account is an Admin
        const isDocAdmin =
          userDocData?.role === 'Admin' ||
          userDocData?.role === 'admin' ||
          (userDocData as any)?.isAdmin === true;
        const isAdmin = isEmailAdmin(res.user.email || targetEmail) || isDocAdmin;
        if (isAdmin) {
          addAuthorizedAdminEmail(res.user.email || targetEmail);
          localStorage.removeItem('ub_admin_session');
          sessionStorage.removeItem('ub_admin_5locks_passed');
        }

        // Verification check for non-admin accounts (allow if admin-approved or Firestore emailVerified)
        const isDocVerifiedOrApproved =
          userDocData?.emailVerified === true ||
          userDocData?.isApproved === true ||
          userDocData?.status === 'approved';
        if (!isAdmin && !res.user.emailVerified && !isUserVerified(targetEmail, res.user) && !isDocVerifiedOrApproved) {
          await signOut(auth);
          setFirebaseUser(null);
          handleSetPendingVerification({
            email: targetEmail,
            fullName: res.user.displayName || targetEmail.split('@')[0],
          });
          return {
            success: false,
            requireVerification: true,
            email: targetEmail,
            fullName: res.user.displayName || targetEmail.split('@')[0],
            error: 'Email not verified. Please check your inbox for verification link. Check spam folder.',
          };
        }

        // Load wallet balance from Firestore
        let walletBal = 0;
        try {
          const wDoc = await getDoc(doc(db, 'wallets', res.user.uid));
          if (wDoc.exists() && typeof wDoc.data()?.balance === 'number') {
            walletBal = wDoc.data().balance;
          } else if (typeof userDocData?.walletBalance === 'number') {
            walletBal = userDocData.walletBalance;
          }
        } catch (wErr) {
          console.warn('Firestore wallet fetch notice:', wErr);
        }

        const isKnownPromoter = INITIAL_PROMOTERS.some(
          (p) => p.email.toLowerCase() === targetEmail.toLowerCase().trim()
        );
        const role = isAdmin
          ? 'Admin'
          : (userDocData?.role === 'Promoter' || isKnownPromoter ? 'Promoter' : (userDocData?.role || 'Customer'));

        const fallbackAdminName =
          targetEmail.toLowerCase().trim() === 'tetelophokwane98@gmail.com'
            ? 'Tetelo Phokwane'
            : (targetEmail.toLowerCase().trim() === 'admin@universalband.co.za' ? 'System Admin' : 'System Admin');

        const resolvedName =
          userDocData?.fullName && userDocData.fullName !== 'New User'
            ? userDocData.fullName
            : (userDocData?.name && userDocData.name !== 'New User'
                ? userDocData.name
                : (res.user.displayName || (isAdmin ? fallbackAdminName : targetEmail.split('@')[0])));

        // Role Approval Enforcement for Event Organiser, Seller, Driver, Shop Worker
        const isNonCustomerRole = role === 'Event Organiser' || role === 'Seller' || role === 'Driver' || role === 'Shop Worker' || (role === 'Promoter' && !isKnownPromoter && !isAdmin);
        const isApprovedAccount = userDocData?.isApproved === true || userDocData?.status === 'approved' || userDocData?.status === 'active';

        if (!isAdmin && isNonCustomerRole && !isApprovedAccount) {
          await signOut(auth);
          setFirebaseUser(null);
          if (userDocData?.status === 'rejected') {
            return {
              success: false,
              error: `Your account application was rejected. Reason: ${userDocData?.rejectionReason || 'Please contact admin for assistance.'}`,
            };
          }
          return {
            success: false,
            error: 'Your account is pending approval. Our team will review your application. You will get an SMS / notification when approved.',
          };
        }

        const loggedInUser: UserProfile = {
          id: res.user.uid,
          name: resolvedName,
          fullName: resolvedName,
          email: res.user.email || targetEmail,
          phone: userDocData?.phone || '',
          role,
          status: userDocData?.status || (isNonCustomerRole ? 'approved' : 'active'),
          isApproved: isApprovedAccount || !isNonCustomerRole || isAdmin,
          approvedAt: userDocData?.approvedAt,
          createdAt: userDocData?.createdAt,
          walletBalance: walletBal,
          assignedStoreId: userDocData?.assignedStoreId || '',
          assignedStoreName: userDocData?.assignedStoreName || '',
          organisationName: userDocData?.organisationName || '',
          shopName: userDocData?.shopName || '',
          whatToSell: userDocData?.whatToSell || '',
          vehicleType: userDocData?.vehicleType || '',
          licensePlate: userDocData?.licensePlate || '',
          driverLicenseNumber: userDocData?.driverLicenseNumber || '',
          customerQrId: resolveCustomerQrId(res.user.uid, userDocData?.customerQrId) || undefined,
          isRegistered: true,
          emailVerified: true,
        };

        // Persist to users/{uid} for consistent fast lookups
        try {
          await setDoc(doc(db, 'users', res.user.uid), cleanForFirestore(loggedInUser), { merge: true });
        } catch (e) {}

        if (isAdmin) {
          localStorage.removeItem('ub_admin_session');
          sessionStorage.removeItem('ub_admin_5locks_passed');
          localStorage.setItem('ub_admin_email', targetEmail.toLowerCase().trim());
          setPendingAdminAuthUser(loggedInUser);
          setIsAdminSecurityModalOpen(true);
          return {
            success: false,
            requireAdminSecurity: true,
            pendingUser: loggedInUser,
            email: targetEmail,
            fullName: loggedInUser.fullName || loggedInUser.name,
          };
        }

        const needsSecurity = isAccountSecurityRequired(targetEmail, role, userDocData);
        if (needsSecurity) {
          setPendingSecurityAuth({
            pendingUser: loggedInUser,
            targetEmail,
            walletBal,
            isAdmin: false,
          });
          return {
            success: false,
            requireSecurityVerification: true,
            pendingUser: loggedInUser,
            email: targetEmail,
            fullName: loggedInUser.fullName || loggedInUser.name,
          };
        }

        setCurrentUser(loggedInUser);
        localStorage.setItem('wallet_balance', String(walletBal));
        localStorage.setItem(`ub_wallet_balance_${targetEmail}`, String(walletBal));
        localStorage.setItem('ub_user_profile', JSON.stringify(loggedInUser));
        localStorage.setItem('ub_has_registered', 'true');
        handleSetPendingVerification(null);
        setWelcomeMessage(`Welcome back, ${loggedInUser.name}!`);

        // Route to respective role dashboard after approved login
        if (role === 'Event Organiser' || role === 'Promoter') {
          setActiveModal('promoter-dashboard');
        } else if (role === 'Seller') {
          setActiveModal('store-manager');
        } else if (role === 'Driver') {
          setActiveModal('driver-dashboard');
        } else if (role === 'Shop Worker' && loggedInUser.assignedStoreId) {
          setCurrentRoute(`/stores/${loggedInUser.assignedStoreId}`);
        } else {
          setCurrentRoute('/');
        }

        return { success: true };
      }

      return { success: false, error: 'Login failed. Please check your details.' };
    } catch (authErr: any) {
      console.warn('Firebase signInWithEmailAndPassword attempt notice:', authErr?.code, authErr?.message);
      const code = authErr?.code;

      // Handle un-provisioned Admin / Promoter / known accounts or wrong credentials
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-login-credentials'
      ) {
        const cleanTarget = targetEmail.toLowerCase().trim();
        const isTargetAdminEmail = isEmailAdmin(cleanTarget);
        const isKnownPromoter = INITIAL_PROMOTERS.some((p) => p.email.toLowerCase() === cleanTarget);

        // Check if user exists in Firestore users or is Admin / Promoter
        let isExistingUserInFirestore = false;
        let existingFirestoreDoc: any = null;
        try {
          const q = query(collection(db, 'users'), where('email', '==', cleanTarget));
          const snap = await getDocs(q);
          if (!snap.empty) {
            isExistingUserInFirestore = true;
            existingFirestoreDoc = snap.docs[0].data();
          } else if (isTargetAdminEmail) {
            const adminDoc = await getDoc(doc(db, 'users', 'user_admin'));
            if (adminDoc.exists()) {
              isExistingUserInFirestore = true;
              existingFirestoreDoc = adminDoc.data();
            }
          }
        } catch (e) {}

        const isDocAdmin =
          existingFirestoreDoc?.role === 'Admin' ||
          existingFirestoreDoc?.role === 'admin' ||
          existingFirestoreDoc?.isAdmin === true;
        const effectiveAdmin = isTargetAdminEmail || isDocAdmin;
        if (effectiveAdmin) {
          addAuthorizedAdminEmail(cleanTarget);
        }

        if (effectiveAdmin || isKnownPromoter || isExistingUserInFirestore) {
          // Attempt to provision user in Firebase Auth with the entered password if first time
          try {
            const createRes = await createUserWithEmailAndPassword(auth, targetEmail, pass);
            if (createRes.user) {
              setFirebaseUser(createRes.user);
              const role = effectiveAdmin
                ? 'Admin'
                : (existingFirestoreDoc?.role || (isKnownPromoter ? 'Promoter' : 'Customer'));

              const fallbackAdminName =
                cleanTarget === 'tetelophokwane98@gmail.com'
                  ? 'Tetelo Phokwane'
                  : (cleanTarget === 'admin@universalband.co.za' ? 'System Admin' : 'System Admin');

              const resolvedName =
                existingFirestoreDoc?.fullName && existingFirestoreDoc.fullName !== 'New User'
                  ? existingFirestoreDoc.fullName
                  : (existingFirestoreDoc?.name && existingFirestoreDoc.name !== 'New User'
                      ? existingFirestoreDoc.name
                      : (effectiveAdmin ? fallbackAdminName : targetEmail.split('@')[0]));

              const loggedInUser: UserProfile = {
                id: createRes.user.uid,
                name: resolvedName,
                fullName: resolvedName,
                email: targetEmail,
                phone: existingFirestoreDoc?.phone || '',
                role,
                walletBalance: existingFirestoreDoc?.walletBalance || 0,
                assignedStoreId: existingFirestoreDoc?.assignedStoreId || '',
                assignedStoreName: existingFirestoreDoc?.assignedStoreName || '',
                customerQrId: resolveCustomerQrId(createRes.user.uid, existingFirestoreDoc?.customerQrId) || undefined,
                isRegistered: true,
                emailVerified: true,
              };

              try {
                await setDoc(doc(db, 'users', createRes.user.uid), cleanForFirestore(loggedInUser), { merge: true });
              } catch (dbErr) {
                console.warn('Firestore doc sync notice:', dbErr);
              }

              if (effectiveAdmin) {
                localStorage.removeItem('ub_admin_session');
                sessionStorage.removeItem('ub_admin_5locks_passed');
                localStorage.setItem('ub_admin_email', cleanTarget);
                setPendingAdminAuthUser(loggedInUser);
                setIsAdminSecurityModalOpen(true);
                return {
                  success: false,
                  requireAdminSecurity: true,
                  pendingUser: loggedInUser,
                  email: targetEmail,
                  fullName: loggedInUser.fullName || loggedInUser.name,
                };
              }

              const needsSecurity = isAccountSecurityRequired(targetEmail, role, existingFirestoreDoc);
              if (needsSecurity) {
                setPendingSecurityAuth({
                  pendingUser: loggedInUser,
                  targetEmail,
                  walletBal: loggedInUser.walletBalance || 0,
                  isAdmin: effectiveAdmin,
                });
                return {
                  success: false,
                  requireSecurityVerification: true,
                  pendingUser: loggedInUser,
                  email: targetEmail,
                  fullName: loggedInUser.fullName || loggedInUser.name,
                };
              }

              setCurrentUser(loggedInUser);
              localStorage.setItem('wallet_balance', String(loggedInUser.walletBalance || 0));
              localStorage.setItem(`ub_wallet_balance_${targetEmail}`, String(loggedInUser.walletBalance || 0));
              localStorage.setItem('ub_user_profile', JSON.stringify(loggedInUser));
              localStorage.setItem('ub_has_registered', 'true');
              handleSetPendingVerification(null);
              setWelcomeMessage(`Welcome back, ${loggedInUser.name}!`);
              setCurrentRoute('/');
              return { success: true };
            }
          } catch (createErr: any) {
            console.warn('Auto-create attempt during login notice:', createErr?.code);
            if (createErr?.code === 'auth/email-already-in-use') {
              return { success: false, error: 'Incorrect password for this account. Please check your password or use "Forgot Password".' };
            }
          }
        }

        return { success: false, error: 'Invalid email or password. Please verify your credentials or register.' };
      }

      if (code === 'auth/wrong-password') {
        return { success: false, error: 'Incorrect password. Please try again.' };
      }
      if (code === 'auth/invalid-email') {
        return { success: false, error: 'Please enter a valid email address.' };
      }
      if (code === 'auth/too-many-requests') {
        return { success: false, error: 'Access temporarily disabled due to multiple failed login attempts. Please try again later.' };
      }
      if (code === 'auth/user-disabled') {
        return { success: false, error: 'This user account has been disabled.' };
      }
      if (code === 'auth/network-request-failed') {
        return { success: false, error: 'Network error. Please check your internet connection.' };
      }
      return { success: false, error: 'Invalid credentials. Please check your email and password.' };
    }
  };

  const completeSecurityLogin = (userToActivate?: UserProfile) => {
    const user = userToActivate || pendingSecurityAuth?.pendingUser;
    if (!user) return;
    const email = (user.email || pendingSecurityAuth?.targetEmail || '').toLowerCase().trim();
    let walletBal = pendingSecurityAuth?.walletBal ?? (user.walletBalance || 0);
    const isAdmin = user.role === 'Admin' || isEmailAdmin(email) || pendingSecurityAuth?.isAdmin || false;

    if (isAdmin) {
      user.role = 'Admin';
      user.walletBalance = walletBal;
      addAuthorizedAdminEmail(email);
      localStorage.setItem('ub_admin_session', 'true');
      if (!user.name || user.name === 'New User') {
        user.name = email === 'tetelophokwane98@gmail.com' ? 'Tetelo Phokwane' : 'System Admin';
        user.fullName = user.name;
      }
    }

    setCurrentUser(user);
    localStorage.setItem('wallet_balance', String(walletBal));
    if (email) {
      localStorage.setItem(`ub_wallet_balance_${email}`, String(walletBal));
    }
    localStorage.setItem('ub_user_profile', JSON.stringify(user));
    localStorage.setItem('ub_has_registered', 'true');
    if (isAdmin) {
      localStorage.setItem('ub_admin_session', 'true');
    }
    setPendingSecurityAuth(null);
    handleSetPendingVerification(null);
    setWelcomeMessage(`Welcome back, ${user.name}!`);
    if (user.role === 'Promoter' && user.assignedStoreId) {
      setSelectedStoreId(user.assignedStoreId);
      navigateTo(`/store/${user.assignedStoreId}`);
    } else {
      setCurrentRoute('/');
    }
  };

  const cancelSecurityLogin = async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (e) {}
    setFirebaseUser(null);
    setPendingSecurityAuth(null);
  };

  const signInWithGoogle = async (options?: {
    role?: string;
    assignedStoreId?: string;
    assignedStoreName?: string;
    shopName?: string;
    whatToSell?: string;
    organisationName?: string;
    vehicleType?: string;
    licensePlate?: string;
    driverLicenseNumber?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (options?.role && options.role !== 'Customer') {
      return {
        success: false,
        error: 'Only Customers can log in with Google. Please complete the registration form to submit your details for approval.',
      };
    }
    const hasExplicitRole = Boolean(options?.role);
    if (hasExplicitRole) {
      googleRegistrationLockRef.current = true;
    }
    try {
      let u: FirebaseUser | null = null;

      // 1. Detect if we are running in the native mobile app (Capacitor)
      if (Capacitor.isNativePlatform()) {
        try {
          try {
            await GoogleAuth.initialize({
              clientId: firebaseConfig.oAuthClientId || '186057622178-i320v89cavabi40htj1m5kutknbcf2j9.apps.googleusercontent.com',
              scopes: ['profile', 'email'],
              grantOfflineAccess: false,
            });
          } catch (initErr) {
            console.warn('GoogleAuth initialize warning:', initErr);
          }

          // Native Google Sign-In: opens system Google account picker on Android
          const googleUser = await GoogleAuth.signIn();
          const idToken = googleUser?.authentication?.idToken || (googleUser as any)?.idToken;
          const accessToken = googleUser?.authentication?.accessToken || (googleUser as any)?.accessToken;
          if (!idToken) {
            throw new Error('Google Sign-In returned no ID token for lunar-idiom-zggh3. Ensure your Android app SHA-1 and package name are registered in Firebase Console (lunar-idiom-zggh3).');
          }
          const credential = GoogleAuthProvider.credential(idToken, accessToken);
          const userCredential = await signInWithCredential(auth, credential);
          u = userCredential.user;
        } catch (nativeErr: any) {
          console.warn('Native GoogleAuth plugin notice:', nativeErr);
          const errCode = String(nativeErr?.code || '').trim();
          const errMsg = String(nativeErr?.message || nativeErr?.error || nativeErr || '').trim();

          if (
            errCode === '12501' ||
            errMsg.toLowerCase().includes('cancel')
          ) {
            return { success: false, error: 'Google sign-in was cancelled.' };
          }

          if (
            errCode === '10' ||
            errMsg.includes('10:') ||
            errMsg.includes('DEVELOPER_ERROR')
          ) {
            return {
              success: false,
              error: 'Android Google Sign-In Error 10 (DEVELOPER_ERROR): The APK signing SHA-1 certificate on this build does not match Firebase project "lunar-idiom-zggh3" (package "com.universalband.mall"). Note: VoltBuilder debug builds may use a different SHA-1 than 5e:8f:16:06:2e:32:67:61:ec:0d:59:78:9a:ae:20:c0:8d:2c:67:f9 — add your APK\'s actual SHA-1 in Firebase Console, re-download google-services.json, and rebuild, or log in with Email & Password.',
            };
          }

          if (errCode === '12500') {
            return {
              success: false,
              error: 'Android Google Sign-In Error 12500 (SIGN_IN_FAILED): Check that Google Sign-In is enabled in Firebase Authentication, Support Email is set in Firebase Project Settings, and OAuth Consent Screen is configured in Google Cloud (lunar-idiom-zggh3) — or log in with Email & Password.',
            };
          }

          if (errCode === '7') {
            return {
              success: false,
              error: 'Android Google Sign-In Error 7: Network error while contacting Google Play Services. Check your internet connection and try again.',
            };
          }

          return {
            success: false,
            error: `Android Google Sign-In failed${errCode ? ` (Code ${errCode})` : ''}: ${errMsg || 'Please check Firebase setup for lunar-idiom-zggh3 or log in with Email & Password.'}`,
          };
        }
      } else {
        // 2. Web flow (Standard browser / Chrome / Desktop):
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
          prompt: 'select_account',
        });

        let result;
        try {
          result = await signInWithPopup(auth, provider);
        } catch (popupErr: any) {
          console.log('Google sign-in popup error code:', popupErr?.code, popupErr?.message);
          const code = popupErr?.code || '';
          const msg = popupErr?.message || '';

          if (
            code === 'auth/popup-closed-by-user' ||
            code === 'auth/cancelled-popup-request' ||
            msg.includes('closed-by-user')
          ) {
            return {
              success: false,
              error: 'Google sign-in was cancelled.',
            };
          }

          if (
            code === 'auth/popup-blocked' ||
            code === 'auth/operation-not-supported' ||
            msg.includes('popup-blocked') ||
            msg.includes('operation-not-supported')
          ) {
            try {
              if (options?.role) {
                sessionStorage.setItem('ub_pending_google_role', JSON.stringify(options));
              }
              await signInWithRedirect(auth, provider);
              return { success: true };
            } catch (redirErr: any) {
              console.error('signInWithRedirect fallback error:', redirErr);
              throw redirErr;
            }
          }

          throw popupErr;
        }

        if (result && result.user) {
          u = result.user;
        }
      }

      if (u) {
        const cleanEmail = (u.email || '').toLowerCase().trim();
        const displayName = u.displayName || cleanEmail.split('@')[0] || 'Google User';

        setFirebaseUser(u);

        // Check if user document already exists in Firestore
        let existingData: any = null;
        const userDocRef = doc(db, 'users', u.uid);
        try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            existingData = docSnap.data();
          }
        } catch (dbErr) {
          console.warn('Firestore Google user fetch:', dbErr);
        }

        // Check if existing Firestore user is a pending/rejected non-Customer account
        const existingRole = existingData?.role || 'Customer';
        const isExistingNonCustomer =
          existingRole === 'Event Organiser' ||
          existingRole === 'Seller' ||
          existingRole === 'Driver' ||
          existingRole === 'Shop Worker' ||
          (existingRole === 'Promoter' && !INITIAL_PROMOTERS.some((p) => p.email.toLowerCase() === cleanEmail));
        const isExistingApproved =
          existingData?.isApproved === true ||
          existingData?.status === 'approved' ||
          existingData?.status === 'active';

        if (!isEmailAdmin(cleanEmail) && isExistingNonCustomer && !isExistingApproved) {
          await signOut(auth).catch(() => {});
          setFirebaseUser(null);
          if (existingData?.status === 'rejected') {
            return {
              success: false,
              error: `Your ${existingRole} application was rejected. Reason: ${existingData?.rejectionReason || 'Please contact admin for assistance.'}`,
            };
          }
          return {
            success: false,
            error: `Your ${existingRole} account is pending admin approval. Please wait for approval notification before logging in.`,
          };
        }

        const userRole = options?.role === 'Customer'
          ? 'Customer'
          : (isEmailAdmin(cleanEmail)
              ? 'Admin'
              : (existingData?.role && existingData.role !== 'Customer' ? existingData.role : 'Customer'));

        const initialBal = typeof existingData?.walletBalance === 'number'
          ? existingData.walletBalance
          : 0;

        const nowIso = new Date().toISOString();
        const createdAtIso = existingData?.createdAt || nowIso;

        const resolvedAssignedStoreId = existingData?.assignedStoreId || '';
        const resolvedAssignedStoreName = existingData?.assignedStoreName || '';

        const custQrId = resolveCustomerQrId(u.uid, existingData?.customerQrId);

        try {
          if (!existingData || options?.role === 'Customer') {
            const newUserDoc: Record<string, any> = {
              id: u.uid,
              name: existingData?.name || displayName,
              fullName: existingData?.fullName || displayName,
              email: cleanEmail,
              phone: existingData?.phone || '',
              role: userRole,
              status: existingData?.status || 'active',
              isApproved: true,
              walletBalance: initialBal,
              createdAt: createdAtIso,
              emailVerified: true,
              isRegistered: true,
              customerQrId: custQrId || undefined,
            };
            await setDoc(userDocRef, cleanForFirestore(newUserDoc), { merge: true });

            // Create / sync wallet document
            await setDoc(doc(db, 'wallets', u.uid), {
              userId: u.uid,
              balance: initialBal,
              createdAt: createdAtIso,
            }, { merge: true });
            existingData = { ...(existingData || {}), ...newUserDoc };
          } else if (custQrId && !existingData.customerQrId) {
            await setDoc(userDocRef, { customerQrId: custQrId }, { merge: true });
            existingData = { ...existingData, customerQrId: custQrId };
          }
        } catch (dbErr) {
          console.warn('Firestore Google user sync:', dbErr);
        }

        const gProfile: UserProfile = {
          id: u.uid,
          name: existingData?.name || displayName,
          fullName: existingData?.fullName || displayName,
          email: cleanEmail,
          phone: existingData?.phone || '',
          role: userRole,
          status: existingData?.status || 'active',
          isApproved: true,
          assignedStoreId: resolvedAssignedStoreId,
          assignedStoreName: resolvedAssignedStoreName,
          organisationName: existingData?.organisationName || '',
          shopName: existingData?.shopName || '',
          whatToSell: existingData?.whatToSell || '',
          vehicleType: existingData?.vehicleType || '',
          licensePlate: existingData?.licensePlate || '',
          driverLicenseNumber: existingData?.driverLicenseNumber || '',
          createdAt: createdAtIso,
          walletBalance: initialBal,
          isRegistered: true,
          emailVerified: true,
          customerQrId: custQrId || undefined,
          photo: u.photoURL || existingData?.photo || undefined,
        };

        if (userRole === 'Admin' || isEmailAdmin(cleanEmail)) {
          localStorage.removeItem('ub_admin_session');
          sessionStorage.removeItem('ub_admin_5locks_passed');
          if (cleanEmail) {
            localStorage.setItem('ub_admin_email', cleanEmail);
          }
          setPendingAdminAuthUser({ ...gProfile, role: 'Admin' });
          setIsAdminSecurityModalOpen(true);
          return { success: true };
        }

        setCurrentUser(gProfile);
        localStorage.setItem('ub_user_profile', JSON.stringify(gProfile));
        localStorage.setItem('ub_has_registered', 'true');
        localStorage.setItem('wallet_balance', String(initialBal));
        if (cleanEmail) {
          localStorage.setItem(`ub_wallet_balance_${cleanEmail}`, String(initialBal));
        }
        setWelcomeMessage(`Welcome ${gProfile.name}!`);

        // Navigate straight to the home screen for the selected role
        if (userRole === 'Event Organiser' || userRole === 'Promoter') {
          setCurrentRoute('/');
          setActiveModal('promoter-dashboard');
        } else if (userRole === 'Seller') {
          setCurrentRoute('/');
          setActiveModal('store-manager');
        } else if (userRole === 'Driver') {
          setCurrentRoute('/driver');
          setActiveModal('driver-dashboard');
        } else if (userRole === 'Shop Worker') {
          const workerStoreId = resolvedAssignedStoreId || stores[0]?.id || '';
          setSelectedStoreId(workerStoreId);
          setActiveModal(null);
          setCurrentRoute(workerStoreId ? `/stores/${workerStoreId}` : '/');
        } else if (options?.role === 'Customer') {
          setActiveModal(null);
          setCurrentRoute('/');
        } else {
          setCurrentRoute('/dashboard');
        }

        return { success: true };
      }
      return { success: false, error: 'Could not complete Google sign-in.' };
    } catch (error: any) {
      console.log('Google sign-in error:', error);
      const errCode = error?.code || '';
      const errMsg = error?.message || error?.error || String(error);
      let displayError = 'Google sign-in failed. Please try again.';

      if (errCode === 'auth/unauthorized-domain' || errMsg.includes('unauthorized-domain')) {
        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'remix-universal-band-app-5861.ai.studio';
        displayError = `Domain not authorized for Google Sign-In. Add "${hostname}" and "remix-universal-band-app-5861.ai.studio" to Authorized Domains in your Firebase Console (Authentication > Settings > Authorized Domains), or log in with Email and Password.`;
      } else if (errCode === 'auth/invalid-continue-uri' || errMsg.includes('invalid-continue-uri')) {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'remix-universal-band-app-5861.ai.studio';
        displayError = `Invalid continue URI. Ensure "${origin}" is added to Authorized Domains in your Firebase Console (Authentication > Settings > Authorized Domains).`;
      } else if (
        errCode === 'auth/popup-closed-by-user' ||
        errMsg.includes('closed-by-user') ||
        errCode === 'auth/cancelled-popup-request'
      ) {
        displayError = 'Google sign-in was cancelled.';
      } else if (errCode === 'auth/popup-blocked') {
        displayError = 'Popup was blocked by the browser. Please allow popups or use Email & Password.';
      } else if (errCode === 'auth/operation-not-supported') {
        displayError = 'Google sign-in is not supported in this preview iframe. Please log in with Email & Password.';
      } else if (errMsg.includes('Something went wrong') || errMsg.includes('10:') || errMsg.includes('DEVELOPER_ERROR')) {
        displayError = 'Connected to Firebase (lunar-idiom-zggh3). Note: Native Google Sign-In requires your Android package name & SHA-1 fingerprint registered in Firebase Console, or you can log in directly with Email & Password.';
      } else if (errMsg) {
        displayError = errMsg;
      }

      return { success: false, error: displayError };
    } finally {
      googleRegistrationLockRef.current = false;
    }
  };

  const signOutUser = async () => {
    const isRoleAdmin =
      currentUser?.role?.toLowerCase() === 'admin' ||
      isAuthorizedAdminEmail(currentUser?.email) ||
      localStorage.getItem('ub_admin_session') === 'true';

    // PART 2: ADMIN LOGOUT - DELETE ADMIN ACCOUNT FROM APP / DEVICE ONLY
    if (isRoleAdmin) {
      const confirmed = window.confirm(
        'Are you sure you want to exit? Your admin account will be removed from this device for security. You will need to log in again.'
      );
      if (!confirmed) {
        return;
      }

      // a) Sign out from Firebase Auth
      try {
        await signOut(auth);
      } catch (e) {}

      // b) DELETE admin account session from the app / device (local storage, admin vault, cached admin data)
      const adminEmail = (currentUser?.email || '').toLowerCase().trim();
      localStorage.removeItem('ub_admin_session');
      localStorage.removeItem('ub_admin_email');
      sessionStorage.removeItem('ub_admin_5locks_passed');
      sessionStorage.removeItem('ub_app_active');
      setPendingAdminAuthUser(null);
      localStorage.removeItem('ub_admin_security_vault_v5');
      localStorage.removeItem('ub_admin_security_vault_v4');
      localStorage.removeItem('ub_has_registered');
      localStorage.removeItem('ub_user_profile');
      localStorage.removeItem('wallet_balance');
      localStorage.removeItem('ub_pending_verification');
      localStorage.removeItem('ub_recovery_email');
      if (adminEmail) {
        localStorage.removeItem(`ub_admin_otp_${adminEmail}`);
        localStorage.removeItem(`ub_fingerprint_link_${adminEmail}`);
        localStorage.removeItem(`ub_wallet_balance_${adminEmail}`);
      }

      // Disable background Admin SMS payment confirmation on this device upon Admin logout
      if (Capacitor.isNativePlatform()) {
        void configureBackgroundSmsConfirmation({
          enabled: false,
          isAdminDevice: false,
          bankMessage: paymentBankMessageRef.current || 'TymeBank',
          referenceFormat: paymentReferenceFormatRef.current || 'UB-',
          projectId: firebaseConfig.projectId,
          databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
          apiKey: firebaseConfig.apiKey,
          refreshToken: '',
        });
      }

      // c) Do NOT delete admin account from Firebase / Database - only remove from this device / app
      setWelcomeMessage(null);
      setFirebaseUser(null);
      setTickets([]);
      setCurrentUser({
        id: 'guest_user',
        name: 'New User',
        fullName: 'New User',
        email: '',
        phone: '',
        role: 'Customer',
        walletBalance: 0,
        isRegistered: false,
      });
      setIsAdminSecurityModalOpen(false);
      setActiveModal(null);
      setIsLocked(false);

      // Go back to the very first Login screen
      setCurrentRoute('/login');
      return;
    }

    // PART 3: OTHER ROLES - DO NOT DELETE ACCOUNT
    // For ALL other roles (NOT admin) - e.g. normal user, artist, vendor, staff, etc:
    // When they Log Out / Lock Out / Leave the app / Close the app:
    // - Do NOT delete their account from the app
    // - Do NOT sign them out completely
    // - KEEP their account saved on the device like normal - next time they open the app, they can just unlock with their Fingerprint or PIN, or stay logged in
    // - Only clear session if they manually tap "Delete My Account" - not on normal logout.
    const userEmail = (currentUser?.email || '').toLowerCase().trim();
    if (userEmail && currentUser.walletBalance !== undefined) {
      try {
        localStorage.setItem(`ub_wallet_balance_${userEmail}`, String(currentUser.walletBalance));
      } catch (e) {}
    }

    setIsLocked(true);
    setActiveModal(null);
    setCurrentRoute('/app-lock');
  };

  const deleteMyAccount = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const currentFbUser = auth.currentUser;
      const targetUid = currentUser?.id || currentFbUser?.uid;
      const targetEmail = (currentUser?.email || currentFbUser?.email || '').toLowerCase().trim();

      // 1. Delete user doc & wallet doc from Firestore
      if (targetUid && targetUid !== 'guest_user') {
        try {
          await deleteDoc(doc(db, 'users', targetUid));
        } catch (e) {
          console.warn('deleteDoc users warning:', e);
        }
        try {
          await deleteDoc(doc(db, 'wallets', targetUid));
        } catch (e) {
          console.warn('deleteDoc wallets warning:', e);
        }
        // Write tombstone to revoked_users
        try {
          await setDoc(doc(db, 'revoked_users', targetUid), {
            uid: targetUid,
            email: targetEmail,
            deletedAt: new Date().toISOString(),
            reason: 'user_delete_my_account',
          }, { merge: true });
        } catch (e) {}
      }

      // 2. Delete user account from Firebase Authentication
      if (currentFbUser) {
        try {
          await deleteUser(currentFbUser);
        } catch (authErr: any) {
          console.warn('Firebase Auth deleteUser notice:', authErr?.code, authErr?.message);
        }
      }

      // 3. Sign out of Firebase Auth
      try {
        await signOut(auth);
      } catch (e) {}

      // 4. Clear all local storage & cached login on the phone
      try {
        localStorage.removeItem('ub_admin_session');
        localStorage.removeItem('ub_has_registered');
        localStorage.removeItem('ub_user_profile');
        localStorage.removeItem('wallet_balance');
        localStorage.removeItem('ub_pending_verification');
        localStorage.removeItem('ub_recovery_email');
        if (targetEmail) {
          localStorage.removeItem(`ub_wallet_balance_${targetEmail}`);
        }
      } catch (e) {}

      // 5. Clear welcome message completely so "Welcome back" does NOT show
      setWelcomeMessage(null);

      // 6. Reset state to guest
      setFirebaseUser(null);
      setTickets([]);
      setCurrentUser({
        id: 'guest_user',
        name: 'New User',
        fullName: 'New User',
        email: '',
        phone: '',
        role: 'Customer',
        walletBalance: 0,
        isRegistered: false,
      });

      // 7. Send user back to First Screen with 3 buttons
      setCurrentRoute('/');
      return { success: true };
    } catch (err: any) {
      console.error('deleteMyAccount error:', err);
      return { success: false, error: err?.message || 'Failed to delete account' };
    }
  };

  const adminDeleteUser = async (userId: string, userEmail?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const cleanEmail = (userEmail || '').toLowerCase().trim();

      // 1. Delete document from Firestore users collection
      await deleteDoc(doc(db, 'users', userId));

      // 2. Delete document from Firestore wallets collection
      try {
        await deleteDoc(doc(db, 'wallets', userId));
      } catch (e) {}

      // 3. Record revocation in Firestore
      try {
        await setDoc(doc(db, 'revoked_users', userId), {
          uid: userId,
          email: cleanEmail,
          deletedAt: new Date().toISOString(),
          revokedBy: currentUser?.email || 'admin',
          reason: 'admin_dashboard_deletion',
        }, { merge: true });
      } catch (e) {}

      // 4. If current device is logged in as this user, delete from Auth immediately and sign out
      if (auth.currentUser && auth.currentUser.uid === userId) {
        try {
          await deleteUser(auth.currentUser);
        } catch (e) {}
        try {
          await signOut(auth);
        } catch (e) {}

        localStorage.removeItem('ub_admin_session');
        localStorage.removeItem('ub_has_registered');
        localStorage.removeItem('ub_user_profile');
        localStorage.removeItem('wallet_balance');
        localStorage.removeItem('ub_pending_verification');
        localStorage.removeItem('ub_recovery_email');
        if (cleanEmail) {
          localStorage.removeItem(`ub_wallet_balance_${cleanEmail}`);
        }
        setWelcomeMessage(null);
        setFirebaseUser(null);
        setTickets([]);
        setCurrentUser({
          id: 'guest_user',
          name: 'New User',
          fullName: 'New User',
          email: '',
          phone: '',
          role: 'Customer',
          walletBalance: 0,
          isRegistered: false,
        });
        setCurrentRoute('/');
      }

      return { success: true };
    } catch (err: any) {
      console.error('adminDeleteUser error:', err);
      return { success: false, error: err?.message || 'Failed to delete user' };
    }
  };

  const approveUser = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: 'approved',
        isApproved: true,
        approvedAt: new Date().toISOString(),
      });
      setAllRegisteredUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: 'approved', isApproved: true } : u))
      );
      return { success: true };
    } catch (err: any) {
      console.error('approveUser error:', err);
      return { success: false, error: err?.message || 'Failed to approve user' };
    }
  };

  const rejectUser = async (userId: string, reason: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: 'rejected',
        isApproved: false,
        rejectionReason: reason || 'Application declined by administrator.',
        rejectedAt: new Date().toISOString(),
      });
      setAllRegisteredUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: 'rejected', isApproved: false, rejectionReason: reason } : u))
      );
      return { success: true };
    } catch (err: any) {
      console.error('rejectUser error:', err);
      return { success: false, error: err?.message || 'Failed to reject user' };
    }
  };

  const addMenuItem = async (
    collectionName: 'menu_food' | 'menu_alcohol' | 'menu_softdrinks',
    itemData: Omit<MenuItem, 'id'>
  ): Promise<boolean> => {
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Promoter') {
      setWelcomeMessage('Action Restricted: Only Admin or Promoter can add menu items.');
      return false;
    }

    if (currentUser.role === 'Promoter') {
      const allowedStore = currentUser.assignedStoreId;
      if (allowedStore && itemData.storeId && itemData.storeId !== allowedStore) {
        setWelcomeMessage(
          `Unauthorized: You are assigned to manage ${currentUser.assignedStoreName || allowedStore}. You cannot add menu items to another promoter's store.`
        );
        return false;
      }
    }

    const newId = `${collectionName.replace('menu_', '')}-${Date.now()}`;
    const fullItem: MenuItem = {
      id: newId,
      ...itemData,
      createdAt: new Date().toISOString(),
    };

    if (collectionName === 'menu_food') {
      setMenuFood((prev) => [fullItem, ...prev]);
    } else if (collectionName === 'menu_alcohol') {
      setMenuAlcohol((prev) => [fullItem, ...prev]);
    } else {
      setMenuSoftDrinks((prev) => [fullItem, ...prev]);
    }

    try {
      await setDoc(doc(db, collectionName, newId), fullItem);
    } catch (err) {
      console.warn(`Firestore save to ${collectionName} error:`, err);
    }
    return true;
  };

  const purchaseMenuItem = async (item: MenuItem): Promise<{ success: boolean; error?: string }> => {
    // Critical Alcohol boundary check
    const isAlcohol = item.category === 'alcohol' || isAlcoholItem(item);
    if (isAlcohol && (!userWalletDoc.canBuyAlcohol || !userWalletDoc.idVerified || (userWalletDoc.age ?? 0) < 18)) {
      return {
        success: false,
        error: "Add your ID to buy Alcohol. You can still buy Food and Soft Drinks.",
      };
    }

    const numericPrice = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
    if (currentUser.walletBalance < numericPrice) {
      return {
        success: false,
        error: `Insufficient Universal Band balance (Current: R${currentUser.walletBalance.toFixed(2)}, Required: ${item.price}). Please top up.`,
      };
    }

    const currentStoredBal = Number(localStorage.getItem('wallet_balance') || 0);
    const updatedBalance = Math.max(0, currentStoredBal - numericPrice);
    localStorage.setItem('wallet_balance', String(updatedBalance));

    addWalletTransaction({
      type: 'purchase',
      title: item.name,
      subtitle: `${item.category.toUpperCase()} • Cashless Band Tap`,
      amount: -numericPrice,
    });

    setCurrentUser((prev) => ({
      ...prev,
      walletBalance: updatedBalance,
    }));
    setUserWalletDoc((prev) => ({
      ...prev,
      balance: updatedBalance,
    }));

    try {
      await setDoc(doc(db, 'users', currentUser.id), { walletBalance: updatedBalance }, { merge: true });
    } catch (err) {
      console.warn('Firestore balance update warning:', err);
    }

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#FACC15', '#FFFFFF', '#10B981'],
      });
    } catch {
      // ignore
    }

    return { success: true };
  };

  const setUserAge = (age: number) => {
    setCurrentUser((prev) => ({
      ...prev,
      age,
    }));
  };

  // -------------------------------------------------------------
  // LIVE VENDOR SALES & WALLET DEDUCTIONS
  // -------------------------------------------------------------
  const [liveSales, setLiveSales] = useState<VendorSale[]>([]);

  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'sales'), (snapshot) => {
        const list: VendorSale[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as VendorSale);
        });
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setLiveSales(list);
      }, (err) => {
        console.warn('Live sales listener notice:', err);
      });
      return () => unsub();
    } catch (e) {}
  }, []);

  const totalLiveSalesAmount = useMemo(() => {
    return liveSales.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  }, [liveSales]);

  const resetAllCustomerBalances = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    let count = 0;
    const processedUserIds = new Set<string>();

    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const docSnap of usersSnap.docs) {
        processedUserIds.add(docSnap.id);
        await setDoc(
          doc(db, 'users', docSnap.id),
          {
            walletBalance: 0,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        await setDoc(
          doc(db, 'wallets', docSnap.id),
          {
            balance: 0,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        count++;
      }

      const walletsSnap = await getDocs(collection(db, 'wallets'));
      for (const wSnap of walletsSnap.docs) {
        if (!processedUserIds.has(wSnap.id)) {
          await setDoc(
            doc(db, 'wallets', wSnap.id),
            {
              balance: 0,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          count++;
        }
      }

      try {
        const rawReg = localStorage.getItem('ub_registered_users');
        if (rawReg) {
          const list = JSON.parse(rawReg);
          if (Array.isArray(list)) {
            const updatedList = list.map((u: any) => ({
              ...u,
              walletBalance: 0,
            }));
            localStorage.setItem('ub_registered_users', JSON.stringify(updatedList));
          }
        }
      } catch (e) {}

      localStorage.setItem('wallet_balance', '0');

      setCurrentUser((prev) => ({
        ...prev,
        walletBalance: 0,
      }));
      setUserWalletDoc((prev) => ({
        ...prev,
        balance: 0,
      }));

      addWalletTransaction({
        type: 'topup',
        title: 'Reset All Balances to R0.00',
        subtitle: 'Admin Wallet Reset Completed',
        amount: 0,
      });

      return { success: true, count: count || 1 };
    } catch (err: any) {
      console.error('resetAllCustomerBalances error:', err);
      localStorage.setItem('wallet_balance', '0');
      setCurrentUser((prev) => ({
        ...prev,
        walletBalance: 0,
      }));
      setUserWalletDoc((prev) => ({
        ...prev,
        balance: 0,
      }));
      return { success: true, count: 1 };
    }
  };

  const deductVendorSale = async (params: {
    customerId: string;
    amount: number;
    itemName?: string;
    vendorName?: string;
    storeId?: string;
    storeName?: string;
  }): Promise<{ success: boolean; previousBalance: number; newBalance: number; error?: string }> => {
    const deductAmt = Math.abs(Number(params.amount)) || 0;
    const cleanId = (params.customerId || '').trim();
    const itemName = params.itemName || 'Bar / Vendor Item';

    if (!cleanId) {
      return {
        success: false,
        previousBalance: 0,
        newBalance: 0,
        error: 'Please scan or enter a valid Customer ID, wristband pass code, phone, or email.',
      };
    }

    if (deductAmt <= 0) {
      return {
        success: false,
        previousBalance: 0,
        newBalance: 0,
        error: 'Sale amount must be greater than R0.00.',
      };
    }

    let targetUid = cleanId;
    let targetName = 'Customer';
    let currentBal = 0;
    let foundCustomer = false;
    let isCurrent = false;

    const cleanLower = cleanId.toLowerCase();
    const cleanDigits = cleanId.replace(/[\s-]/g, '');
    const currentPhoneDigits = (currentUser.phone || '').replace(/[\s-]/g, '');

    if (
      currentUser.id &&
      currentUser.id !== 'guest_user' &&
      (cleanId === currentUser.id ||
        (currentUser.email && cleanLower === currentUser.email.toLowerCase()) ||
        (currentPhoneDigits && cleanDigits === currentPhoneDigits))
    ) {
      isCurrent = true;
      foundCustomer = true;
      targetUid = currentUser.id;
      targetName = currentUser.fullName || currentUser.name || 'Customer';
      currentBal = typeof currentUser.walletBalance === 'number'
        ? currentUser.walletBalance
        : Number(localStorage.getItem('wallet_balance') || 0);
    } else {
      try {
        // 1. Direct user lookup
        const uDoc = await getDoc(doc(db, 'users', cleanId));
        if (uDoc.exists()) {
          const uData = uDoc.data();
          foundCustomer = true;
          targetUid = uDoc.id;
          targetName = uData.fullName || uData.name || 'Customer';
          currentBal = typeof uData.walletBalance === 'number' ? uData.walletBalance : 0;
        } else {
          // 2. Ticket / bandCode lookup to resolve real ticket owner's userId
          const ticketMatch = tickets.find(
            (t) =>
              t.ticketId?.toLowerCase() === cleanLower ||
              t.bandCode?.toLowerCase() === cleanLower ||
              t.id?.toLowerCase() === cleanLower
          );
          if (ticketMatch && (ticketMatch.userId || ticketMatch.user_id)) {
            const ownerId = ticketMatch.userId || ticketMatch.user_id!;
            const ownerDoc = await getDoc(doc(db, 'users', ownerId));
            if (ownerDoc.exists()) {
              const ownerData = ownerDoc.data();
              foundCustomer = true;
              targetUid = ownerDoc.id;
              targetName = ownerData.fullName || ownerData.name || ticketMatch.customerName || 'Customer';
              currentBal = typeof ownerData.walletBalance === 'number' ? ownerData.walletBalance : 0;
            }
          }

          // 3. Fallback wallet lookup by doc ID
          if (!foundCustomer) {
            const wDoc = await getDoc(doc(db, 'wallets', cleanId));
            if (wDoc.exists()) {
              const wData = wDoc.data();
              foundCustomer = true;
              targetUid = wDoc.id;
              currentBal = typeof wData.balance === 'number' ? wData.balance : 0;
            }
          }
        }
      } catch (e) {
        console.warn('User lookup warning:', e);
      }
    }

    if (!foundCustomer) {
      return {
        success: false,
        previousBalance: 0,
        newBalance: 0,
        error: `No customer wallet found for "${cleanId}".`,
      };
    }

    if (currentBal < deductAmt) {
      return {
        success: false,
        previousBalance: currentBal,
        newBalance: currentBal,
        error: `Insufficient balance (Customer has R${currentBal.toFixed(2)}, item is R${deductAmt.toFixed(2)}).`,
      };
    }

    const newBal = Math.max(0, currentBal - deductAmt);

    // Update in Firestore
    try {
      await setDoc(doc(db, 'users', targetUid), { walletBalance: newBal }, { merge: true });
      await setDoc(doc(db, 'wallets', targetUid), { balance: newBal }, { merge: true });
    } catch (err) {
      console.warn('Firestore balance deduction error:', err);
    }

    // Record vendor sale in Firestore
    const saleId = `sale_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const saleRecord: VendorSale = {
      id: saleId,
      itemName,
      amount: deductAmt,
      customerId: targetUid,
      customerName: targetName,
      storeId: params.storeId || '',
      storeName: params.storeName || 'Venue Bar POS',
      vendorId: currentUser.id,
      vendorName: params.vendorName || currentUser.name || 'Universal Band Bar POS',
      timestamp: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'sales', saleId), saleRecord);
    } catch (err) {
      console.warn('Firestore sale record notice:', err);
    }

    // Update active user state and storage if current user
    if (isCurrent || targetUid === currentUser.id) {
      localStorage.setItem('wallet_balance', String(newBal));
      setCurrentUser((prev) => ({
        ...prev,
        walletBalance: newBal,
      }));
      setUserWalletDoc((prev) => ({
        ...prev,
        balance: newBal,
      }));
      addWalletTransaction({
        type: 'purchase',
        title: `${itemName} (Bar POS)`,
        subtitle: `Vendor Scan • R${deductAmt.toFixed(2)} Deducted`,
        amount: -deductAmt,
      });
    }

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#FACC15', '#10B981', '#FFFFFF'],
      });
    } catch (e) {}

    return {
      success: true,
      previousBalance: currentBal,
      newBalance: newBal,
    };
  };

  // --- Universal Band Mall Cart Operations ---
  const addToCart = (
    storeId: string,
    storeName: string,
    item: {
      id: string;
      name: string;
      price: number | string;
      image?: string;
      imageUrl?: string;
      category?: string;
      subCategory?: string;
      isAlcohol?: boolean;
      ingredients?: string[];
      allowIngredientRemoval?: boolean;
    },
    quantity: number = 1,
    customization?: {
      removedIngredients?: string[];
      customizedIngredients?: string[];
    }
  ) => {
    if (!storeId || !item?.id) return;
    const numericPrice = typeof item.price === 'number' ? item.price : parseFloat(String(item.price).replace(/[^0-9.]/g, '')) || 0;
    const itemImage = item.image || item.imageUrl || 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80';
    const removedIngredients = customization?.removedIngredients || [];
    const removedKey = removedIngredients.slice().sort().join(',');

    setCarts((prev) => {
      const currentStoreCart = prev[storeId] ? [...prev[storeId]] : [];
      const existingIndex = currentStoreCart.findIndex(
        (ci) => ci.menuItemId === item.id && ((ci.removedIngredients || []).slice().sort().join(',') === removedKey)
      );

      if (existingIndex >= 0) {
        currentStoreCart[existingIndex] = {
          ...currentStoreCart[existingIndex],
          quantity: currentStoreCart[existingIndex].quantity + quantity,
        };
      } else {
        const newCartItem: CartItem = {
          id: `cart_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          menuItemId: item.id,
          name: item.name,
          price: numericPrice,
          quantity: Math.max(1, quantity),
          image: itemImage,
          category: item.category,
          subCategory: item.subCategory,
          isAlcohol: item.isAlcohol,
          storeId,
          storeName,
          ingredients: item.ingredients,
          allowIngredientRemoval: item.allowIngredientRemoval,
          removedIngredients,
          customizedIngredients: customization?.customizedIngredients || (item.ingredients ? item.ingredients.filter(ing => !removedIngredients.includes(ing)) : undefined),
        };
        currentStoreCart.push(newCartItem);
      }

      return {
        ...prev,
        [storeId]: currentStoreCart,
      };
    });
  };

  const removeFromCart = (storeId: string, itemId: string) => {
    if (!storeId || !itemId) return;
    setCarts((prev) => {
      const currentStoreCart = prev[storeId] ? [...prev[storeId]] : [];
      const filtered = currentStoreCart.filter((ci) => ci.id !== itemId && ci.menuItemId !== itemId);
      return {
        ...prev,
        [storeId]: filtered,
      };
    });
  };

  const updateCartQuantity = (storeId: string, itemId: string, quantity: number) => {
    if (!storeId || !itemId) return;
    setCarts((prev) => {
      const currentStoreCart = prev[storeId] ? [...prev[storeId]] : [];
      if (quantity <= 0) {
        return {
          ...prev,
          [storeId]: currentStoreCart.filter((ci) => ci.id !== itemId && ci.menuItemId !== itemId),
        };
      }
      const updated = currentStoreCart.map((ci) => {
        if (ci.id === itemId || ci.menuItemId === itemId) {
          return { ...ci, quantity };
        }
        return ci;
      });
      return {
        ...prev,
        [storeId]: updated,
      };
    });
  };

  const updateCartItemRemovedIngredients = (storeId: string, itemId: string, removedIngredients: string[]) => {
    if (!storeId || !itemId) return;
    setCarts((prev) => {
      const currentStoreCart = prev[storeId] ? [...prev[storeId]] : [];
      const updated = currentStoreCart.map((ci) => {
        if (ci.id === itemId || ci.menuItemId === itemId) {
          const raw = ci.ingredients || [];
          const remaining = raw.filter(
            (ing) => !removedIngredients.some((rem) => rem.toLowerCase() === ing.toLowerCase())
          );
          return {
            ...ci,
            removedIngredients,
            customizedIngredients: remaining,
          };
        }
        return ci;
      });
      return {
        ...prev,
        [storeId]: updated,
      };
    });
  };

  const clearCart = (storeId: string) => {
    if (!storeId) return;
    setCarts((prev) => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
  };

  const getCartSummary = (storeId: string) => {
    const items = carts[storeId] || [];
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const subtotal = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    const platformFee = calculatePlatformFee(totalQuantity);
    const total = subtotal + platformFee;
    return {
      subtotal,
      totalQuantity,
      platformFee,
      total,
      items,
    };
  };

  // --- Create Universal Band Mall Order ---
  const createMallOrder = async (params: {
    storeId: string;
    storeName: string;
    storeLocation?: string;
    storeOwnerId?: string;
    customerPhone: string;
    customerName?: string;
    collectionDate: 'Today' | string;
    paymentMethod?: 'wallet' | 'card';
    customItems?: CartItem[];
    eventId?: string;
    checkoutType: 'COLLECTION' | 'DELIVERY';
    deliveryAddress?: string;
    deliveryPhone?: string;
    deliveryFee?: number;
    deliveryLat?: number;
    deliveryLng?: number;
    gpsAccuracy?: number;
  }): Promise<{ success: boolean; order?: MallOrder; error?: string }> => {
    const { storeId, storeName, storeLocation, storeOwnerId, customerPhone, customerName, collectionDate, customItems, eventId, checkoutType, deliveryAddress, deliveryPhone, deliveryFee, deliveryLat, deliveryLng, gpsAccuracy } = params;

    // Check if event has passed (if it's an event-linked order)
    if (eventId) {
      const event = events.find(e => e.id === eventId);
      if (event && isEventExpired(event.date || event.event_date || '')) {
         return { success: false, error: 'This event has already passed and food pre-orders are no longer available.' };
      }
    }

    // 0. Check if there is any phone online from this shop
    const isShopOnline = checkIsStoreOnline(storeId);
    if (!isShopOnline) {
      return {
        success: false,
        error: `Sales Paused: No staff or owner phone from "${storeName}" is currently online to see and prepare orders. To ensure your order is fulfilled, orders cannot be placed while the shop is offline.`,
      };
    }

    // 1. Mandatory phone number check
    const cleanPhone = (checkoutType === 'DELIVERY' ? (deliveryPhone || '') : (customerPhone || '')).trim();
    if (!cleanPhone || cleanPhone.replace(/[^0-9]/g, '').length < 6) {
      return {
        success: false,
        error: 'A valid customer phone number is strictly required at checkout for order verification.',
      };
    }

    const items = (customItems && customItems.length > 0) ? customItems : (carts[storeId] ?? []);
    if (items.length === 0) {
      return {
        success: false,
        error: 'Your cart is empty. Please add items before checking out.',
      };
    }

    const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
    const subtotal = items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0);
    const platformFee = calculatePlatformFee(totalQuantity);
    const total = subtotal + platformFee + (deliveryFee || 0);

    // 3. Wallet payment check
    const userBalance = typeof currentUser?.walletBalance === 'number'
      ? currentUser.walletBalance
      : Number(localStorage.getItem('wallet_balance') || 0);

    if (userBalance < total) {
      return {
        success: false,
        error: `Insufficient wallet balance. Total is R${total.toFixed(2)} (including R${platformFee.toFixed(2)} mall fee + ${checkoutType === 'DELIVERY' ? 'delivery' : 'platform'} fee), but your balance is R${userBalance.toFixed(2)}. Please top up your wallet.`,
      };
    }

    const orderId = `ubm_ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const orderNumber = `UBM-${Math.floor(10000 + Math.random() * 90000)}`;
    const collectionCode = `UB-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Backup pins
    const pickupPin = Math.floor(100000 + Math.random() * 900000).toString();
    const deliveryPin = Math.floor(100000 + Math.random() * 900000).toString();

    const isTodayCollection = collectionDate === 'Today' || collectionDate.toLowerCase().includes('today');

    const resolvedCustomerName = customerName?.trim() || currentUser?.name || currentUser?.fullName || 'Customer';
    const custQrId = resolveCustomerQrId(currentUser?.id, currentUser?.customerQrId);

    const newOrder: MallOrder = {
      id: orderId,
      orderNumber,
      storeId,
      storeName,
      storeLocation: storeLocation || 'Universal Band Mall',
      storeOwnerId: storeOwnerId || '',
      customerId: currentUser?.id || `guest_${Date.now()}`,
      customerName: resolvedCustomerName,
      customerPhone: cleanPhone,
      customerQrId: custQrId || undefined,
      items: items.map((ci) => ({
        id: ci.menuItemId,
        name: ci.name,
        price: ci.price,
        quantity: ci.quantity,
        subCategory: ci.subCategory,
        image: ci.image,
        ingredients: ci.ingredients,
        allowIngredientRemoval: ci.allowIngredientRemoval,
        removedIngredients: ci.removedIngredients,
      })),
      totalQuantity,
      subtotal,
      platformFee,
      total,
      collectionDate: collectionDate || 'Today',
      isTodayCollection,
      
      // Delivery Fields
      collectionMethod: checkoutType,
      deliveryAddress: checkoutType === 'DELIVERY' ? deliveryAddress : undefined,
      deliveryPhone: checkoutType === 'DELIVERY' ? deliveryPhone : undefined,
      deliveryFee: checkoutType === 'DELIVERY' ? deliveryFee : undefined,
      deliveryLat: checkoutType === 'DELIVERY' ? deliveryLat : undefined,
      deliveryLng: checkoutType === 'DELIVERY' ? deliveryLng : undefined,
      gpsAccuracy: checkoutType === 'DELIVERY' ? gpsAccuracy : undefined,
      
      // Step 1: Status = New Order
      status: 'new_order',
      
      pickupQrCode: undefined,
      deliveryQrCode: undefined,
      pickupPin: checkoutType === 'DELIVERY' ? pickupPin : undefined,
      deliveryPin: checkoutType === 'DELIVERY' ? deliveryPin : undefined,
      
      collectionCode,
      paidAt: new Date().toISOString(),
    };


    // 4. Deduct wallet balance
    const newBal = Math.max(0, userBalance - total);
    try {
      localStorage.setItem('wallet_balance', String(newBal));
      setCurrentUser((prev) => ({
        ...prev,
        walletBalance: newBal,
        phone: cleanPhone || prev.phone,
      }));
      setUserWalletDoc((prev) => ({
        ...prev,
        balance: newBal,
      }));
      if (currentUser?.id) {
        setDoc(doc(db, 'users', currentUser.id), { walletBalance: newBal, phone: cleanPhone }, { merge: true }).catch(() => {});
        setDoc(doc(db, 'wallets', currentUser.id), { balance: newBal }, { merge: true }).catch(() => {});
      }
    } catch (e) {
      console.warn('Wallet balance deduction notice:', e);
    }

    addWalletTransaction({
      type: 'purchase',
      title: `${storeName} Order (${orderNumber})`,
      subtitle: `${totalQuantity} item(s) • Fee R${platformFee.toFixed(2)} • Ready for pickup`,
      amount: -total,
      reference: orderNumber,
    });

    // 5. Save order to Firestore and local state
    try {
      await setDoc(doc(db, 'mall_orders', orderId), cleanForFirestore(newOrder));
    } catch (e) {
      console.warn('Could not write mall order to Firestore:', e);
    }

    setMallOrders((prev) => [newOrder, ...prev]);
    try {
      const storedOrders = JSON.parse(localStorage.getItem('ub_mall_orders') || '[]');
      localStorage.setItem('ub_mall_orders', JSON.stringify([newOrder, ...storedOrders]));
    } catch (e) {}

    // 6. IF COLLECTION IS TODAY: Store owner receives an immediate message showing what customer ordered!
    if (isTodayCollection) {
      const itemsSummary = formatItemSummary(items);
      const messageId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const storeMessage: StoreMessage = {
        id: messageId,
        storeId,
        storeName,
        orderId,
        type: 'ORDER_TODAY',
        title: `🚨 TODAY PICKUP: ${orderNumber}`,
        message: `${resolvedCustomerName} (${cleanPhone}) placed an order to be collected TODAY. Total: R${total.toFixed(2)}. Items: ${itemsSummary}`,
        customerName: resolvedCustomerName,
        customerPhone: cleanPhone,
        totalQuantity,
        totalAmount: total,
        itemsSummary,
        collectionDate: 'Today',
        createdAt: new Date().toISOString(),
        read: false,
      };

      try {
        await setDoc(doc(db, 'store_messages', messageId), cleanForFirestore(storeMessage));
      } catch (e) {
        console.warn('Could not write store message to Firestore:', e);
      }

      setStoreMessages((prev) => [storeMessage, ...prev]);
      try {
        const storedMessages = JSON.parse(localStorage.getItem('ub_store_messages') || '[]');
        localStorage.setItem('ub_store_messages', JSON.stringify([storeMessage, ...storedMessages]));
      } catch (e) {}
    }

    // 7. Clear cart for this store (if using regular store cart)
    if (!customItems) {
      clearCart(storeId);
    }
    setActivePickupOrder(newOrder);

    // Confetti celebration
    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#D32F2F', '#0D47A1', '#FACC15', '#FFFFFF'],
      });
    } catch (e) {}

    return {
      success: true,
      order: newOrder,
    };
  };

  // --- Release Mall Order via Customer ONE QR Code (Free) ---
  const releaseMallOrderByQr = async (
    scannedCode: string,
    storeId?: string
  ): Promise<{ success: boolean; order?: MallOrder; message: string }> => {
    const raw = (scannedCode || '').trim();
    if (!raw) return { success: false, message: 'Invalid or empty QR code.' };

    const scan = parseCustomerQrScan(raw);
    if (scan.dynamicError) {
      return { success: false, message: scan.dynamicErrorMessage };
    }
    const matches = mallOrders.filter((o) => doesOrderMatchCustomerQr(o, scan, storeId));
    const activeMatch =
      matches.find(
        (o) => o.status !== 'collected' && o.status !== 'delivered' && o.status !== 'cancelled'
      ) || matches[0];

    if (!activeMatch) {
      const storeScopedMismatch = storeId
        ? mallOrders.find((o) => doesOrderMatchCustomerQr(o, scan))
        : undefined;
      if (storeScopedMismatch && storeId && storeScopedMismatch.storeId !== storeId) {
        return {
          success: false,
          message: `This order belongs to ${storeScopedMismatch.storeName}, not this venue.`,
        };
      }
      return { success: false, message: 'No matching order found for this Customer ONE QR.' };
    }

    const matchedOrder = activeMatch;

    if (storeId && matchedOrder.storeId && matchedOrder.storeId !== storeId) {
      return { success: false, message: `This order belongs to ${matchedOrder.storeName}, not this venue.` };
    }

    // Support Delivery Service Module QR Verification
    if (matchedOrder.collectionMethod === 'DELIVERY') {
      if (matchedOrder.status === 'ready_for_pickup' || matchedOrder.status === 'paid') {
        return verifyDriverStorePickup(raw, storeId);
      }
      if (matchedOrder.status === 'out_for_delivery') {
        return verifyCustomerDelivery(raw);
      }
      if (matchedOrder.status === 'delivered') {
        return {
          success: false,
          order: matchedOrder,
          message: `Delivery Order ${matchedOrder.orderNumber} was ALREADY DELIVERED at ${matchedOrder.deliveredAt ? new Date(matchedOrder.deliveredAt).toLocaleTimeString() : 'earlier'}.`,
        };
      }
    }

    if (matchedOrder.status === 'collected') {
      return {
        success: false,
        order: matchedOrder,
        message: `Order ${matchedOrder.orderNumber} was ALREADY COLLECTED at ${matchedOrder.collectedAt ? new Date(matchedOrder.collectedAt).toLocaleTimeString() : 'earlier'}.`,
      };
    }

    const updatedOrder: MallOrder = {
      ...matchedOrder,
      status: 'collected',
      collectionMethod: 'COLLECTION',
      collectionMethodType: 'QR_CODE',
      phoneLookupFeeCharged: false,
      collectedAt: new Date().toISOString(),
      collectedBy: currentUser?.name || 'Store Staff',
    };

    try {
      await setDoc(doc(db, 'mall_orders', matchedOrder.id), cleanForFirestore(updatedOrder), { merge: true });
    } catch (e) {
      console.warn('Could not update order collection status:', e);
    }

    setMallOrders((prev) => prev.map((o) => (o.id === matchedOrder.id ? updatedOrder : o)));
    try {
      const stored = JSON.parse(localStorage.getItem('ub_mall_orders') || '[]');
      const updatedList = stored.map((o: any) => (o.id === matchedOrder.id ? updatedOrder : o));
      localStorage.setItem('ub_mall_orders', JSON.stringify(updatedList));
    } catch (e) {}

    return {
      success: true,
      order: updatedOrder,
      message: `VALID QR • Handed over to ${updatedOrder.customerName}! 100% Free QR release.`,
    };
  };

  // --- Release Mall Order via Phone Number Lookup (R5 Fee Charged) ---
  const releaseMallOrderByPhone = async (
    customerPhone: string,
    storeId: string,
    orderId?: string
  ): Promise<{ success: boolean; order?: MallOrder; feeCharged: number; storeEarned: number; adminEarned: number; message: string }> => {
    const cleanDigits = (customerPhone || '').replace(/[^0-9]/g, '');
    if (!cleanDigits || cleanDigits.length < 6) {
      return {
        success: false,
        feeCharged: 0,
        storeEarned: 0,
        adminEarned: 0,
        message: 'Please provide a valid customer phone number.',
      };
    }

    // Find ready_for_pickup or paid order matching phone number
    const matchedOrders = mallOrders.filter((o) => {
      const oDigits = (o.customerPhone || '').replace(/[^0-9]/g, '');
      const phoneMatch = oDigits.includes(cleanDigits) || cleanDigits.includes(oDigits);
      const storeMatch = !storeId || o.storeId === storeId;
      const statusMatch = o.status === 'ready_for_pickup' || o.status === 'paid';
      return phoneMatch && storeMatch && statusMatch;
    });

    if (matchedOrders.length === 0) {
      return {
        success: false,
        feeCharged: 0,
        storeEarned: 0,
        adminEarned: 0,
        message: `No active pickup order found for phone number "${customerPhone}".`,
      };
    }

    const orderToCollect = orderId ? matchedOrders.find((o) => o.id === orderId) || matchedOrders[0] : matchedOrders[0];

    // Phone lookup fee distribution: R5 total. R2 to store owner's wallet, R3 to admin ("the rest to me")
    const feeSplit = getPhoneLookupFeeSplit(); // { totalFee: 5, storeOwnerShare: 2, platformShare: 3 }
    const storeEarned = feeSplit.storeOwnerShare; // R2
    const adminEarned = feeSplit.platformShare; // R3

    // Credit store owner / vendor wallet
    const activeBal = typeof currentUser?.walletBalance === 'number'
      ? currentUser.walletBalance
      : Number(localStorage.getItem('wallet_balance') || 0);

    const newOwnerBal = activeBal + storeEarned;
    localStorage.setItem('wallet_balance', String(newOwnerBal));
    setCurrentUser((prev) => ({ ...prev, walletBalance: newOwnerBal }));
    setUserWalletDoc((prev) => ({ ...prev, balance: newOwnerBal }));

    addWalletTransaction({
      type: 'topup',
      title: `Phone Lookup Collection Fee (+R${storeEarned}.00)`,
      subtitle: `Store Share • Order ${orderToCollect.orderNumber} • Phone ${orderToCollect.customerPhone}`,
      amount: storeEarned,
      reference: `LOOKUP_FEE_${orderToCollect.orderNumber}`,
    });

    // Credit platform admin wallet in Firestore
    try {
      const adminWalletRef = doc(db, 'wallets', 'user_admin');
      await setDoc(adminWalletRef, { balance: increment(adminEarned), updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('Admin wallet update notice:', e);
    }

    const updatedOrder: MallOrder = {
      ...orderToCollect,
      status: 'collected',
      collectionMethod: 'COLLECTION',
      collectionMethodType: 'PHONE_NUMBER_LOOKUP',
      phoneLookupFeeCharged: true,
      collectedAt: new Date().toISOString(),
      collectedBy: currentUser?.name || 'Store Staff',
    };

    try {
      await setDoc(doc(db, 'mall_orders', orderToCollect.id), cleanForFirestore(updatedOrder), { merge: true });
    } catch (e) {
      console.warn('Could not update order collection status:', e);
    }

    setMallOrders((prev) => prev.map((o) => (o.id === orderToCollect.id ? updatedOrder : o)));
    try {
      const stored = JSON.parse(localStorage.getItem('ub_mall_orders') || '[]');
      const updatedList = stored.map((o: any) => (o.id === orderToCollect.id ? updatedOrder : o));
      localStorage.setItem('ub_mall_orders', JSON.stringify(updatedList));
    } catch (e) {}

    return {
      success: true,
      order: updatedOrder,
      feeCharged: feeSplit.totalFee,
      storeEarned,
      adminEarned,
      message: `Order collected via Phone Lookup! Charged R5.00: R2.00 credited to Store Owner wallet, R3.00 to Universal Band Mall.`,
    };
  };

  const markStoreMessageRead = async (messageId: string) => {
    setStoreMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, read: true } : m)));
    try {
      await updateDoc(doc(db, 'store_messages', messageId), { read: true });
    } catch (e) {}
  };

  // --- Store Online Presence & Phone Checking ---
  const checkIsStoreOnline = (storeId: string): boolean => {
    if (!storeId) return false;

    // 1. If currentUser is owner, promoter or worker of this store, their phone is open and active right now!
    const roleLower = (currentUser?.role || '').toLowerCase();
    const isCurrentUserStoreStaff =
      currentUser?.assignedStoreId === storeId ||
      roleLower === 'admin' ||
      (roleLower === 'promoter' && currentUser?.assignedStoreId === storeId) ||
      (roleLower === 'worker' && currentUser?.assignedStoreId === storeId);

    // 2. Check store presence record
    const presence = storePresence[storeId];
    if (presence) {
      if (presence.manualOverrideOnline === false) {
        return false;
      }
      const ageMs = Date.now() - (presence.lastPingMs || new Date(presence.lastSeenAt || 0).getTime());
      if (presence.isOnline && ageMs < 180000) {
        return true;
      }
    }

    if (isCurrentUserStoreStaff) {
      return true;
    }

    if (presence && presence.isOnline) {
      return true;
    }

    return false;
  };

  const updateStorePresence = async (storeId: string, isOnline: boolean) => {
    if (!storeId) return;
    const now = new Date().toISOString();
    const presenceDoc: StorePresence = {
      storeId,
      isOnline,
      lastSeenAt: now,
      lastPingMs: Date.now(),
      activeDeviceId: currentUser?.id || `device_${Date.now()}`,
      activeStaffName: currentUser?.name || currentUser?.fullName || 'Staff',
      activeStaffRole: currentUser?.role || 'Staff',
      activeStaffPhone: currentUser?.phone || '',
      manualOverrideOnline: isOnline,
    };

    setStorePresence((prev) => ({
      ...prev,
      [storeId]: presenceDoc,
    }));

    try {
      localStorage.setItem(
        'ub_store_presence',
        JSON.stringify({
          ...storePresence,
          [storeId]: presenceDoc,
        })
      );
      await setDoc(doc(db, 'store_presence', storeId), cleanForFirestore(presenceDoc), { merge: true });
    } catch (e) {}
  };

  // --- Store Worker Account Management ---
  const createStoreWorker = async (data: {
    storeId: string;
    storeName: string;
    name: string;
    email: string;
    phone: string;
    password?: string;
    role?: 'Worker' | 'Manager';
  }): Promise<{ success: boolean; worker?: StoreWorker; error?: string }> => {
    try {
      const cleanEmail = (data.email || '').toLowerCase().trim();
      const cleanName = (data.name || '').trim();
      const cleanPhone = (data.phone || '').trim();
      const pass = data.password?.trim() || '';
      const assignedRole = data.role === 'Manager' ? 'Manager' : 'Worker';

      if (!cleanName || !cleanEmail) {
        return { success: false, error: 'Staff name and email address are required.' };
      }
      if (pass.length < 6) {
        return { success: false, error: 'Staff password (minimum 6 characters) is required.' };
      }

      const workerId = `worker_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const newWorker: StoreWorker = {
        id: workerId,
        storeId: data.storeId,
        storeName: data.storeName,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        role: assignedRole,
        passwordHint: pass,
        createdBy: currentUser?.id || 'store_owner',
        createdAt: new Date().toISOString(),
        isOnline: true,
      };

      const workerProfile: UserProfile = {
        id: workerId,
        name: cleanName,
        fullName: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        role: assignedRole,
        status: 'active',
        assignedStoreId: data.storeId,
        assignedStoreName: data.storeName,
        walletBalance: 0,
        isRegistered: true,
        emailVerified: true,
        createdAt: new Date().toISOString(),
      };

      try {
        const secondaryApp = initializeApp(firebaseConfig, `WorkerApp_${Date.now()}`);
        const secondaryAuth = getAuth(secondaryApp);
        await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, pass);
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
      } catch (authErr: any) {
        if (authErr?.code !== 'auth/email-already-in-use') {
          console.warn('Secondary auth worker creation notice:', authErr);
        }
      }

      try {
        await setDoc(doc(db, 'users', workerId), cleanForFirestore(workerProfile), { merge: true });
        await setDoc(doc(db, 'store_workers', workerId), cleanForFirestore(newWorker), { merge: true });
      } catch (e) {
        console.warn('Firestore store_workers save notice:', e);
      }

      try {
        const rawUsers = localStorage.getItem('ub_registered_users');
        const list = rawUsers ? JSON.parse(rawUsers) : [];
        list.push({ ...workerProfile, password: pass });
        localStorage.setItem('ub_registered_users', JSON.stringify(list));
      } catch (e) {}

      setStoreWorkers((prev) => [newWorker, ...prev.filter((w) => w.id !== workerId)]);
      try {
        const existing = JSON.parse(localStorage.getItem('ub_store_workers') || '[]');
        localStorage.setItem(
          'ub_store_workers',
          JSON.stringify([newWorker, ...existing.filter((w: any) => w.id !== workerId)])
        );
      } catch (e) {}

      return { success: true, worker: newWorker };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create worker account.' };
    }
  };

  const deleteStoreWorker = async (workerId: string): Promise<boolean> => {
    setStoreWorkers((prev) => prev.filter((w) => w.id !== workerId));
    try {
      await deleteDoc(doc(db, 'store_workers', workerId));
      await deleteDoc(doc(db, 'users', workerId));
      const existing = JSON.parse(localStorage.getItem('ub_store_workers') || '[]');
      localStorage.setItem(
        'ub_store_workers',
        JSON.stringify(existing.filter((w: any) => w.id !== workerId))
      );
    } catch (e) {}
    return true;
  };

  // --- Mark Order Ready for Pickup / Delivery ---
  const markOrderReady = async (orderId: string): Promise<{ success: boolean; message: string }> => {
    const order = mallOrders.find((o) => o.id === orderId);
    if (!order) {
      return { success: false, message: 'Order not found.' };
    }

    const isDelivery = order.collectionMethod === 'DELIVERY';
    const hostStore = stores.find((s) => s.id === order.storeId);

    const vendorLat = hostStore?.lat || order.vendorLat || -25.1703;
    const vendorLng = hostStore?.lng || order.vendorLng || 29.5252;
    const vendorName = hostStore?.name || order.storeName || 'Florence Kitchen';

    const customerLat = order.deliveryLat || order.customerLat || -25.1650;
    const customerLng = order.deliveryLng || order.customerLng || 29.5300;
    const customerAddress = order.deliveryAddress || 'Elias Motsoaledi Zone...';

    const pickupPin = order.pickupPin || Math.floor(100000 + Math.random() * 900000).toString();
    const deliveryPin = order.deliveryPin || Math.floor(100000 + Math.random() * 900000).toString();

    const updatedOrder: MallOrder = {
      ...order,
      status: 'ready_for_pickup',
      pickupPin,
      deliveryPin,
      vendorLat,
      vendorLng,
      vendorName,
      customerLat,
      customerLng,
      customerAddress,
      orderAmount: order.total,
      readyAt: new Date().toISOString(),
      readyBy: currentUser?.name || 'Store Staff',
    };

    try {
      await setDoc(doc(db, 'mall_orders', order.id), cleanForFirestore(updatedOrder), { merge: true });
      await setDoc(doc(db, 'orders', order.id), cleanForFirestore({
        ...updatedOrder,
        status: 'ready_for_driver',
        vendorLat,
        vendorLng,
        vendorName,
        customerLat,
        customerLng,
        customerAddress,
        orderAmount: order.total,
        createdAt: Date.now(),
      }), { merge: true });
    } catch (e) {}

    setMallOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
    try {
      const stored = JSON.parse(localStorage.getItem('ub_mall_orders') || '[]');
      localStorage.setItem(
        'ub_mall_orders',
        JSON.stringify(stored.map((o: any) => (o.id === order.id ? updatedOrder : o)))
      );
    } catch (e) {}

    const readyMsgId = `ready_msg_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const driverNoticeText = `Order Ready - ${order.storeName} - ${order.orderNumber} - Pickup at ${order.storeLocation || 'Store Location'}`;
    const readyMessage: StoreMessage = {
      id: readyMsgId,
      storeId: order.storeId,
      storeName: order.storeName,
      orderId: order.id,
      type: 'ORDER_READY',
      title: isDelivery ? `🛵 Order Ready - ${order.storeName} - ${order.orderNumber}` : `✅ ORDER READY: ${order.orderNumber}`,
      message: isDelivery
        ? driverNoticeText
        : `Order ${order.orderNumber} for ${order.customerName} (${order.customerPhone}) is READY FOR COLLECTION! Prepared by ${currentUser?.name || 'Staff'}.`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalQuantity: order.totalQuantity,
      totalAmount: order.total,
      itemsSummary: formatItemSummary(order.items),
      collectionDate: order.collectionDate,
      createdAt: new Date().toISOString(),
      read: false,
    };

    try {
      await setDoc(doc(db, 'store_messages', readyMsgId), cleanForFirestore(readyMessage));
    } catch (e) {}

    setStoreMessages((prev) => [readyMessage, ...prev]);

    if (isDelivery) {
      setWelcomeMessage(driverNoticeText);
      try {
        localStorage.setItem('ub_latest_driver_notification', driverNoticeText);
      } catch (e) {}
    } else {
      setWelcomeMessage(`Order ${order.orderNumber} is ready for customer collection!`);
    }

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#10B981', '#FACC15', '#0D47A1'],
      });
    } catch (e) {}

    return {
      success: true,
      message: isDelivery
        ? `Order Complete / Order Ready! Drivers notified: "${driverNoticeText}"`
        : `Order ${order.orderNumber} is marked READY! Customer notified for collection.`,
    };
  };

  // --- Step 4: Driver Confirms Pickup / Accepts Order ---
  const acceptOrder = async (
    orderId: string,
    driver: { id: string; name: string; phone: string; plate: string; photo?: string }
  ): Promise<{ success: boolean; message: string; order?: MallOrder }> => {
    const order = mallOrders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) {
      return { success: false, message: 'Order not found.' };
    }

    if (order.collectionMethod !== 'DELIVERY') {
      return { success: false, message: 'This is a customer collection order, not a delivery order.' };
    }

    // Step 4: Lock order to this driver. No other driver can take it.
    if (order.deliveryDriverId && order.deliveryDriverId !== driver.id) {
      return {
        success: false,
        message: `This order is already taken by driver ${order.deliveryDriverName || 'another driver'}.`,
      };
    }

    const pickupPin = order.pickupPin || Math.floor(100000 + Math.random() * 900000).toString();
    const deliveryPin = order.deliveryPin || Math.floor(100000 + Math.random() * 900000).toString();
    const driverPhoto = driver.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';

    // Step 4: Status changes to Driver Assigned - [Driver Name] (PIN-based handoff; customer scans use permanent Profile ONE QR)
    const updatedOrder: MallOrder = {
      ...order,
      deliveryDriverId: driver.id,
      deliveryDriverName: driver.name,
      deliveryDriverPhone: driver.phone,
      deliveryDriverPlate: driver.plate,
      deliveryDriverPhoto: driverPhoto,
      status: 'driver_assigned',
      driverAcceptedAt: new Date().toISOString(),
      pickupQrCode: undefined,
      deliveryQrCode: undefined,
      pickupPin,
      deliveryPin,
    };

    try {
      await setDoc(doc(db, 'mall_orders', order.id), cleanForFirestore(updatedOrder), { merge: true });
    } catch (e) {}

    setMallOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
    try {
      const stored = JSON.parse(localStorage.getItem('ub_mall_orders') || '[]');
      localStorage.setItem(
        'ub_mall_orders',
        JSON.stringify(stored.map((o: any) => (o.id === order.id ? updatedOrder : o)))
      );
    } catch (e) {}

    // Step 4: Customer gets notification: "Your driver is on the way to pick up your order"
    setWelcomeMessage('Your driver is on the way to pick up your order');

    // Alert vendor that a driver has accepted and is on their way to the store
    const driverNoticeId = `driver_assigned_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const driverNotice: StoreMessage = {
      id: driverNoticeId,
      storeId: order.storeId,
      storeName: order.storeName,
      orderId: order.id,
      type: 'GENERAL',
      title: `🛵 Driver Assigned: ${driver.name} for ${order.orderNumber}`,
      message: `Driver ${driver.name} (${driver.phone}, Plate: ${driver.plate}) is on the way to pick up order ${order.orderNumber}.`,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalQuantity: order.totalQuantity,
      totalAmount: order.total,
      itemsSummary: formatItemSummary(order.items),
      collectionDate: order.collectionDate,
      createdAt: new Date().toISOString(),
      read: false,
    };

    try {
      await setDoc(doc(db, 'store_messages', driverNoticeId), cleanForFirestore(driverNotice));
    } catch (e) {}

    setStoreMessages((prev) => [driverNotice, ...prev]);

    return {
      success: true,
      message: `Pickup confirmed! Show Pickup PIN ${pickupPin} at ${order.storeName}.`,
      order: updatedOrder,
    };
  };

  // --- Step 6: Store Scans Driver QR Code ---
  const verifyDriverStorePickup = async (
    scannedCodeOrPin: string,
    storeId?: string
  ): Promise<{
    success: boolean;
    message: string;
    order?: MallOrder;
    driver?: { name: string; photo: string; plate: string };
  }> => {
    const raw = (scannedCodeOrPin || '').trim();
    if (!raw) return { success: false, message: 'Wrong driver' };

    let parsedOrderId = raw;
    let parsedPin = raw;
    let parsedDriverId = '';
    let parsedDriverName = '';
    let parsedDriverPhoto = '';
    let parsedDriverPlate = '';

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        parsedOrderId = parsed.orderId || parsed.id || raw;
        parsedPin = parsed.pin || raw;
        parsedDriverId = parsed.driverId || '';
        parsedDriverName = parsed.driverName || '';
        parsedDriverPhoto = parsed.driverPhoto || '';
        parsedDriverPlate = parsed.driverPlate || '';
      }
    } catch (e) {}

    const matchedOrder = mallOrders.find(
      (o) =>
        o.id === parsedOrderId ||
        o.orderNumber === raw ||
        o.pickupPin === raw ||
        o.pickupPin === parsedPin ||
        o.pickupQrCode === raw ||
        (o.orderNumber && raw.includes(o.orderNumber)) ||
        (o.id && raw.includes(o.id))
    );

    if (!matchedOrder) {
      return { success: false, message: 'Wrong driver' };
    }

    if (storeId && matchedOrder.storeId && matchedOrder.storeId !== storeId) {
      return { success: false, message: 'Wrong driver' };
    }

    // Check if wrong driver: if order has an assigned driver, the scanned QR must match that driver
    if (matchedOrder.deliveryDriverId && parsedDriverId && matchedOrder.deliveryDriverId !== parsedDriverId) {
      return { success: false, message: 'Wrong driver' };
    }

    const driverName = matchedOrder.deliveryDriverName || parsedDriverName || 'Driver';
    const driverPhoto = matchedOrder.deliveryDriverPhoto || parsedDriverPhoto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
    const driverPlate = matchedOrder.deliveryDriverPlate || parsedDriverPlate || 'Plate Unknown';

    return {
      success: true,
      message: `This is the correct driver - ${driverName} - for Order ${matchedOrder.orderNumber}`,
      driver: {
        name: driverName,
        photo: driverPhoto,
        plate: driverPlate,
      },
      order: matchedOrder,
    };
  };

  // --- Step 6: Store Confirms Collection (Handover to Driver) ---
  const confirmStoreHandoverToDriver = async (
    orderId: string
  ): Promise<{ success: boolean; message: string; order?: MallOrder }> => {
    const matchedOrder = mallOrders.find((o) => o.id === orderId);
    if (!matchedOrder) {
      return { success: false, message: 'Order not found.' };
    }

    const updatedOrder: MallOrder = {
      ...matchedOrder,
      status: 'collected_by_driver',
      shopHandoverNote: 'Driver has collected the order. Shop has done its part.',
      driverPickedUpAt: new Date().toISOString(),
      collectedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'mall_orders', matchedOrder.id), cleanForFirestore(updatedOrder), { merge: true });
    } catch (e) {}

    setMallOrders((prev) => prev.map((o) => (o.id === matchedOrder.id ? updatedOrder : o)));
    try {
      const stored = JSON.parse(localStorage.getItem('ub_mall_orders') || '[]');
      localStorage.setItem(
        'ub_mall_orders',
        JSON.stringify(stored.map((o: any) => (o.id === matchedOrder.id ? updatedOrder : o)))
      );
    } catch (e) {}

    // Step 6: Customer gets notification: "Your order has been collected"
    setWelcomeMessage('Your order has been collected');

    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10B981', '#0D47A1', '#FACC15'],
      });
    } catch (e) {}

    return {
      success: true,
      message: 'Driver has collected the order. Shop has done its part.',
      order: updatedOrder,
    };
  };

  // --- Step 8: Driver Scans Customer ONE QR Code (or enters PIN) ---
  const verifyCustomerDelivery = async (
    scannedCodeOrPin: string,
    driverId?: string,
    gpsCoords?: { lat: number; lng: number }
  ): Promise<{ success: boolean; message: string; order?: MallOrder; customerVerified?: boolean }> => {
    const raw = (scannedCodeOrPin || '').trim();
    if (!raw) return { success: false, message: 'Invalid or empty customer QR code / PIN.' };

    const scan = parseCustomerQrScan(raw);
    if (scan.dynamicError) {
      return { success: false, message: scan.dynamicErrorMessage };
    }
    const cleanInputDigits = normalizePhoneDigits(raw);

    const deliveryMatches = mallOrders.filter((o) => {
      if (o.collectionMethod !== 'DELIVERY') return false;
      if (doesOrderMatchCustomerQr(o, scan)) return true;
      const oPhoneDigits = normalizePhoneDigits(o.customerPhone || '');
      const isLast4Match = cleanInputDigits.length >= 4 && oPhoneDigits.endsWith(cleanInputDigits);
      return isLast4Match;
    });

    const matchedOrder =
      deliveryMatches.find((o) => o.status !== 'delivered' && o.status !== 'cancelled') ||
      deliveryMatches[0];

    if (!matchedOrder) {
      return { success: false, message: 'Wrong customer QR code' };
    }

    if (matchedOrder.status === 'delivered') {
      return {
        success: false,
        order: matchedOrder,
        message: `Order ${matchedOrder.orderNumber} was ALREADY delivered.`,
      };
    }

    // Step 9: App shows "Correct Customer - Confirm Delivery"
    return {
      success: true,
      customerVerified: true,
      message: 'Correct Customer - Confirm Delivery',
      order: matchedOrder,
    };
  };

  // --- Step 9: Payment and Delivery Confirmation ---
  const confirmCustomerDeliveryComplete = async (
    orderId: string,
    gpsCoords?: { lat: number; lng: number }
  ): Promise<{ success: boolean; message: string; order?: MallOrder }> => {
    const matchedOrder = mallOrders.find((o) => o.id === orderId);
    if (!matchedOrder) {
      return { success: false, message: 'Order not found.' };
    }

    const deliveryFeeEarned = matchedOrder.deliveryFee || 25;

    // Step 9: Order status changes automatically to Delivered
    const updatedOrder: MallOrder = {
      ...matchedOrder,
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      deliveryProof: {
        type: 'QR_SCAN',
        timestamp: new Date().toISOString(),
        ...(gpsCoords ? { gps: gpsCoords } : {}),
        notes: `Delivered by Driver ${matchedOrder.deliveryDriverName || currentUser?.name || 'Courier'}`,
      },
    };

    try {
      await setDoc(doc(db, 'mall_orders', matchedOrder.id), cleanForFirestore(updatedOrder), { merge: true });
    } catch (e) {}

    setMallOrders((prev) => prev.map((o) => (o.id === matchedOrder.id ? updatedOrder : o)));
    try {
      const stored = JSON.parse(localStorage.getItem('ub_mall_orders') || '[]');
      localStorage.setItem(
        'ub_mall_orders',
        JSON.stringify(stored.map((o: any) => (o.id === matchedOrder.id ? updatedOrder : o)))
      );
    } catch (e) {}

    // Step 10: Driver dashboard earnings updated
    const activeBal = typeof currentUser?.walletBalance === 'number'
      ? currentUser.walletBalance
      : Number(localStorage.getItem('wallet_balance') || 0);

    const newDriverBal = activeBal + deliveryFeeEarned;
    try {
      localStorage.setItem('wallet_balance', String(newDriverBal));
      setCurrentUser((prev: any) => ({ ...prev, walletBalance: newDriverBal }));
      setUserWalletDoc((prev: any) => ({ ...prev, balance: newDriverBal }));
      if (currentUser?.id) {
        setDoc(doc(db, 'wallets', currentUser.id), { balance: newDriverBal }, { merge: true }).catch(() => {});
      }
    } catch (e) {}

    addWalletTransaction({
      type: 'topup',
      title: `Delivery Complete (+R${deliveryFeeEarned.toFixed(2)})`,
      subtitle: `Completed ${matchedOrder.orderNumber} for ${matchedOrder.customerName}`,
      amount: deliveryFeeEarned,
      reference: `DELIVERY_${matchedOrder.orderNumber}`,
    });

    // Step 9: Customer gets notification: "Your order has been delivered"
    // Driver gets notification: "Delivery Complete"
    setWelcomeMessage('Your order has been delivered');

    try {
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#10B981', '#FACC15', '#0D47A1', '#FFFFFF'],
      });
    } catch (e) {}

    return {
      success: true,
      message: 'Delivery Complete',
      order: updatedOrder,
    };
  };

  const markAsOnWay = async (orderId: string) => {
    return confirmStoreHandoverToDriver(orderId);
  };

  const markAsDelivered = async (orderId: string, proof?: any) => {
    return confirmCustomerDeliveryComplete(orderId);
  };

  return (
    <AppContext.Provider
      value={{
        isLocked,
        unlockApp,
        lockApp,
        attemptsLeft,
        resetPinWithEmail,
        currentPin,
        updatePin,
        currentRoute,
        navigateTo,
        selectedStoreId,
        setSelectedStoreId,
        stores,
        events,
        tickets,
        promoters,
        createOrAssignPromoter,
        isAdminSecurityModalOpen,
        setIsAdminSecurityModalOpen,
        pendingAdminAuthUser,
        openAdminLoginFlow,
        handleAdminSecuritySuccess,
        cancelAdminLogin,
        terminateAdminSession,
        wipeAndReset,
        menuFood,
        menuAlcohol,
        menuSoftDrinks,
        currentUser,
        setCurrentUser,
        currentWalletBalance,
        firebaseUser,
        welcomeMessage,
        setWelcomeMessage,
        registerWithEmail,
        loginWithEmailOrPhone,
        pendingSecurityAuth,
        completeSecurityLogin,
        cancelSecurityLogin,
        pendingVerification,
        setPendingVerification: handleSetPendingVerification,
        loginAsAdminMaster,
        sendEmailOtp,
        resetPasswordWithOtp,
        resetPasswordDirectly,
        signInWithGoogle,
        setAuthRegistrationLock,
        signOutUser,
        deleteMyAccount,
        adminDeleteUser,
        approveUser,
        rejectUser,
        pendingApprovals,
        pendingCheckoutTarget,
        setPendingCheckoutTarget,
        totalCartCount,
        allRegisteredUsers,
        storeRequests,
        buyTicket,
        buyTicketWithPayShap,
        updateTicketPaymentStatus,
        confirmTicketPaymentManually,
        confirmMallOrderPaymentManually,
        markPayshapRequestSent,
        processTymebankSms,
        scanRealSmsInbox,
        tymebankPayshapNumber,
        updateTymebankPayshapNumber,
        paymentBankMessage,
        paymentReferenceFormat,
        lastPaymentSmsText,
        lastPaymentSmsSender,
        lastPaymentSmsAt,
        lastPaymentAmount,
        lastConfirmedReference,
        smsPermissionActive,
        updatePaymentConfirmationSettings,
        requestAdminSmsPermissionPopup,
        newOrderSound,
        updateNewOrderSound,
        buyTicketAlarm,
        updateBuyTicketAlarm,
        activePaymentAlarm,
        dismissPaymentAlarm,
        activeBuyTicketAlarm,
        dismissBuyTicketAlarm,
        testPaymentAlarm,
        supportRingEnabled,
        setSupportRingEnabled,
        supportChats,
        activeCustomerChat,
        unreadAdminSupportCount,
        unreadCustomerSupportCount,
        isSupportModalOpen,
        setIsSupportModalOpen,
        activeAdminSupportChatId,
        setActiveAdminSupportChatId,
        sendCustomerSupportMessage,
        sendAdminSupportReply,
        markChatAsReadByCustomer,
        markChatAsReadByAdmin,
        approveTicketManuallyFromChat,
        rejectTicketFromChat,
        notificationBanner,
        dismissNotificationBanner,
        tymebankSmsLogs,
        clearTymebankSmsLogs,
        walletTopups,
        submitPayshapTopUpRequest,
        checkInTicket,
        checkOutTicket,
        selectedBuyingEvent,
        setSelectedBuyingEvent,
        editingEvent,
        setEditingEvent,
        eventActionError,
        setEventActionError,
        eventsLoaded,
        addNewEvent,
        updateEvent,
        deleteEvent,
        addNewStore,
        updateStore,
        deleteStore,
        editingStore,
        setEditingStore,
        addMenuItem,
        purchaseMenuItem,
        updateStoreRequestStatus,
        submitPromoterApplication,
        topUpWallet,
        walletTransactions,
        addWalletTransaction,
        resetWallet,
        setUserAge,
        userWalletDoc,
        updateUserWalletDoc,
        activeStoreTab,
        setActiveStoreTab,
        selectedTicket,
        setSelectedTicket,
        activeModal,
        setActiveModal,
        resetPasswordCode,
        customLogoUrl,
        updateCustomLogo,
        customAppIconUrl,
        updateCustomAppIcon,
        resetAllCustomerBalances,
        deductVendorSale,
        liveSales,
        totalLiveSalesAmount,
        carts,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        updateCartItemRemovedIngredients,
        clearCart,
        getCartSummary,
        mallOrders,
        storeMessages,
        createMallOrder,
        releaseMallOrderByQr,
        releaseMallOrderByPhone,
        markStoreMessageRead,
        activePickupOrder,
        setActivePickupOrder,
        storeWorkers,
        createStoreWorker,
        deleteStoreWorker,
        storePresence,
        updateStorePresence,
        checkIsStoreOnline,
        markOrderReady,
        acceptOrder,
        verifyDriverStorePickup,
        confirmStoreHandoverToDriver,
        verifyCustomerDelivery,
        confirmCustomerDeliveryComplete,
        markAsOnWay,
        markAsDelivered,
        eventPreorderEvent,
        setEventPreorderEvent,
        openEventFoodPreorder,
        isAppReady,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
