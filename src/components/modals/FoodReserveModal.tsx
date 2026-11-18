import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MenuItemDoc, Store } from '../../types';
import {
  X,
  Utensils,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  User,
  Search,
  ArrowRight,
  ShieldCheck,
  Radio,
  Calendar,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { searchCustomerByIdOrPhone, VerifiedCustomerProfile } from '../../utils/customerDirectory';
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import confetti from 'canvas-confetti';
import { resolveCustomerQrId } from '../../utils/customerQr';

interface FoodReserveModalProps {
  item: MenuItemDoc;
  store: Store;
  onClose: () => void;
  onSuccess?: () => void;
}

export const FoodReserveModal: React.FC<FoodReserveModalProps> = ({
  item,
  store,
  onClose,
  onSuccess,
}) => {
  const { currentUser, topUpWallet, navigateTo } = useApp();

  const [quantity, setQuantity] = useState<number>(1);
  const [reserveForOther, setReserveForOther] = useState<boolean>(false);
  const [otherPersonIdInput, setOtherPersonIdInput] = useState<string>('');
  const [isSearchingRecipient, setIsSearchingRecipient] = useState<boolean>(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  // Recipient confirmation popup state
  const [recipientProfile, setRecipientProfile] = useState<VerifiedCustomerProfile | null>(null);
  const [showRecipientConfirmModal, setShowRecipientConfirmModal] = useState<boolean>(false);
  const [confirmedRecipient, setConfirmedRecipient] = useState<VerifiedCustomerProfile | null>(null);

  // Completed reservation state
  const [isProcessingOrder, setIsProcessingOrder] = useState<boolean>(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [removedIngredients, setRemovedIngredients] = useState<string[]>([]);
  const [reservationError, setReservationError] = useState<string | null>(null);

  const rawPrice = typeof item.price === 'string' ? parseFloat(item.price.replace(/[^\d.]/g, '')) : item.price;
  const unitPrice = isNaN(rawPrice) ? 50 : rawPrice;
  const totalPrice = unitPrice * quantity;

  const currentCustomerId = currentUser.idNumber || currentUser.id || '';

  // Handle searching the recipient
  const handleVerifyRecipient = async () => {
    if (!otherPersonIdInput.trim()) {
      setRecipientError('Please enter the ID Number, Phone, or Customer ID of the recipient');
      return;
    }

    setIsSearchingRecipient(true);
    setRecipientError(null);

    try {
      const found = await searchCustomerByIdOrPhone(otherPersonIdInput.trim());
      if (!found) {
        setRecipientError(`No registered customer found matching "${otherPersonIdInput}". Please check the ID number or phone number.`);
        return;
      }

      setRecipientProfile(found);
      setShowRecipientConfirmModal(true);
    } catch (err: any) {
      setRecipientError(err?.message || 'Error searching customer directory');
    } finally {
      setIsSearchingRecipient(false);
    }
  };

  // Confirm recipient
  const handleConfirmRecipient = () => {
    if (recipientProfile) {
      setConfirmedRecipient(recipientProfile);
      setShowRecipientConfirmModal(false);
      setRecipientError(null);
    }
  };

  // Complete Reservation
  const handleCompleteReservation = async () => {
    setReservationError(null);
    if (!currentCustomerId || currentCustomerId === 'guest_user') {
      setReservationError('Please sign in with your registered account before making a reservation.');
      return;
    }

    // If reserve for other is enabled, require confirmed recipient
    if (reserveForOther && !confirmedRecipient) {
      setRecipientError('Please verify and confirm the person you are reserving for before proceeding.');
      return;
    }

    // Check wallet balance
    if (currentUser.walletBalance < totalPrice) {
      setReservationError(`Insufficient wallet balance (R${currentUser.walletBalance.toFixed(2)}). Please top up at least R${(totalPrice - currentUser.walletBalance).toFixed(2)}.`);
      return;
    }

    setIsProcessingOrder(true);
    try {
      const resRef = doc(collection(db, 'reservations'));
      const activeCustomerId = reserveForOther && confirmedRecipient
        ? confirmedRecipient.idNumber
        : currentCustomerId;

      const activeCustomerName = reserveForOther && confirmedRecipient
        ? confirmedRecipient.fullName
        : (currentUser.fullName || currentUser.name);

      const activeCustomerPhoto = reserveForOther && confirmedRecipient
        ? confirmedRecipient.photo
        : currentUser.photo;

      const collectionCode = `UB-${Math.floor(100000 + Math.random() * 900000)}`;

      const reservationPayload = {
        id: resRef.id,
        walletId: currentUser.id,
        storeId: store.id,
        storeName: store.name,
        itemId: item.id,
        itemName: item.name,
        price: unitPrice,
        quantity,
        total: totalPrice,
        category: item.category || 'food',
        subCategory: item.subCategory || 'soft',
        isAlcohol: Boolean(item.isAlcohol),
        ingredients: item.ingredients || [],
        allowIngredientRemoval: item.allowIngredientRemoval,
        removedIngredients,
        status: 'paid',
        paidAt: serverTimestamp(),
        // Advanced Customer ID System fields
        customerId: activeCustomerId,
        customerName: activeCustomerName,
        customerPhoto: activeCustomerPhoto,
        reservedForOther: Boolean(reserveForOther),
        beneficiaryId: confirmedRecipient ? confirmedRecipient.id : currentUser.id,
        beneficiaryName: confirmedRecipient ? confirmedRecipient.fullName : currentUser.name,
        beneficiaryPhoto: confirmedRecipient ? confirmedRecipient.photo : currentUser.photo,
        collectionCode,
        customerQrId: resolveCustomerQrId(currentUser.id, currentUser.customerQrId) || undefined,
        collectionNote: 'Show your Profile ONE QR or ID at the counter to collect',
      };

      await setDoc(resRef, reservationPayload);

      // Debit wallet balance
      await topUpWallet(-totalPrice);

      // Record Spending Transaction
      try {
        const txRef = doc(collection(db, 'transactions'));
        await setDoc(txRef, {
          userId: currentUser.id,
          customerId: activeCustomerId,
          customerName: activeCustomerName,
          type: item.category === 'drink' ? 'drink' : 'food',
          description: `Reserved ${quantity}x ${item.name} at ${store.name}`,
          amount: totalPrice,
          storeId: store.id,
          storeName: store.name,
          paymentMethod: 'Wallet',
          status: 'Paid',
          reference: collectionCode,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        });

        // Local cache of spending transactions (strictly scoped by userId)
        const existingTx = JSON.parse(localStorage.getItem('ub_spending_history') || '[]');
        existingTx.unshift({
          id: txRef.id,
          userId: currentUser.id,
          date: new Date().toISOString(),
          type: item.category === 'drink' ? 'drink' : 'food',
          description: `Reserved ${quantity}x ${item.name} at ${store.name}`,
          amount: totalPrice,
          paymentMethod: 'Wallet',
          status: 'Paid',
          storeName: store.name,
          reference: collectionCode,
        });
        localStorage.setItem('ub_spending_history', JSON.stringify(existingTx));
      } catch (e) {
        console.warn('Transaction log error:', e);
      }

      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
      });

      setCompletedOrder({
        ...reservationPayload,
        id: resRef.id,
      });

      onSuccess?.();
    } catch (err: any) {
      setReservationError('Error creating reservation: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsProcessingOrder(false);
    }
  };

  const handleCopyId = (idStr: string) => {
    navigator.clipboard.writeText(idStr);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      {/* 1. Recipient Confirmation Popup Modal ("Confirm you want to reserve for [Name]? Yes / No") */}
      {showRecipientConfirmModal && recipientProfile && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg animate-in zoom-in-95 duration-200">
          <div className="bg-[#181818] border-2 border-[#FACC15] rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="w-20 h-20 rounded-full mx-auto mb-4 p-1 border-2 border-[#FACC15] relative shadow-lg bg-[#242424] flex items-center justify-center">
              {recipientProfile.photo ? (
                <img
                  src={recipientProfile.photo}
                  alt={recipientProfile.fullName}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="text-2xl font-black text-[#FACC15]">
                  {(recipientProfile.fullName || 'C').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="absolute -bottom-1 -right-1 bg-[#FACC15] text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow">
                MATCH
              </div>
            </div>

            <span className="text-[11px] font-black uppercase tracking-widest text-[#FACC15]">
              Verified Recipient Profile
            </span>
            <h3 className="text-xl font-black text-white mt-1 mb-1">
              {recipientProfile.fullName}
            </h3>

            <div className="bg-[#111] border border-white/10 rounded-2xl p-3 my-4 space-y-1.5 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-gray-400">ID Number:</span>
                <span className="text-white font-mono font-bold">{recipientProfile.idNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Phone:</span>
                <span className="text-white font-bold">{recipientProfile.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Customer ID:</span>
                <span className="text-[#FACC15] font-bold">{recipientProfile.id}</span>
              </div>
            </div>

            <p className="text-sm font-bold text-gray-200 mb-6">
              Confirm you want to reserve for <span className="text-[#FACC15]">{recipientProfile.fullName}</span>?
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowRecipientConfirmModal(false)}
                className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-gray-300 font-extrabold text-xs transition cursor-pointer"
              >
                No, Change
              </button>
              <button
                type="button"
                onClick={handleConfirmRecipient}
                className="w-full py-3 rounded-2xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs transition shadow-lg shadow-yellow-400/20 cursor-pointer"
              >
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Reservation Card */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#1A1A1A]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FACC15]/20 border border-[#FACC15]/40 text-[#FACC15] flex items-center justify-center">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white leading-tight">
                {completedOrder ? 'Reservation Ticket' : 'Food & Drinks Reservation'}
              </h2>
              <p className="text-[11px] text-gray-400">{store.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* SUCCESS CONFIRMATION SCREEN / TICKET */}
          {completedOrder ? (
            <div className="space-y-4 text-center animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-black text-white">Reservation Confirmed!</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Your order is registered at {store.name}
                </p>
              </div>

              {/* Requirement 1: Unique Customer ID on Ticket & Confirmation Screen */}
              <div className="bg-gradient-to-b from-[#1E1E1E] to-[#161616] border-2 border-[#FACC15] rounded-2xl p-4 shadow-xl text-left space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15]">
                    COLLECTION CUSTOMER ID
                  </span>
                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-full">
                    PAID • VALID
                  </span>
                </div>

                <div className="flex items-center justify-between bg-black/60 p-3 rounded-xl border border-white/10">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-semibold">CUSTOMER ID NUMBER</span>
                    <span className="text-lg font-mono font-black text-white tracking-wider">
                      {completedOrder.customerId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyId(completedOrder.customerId)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-[#FACC15] transition cursor-pointer"
                    title="Copy ID"
                  >
                    {copiedId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Requirement 1 Mandatory Explicit Copy */}
                <div className="bg-[#FACC15]/10 border border-[#FACC15]/30 rounded-xl p-3 text-center">
                  <p className="text-xs font-black text-[#FACC15]">
                    "Use this ID to collect your food if you don't have QR or NFC"
                  </p>
                </div>

                {/* Recipient Details */}
                <div className="flex items-center gap-3 pt-1 border-t border-white/10">
                  {completedOrder.customerPhoto ? (
                    <img
                      src={completedOrder.customerPhoto}
                      alt={completedOrder.customerName}
                      className="w-10 h-10 rounded-full object-cover border border-[#FACC15]"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#FACC15]/20 border border-[#FACC15] flex items-center justify-center font-black text-sm text-[#FACC15] shrink-0">
                      {(completedOrder.customerName || 'C').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-gray-400 block">Collect Person / Beneficiary</span>
                    <span className="text-sm font-bold text-white">{completedOrder.customerName}</span>
                  </div>
                </div>

                {/* Profile ONE QR instruction instead of per-item QR */}
                <div className="bg-black/40 border border-[#FACC15]/30 rounded-xl p-3 my-2 text-center space-y-2">
                  <p className="text-xs font-bold text-white">
                    Added to your permanent Profile ONE QR.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigateTo('/profile');
                    }}
                    className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-[#FACC15] text-black font-black text-xs cursor-pointer"
                  >
                    Show My ONE QR on Profile
                  </button>
                </div>

                <div className="text-center">
                  <span className="text-[11px] text-gray-400">Order Reference:</span>
                  <span className="text-xs font-mono font-bold text-[#FACC15] ml-1.5">
                    {completedOrder.collectionCode}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigateTo('/reserved');
                  }}
                  className="w-full py-3 rounded-xl bg-[#262626] hover:bg-[#333] text-white font-bold text-xs transition cursor-pointer"
                >
                  View All Reserved
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* PRE-RESERVATION CONFIGURATION FORM */
            <div className="space-y-4">
              {/* Item Card Overview */}
              <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-3.5 flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 shrink-0">
                  <img
                    src={item.imageUrl || item.image || 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-black uppercase text-[#FACC15] block">
                    {item.category || 'Food'}
                  </span>
                  <h4 className="text-sm font-black text-white truncate">{item.name}</h4>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold text-gray-400">Unit: R{unitPrice.toFixed(0)}</span>
                    <span className="text-sm font-black text-[#FACC15]">Total: R{totalPrice.toFixed(0)}</span>
                  </div>
                </div>
              </div>

              {/* Meal Ingredients Customization (Tap to Cancel) */}
              {(() => {
                const mealIngredients = (item.ingredients && item.ingredients.length > 0)
                  ? item.ingredients
                  : (item.category === 'food' ? ['rice', 'chicken', 'achaar', 'salad'] : []);

                if (mealIngredients.length === 0) return null;

                const isCustomizable = item.allowIngredientRemoval !== false;

                return (
                  <div className="bg-[#1C1A14] border-2 border-[#FACC15]/40 rounded-2xl p-4 space-y-2.5 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#FACC15] text-black flex items-center justify-center font-black">
                          <Utensils className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-white block uppercase tracking-wide">
                            Meal Ingredients Customization
                          </span>
                          <span className="text-[10px] text-gray-300">
                            Press any ingredient to cancel it from your meal before checking out
                          </span>
                        </div>
                      </div>
                      {isCustomizable ? (
                        <span className="text-[10px] font-black uppercase text-black bg-[#FACC15] px-2 py-0.5 rounded-full shadow">
                          Tap to Cancel
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">Fixed recipe</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {mealIngredients.map((ing) => {
                        const isRemoved = removedIngredients.includes(ing.toLowerCase());
                        return (
                          <button
                            key={ing}
                            type="button"
                            disabled={!isCustomizable}
                            onClick={() => {
                              setRemovedIngredients((prev) =>
                                prev.includes(ing.toLowerCase())
                                  ? prev.filter((i) => i !== ing.toLowerCase())
                                  : [...prev, ing.toLowerCase()]
                              );
                            }}
                            className={`px-3 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer active:scale-95 select-none ${
                              isRemoved
                                ? 'bg-rose-950/80 border-2 border-rose-500 text-rose-200 line-through'
                                : 'bg-zinc-800/90 hover:bg-zinc-700 border-2 border-emerald-500/60 text-white'
                            }`}
                          >
                            <span>{ing.charAt(0).toUpperCase() + ing.slice(1)}</span>
                            {isRemoved ? (
                              <span className="text-[9px] bg-rose-600 text-white px-1.5 py-0.2 rounded font-black no-underline">
                                CANCELED
                              </span>
                            ) : (
                              <span className="text-[9px] font-black text-emerald-400">
                                ✓ Keep
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="text-[11px] p-2.5 rounded-xl bg-black/60 border border-white/10 font-bold">
                      {removedIngredients.length > 0 ? (
                        <span className="text-rose-400">
                          🚫 Kitchen instruction: Do NOT include {removedIngredients.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')}.
                        </span>
                      ) : (
                        <span className="text-emerald-400">
                          ✓ All standard ingredients ({mealIngredients.join(', ')}) will be included.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Quantity Controls */}
              <div className="flex items-center justify-between bg-[#1A1A1A] border border-white/10 rounded-2xl p-3">
                <span className="text-xs font-bold text-gray-300">Quantity</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-8 h-8 rounded-lg bg-[#262626] hover:bg-[#333] text-white font-bold flex items-center justify-center transition cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-sm font-black text-white w-6 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-8 h-8 rounded-lg bg-[#262626] hover:bg-[#333] text-white font-bold flex items-center justify-center transition cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Requirement 1: "Reserve for someone else" TOGGLE */}
              <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#FACC15]" />
                    <div>
                      <span className="text-xs font-black text-white block">
                        Reserve for someone else
                      </span>
                      <span className="text-[10px] text-gray-400">
                        Transfer collection authorization to another person
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reserveForOther}
                      onChange={(e) => {
                        setReserveForOther(e.target.checked);
                        if (!e.target.checked) {
                          setConfirmedRecipient(null);
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FACC15]" />
                  </label>
                </div>

                {/* If Toggle is OFF: Show Own Customer ID */}
                {!reserveForOther ? (
                  <div className="bg-[#121212] border border-white/5 rounded-xl p-3 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">
                      Your Unique Customer ID
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-bold text-white tracking-wider">
                        {currentCustomerId}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Auto-Assigned
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 italic pt-1 border-t border-white/5">
                      "Use this ID to collect your food if you don't have QR or NFC"
                    </p>
                  </div>
                ) : (
                  /* If Toggle is ON: Hide Own ID, show Input & Verification Flow */
                  <div className="space-y-3 pt-2 border-t border-white/10 animate-in fade-in duration-200">
                    <div>
                      <label className="block text-[11px] font-black text-gray-300 uppercase tracking-wider mb-1.5">
                        Enter ID of person you are reserving for *
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={otherPersonIdInput}
                          onChange={(e) => setOtherPersonIdInput(e.target.value)}
                          placeholder="e.g. 9901015000087 or 0821234567"
                          className="flex-1 bg-[#121212] border border-white/15 rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] text-xs font-semibold"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyRecipient}
                          disabled={isSearchingRecipient}
                          className="bg-[#FACC15] hover:bg-yellow-400 text-black font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                        >
                          {isSearchingRecipient ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Search className="w-3.5 h-3.5 stroke-[2.5]" />
                          )}
                          <span>Verify</span>
                        </button>
                      </div>
                    </div>

                    {/* Recipient Error */}
                    {recipientError && (
                      <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                        <span>{recipientError}</span>
                      </div>
                    )}

                    {/* Confirmed Recipient Banner */}
                    {confirmedRecipient && (
                      <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {confirmedRecipient.photo ? (
                            <img
                              src={confirmedRecipient.photo}
                              alt={confirmedRecipient.fullName}
                              className="w-9 h-9 rounded-full object-cover border border-emerald-400"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-xs font-black text-emerald-300 shrink-0">
                              {(confirmedRecipient.fullName || 'C').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                              Confirmed Recipient
                            </span>
                            <span className="text-xs font-black text-white">{confirmedRecipient.fullName}</span>
                            <span className="text-[10px] text-gray-400 block font-mono">ID: {confirmedRecipient.idNumber}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmedRecipient(null)}
                          className="text-[10px] text-gray-400 hover:text-white underline cursor-pointer"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Wallet Balance Check & Action */}
              <div className="pt-2 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Wallet Balance:</span>
                  <span className="font-bold text-white">R{currentUser.walletBalance.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between text-sm font-black">
                  <span className="text-gray-300">Total Due:</span>
                  <span className="text-[#FACC15] text-lg">R{totalPrice.toFixed(0)}</span>
                </div>

                {removedIngredients.length > 0 ? (
                  <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-2.5 text-xs text-rose-300 flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <span>❌ Excluded from meal:</span>
                      <strong className="text-white">{removedIngredients.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')}</strong>
                    </span>
                    <span className="text-[10px] text-[#FACC15] underline cursor-pointer" onClick={() => setRemovedIngredients([])}>
                      Reset
                    </span>
                  </div>
                ) : (
                  <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2 text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Standard Recipe: All ingredients included.</span>
                  </div>
                )}

                {reservationError && (
                  <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{reservationError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCompleteReservation}
                  disabled={isProcessingOrder || (reserveForOther && !confirmedRecipient)}
                  className="w-full py-3.5 rounded-2xl bg-[#FACC15] hover:bg-yellow-400 active:scale-98 text-black font-black text-xs transition shadow-lg shadow-yellow-400/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isProcessingOrder ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Reserving Order...</span>
                    </>
                  ) : (
                    <>
                      <span>Pay & Complete Reservation (R{totalPrice.toFixed(0)})</span>
                      <ArrowRight className="w-4 h-4 stroke-[3]" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
