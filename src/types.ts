export interface Store {
  id: string;
  name: string;
  location: string;
  imageUrl: string;
  category?: string;
  originalImageUrl?: string;
  ownerId?: string;
  promoterId?: string;
  description?: string;
  createdAt?: string;
  lat?: number;
  lng?: number;
  googleMapsUrl?: string;
}

export interface EventItem {
  id: string;
  storeId: string;
  title: string;
  date: string;
  event_date?: string; // date + time
  location: string;
  price: string;
  imageUrl?: string;
  status: 'Open' | 'Closed';
  category: 'Events' | 'Food' | 'Drinks';
  creatorId?: string;
  description?: string;
  ticketsAvailable?: number;
  ticketsSold?: number;
  earlyBirdPrice?: number | string;
  generalPrice?: number | string;
  vipPrice?: number | string;
  vvipPrice?: number | string;
  earlyBirdVipPrice?: number | string;
  eventCode?: string;
  kidsPrice?: number | string;
}

export type AttendanceStatus = 'OUTSIDE' | 'INSIDE' | 'EXITED';

export interface AttendanceLog {
  action: 'CHECK_IN' | 'CHECK_OUT';
  timestamp: string; // ISO string
  timeFormatted: string; // e.g. "14:32"
  bouncerName?: string;
  bouncerRole?: string;
  notes?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  fullName?: string;
  idNumber?: string;
  age?: number;
  email: string;
  phone: string;
  photo?: string;
  avatarUrl?: string;
  walletId?: string;
  customerQrId?: string;
  role: 'Admin' | 'Customer' | 'Event Organiser' | 'Seller' | 'Driver' | 'Shop Worker' | 'Promoter' | string;
  status?: 'pending' | 'approved' | 'rejected' | 'active' | 'suspended' | string;
  isApproved?: boolean;
  approvedAt?: string;
  rejectionReason?: string;
  rejectedAt?: string;
  organisationName?: string;
  shopName?: string;
  whatToSell?: string;
  vehicleType?: string;
  licensePlate?: string;
  driverLicenseNumber?: string;
  createdAt?: string;
  assignedStoreId?: string; // If Promoter or Shop Worker, strictly assigned store
  assignedStoreName?: string;
  walletBalance: number;
  isRegistered?: boolean;
  emailVerified?: boolean;
  isVerified?: boolean;
}

export interface Promoter {
  id: string;
  uid: string;
  email: string;
  name: string;
  role: 'Promoter' | 'Admin';
  storeId: string;
  storeName: string;
  phone?: string;
  createdAt?: string;
}

export interface PromoterApplication {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  storeName?: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketId: string; // e.g. UB-84729
  eventId: string;
  storeId: string; // Scoped to venue (e.g. florence-palm, mphela-resort)
  storeName: string;
  userId?: string;
  user_id?: string; // Required user ID field
  eventName: string;
  eventTitle: string;
  eventDate: string;
  event_date?: string; // Required event date + time field
  eventLocation?: string;
  price: string;
  ticketTier?: 'Early Bird' | 'General' | 'VIP' | 'VVIP' | string;
  tierName?: string;
  attendeeName?: string; // primary identifier
  attendeePhone?: string; // primary identifier (encrypted / masked)
  customerName: string;
  customerPhone?: string;
  customerIdNumber?: string; // deprecated
  customerPhoto?: string;
  customerQrId?: string;
  qrCode?: string;
  bandCode: string; // e.g. UB-84729
  status: 'valid' | 'used' | 'expired' | 'Valid' | 'Used' | 'billed' | 'Billed' | 'inside' | 'Inside' | 'INSIDE';
  attendanceStatus?: AttendanceStatus; // 'OUTSIDE' (default) | 'INSIDE' | 'EXITED'
  attendanceLogs?: AttendanceLog[];
  insideSince?: string; // e.g. "14:32"
  exitedAt?: string; // e.g. "16:10"
  lastMovementAt?: string;
  isBilled?: boolean;
  billedAt?: string;
  isEventOver?: boolean;
  purchaseDate?: string;
  purchase_date?: string; // Required purchase date field
  createdAt: string;
  quantity?: number;
  paymentStatus?: 'PENDING_PAYMENT' | 'WAITING FOR PAYMENT' | 'PAID' | 'VERIFIED';
  payshapReference?: string;
  payshapRequestSent?: boolean;
  payshapRequestSentAt?: string;
  paidAt?: string;
  verifiedSmsText?: string;
  checkedBy?: string;
  checkedAt?: string;
  hasFoodPreorder?: boolean;
  preorderSummary?: string;
  preorderOrderId?: string;
  preorderTotal?: number;
}

export type BuiltInSoundId =
  | 'loud-ringtone'
  | 'urgent-bell'
  | 'cash-register'
  | 'marimba-alert'
  | 'siren-ping';

export interface NewOrderSoundConfig {
  mode: 'preset' | 'custom';
  presetId: BuiltInSoundId;
  customName?: string;
  customDataUrl?: string;
  volume?: number;
}

