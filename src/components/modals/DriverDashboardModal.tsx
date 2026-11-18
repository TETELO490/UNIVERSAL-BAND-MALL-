import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MallOrder } from '../../types';
import { resolveDeliveryFee } from '../../utils/mallFees';
import { normalizePhoneDigits } from '../../utils/customerQr';
import Scanner from '../Scanner';
import { DriverMapModal } from './DriverMapModal';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  Bike,
  MapPin,
  Phone,
  Navigation,
  QrCode,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

interface DriverDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DriverDashboardModal: React.FC<DriverDashboardModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentUser,
    currentWalletBalance,
    mallOrders,
    acceptOrder,
    verifyCustomerDelivery,
    confirmCustomerDeliveryComplete,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'earnings'>('available');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  
  // Driver Vehicle profile
  const [driverName, setDriverName] = useState<string>(
    currentUser?.name || currentUser?.fullName || ''
  );
  const [driverPhone, setDriverPhone] = useState<string>(
    currentUser?.phone || ''
  );
  const [driverPlate, setDriverPlate] = useState<string>(
    (currentUser as any)?.licensePlate || ''
  );
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);

  // Scanner & completion state
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [manualPinInput, setManualPinInput] = useState<string>('');
  const [pendingCustomerConfirm, setPendingCustomerConfirm] = useState<MallOrder | null>(null);
  const [isCompletingDelivery, setIsCompletingDelivery] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Map state
  const [showMapModal, setShowMapModal] = useState<boolean>(false);
  const [mapTargetOrder, setMapTargetOrder] = useState<MallOrder | null>(null);

  if (!isOpen) return null;

  const currentDriverId = currentUser?.id && currentUser.id !== 'guest_user' ? currentUser.id : '';
  const normalizedDriverPhone = normalizePhoneDigits(driverPhone || currentUser?.phone || '');
  const doesOrderBelongToDriver = (o: MallOrder): boolean => {
    if (!currentDriverId) return false;
    if (o.deliveryDriverId === currentDriverId) return true;
    const oPhone = normalizePhoneDigits(o.deliveryDriverPhone || '');
    return normalizedDriverPhone.length >= 7 && oPhone.length >= 7 && oPhone === normalizedDriverPhone;
  };

  // 1. Available orders: Paid delivery orders ready_for_pickup or paid, not yet accepted
  const availableOrders = currentDriverId
    ? mallOrders.filter(
        (o) =>
          o.collectionMethod === 'DELIVERY' &&
          o.paymentStatus !== 'WAITING FOR PAYMENT' &&
          o.paymentStatus !== 'PENDING_PAYMENT' &&
          (o.status === 'ready_for_pickup' || o.status === 'paid') &&
          (!o.deliveryDriverId || o.deliveryDriverId === '')
      )
    : [];

  // 2. Active delivery: order locked strictly to this driver that is not yet completed
  const activeDelivery = currentDriverId
    ? mallOrders.find(
        (o) =>
          o.collectionMethod === 'DELIVERY' &&
          doesOrderBelongToDriver(o) &&
          o.status !== 'delivered' &&
          o.status !== 'collected' &&
          o.status !== 'cancelled'
      )
    : undefined;

  // 3. Completed deliveries: strictly by this driver
  const completedDeliveries = currentDriverId
    ? mallOrders.filter(
        (o) =>
          o.collectionMethod === 'DELIVERY' &&
          o.status === 'delivered' &&
          doesOrderBelongToDriver(o)
      )
    : [];

  const totalEarnings = completedDeliveries.reduce((sum, o) => sum + resolveDeliveryFee(o.deliveryFee), 0);

  // Handle Driver Accepts Order
  const handleAcceptOrder = async (order: MallOrder) => {
    setActionNotice(null);
    if (!currentDriverId) {
      setActionNotice({
        success: false,
        message: 'Please log in with your registered Driver account before accepting deliveries.',
      });
      return;
    }
    if (!driverName.trim() || !driverPhone.trim()) {
      setIsEditingProfile(true);
      setActionNotice({
        success: false,
        message: 'Please enter your driver name and phone number in Vehicle profile before accepting.',
      });
      return;
    }
    const res = await acceptOrder(order.id, {
      id: currentDriverId,
      name: driverName.trim(),
      phone: driverPhone.trim(),
      plate: driverPlate.trim(),
    });

    if (res.success) {
      setActionNotice({ success: true, message: res.message });
      setActiveTab('active');
    } else {
      setActionNotice({ success: false, message: res.message });
    }
  };

  // Handle scanning or verifying Customer Drop-Off QR / PIN
  const handleCustomerScanVerified = async (scannedText: string) => {
    setShowScanner(false);
    setActionNotice(null);
    setPendingCustomerConfirm(null);

    const res = await verifyCustomerDelivery(scannedText, currentDriverId);
    if (res.success && res.customerVerified && res.order) {
      setPendingCustomerConfirm(res.order);
      setActionNotice({ success: true, message: res.message });
      setManualPinInput('');
    } else {
      setActionNotice({ success: false, message: res.message });
    }
  };

  // Handle final confirmation + wallet payout after customer verification
  const handleConfirmDeliveryCompletion = async () => {
    if (!pendingCustomerConfirm || isCompletingDelivery) return;
    setIsCompletingDelivery(true);
    try {
      const res = await confirmCustomerDeliveryComplete(pendingCustomerConfirm.id);
      if (res.success) {
        setActionNotice({ success: true, message: res.message });
        setPendingCustomerConfirm(null);
        setActiveTab('earnings');
      } else {
        setActionNotice({ success: false, message: res.message });
      }
    } finally {
      setIsCompletingDelivery(false);
    }
  };

  // Handle manual PIN or Phone confirmation
  const handleManualCustomerVerify = async () => {
    if (!manualPinInput.trim()) return;
    await handleCustomerScanVerified(manualPinInput.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white text-black rounded-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header - Courier Limpopo Blue & Yellow */}
        <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <Bike className="w-5 h-5 text-[#FACC15]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black tracking-tight leading-tight">
                  Order Delivery Driver Hub
                </h2>
                <span className="bg-[#FACC15] text-black text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                  Active
                </span>
              </div>
              <p className="text-[10px] text-blue-200">
                {driverName || 'Set Driver Name'}{driverPlate ? ` • ${driverPlate}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsEditingProfile((prev) => !prev)}
              className="text-[10px] bg-white/10 hover:bg-white/20 text-blue-100 font-bold px-2 py-1 rounded-lg transition"
            >
              {isEditingProfile ? 'Done' : 'Vehicle'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Profile / Vehicle Details Editor */}
        {isEditingProfile && (
          <div className="p-3 bg-blue-50/80 border-b border-blue-200 space-y-2 text-xs">
            <div className="flex items-center justify-between font-black text-blue-950 text-[11px]">
              <span>Driver & Vehicle Profile (Seen by Vendors & Customers)</span>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="text-[#0D47A1] font-bold underline"
              >
                Save
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] font-bold text-gray-500 block">Name</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-500 block">Phone</label>
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-500 block">Number Plate</label>
                <input
                  type="text"
                  value={driverPlate}
                  onChange={(e) => setDriverPlate(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-bold"
                />
              </div>
            </div>
          </div>
        )}

        {/* Quick Earnings & Status Bar */}
        <div className="px-4 py-2.5 bg-gray-900 text-white flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span className="font-bold text-[11px]">
              {isOnline ? 'Online for Deliveries' : 'Offline'}
            </span>
            <button
              type="button"
              onClick={() => setIsOnline(!isOnline)}
              className="text-[9px] text-gray-400 hover:text-white underline ml-1 font-mono"
            >
              Toggle
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[9px] text-gray-400 block font-medium">Fee Balance</span>
              <span className="text-xs font-black text-[#FACC15]">
                R{(currentWalletBalance ?? currentUser?.walletBalance ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Nav Tabs */}
        <div className="grid grid-cols-3 p-1.5 bg-gray-100 border-b border-gray-200 gap-1 shrink-0 text-xs font-black">
          <button
            type="button"
            onClick={() => setActiveTab('available')}
            className={`py-2 px-1 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'available'
                ? 'bg-white text-[#0D47A1] shadow-sm'
                : 'text-gray-500 hover:text-black'
            }`}
          >
            <span>Available</span>
            {availableOrders.length > 0 && (
              <span className="bg-[#D32F2F] text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                {availableOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`py-2 px-1 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'active'
                ? 'bg-white text-[#0D47A1] shadow-sm'
                : 'text-gray-500 hover:text-black'
            }`}
          >
            <span>Active Run</span>
            {activeDelivery && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('earnings')}
            className={`py-2 px-1 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'earnings'
                ? 'bg-white text-[#0D47A1] shadow-sm'
                : 'text-gray-500 hover:text-black'
            }`}
          >
            <span>Earnings ({completedDeliveries.length})</span>
          </button>
        </div>

        {/* Action Notice Alert */}
        {actionNotice && (
          <div
            className={`mx-4 mt-3 p-3 rounded-2xl border text-xs flex items-start gap-2.5 animate-in fade-in shrink-0 ${
              actionNotice.success
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            {actionNotice.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-bold">{actionNotice.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab 1: Available Orders */}
        {activeTab === 'available' && (
          <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="font-black uppercase tracking-wider text-gray-700">
                Live Orders Waiting for Drivers
              </span>
              <span className="font-mono font-bold">
                {availableOrders.length} ready
              </span>
            </div>

            {availableOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 space-y-2">
                <Bike className="w-10 h-10 text-gray-300 mx-auto" />
                <h3 className="font-black text-gray-700 text-sm">No Pending Deliveries</h3>
                <p className="text-xs max-w-xs mx-auto text-gray-500 leading-relaxed">
                  When a customer orders delivery and the store finishes cooking, orders will pop up right here with full fee details!
                </p>
              </div>
            ) : (
              availableOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white rounded-2xl p-4 border-2 border-gray-200 hover:border-[#0D47A1] shadow-sm space-y-3 transition"
                >
                  {/* Store & Fee Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-black text-[#0D47A1] block">
                        {ord.storeName}
                      </span>
                      <span className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-red-500" />
                        {ord.storeLocation || 'Universal Band Mall'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 inline-block">
                        +R{resolveDeliveryFee(ord.deliveryFee).toFixed(2)} Fee
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono block mt-0.5">{ord.orderNumber}</span>
                    </div>
                  </div>

                  {/* Customer Drop-off Address */}
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                      <span>📍 Drop-off:</span>
                      <span className="text-gray-900">{ord.deliveryAddress || 'Customer Address'}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Customer: <strong>{ord.customerName}</strong> ({ord.customerPhone})
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="text-[11px] text-gray-600 bg-blue-50/50 p-2 rounded-xl">
                    <strong>Items to deliver:</strong>{' '}
                    {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')} (R{ord.total.toFixed(2)})
                  </div>

                  {/* Accept Delivery Button */}
                  <button
                    type="button"
                    onClick={() => handleAcceptOrder(ord)}
                    className="w-full py-3 bg-[#0D47A1] hover:bg-blue-900 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Bike className="w-4 h-4 text-[#FACC15]" />
                    <span>Accept Delivery & Lock Order</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Active Run */}
        {activeTab === 'active' && (
          <div className="p-4 overflow-y-auto space-y-4 flex-1">
            {!activeDelivery ? (
              <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 space-y-2">
                <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto" />
                <h3 className="font-black text-gray-700 text-sm">No Active Delivery Right Now</h3>
                <p className="text-xs max-w-xs mx-auto text-gray-500">
                  Select an order from the <strong>Available</strong> tab to accept it and start your run.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('available')}
                  className="mt-2 py-2 px-4 bg-[#0D47A1] text-white font-bold text-xs rounded-xl inline-block cursor-pointer"
                >
                  View Available Orders
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status Stepper */}
                {(() => {
                  const isOutForDelivery = activeDelivery.status === 'out_for_delivery' || activeDelivery.status === 'collected_by_driver';
                  const driverPickupQrPayload = JSON.stringify({
                    type: 'DRIVER_STORE_PICKUP',
                    orderId: activeDelivery.id,
                    pin: activeDelivery.pickupPin || '',
                    driverId: currentDriverId,
                    driverName: activeDelivery.deliveryDriverName || driverName,
                    driverPlate: activeDelivery.deliveryDriverPlate || driverPlate,
                  });
                  return (
                    <>
                <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200">
                  <div className="flex items-center justify-between text-xs font-black">
                    <span className="text-[#0D47A1]">
                      {isOutForDelivery
                        ? 'STEP 2: DELIVERING TO CUSTOMER'
                        : 'STEP 1: COLLECTING FROM VENDOR'}
                    </span>
                    <span className="bg-yellow-400 text-black text-[9px] px-2 py-0.5 rounded-full font-bold">
                      {activeDelivery.orderNumber}
                    </span>
                  </div>

                  {/* Progress dots */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-2 rounded-full bg-emerald-500" />
                    <div
                      className={`flex-1 h-2 rounded-full ${
                        isOutForDelivery
                          ? 'bg-emerald-500'
                          : 'bg-gray-300'
                      }`}
                    />
                    <div className="flex-1 h-2 rounded-full bg-gray-300" />
                  </div>
                </div>

                {/* PHASE 1: Heading to Store (before store scans driver QR/PIN) */}
                {!isOutForDelivery && (
                  <div className="bg-white rounded-2xl p-4 border-2 border-[#0D47A1] shadow-sm space-y-3.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-black tracking-wider text-gray-400 block">
                          Pickup Location
                        </span>
                        <h4 className="font-black text-sm text-[#0D47A1]">
                          {activeDelivery.storeName}
                        </h4>
                        <p className="text-[11px] text-gray-600 mt-0.5">
                          {activeDelivery.storeLocation || 'Universal Band Mall Food Court'}
                        </p>
                      </div>
                      <span className="bg-blue-50 text-[#0D47A1] text-xs font-black px-2.5 py-1 rounded-xl border border-blue-200">
                        +R{resolveDeliveryFee(activeDelivery.deliveryFee).toFixed(2)}
                      </span>
                    </div>

                    {/* Navigation Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                          activeDelivery.storeLocation || activeDelivery.storeName || 'Universal Band Mall'
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2.5 px-3 bg-[#D32F2F] text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Navigate (Maps)</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          setMapTargetOrder(activeDelivery);
                          setShowMapModal(true);
                        }}
                        className="py-2.5 px-3 bg-gray-900 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#FACC15]" />
                        <span>View Leaflet Route</span>
                      </button>
                    </div>

                    {/* STORE PICKUP QR & PIN PASS (Shop worker/owner scans QR OR checks PIN) */}
                    <div className="bg-blue-50/70 border-2 border-[#0D47A1]/30 rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-2.5">
                      <span className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">
                        Store Pickup Ticket (QR & PIN)
                      </span>
                      <p className="text-[11px] text-gray-600 max-w-xs">
                        Let the store staff scan this single-use Pickup QR ticket (or enter PIN) to confirm handover.
                      </p>
                      <div className="bg-white p-3 rounded-2xl border border-blue-200 shadow-sm">
                        <QRCodeSVG
                          value={driverPickupQrPayload}
                          size={140}
                          level="M"
                          bgColor="#FFFFFF"
                          fgColor="#0D47A1"
                        />
                      </div>
                      <div className="bg-white px-5 py-2 rounded-xl border border-blue-200 text-center shadow-sm">
                        <span className="text-[9px] text-gray-500 uppercase font-bold block">Backup Pickup PIN</span>
                        <span className="font-mono font-black text-xl text-[#0D47A1] tracking-widest tabular-nums">
                          {activeDelivery.pickupPin || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PHASE 2: Out For Delivery to Customer */}
                {isOutForDelivery && (
                  <div className="bg-white rounded-2xl p-4 border-2 border-emerald-500 shadow-md space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="bg-emerald-100 text-emerald-900 text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                        <Bike className="w-3.5 h-3.5" />
                        <span>Food in Hand • On The Way</span>
                      </span>
                      <span className="text-xs font-black text-emerald-700">
                        +R{resolveDeliveryFee(activeDelivery.deliveryFee).toFixed(2)} Fee
                      </span>
                    </div>

                    {/* Customer Destination Card */}
                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-gray-500 block">
                            Customer Drop-Off Address
                          </span>
                          <h4 className="font-black text-sm text-gray-900">
                            {activeDelivery.deliveryAddress || 'Customer Address'}
                          </h4>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Customer: <strong>{activeDelivery.customerName}</strong>
                          </p>
                        </div>

                        {/* Call Customer Button */}
                        <a
                          href={`tel:${activeDelivery.customerPhone}`}
                          className="p-2.5 bg-[#0D47A1] hover:bg-blue-900 text-white rounded-xl shadow transition flex items-center justify-center"
                          title="Call Customer"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      </div>

                      {/* Navigation Buttons to Customer */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                            activeDelivery.deliveryAddress || activeDelivery.storeLocation || ''
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2.5 px-3 bg-[#10B981] hover:bg-emerald-600 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Navigate to Customer</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            setMapTargetOrder(activeDelivery);
                            setShowMapModal(true);
                          }}
                          className="py-2.5 px-3 bg-gray-900 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#FACC15]" />
                          <span>Leaflet Route Map</span>
                        </button>
                      </div>
                    </div>

                    {/* Order Items Summary */}
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-700">
                      <strong>Items to Hand Over:</strong>{' '}
                      {activeDelivery.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </div>

                    {/* VERIFY DROP-OFF SECTION (Driver scans Customer QR or enters PIN) */}
                    <div className="bg-amber-50/70 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
                        <div>
                          <h4 className="font-black text-xs text-amber-950">
                            STEP 5: VERIFY CUSTOMER & COMPLETE
                          </h4>
                          <p className="text-[11px] text-amber-800 leading-snug">
                            Scan customer QR code or enter their 6-digit Delivery PIN / last 4 phone digits before handing over food.
                          </p>
                        </div>
                      </div>

                      {/* Camera Scanner Button */}
                      {!showScanner ? (
                        <button
                          type="button"
                          onClick={() => setShowScanner(true)}
                          className="w-full py-3 bg-[#0D47A1] hover:bg-blue-900 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <QrCode className="w-4 h-4 text-[#FACC15]" />
                          <span>Scan Customer QR with Camera</span>
                        </button>
                      ) : (
                        <div className="rounded-2xl overflow-hidden border-2 border-blue-600 bg-black space-y-2 p-2">
                          <div className="flex items-center justify-between text-white text-xs px-2 py-1">
                            <span className="font-bold">Point Camera at Customer QR</span>
                            <button
                              type="button"
                              onClick={() => setShowScanner(false)}
                              className="text-gray-300 hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                          <Scanner
                            mode="raw"
                            onTicketVerified={handleCustomerScanVerified}
                            onClose={() => setShowScanner(false)}
                          />
                        </div>
                      )}

                      {/* Manual Backup PIN Input */}
                      <div className="pt-2 border-t border-amber-200 space-y-2">
                        <label className="text-[11px] font-bold text-amber-900 block">
                          OR Enter Customer Delivery PIN / Last 4 Phone Digits:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={manualPinInput}
                            onChange={(e) => setManualPinInput(e.target.value)}
                            placeholder="e.g. 6-digit PIN from customer..."
                            className="flex-1 bg-white border-2 border-amber-300 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-amber-600"
                          />
                          <button
                            type="button"
                            onClick={handleManualCustomerVerify}
                            className="py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow active:scale-95 transition cursor-pointer"
                          >
                            Verify
                          </button>
                        </div>
                      </div>

                      {/* Confirmed Customer Completion & Payout Card */}
                      {pendingCustomerConfirm && (
                        <div className="p-3 bg-emerald-100 border-2 border-emerald-500 rounded-2xl space-y-2.5">
                          <div className="flex items-center gap-2 text-xs font-black text-emerald-950">
                            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                            <span>
                              Customer Verified: {pendingCustomerConfirm.customerName} ({pendingCustomerConfirm.orderNumber})
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isCompletingDelivery}
                            onClick={handleConfirmDeliveryCompletion}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {isCompletingDelivery
                                ? 'Completing...'
                                : `Confirm Drop-Off & Credit +R${resolveDeliveryFee(pendingCustomerConfirm.deliveryFee).toFixed(2)}`}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Earnings & Completed Runs */}
        {activeTab === 'earnings' && (
          <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
            {/* Total Earnings Card */}
            <div className="bg-gradient-to-br from-blue-900 to-indigo-950 text-white p-4 rounded-2xl border border-blue-500/30 shadow-lg space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-200">
                Driver Payout Summary
              </span>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-[#FACC15]">
                  R{totalEarnings.toFixed(2)}
                </span>
                <span className="bg-white/10 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  {completedDeliveries.length} Completed
                </span>
              </div>
              <p className="text-[11px] text-blue-200 pt-1 border-t border-white/10">
                Earnings are credited immediately into your Universal Band Cashless Wallet per completed drop-off.
              </p>
            </div>

            {/* List of completed deliveries */}
            <div className="space-y-2">
              <span className="text-xs font-black text-gray-700 uppercase tracking-wider block">
                Proof of Delivery History
              </span>

              {completedDeliveries.length === 0 ? (
                <div className="p-6 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs">
                  No completed deliveries yet. Accept an order to start earning!
                </div>
              ) : (
                completedDeliveries.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-gray-900">
                        {ord.orderNumber} • {ord.storeName}
                      </span>
                      <span className="text-emerald-700 font-black">
                        +R{resolveDeliveryFee(ord.deliveryFee).toFixed(2)}
                      </span>
                    </div>

                    <div className="text-[11px] text-gray-600">
                      Delivered to: <strong>{ord.customerName}</strong> ({ord.deliveryAddress || 'Address'})
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-100">
                      <span>
                        {ord.deliveredAt
                          ? new Date(ord.deliveredAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Completed'}
                      </span>
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>QR Verified Proof Saved</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 shrink-0 flex items-center justify-between text-xs text-gray-500">
          <span>Universal Band Delivery Fleet</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-700 hover:text-black font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Embedded Leaflet Map Modal */}
      {showMapModal && mapTargetOrder && (
        <DriverMapModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          storeLat={(mapTargetOrder as any).storeLat}
          storeLng={(mapTargetOrder as any).storeLng}
          customerLat={(mapTargetOrder as any).deliveryLat}
          customerLng={(mapTargetOrder as any).deliveryLng}
          storeLabel={mapTargetOrder.storeLocation || mapTargetOrder.storeName}
          customerLabel={mapTargetOrder.deliveryAddress}
        />
      )}
    </div>
  );
};

export default DriverDashboardModal;
