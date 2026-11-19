import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CartItem } from '../../types';
import {
  buildSnapScanUrl,
  getPublicSnapCode,
  openSnapScanLink,
  recordSnapScanOrder,
  recordSnapScanRetryAttempt,
} from '../../utils/snapscanHelper';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  CreditCard,
  CheckCircle2,
  Phone,
  Calendar,
  AlertCircle,
  Sparkles,
  Zap,
  ShieldCheck,
  Check,
  MapPin,
  Navigation,
  Compass,
  Loader2,
  Utensils,
} from 'lucide-react';
import { LocationPickerModal } from '../modals/LocationPickerModal';
import { MALL_FEES, calculatePlatformFee } from '../../utils/mallFees';
import { formatGeolocationError, isBannedLocation } from '../../utils/gpsHelper';
import { ensureLocationPermission } from '../../utils/nativePermissions';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

interface StoreCartDrawerProps {
  storeId: string;
  storeName: string;
  storeLocation?: string;
  storeOwnerId?: string;
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (order: any) => void;
}

export const StoreCartDrawer: React.FC<StoreCartDrawerProps> = ({
  storeId,
  storeName,
  storeLocation,
  storeOwnerId,
  isOpen,
  onClose,
  onOrderCreated,
}) => {
  const {
    carts,
    removeFromCart,
    updateCartQuantity,
    updateCartItemRemovedIngredients,
    clearCart,
    getCartSummary,
    createMallOrder,
    currentUser,
    currentWalletBalance,
    topUpWallet,
    navigateTo,
    setActiveModal,
    checkIsStoreOnline,
  } = useApp();

  const isStoreOnline = checkIsStoreOnline(storeId);
  const cartSummary = getCartSummary(storeId);
  const items = cartSummary.items;

  // Meal Customization state inside cart/checkout
  const [expandedCustomizerId, setExpandedCustomizerId] = useState<string | null>(null);

  const customizableItems = items.filter(
    (item) => (item.ingredients && item.ingredients.length > 0) || item.allowIngredientRemoval
  );

  // Form states
  const [customerPhone, setCustomerPhone] = useState<string>(() => {
    return currentUser?.phone || localStorage.getItem('ub_checkout_phone') || '';
  });
  const [customerName, setCustomerName] = useState<string>(() => {
    return currentUser?.name || currentUser?.fullName || '';
  });
  const [collectionDateType, setCollectionDateType] = useState<'Today' | 'Scheduled'>('Today');
  const [scheduledDate, setScheduledDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [checkoutType, setCheckoutType] = useState<'COLLECTION' | 'DELIVERY'>('COLLECTION');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryPhone, setDeliveryPhone] = useState<string>(() => {
    return currentUser?.phone || localStorage.getItem('ub_checkout_phone') || '';
  });
  
  const [paymentMethod, setPaymentMethod] = useState<'Capitec Pay' | 'Ozow' | 'PayShap' | 'SnapScan' | 'Wallet'>('Capitec Pay');
  const [snapScanConfirmation, setSnapScanConfirmation] = useState<{
    orderDocId: string;
    orderNumber: string;
    totalRands: number;
    pressedPayLabel: string;
    attempts: string[];
    snapUrl: string;
  } | null>(null);
  const [useWalletBalance, setUseWalletBalance] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Delivery Location states
  const [isDetectingLocation, setIsDetectingLocation] = useState<boolean>(false);
  const [locationStatusMsg, setLocationStatusMsg] = useState<string | null>(null);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState<boolean>(false);

  const handleUseCurrentLocation = async () => {
    setIsDetectingLocation(true);
    setLocationStatusMsg('Checking location permission...');

    const perm = await ensureLocationPermission();
    if (!perm.granted) {
      setLocationStatusMsg(perm.message || 'Please allow Location permission in device settings.');
      setIsDetectingLocation(false);
      setDeliveryAddress('');
      return;
    }

    setLocationStatusMsg('Searching REAL house... go outside, wait 20 sec...');
    setDeliveryAddress('Searching REAL house... go outside, wait 20 sec...');

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatusMsg('GPS is not supported on this device/browser');
      setIsDetectingLocation(false);
      setDeliveryAddress('');
      return;
    }

    let cartWatchId: number | null = null;

    cartWatchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;

        // Block fake Gemsbokspruit location -25.3273, 28.9422
        if (isBannedLocation(lat, lng)) {
          setLocationStatusMsg("❌ Fake location blocked - Go OUTSIDE for real GPS");
          setDeliveryAddress('');
          setIsDetectingLocation(false);
          if (cartWatchId !== null) navigator.geolocation.clearWatch(cartWatchId);
          return;
        }

        console.log("Accuracy:", pos.coords.accuracy + "m");
        setLocationStatusMsg("Accuracy: " + Math.round(acc) + "m (Need < 25m for exact house)");

        // Only save when accuracy < 25m = your real house
        if (acc >= 25) {
          // FAR - reject it, keep watching
          setLocationStatusMsg(`Still NEAR ${Math.round(acc)}m - Go outside Boss, wait... (Need < 25m)`);
          setDeliveryAddress(`Still NEAR ${Math.round(acc)}m - Go outside Boss, wait...`);
          return; // don't save
        }

        // REAL - accept it!
        console.log("EXACT FREE:", lat, lng);
        (window as any).currentDeliveryLat = lat;
        (window as any).currentDeliveryLng = lng;

        let realAddress = `(${lat.toFixed(4)}, ${lng.toFixed(4)})`;

        try {
          const revRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { Accept: 'application/json' } }
          );
          if (revRes.ok) {
            const revData = await revRes.json();
            if (revData && revData.display_name) {
              const cleanParts = revData.display_name.split(',').slice(0, 3).join(',').trim();
              realAddress = `${cleanParts} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            }
          }
        } catch (_) {}

        setDeliveryAddress(realAddress);
        setLocationStatusMsg("✅ EXACT FREE HOUSE " + Math.round(acc) + "m");
        setIsDetectingLocation(false);

        // Save lat,lng to Firebase here
        try {
          setDoc(doc(db, 'customer_locations', 'latest'), {
            lat,
            lng,
            accuracy: acc,
            address: realAddress,
            source: 'exact_free_gps',
            updatedAt: Date.now(),
          }, { merge: true });
        } catch (_) {}

        if (cartWatchId !== null) {
          navigator.geolocation.clearWatch(cartWatchId);
          cartWatchId = null;
        }
      },
      async (err) => {
        const friendlyMsg = formatGeolocationError(err);
        console.warn("GPS notice on checkout:", friendlyMsg);

        setLocationStatusMsg(`📍 GPS unavailable (${friendlyMsg}). Tap "Pick on Map" or type your delivery address.`);
        setIsMapPickerOpen(true);
        setIsDetectingLocation(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000
      }
    );
  };

  if (!isOpen) return null;

  const totalQuantity = cartSummary.totalQuantity;
  const subtotal = cartSummary.subtotal;
  const deliveryFee = checkoutType === 'DELIVERY' ? MALL_FEES.DEFAULT_DELIVERY_FEE : 0;
  const platformFee = cartSummary.platformFee;
  const total = cartSummary.total + deliveryFee;

  // Split payment math
  const walletDeduction = useWalletBalance && paymentMethod !== 'Wallet'
    ? Math.min(currentWalletBalance, total)
    : (paymentMethod === 'Wallet' ? Math.min(currentWalletBalance, total) : 0);
  const externalAmount = paymentMethod === 'Wallet' ? 0 : Math.max(0, total - walletDeduction);
  const hasSufficientBalance = paymentMethod === 'Wallet' ? currentWalletBalance >= total : true;

  const getRealLocationForOrder = async (): Promise<{ lat: number; lng: number; accuracy: number; address?: string } | null> => {
    const perm = await ensureLocationPermission();
    if (!perm.granted) {
      return null;
    }

    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return resolve(null);
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;

          if (isBannedLocation(lat, lng)) {
            return resolve(null);
          }

          const addressInput = document.getElementById("addressInput") as HTMLInputElement | null;

          resolve({
            lat,
            lng,
            accuracy,
            address: addressInput?.value || deliveryAddress,
          });
        },
        (err) => {
          console.warn("GPS checkout status:", formatGeolocationError(err));
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Online Phone Presence Check
    if (!isStoreOnline) {
      setErrorMessage(
        `Cannot place order: No staff or owner phone from "${storeName}" is currently online to see your order. Sales are paused until staff are online.`
      );
      return;
    }

    const cleanPhone = (checkoutType === 'COLLECTION' ? customerPhone : deliveryPhone).trim();
    if (!cleanPhone || cleanPhone.replace(/[^0-9]/g, '').length < 7) {
      setErrorMessage('Phone number is strictly required for order verification.');
      return;
    }
    
    if (checkoutType === 'DELIVERY' && (!deliveryAddress || deliveryAddress.length < 5)) {
      setErrorMessage('Delivery address is required for delivery orders.');
      return;
    }

    if (items.length === 0) {
      setErrorMessage('Your cart is empty.');
      return;
    }

    if (paymentMethod === 'Wallet' && currentWalletBalance < total) {
      setErrorMessage(
        `Insufficient wallet balance (Need R${total.toFixed(2)}, available R${currentWalletBalance.toFixed(2)}). Select Capitec Pay, Ozow, or PayShap to pay with Wallet + Gateway.`
      );
      return;
    }

    setIsSubmitting(true);
    let toppedUpExternal = 0;
    try {
      localStorage.setItem('ub_checkout_phone', cleanPhone);

      const chosenDate = collectionDateType === 'Today' ? 'Today' : scheduledDate;

      let realLoc: { lat: number; lng: number; accuracy: number; address?: string } | null = null;
      if (checkoutType === 'DELIVERY') {
        try {
          realLoc = await getRealLocationForOrder();
        } catch (_) {}
      }

      // Direct Instant Payment handling / Split payment top-up (only after all pre-checks & GPS complete)
      if (externalAmount > 0) {
        const topUpMemo = walletDeduction > 0
          ? `${paymentMethod} Split Payment (Wallet R${walletDeduction.toFixed(2)} + ${paymentMethod} R${externalAmount.toFixed(2)})`
          : `${paymentMethod} Direct Checkout`;
        await topUpWallet(externalAmount, topUpMemo);
        toppedUpExternal = externalAmount;
      }

      const res = await createMallOrder({
        storeId,
        storeName,
        storeLocation: storeLocation || 'Universal Band Mall',
        storeOwnerId,
        customerPhone: cleanPhone,
        customerName: customerName.trim() || currentUser?.name || 'Customer',
        collectionDate: chosenDate,
        paymentMethod: 'wallet',
        checkoutType,
        deliveryAddress: checkoutType === 'DELIVERY' ? (realLoc?.address || deliveryAddress) : undefined,
        deliveryPhone: checkoutType === 'DELIVERY' ? deliveryPhone : undefined,
        deliveryFee,
        deliveryLat: realLoc?.lat,
        deliveryLng: realLoc?.lng,
        gpsAccuracy: realLoc?.accuracy,
      });

      if (!res.success || !res.order) {
        if (toppedUpExternal > 0) {
          await topUpWallet(-toppedUpExternal, 'Checkout Failed Rollback');
        }
        setErrorMessage(res.error || 'Failed to place order. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (paymentMethod === 'SnapScan') {
        const snapCode = await getPublicSnapCode();
        if (!snapCode) {
          setErrorMessage('SnapScan is not configured yet. Please ask the admin to save the SnapCode in Admin Settings.');
          return;
        }
        const payRands = externalAmount > 0 ? externalAmount : total;
        const snapRecord = await recordSnapScanOrder({
          totalRands: payRands,
          storeId,
          storeName,
          customerName: customerName.trim() || currentUser?.name || 'Customer',
          customerPhone: cleanPhone,
        });
        const snapUrl = buildSnapScanUrl(payRands, snapRecord.orderNumber, snapCode);
        openSnapScanLink(snapUrl);
        setSnapScanConfirmation({
          orderDocId: snapRecord.id,
          orderNumber: snapRecord.orderNumber,
          totalRands: payRands,
          pressedPayLabel: snapRecord.pressedPayLabel,
          attempts: snapRecord.attempts || [snapRecord.pressedPayTime],
          snapUrl,
        });
        return;
      }

      onClose();
      if (onOrderCreated) {
        onOrderCreated(res.order);
      }
    } catch (err: any) {
      if (toppedUpExternal > 0) {
        await topUpWallet(-toppedUpExternal, 'Checkout Error Rollback').catch(() => {});
      }
      setErrorMessage(err?.message || 'Error processing checkout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (snapScanConfirmation) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-sm bg-white text-black rounded-3xl p-6 shadow-2xl text-center space-y-4 border-2 border-[#0D47A1]">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <div className="text-3xl font-black tracking-tight text-[#0D47A1]">
              {snapScanConfirmation.orderNumber}
            </div>
            <h2 className="text-lg font-black text-gray-900">
              Payment is under review
            </h2>
            <p className="text-xs font-bold text-gray-700">
              Total: <strong className="text-gray-900">R{snapScanConfirmation.totalRands.toFixed(2)}</strong> •{' '}
              <span className="text-amber-700">{snapScanConfirmation.pressedPayLabel}</span>
            </p>
            {snapScanConfirmation.attempts.length > 0 && (
              <div className="pt-1 flex flex-wrap items-center justify-center gap-1.5">
                {snapScanConfirmation.attempts.map((t, i) => (
                  <span
                    key={`cart-att-${i}`}
                    className="text-[10px] font-mono font-bold text-[#0D47A1] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg"
                  >
                    Attempt #{i + 1} · {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                const hhmm = await recordSnapScanRetryAttempt(snapScanConfirmation.orderDocId);
                setSnapScanConfirmation((prev) =>
                  prev
                    ? {
                        ...prev,
                        pressedPayLabel: `Pressed PAY at ${hhmm}`,
                        attempts: [...prev.attempts, hhmm],
                      }
                    : prev
                );
                openSnapScanLink(snapScanConfirmation.snapUrl);
              }}
              className="w-full min-h-[46px] bg-[#0D47A1] hover:bg-blue-900 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>PAY AGAIN / Retry Payment • R{snapScanConfirmation.totalRands.toFixed(2)}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSnapScanConfirmation(null);
                onClose();
              }}
              className="w-full min-h-[44px] bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Drawer Container */}
      <div className="w-full max-w-md bg-white text-black h-full flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header - Limpopo Blue #0D47A1 */}
        <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight leading-tight">
                {storeName} Cart
              </h2>
              <p className="text-[11px] text-blue-100 flex items-center gap-1">
                <span>Universal Band Mall</span>
                <span>•</span>
                <span>{totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Close cart"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                <ShoppingBag className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Your store cart is empty</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Add drinks or food items from {storeName} to get started.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-[#0D47A1] text-white text-xs font-bold rounded-xl hover:bg-blue-900 transition cursor-pointer"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            <>
              {/* Item List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-black text-gray-700 px-1">
                  <span>ORDER ITEMS ({totalQuantity})</span>
                  <button
                    type="button"
                    onClick={() => clearCart(storeId)}
                    className="text-red-600 hover:text-red-700 font-bold text-[11px] cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>

                {items.map((item) => {
                  const isCustomizable = (item.ingredients && item.ingredients.length > 0) || item.allowIngredientRemoval;
                  const itemIngs = item.ingredients && item.ingredients.length > 0
                    ? item.ingredients
                    : ['rice', 'chicken', 'achaar', 'salad'];
                  const isItemExpanded = expandedCustomizerId === item.id;
                  const removedList = item.removedIngredients || [];

                  return (
                    <div
                      key={item.id}
                      className="bg-gray-50 rounded-2xl p-3 border border-gray-200/80 flex flex-col gap-2 shadow-xs transition"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={item.image || 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'}
                          alt={item.name}
                          className="w-14 h-14 rounded-xl object-cover shrink-0 border border-gray-200"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-black text-gray-900 truncate">
                            {item.name}
                          </h4>
                          {removedList.length > 0 ? (
                            <div className="mt-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md">
                                <span>❌ No {removedList.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')}</span>
                              </span>
                            </div>
                          ) : isCustomizable ? (
                            <div className="text-[10px] text-gray-500 truncate mt-0.5">
                              Standard: {itemIngs.join(', ')}
                            </div>
                          ) : null}
                          <div className="text-xs font-extrabold text-[#D32F2F] mt-0.5">
                            R{item.price.toFixed(2)}
                          </div>
                        </div>

                        {/* Stepper */}
                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl p-1 shadow-xs shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(storeId, item.id, item.quantity - 1)}
                            className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-black text-gray-900">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(storeId, item.id, item.quantity + 1)}
                            className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeFromCart(storeId, item.id)}
                          className="text-gray-400 hover:text-red-600 p-1 cursor-pointer transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Ingredient Customizer Button & Toggle on Item */}
                      {isCustomizable && (
                        <div className="pt-1.5 border-t border-gray-200/70">
                          <button
                            type="button"
                            onClick={() => setExpandedCustomizerId(isItemExpanded ? null : item.id)}
                            className={`w-full py-1.5 px-2.5 rounded-xl border text-[11px] font-black flex items-center justify-between transition cursor-pointer ${
                              removedList.length > 0
                                ? 'bg-amber-100/80 border-amber-400 text-amber-950'
                                : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <Utensils className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">
                                {removedList.length > 0
                                  ? `Customized: No ${removedList.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')}`
                                  : 'Press to see ingredients & cancel unwanted items'}
                              </span>
                            </span>
                            <span className="text-[10px] bg-amber-200/90 text-amber-950 px-2 py-0.5 rounded-md font-black shrink-0 ml-1.5">
                              {isItemExpanded ? 'Close ▲' : 'Cancel Items ▼'}
                            </span>
                          </button>

                          {/* Expanded Interactive Ingredient Cancellation Panel */}
                          {isItemExpanded && (
                            <div className="mt-2 p-3 bg-white rounded-xl border-2 border-amber-400 shadow-sm space-y-2 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase text-amber-950 tracking-wider">
                                  Tap any ingredient to cancel:
                                </span>
                                <span className="text-[9px] text-gray-500 font-bold">
                                  Kitchen leaves out canceled items
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {itemIngs.map((ing) => {
                                  const isCancelled = removedList.some(
                                    (r) => r.toLowerCase() === ing.toLowerCase()
                                  );
                                  return (
                                    <button
                                      key={ing}
                                      type="button"
                                      onClick={() => {
                                        const exists = removedList.some((r) => r.toLowerCase() === ing.toLowerCase());
                                        const nextRemoved = exists
                                          ? removedList.filter((r) => r.toLowerCase() !== ing.toLowerCase())
                                          : [...removedList, ing];
                                        updateCartItemRemovedIngredients(storeId, item.id, nextRemoved);
                                      }}
                                      className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer select-none active:scale-95 ${
                                        isCancelled
                                          ? 'bg-rose-100 hover:bg-rose-200 border-2 border-rose-500 text-rose-900 line-through'
                                          : 'bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-400 text-emerald-900'
                                      }`}
                                    >
                                      <span>{ing.charAt(0).toUpperCase() + ing.slice(1)}</span>
                                      {isCancelled ? (
                                        <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.2 rounded no-underline">
                                          CANCELED
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-black text-emerald-700">
                                          ✓ Keep
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="text-[10px] p-2 rounded-lg bg-gray-50 border border-gray-200">
                                {removedList.length > 0 ? (
                                  <span className="text-rose-700 font-black">
                                    🚫 Kitchen instruction: Do NOT include {removedList.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')}.
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 font-bold">
                                    ✓ Full meal: All ingredients ({itemIngs.join(', ')}) will be included.
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Dedicated Checkout Ingredients Customization Section */}
              {customizableItems.length > 0 && (
                <div className="bg-amber-50 rounded-2xl p-4 border-2 border-amber-300 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-400 text-black flex items-center justify-center font-black shadow-xs">
                        <Utensils className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                          Meal Ingredients Customization
                        </h3>
                        <p className="text-[11px] text-amber-800 font-medium">
                          Press any ingredient to cancel it from your meal before checking out:
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    {customizableItems.map((cItem) => {
                      const allIngs = cItem.ingredients && cItem.ingredients.length > 0
                        ? cItem.ingredients
                        : ['rice', 'chicken', 'achaar', 'salad'];
                      const removed = cItem.removedIngredients || [];

                      return (
                        <div key={cItem.id} className="bg-white rounded-xl p-3 border border-amber-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-gray-900">{cItem.name}</span>
                            {removed.length > 0 ? (
                              <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-300 px-2 py-0.5 rounded-md">
                                ❌ CANCELED: {removed.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md">
                                ✓ All standard ingredients
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {allIngs.map((ingredient) => {
                              const isCancelled = removed.some(
                                (r) => r.toLowerCase() === ingredient.toLowerCase()
                              );
                              return (
                                <button
                                  key={ingredient}
                                  type="button"
                                  onClick={() => {
                                    const exists = removed.some((r) => r.toLowerCase() === ingredient.toLowerCase());
                                    const nextRemoved = exists
                                      ? removed.filter((r) => r.toLowerCase() !== ingredient.toLowerCase())
                                      : [...removed, ingredient];
                                    updateCartItemRemovedIngredients(storeId, cItem.id, nextRemoved);
                                  }}
                                  className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer select-none active:scale-95 ${
                                    isCancelled
                                      ? 'bg-rose-100 hover:bg-rose-200 border-2 border-rose-500 text-rose-900 line-through'
                                      : 'bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-400 text-emerald-900'
                                  }`}
                                >
                                  <span>{ingredient.charAt(0).toUpperCase() + ingredient.slice(1)}</span>
                                  {isCancelled ? (
                                    <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.2 rounded no-underline">
                                      CANCELED
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-black text-emerald-700">
                                      ✓ Keep
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Checkout Type Selector */}
              <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200 space-y-2.5">
                <label className="text-xs font-black text-gray-800">
                  Select Service Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutType('COLLECTION')}
                    className={`py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer ${
                      checkoutType === 'COLLECTION'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Collection
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutType('DELIVERY')}
                    className={`py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer ${
                      checkoutType === 'DELIVERY'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Delivery
                  </button>
                </div>
              </div>

              {checkoutType === 'COLLECTION' && (
                /* Collection Date Selector */
                <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200 space-y-2.5">
                  <label className="text-xs font-black text-gray-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#0D47A1]" />
                    <span>When will you collect this order?</span>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCollectionDateType('Today')}
                      className={`py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        collectionDateType === 'Today'
                          ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-yellow-300" />
                        <span>Collect Today</span>
                      </div>
                      <span className="text-[10px] font-normal opacity-90">
                        Store alerted immediately
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCollectionDateType('Scheduled')}
                      className={`py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        collectionDateType === 'Scheduled'
                          ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-300" />
                        <span>Schedule Date</span>
                      </div>
                      <span className="text-[10px] font-normal opacity-90">
                        Pick future date
                      </span>
                    </button>
                  </div>

                  {collectionDateType === 'Today' ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-[11px] text-emerald-800 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>Store Owner Notification:</strong> Because you are collecting <strong>TODAY</strong>, the vendor will receive an instant order notification with what you ordered!
                      </span>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <label className="text-[11px] font-bold text-gray-600 block mb-1">
                        Select Collection Date:
                      </label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 font-bold focus:outline-none focus:border-[#0D47A1]"
                      />
                    </div>
                  )}
                </div>
              )}


              {checkoutType === 'DELIVERY' && (
                <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-gray-800 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#D32F2F]" />
                      <span>Delivery Drop-off Address</span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={isDetectingLocation}
                        className="py-1 px-2 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[11px] font-bold text-[#0D47A1] flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                        title="Auto-detect current GPS location"
                      >
                        {isDetectingLocation ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-[#0D47A1]" />
                            <span>Locating...</span>
                          </>
                        ) : (
                          <>
                            <Navigation className="w-3 h-3 text-[#0D47A1]" />
                            <span>Use Current Location</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsMapPickerOpen(true)}
                        className="py-1 px-2 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-[11px] font-bold text-[#D32F2F] flex items-center gap-1 cursor-pointer transition"
                        title="Open interactive map to tap location"
                      >
                        <Compass className="w-3 h-3 text-[#D32F2F]" />
                        <span>Pick on Map</span>
                      </button>
                    </div>
                  </div>

                  {locationStatusMsg && (
                    <div className="bg-blue-50/90 border border-blue-300 text-blue-900 text-[11px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-2 animate-in fade-in">
                      <Sparkles className="w-3.5 h-3.5 text-[#0D47A1] shrink-0" />
                      <span className="leading-snug">{locationStatusMsg}</span>
                    </div>
                  )}

                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="e.g. 123 Main St, Seshego, Polokwane"
                    className="w-full bg-white border-2 border-gray-300 focus:border-[#D32F2F] rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-bold transition shadow-xs"
                  />

                  {/* 1-Tap Quick Delivery Area Chips (No Typing Required) */}
                  <div className="pt-0.5">
                    <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block mb-1">
                      ⚡ Quick Delivery Areas (Tap to fill):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '🏢 Polokwane CBD', val: 'Polokwane CBD, Limpopo (-23.9045, 29.4688)' },
                        { label: '🏘️ Seshego', val: 'Seshego, Polokwane (-23.8569, 29.3905)' },
                        { label: '🎓 Mankweng (Turfloop)', val: 'Mankweng / Turfloop (-23.8967, 29.7289)' },
                        { label: '🏡 Flora Park', val: 'Flora Park, Polokwane (-23.9161, 29.4820)' },
                        { label: '🛍️ Mall of the North', val: 'Mall of the North, Bendor (-23.8825, 29.4975)' },
                        { label: '🏙️ Polokwane Extensions', val: 'Polokwane Extensions (-23.9010, 29.4650)' },
                      ].map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => {
                            setDeliveryAddress(chip.val);
                            setLocationStatusMsg(`📍 Selected: ${chip.label}`);
                            setTimeout(() => setLocationStatusMsg(null), 3000);
                          }}
                          className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                            deliveryAddress.includes(chip.label.split(' ')[1] || '')
                              ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-xs'
                              : 'bg-white border-gray-200 hover:border-[#0D47A1] hover:bg-blue-50 text-gray-700'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black text-gray-800 flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#D32F2F]" />
                        <span>Delivery Recipient Phone</span>
                      </span>
                      {customerPhone && deliveryPhone !== customerPhone && (
                        <button
                          type="button"
                          onClick={() => setDeliveryPhone(customerPhone)}
                          className="text-[10px] text-[#0D47A1] font-bold hover:underline cursor-pointer"
                        >
                          Use my phone ({customerPhone})
                        </button>
                      )}
                    </label>
                    <input
                      type="tel"
                      required
                      value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                      placeholder="e.g. 071 234 5678"
                      className="w-full bg-white border-2 border-gray-300 focus:border-[#D32F2F] rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-bold transition"
                    />
                  </div>
                </div>
              )}


              {/* Mandatory Phone Number Field */}
              <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-gray-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[#D32F2F]" />
                    <span>Customer Phone Number</span>
                    <span className="text-[#D32F2F] font-black">* (Required)</span>
                  </label>
                  <span className="text-[10px] bg-red-100 text-[#D32F2F] font-black px-1.5 py-0.5 rounded">
                    MANDATORY
                  </span>
                </div>

                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 071 234 5678 or +27712345678"
                  className="w-full bg-white border-2 border-gray-300 focus:border-[#D32F2F] focus:ring-1 focus:ring-[#D32F2F] rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-bold placeholder-gray-400 transition"
                />

                <p className="text-[10px] text-gray-500 leading-relaxed">
                  🔒 <strong>Parcel Security:</strong> Your phone number is registered with this order. You can scan your <strong>QR code for free</strong> to collect, or if you don't have your QR code, the vendor can look up your parcel using this phone number for an <strong>R5.00 fee</strong> (R2 to store, R3 to mall).
                </p>
              </div>

              {/* Payment Method Selector (Capitec Pay / Ozow / PayShap / Wallet) */}
              <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200 space-y-2.5">
                <label className="text-xs font-black text-gray-800 flex items-center justify-between">
                  <span>Checkout Payment Method</span>
                  <span className="text-[10px] text-[#0D47A1] font-bold">MODE 1: DAILY STORE</span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Capitec Pay')}
                    className={`p-2 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'Capitec Pay'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="text-[11px] font-black flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                      <span>Capitec Pay</span>
                    </div>
                    <span className="text-[9px] opacity-80 mt-0.5">Instant Capitec App</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Ozow')}
                    className={`p-2 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'Ozow'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="text-[11px] font-black flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Ozow EFT</span>
                    </div>
                    <span className="text-[9px] opacity-80 mt-0.5">Instant Bank Transfer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('PayShap')}
                    className={`p-2 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'PayShap'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="text-[11px] font-black flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>PayShap</span>
                    </div>
                    <span className="text-[9px] opacity-80 mt-0.5">Real-time Shap ID</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Wallet')}
                    className={`p-2 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'Wallet'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="text-[11px] font-black flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-[#FACC15]" />
                      <span>Wristband Wallet</span>
                    </div>
                    <span className="text-[9px] opacity-80 mt-0.5">
                      R{currentWalletBalance.toFixed(2)} available
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('SnapScan')}
                    className={`col-span-2 p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      paymentMethod === 'SnapScan'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div>
                      <div className="text-[11px] font-black flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Pay with SnapScan</span>
                      </div>
                      <span className="text-[9px] opacity-80 block mt-0.5">
                        Opens SnapScan app / browser with locked amount
                      </span>
                    </div>
                    <span className="text-xs font-black font-mono">
                      R{(externalAmount > 0 ? externalAmount : total).toFixed(2)}
                    </span>
                  </button>
                </div>

                {/* Split Payment Toggle when paying via Gateway and wallet balance > 0 */}
                {paymentMethod !== 'Wallet' && currentWalletBalance > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 space-y-1 text-[11px]">
                    <label className="flex items-center gap-2 font-black text-[#0D47A1] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useWalletBalance}
                        onChange={(e) => setUseWalletBalance(e.target.checked)}
                        className="w-4 h-4 accent-[#0D47A1] rounded cursor-pointer"
                      />
                      <span>
                        Use Wallet Balance + {paymentMethod} (Split Payment)
                      </span>
                    </label>
                    <p className="text-[10px] text-gray-600 pl-6 leading-tight">
                      Deducts <strong>R{walletDeduction.toFixed(2)}</strong> from your wallet balance and pays remaining <strong>R{externalAmount.toFixed(2)}</strong> via {paymentMethod}.
                    </p>
                  </div>
                )}
              </div>

              {/* Fee Breakdown Card */}
              <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-200 space-y-2">
                <div className="text-xs font-black text-gray-800 uppercase tracking-wider">
                  Payment Breakdown
                </div>

                <div className="space-y-1.5 text-xs text-gray-600">
                  <div className="flex items-center justify-between">
                    <span>Items Subtotal ({totalQuantity} items):</span>
                    <span className="font-bold text-gray-900">R{subtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span>Universal Band Mall Fee:</span>
                      <span className="text-[10px] bg-blue-100 text-[#0D47A1] font-extrabold px-1.5 py-0.2 rounded">
                        R4 flat + R1/item
                      </span>
                    </div>
                    <span className="font-bold text-[#0D47A1]">R{platformFee.toFixed(2)}</span>
                  </div>

                  {checkoutType === 'DELIVERY' && (
                    <div className="flex items-center justify-between">
                        <span>Delivery Fee:</span>
                        <span className="font-bold text-[#D32F2F]">R{deliveryFee.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-2 flex items-center justify-between text-xs font-bold text-gray-900">
                    <span>Total Order Amount:</span>
                    <span className="text-sm font-black text-[#D32F2F]">R{total.toFixed(2)}</span>
                  </div>


                  {walletDeduction > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold text-xs">
                      <span>Paid from Wristband Wallet:</span>
                      <span>-R{walletDeduction.toFixed(2)}</span>
                    </div>
                  )}

                  {externalAmount > 0 && (
                    <div className="flex justify-between text-[#0D47A1] font-black text-xs border-t border-gray-200 pt-1">
                      <span>Paid via {paymentMethod}:</span>
                      <span>R{externalAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Wallet Balance Status */}
                <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-gray-600">Wallet Balance:</span>
                    <span className="font-black text-emerald-700">
                      R{currentWalletBalance.toFixed(2)}
                    </span>
                  </div>

                  {currentWalletBalance < total && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setActiveModal('wallet');
                      }}
                      className="text-[11px] font-black text-[#0D47A1] hover:underline cursor-pointer"
                    >
                      + Top Up Wallet
                    </button>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="leading-snug">{errorMessage}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Checkout Button - Limpopo Red #D32F2F */}
        {items.length > 0 && (
          <div className="p-4 bg-gray-50 border-t border-gray-200 shrink-0 space-y-2">
            {!isStoreOnline && (
              <div className="p-2.5 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="text-[11px] font-bold leading-tight">
                  No staff or store owner phone is online from {storeName}. Orders cannot be placed at this time.
                </span>
              </div>
            )}

            <button
              type="button"
              disabled={isSubmitting || !isStoreOnline}
              onClick={handleCheckout}
              className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm text-white shadow-lg flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer ${
                !isStoreOnline
                  ? 'bg-gray-400 cursor-not-allowed opacity-80'
                  : 'bg-[#D32F2F] hover:bg-red-700'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Processing Order...'
                  : !isStoreOnline
                  ? 'Sales Paused (Staff Phone Offline)'
                  : walletDeduction > 0 && externalAmount > 0
                  ? `Pay R${total.toFixed(2)} (R${walletDeduction.toFixed(2)} Wallet + R${externalAmount.toFixed(2)} via ${paymentMethod})`
                  : paymentMethod === 'Wallet'
                  ? `Pay R${total.toFixed(2)} with Wallet`
                  : paymentMethod === 'SnapScan'
                  ? `Pay with SnapScan • R${total.toFixed(2)}`
                  : `Pay R${total.toFixed(2)} via ${paymentMethod}`}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Interactive Leaflet Location Picker Modal */}
      <LocationPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialAddress={deliveryAddress}
        onSelectLocation={(selectedAddress) => {
          setDeliveryAddress(selectedAddress);
          setLocationStatusMsg('📍 Delivery location confirmed on map!');
          setTimeout(() => setLocationStatusMsg(null), 4000);
        }}
      />
    </div>
  );
};