export interface AppNotificationBanner {
  id: string;
  role: 'admin' | 'customer';
  title: string;
  message: string;
  variant: 'waiting' | 'paid';
  ticketId?: string;
}

export interface StoreRequest {
  id: string;
  storeName: string;
  ownerName: string;
  location: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

export interface MenuItem {
  id: string;
  storeId?: string;
  name: string;
  price: string;
  imageUrl?: string;
  description?: string;
  category: 'food' | 'alcohol' | 'softdrink';
  createdAt?: string;
  ingredients?: string[];
  allowIngredientRemoval?: boolean;
}

export interface MenuItemDoc {
  id: string;
  name: string;
  price: number | string;
  image?: string;
  imageUrl?: string;
  category: 'food' | 'drink' | 'alcohol' | string;
  subCategory?: 'soft' | 'alcohol' | string;
  isAlcohol?: boolean;
  storeId: string;
  storeName: string;
  available: boolean;
  description?: string;
  ownerId?: string;
  ingredients?: string[];
  allowIngredientRemoval?: boolean;
}

export interface FoodReservationDoc {
  id: string;
  userId: string;
  items: Array<{
    menuItemId: string;
    qty: number;
    name?: string;
    price?: number;
  }>;
  total: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'collected';
  createdAt: string;
}

export interface Reservation {
  id: string; // e.g. RES-49281
  storeId: string;
  storeName: string;
  eventId: string;
  eventTitle: string;
  eventDate: string; // e.g. "Sat, 03 Oct 2026, 18:00"
  eventTimestamp: number; // epoch ms for countdown / policy calculation
  customerIdNumber: string; // 13-digit SA ID
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  itemType: 'food' | 'alcohol' | 'softdrink';
  itemId: string;
  itemName: string;
  itemPrice: number; // e.g. 50
  itemPriceFormatted: string; // e.g. "R50.00"
  status: 'reserved' | 'cancelled' | 'collected';
  feePercentage?: number; // e.g. 15
  feeAmount?: number; // e.g. 7.50
  refundAmount?: number; // e.g. 42.50
  createdAt: string;
  cancelledAt?: string;
  collectedAt?: string;
}

export interface ReservationDoc {
  id?: string;
  walletId: string;
  storeId: string;
  storeName: string;
  eventId?: string;
  eventName?: string;
  itemId: string;
  itemName: string;
  quantity?: number;
  price?: number;
  total: number;
  category?: string;
  subCategory?: 'soft' | 'alcohol' | string;
  isAlcohol?: boolean;
  status: 'paid' | 'reserved' | 'reserved_for_event' | 'collected' | 'released' | 'cancelled' | 'refunded';
  paidAt: any;
  eventDate?: any;
  refundAmount?: number;
  refundedAt?: any;
  customerId?: string; // South African ID Number or UB Customer ID
  customerQrId?: string;
  customerName?: string;
  customerPhoto?: string;
  customerPhone?: string;
  reservedForOther?: boolean;
  beneficiaryId?: string;
  beneficiaryName?: string;
  beneficiaryPhoto?: string;
  collectionCode?: string; // Short code e.g. UB-RES-9482
  collectionNote?: string; // "Use this ID to collect your food if you don't have QR or NFC"
}

export interface BinnedItem {
  id: string;
  originalCollection: 'tickets' | 'reservations';
  originalId: string;
  itemType: 'ticket' | 'food' | 'drink' | 'alcohol' | string;
  title: string;
  storeId?: string;
  storeName?: string;
  eventId?: string;
  eventName?: string;
  eventDate?: string;
  customerName?: string;
  attendeePhone?: string;
  customerPhone?: string;
  customerIdNumber?: string;
  amount?: number | string;
  binnedAt: any;
  binnedReason: string;
  deleteAt: any; // 60 days from binnedAt
  daysRemaining?: number;
  originalData: any;
  status: 'binned' | 'restored' | 'purged';
}

export interface SpendingTransaction {
  id: string;
  userId: string;
  customerId?: string;
  customerName?: string;
  type: 'ticket' | 'food' | 'drink' | 'topup' | 'refund' | 'cancellation';
  description: string;
  amount: number; // positive for topup/refund, negative for spending
  storeId?: string;
  storeName?: string;
  paymentMethod: 'Wallet' | 'Card' | 'Cashless Band' | 'OneVoucher' | 'Universal Band Wristband';
  status: 'Paid' | 'Used' | 'Cancelled' | 'Refunded' | 'Billed';
  reference?: string;
  timestamp: any;
  createdAt: string;
}

export interface NfcLinkLog {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  idNumber?: string;
  targetUrl: string;
  linkedByAdminId: string;
  linkedByAdminName: string;
  linkedAt: any;
  tagSerialNumber?: string;
  status: 'success' | 'failed';
}

export interface WalletDoc {
  id?: string;
  userId: string;
  balance: number;
  idNumber?: string | null;
  idFrontImageUrl?: string | null;
  idSelfieImageUrl?: string | null;
  idVerified: boolean;
  verificationStatus: 'none' | 'pending' | 'verified' | 'rejected';
  dateOfBirth?: any;
  age?: number | null;
  canBuyAlcohol: boolean;
  updatedAt?: any;
}

export interface WalletTransaction {
  id: string;
  type: 'topup' | 'purchase' | 'refund';
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  reference?: string;
}

export interface VendorSale {
  id: string;
  itemName: string;
  amount: number;
  customerId: string;
  customerName: string;
  storeId?: string;
  storeName?: string;
  vendorId?: string;
  vendorName?: string;
  timestamp: string;
}

export interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  category?: string;
  subCategory?: string;
  isAlcohol?: boolean;
  storeId: string;
  storeName: string;
  ingredients?: string[];
  allowIngredientRemoval?: boolean;
  removedIngredients?: string[];
  customizedIngredients?: string[];
}

export interface MallOrder {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  storeLocation?: string;
  storeOwnerId?: string;
  customerId: string;
  customerQrId?: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    subCategory?: string;
    image?: string;
    ingredients?: string[];
    allowIngredientRemoval?: boolean;
    removedIngredients?: string[];
  }>;
  totalQuantity: number;
  subtotal: number;
  platformFee: number;
  total: number;
  
  // New Delivery Fields
  collectionMethod: 'COLLECTION' | 'DELIVERY';
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryFee?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  gpsAccuracy?: number;
  vendorLat?: number;
  vendorLng?: number;
  vendorName?: string;
  customerLat?: number;
  customerLng?: number;
  customerAddress?: string;
  orderAmount?: number;
  deliveryDriverId?: string;
  deliveryDriverName?: string;
  deliveryDriverPhone?: string;
  deliveryDriverPlate?: string;
  deliveryDriverPhoto?: string;
  shopHandoverNote?: string;
  
  // Statuses
  status: 'new_order' | 'paid' | 'ready_for_pickup' | 'driver_assigned' | 'collected_by_driver' | 'out_for_delivery' | 'delivered' | 'collected' | 'cancelled';
  paymentStatus?: 'WAITING FOR PAYMENT' | 'PENDING_PAYMENT' | 'PAID' | 'VERIFIED';
  payshapReference?: string;
  verifiedSmsText?: string;
  
  // QRs / Pins
  pickupQrCode?: string;
  deliveryQrCode?: string;
  pickupPin?: string;
  deliveryPin?: string;
  
  // Old Collection Fields
  collectionDate: 'Today' | string;
  isTodayCollection: boolean;
  collectionCode: string;
  collectionMethodType?: 'QR_CODE' | 'PHONE_NUMBER_LOOKUP';
  phoneLookupFeeCharged?: boolean;
  
  paidAt: string;
  readyAt?: string;
  readyBy?: string;
  driverAcceptedAt?: string;
  driverPickedUpAt?: string;
  collectedAt?: string;
  collectedBy?: string;
  deliveredAt?: string;
  deliveryProof?: {
    type: 'QR_SCAN' | 'PIN_VERIFY' | 'PHONE_DIGITS';
    timestamp: string;
    gps?: { lat: number; lng: number };
    notes?: string;
  };
}


export interface StoreMessage {
  id: string;
  storeId: string;
  storeName: string;
  orderId: string;
  type: 'ORDER_TODAY' | 'ORDER_SCHEDULED' | 'ORDER_READY' | 'GENERAL';
  title: string;
  message: string;
  customerName: string;
  customerPhone: string;
  totalQuantity: number;
  totalAmount: number;
  itemsSummary: string;
  collectionDate: string;
  createdAt: string;
  read: boolean;
}

export interface StoreWorker {
  id: string;
  storeId: string;
  storeName: string;
  name: string;
  email: string;
  phone: string;
  role: 'Worker' | 'Manager' | 'Staff';
  passwordHint?: string;
  createdBy: string;
  createdAt: string;
  lastActiveAt?: string;
  isOnline?: boolean;
}

export interface StorePresence {
  storeId: string;
  storeName?: string;
  isOnline: boolean;
  lastSeenAt: string;
  lastPingMs: number;
  activeDeviceId?: string;
  activeStaffName?: string;
  activeStaffRole?: string;
  activeStaffPhone?: string;
  manualOverrideOnline?: boolean;
}

export interface SupportTicketAttachment {
  ticketId: string;
  ticketBandCode?: string;
  eventName: string;
  ticketTier?: string;
  price: string;
  payshapReference?: string;
  purchaseDate?: string;
  customerName: string;
  customerPhone?: string;
  status: string;
}

export interface SupportMessage {
  id: string;
  chatId: string;
  senderRole: 'customer' | 'admin';
  senderName: string;
  senderId: string;
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  timestamp: string; // ISO string
  ticketAttachment?: SupportTicketAttachment;
  isSystemNotification?: boolean;
}

export interface SupportChat {
  id: string; // e.g. chat_{customerId}
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerPhoto?: string;
  unreadAdminCount: number;
  unreadCustomerCount: number;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderRole: 'customer' | 'admin';
  pendingTicketId?: string;
  messages: SupportMessage[];
  updatedAt: string;
}

