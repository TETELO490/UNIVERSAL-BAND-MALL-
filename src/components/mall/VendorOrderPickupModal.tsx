import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { MallOrder } from '../../types';
import Scanner from '../Scanner';
import {
  X,
  QrCode,
  Phone,
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShoppingBag,
  Coins,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface VendorOrderPickupModalProps {
  storeId: string;
  storeName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const VendorOrderPickupModal: React.FC<VendorOrderPickupModalProps> = ({
  storeId,
  storeName,
  isOpen,
  onClose,
}) => {
  const {
    mallOrders,
    releaseMallOrderByQr,
    releaseMallOrderByPhone,
    verifyDriverStorePickup,
    confirmStoreHandoverToDriver,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'qr' | 'phone'>('qr');
  const [phoneNumberInput, setPhoneNumberInput] = useState<string>('');
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    order?: MallOrder;
    message: string;
    feeBreakdown?: { total: number; store: number; admin: number };
  } | null>(null);
  const [driverVerification, setDriverVerification] = useState<{
    order: MallOrder;
    driver: { name: string; photo: string; plate: string };
  } | null>(null);
  const [isProcessingPhone, setIsProcessingPhone] = useState(false);
  const [isConfirmingHandover, setIsConfirmingHandover] = useState(false);

  if (!isOpen) return null;

  // Filter orders for this store that match the entered phone
  const cleanDigits = phoneNumberInput.replace(/[^0-9]/g, '');
  const matchingOrders = cleanDigits.length >= 6
    ? mallOrders.filter((o) => {
        const oDigits = (o.customerPhone || '').replace(/[^0-9]/g, '');
        const phoneMatch = oDigits.includes(cleanDigits) || cleanDigits.includes(oDigits);
        const storeMatch = !storeId || o.storeId === storeId;
        const isPaidOrder = o.paymentStatus !== 'WAITING FOR PAYMENT' && o.paymentStatus !== 'PENDING_PAYMENT';
        const statusMatch = o.status === 'ready_for_pickup' || o.status === 'paid' || o.status === 'driver_assigned';
        return phoneMatch && storeMatch && isPaidOrder && statusMatch;
      })
    : [];

  const handleQrVerified = async (scannedText: string) => {
    setDriverVerification(null);
    setScanResult(null);

    // Check if it is a driver store pickup QR
    let isDriverQr = scannedText.includes('DRIVER_STORE_PICKUP');
    try {
      const parsed = JSON.parse(scannedText);
      if (parsed?.type === 'DRIVER_STORE_PICKUP' || parsed?.driverId) {
        isDriverQr = true;
      }
    } catch (e) {}

    if (isDriverQr) {
      const res = await verifyDriverStorePickup(scannedText, storeId);
      if (!res.success) {
        setScanResult({
          success: false,
          message: res.message || 'Wrong driver',
        });
      } else if (res.driver && res.order) {
        setDriverVerification({
          order: res.order,
          driver: res.driver,
        });
      }
      return;
    }

    try {
      const res = await releaseMallOrderByQr(scannedText, storeId);
      setScanResult({
        success: res.success,
        order: res.order,
        message: res.message,
      });
    } catch (err: any) {
      setScanResult({
        success: false,
        message: err?.message || 'Failed to verify QR order.',
      });
    }
  };

  const handleConfirmDriverHandover = async () => {
    if (!driverVerification) return;
    setIsConfirmingHandover(true);
    try {
      const res = await confirmStoreHandoverToDriver(driverVerification.order.id);
      if (res.success) {
        setScanResult({
          success: true,
          order: res.order,
          message: 'Driver has collected the order. Shop has done its part.',
        });
        setDriverVerification(null);
      } else {
        setScanResult({
          success: false,
          message: res.message,
        });
      }
    } catch (err: any) {
      setScanResult({
        success: false,
        message: err?.message || 'Error confirming collection',
      });
    } finally {
      setIsConfirmingHandover(false);
    }
  };

  const handlePhoneCollect = async (orderId?: string) => {
    setIsProcessingPhone(true);
    setScanResult(null);
    try {
      const res = await releaseMallOrderByPhone(phoneNumberInput, storeId, orderId);
      setScanResult({
        success: res.success,
        order: res.order,
        message: res.message,
        feeBreakdown: res.success
          ? {
              total: res.feeCharged,
              store: res.storeEarned,
              admin: res.adminEarned,
            }
          : undefined,
      });
    } catch (err: any) {
      setScanResult({
        success: false,
        message: err?.message || 'Error executing phone lookup collection.',
      });
    } finally {
      setIsProcessingPhone(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white text-black rounded-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header - Limpopo Blue #0D47A1 */}
        <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight leading-tight">
                Order Pickup & Scanner
              </h2>
              <p className="text-[10px] text-blue-200">
                {storeName} • Universal Band Mall
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dual Mode Tabs */}
        <div className="grid grid-cols-2 p-2 bg-gray-100 border-b border-gray-200 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('qr');
              setScanResult(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'qr'
                ? 'bg-white text-[#0D47A1] shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Scan Customer QR (Free)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('phone');
              setScanResult(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'phone'
                ? 'bg-white text-[#D32F2F] shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span>Phone Lookup (R5 Fee)</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Driver Handover Verification Card (Step 6) */}
          {driverVerification && (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl text-xs space-y-3 animate-in zoom-in-95 shadow-md">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-black text-sm text-emerald-950">
                  This is the correct driver - {driverVerification.driver.name} - {driverVerification.driver.plate} - for Order {driverVerification.order.orderNumber}
                </span>
              </div>

              <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-emerald-200">
                {driverVerification.driver.photo ? (
                  <img
                    src={driverVerification.driver.photo}
                    alt={driverVerification.driver.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center font-black text-lg text-emerald-800 shrink-0">
                    {(driverVerification.driver.name || 'D').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-black text-sm text-gray-900">{driverVerification.driver.name}</p>
                  <p className="text-xs text-gray-600">Plate Number: <strong className="text-gray-900">{driverVerification.driver.plate}</strong></p>
                  <p className="text-[11px] text-gray-500">Order: <strong>{driverVerification.order.orderNumber}</strong> ({driverVerification.order.customerName})</p>
                </div>
              </div>

              <div className="text-[11px] text-gray-700 bg-emerald-100/60 p-2.5 rounded-xl border border-emerald-200">
                <strong>Items to give to driver:</strong>{' '}
                {driverVerification.order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
              </div>

              <button
                type="button"
                disabled={isConfirmingHandover}
                onClick={handleConfirmDriverHandover}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isConfirmingHandover ? 'Confirming...' : 'Confirm Collection'}</span>
              </button>
            </div>
          )}

          {/* Result Alert if present */}
          {scanResult && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 animate-in fade-in ${
                scanResult.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              {scanResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <h4 className="font-black text-sm">
                  {scanResult.success
                    ? scanResult.order?.collectionMethod === 'DELIVERY'
                      ? 'DRIVER PICKUP VERIFIED • OUT FOR DELIVERY'
                      : 'PARCEL RELEASED • COLLECTED'
                    : 'SCAN NOTICE'}
                </h4>
                <p className="mt-0.5">{scanResult.message}</p>

                {scanResult.order && (
                  <div className="mt-2 pt-2 border-t border-emerald-200 space-y-1 text-[11px]">
                    <p>
                      <strong>Order:</strong> {scanResult.order.orderNumber} ({scanResult.order.customerName})
                    </p>
                    {scanResult.order.collectionMethod === 'DELIVERY' && scanResult.order.deliveryDriverName && (
                      <p className="text-emerald-800 font-bold">
                        🛵 Driver: {scanResult.order.deliveryDriverName} ({scanResult.order.deliveryDriverPlate || 'Courier'})
                      </p>
                    )}
                    <p>
                      <strong>Items:</strong> {scanResult.order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>
                  </div>
                )}

                {scanResult.feeBreakdown && (
                  <div className="mt-2 p-2 rounded-xl bg-white/80 border border-emerald-200 text-[11px] font-bold text-gray-800">
                    <span className="text-emerald-700 block">💰 R5.00 Lookup Fee Split:</span>
                    <span>• R{scanResult.feeBreakdown.store}.00 credited to YOUR Store Owner Wallet</span>
                    <br />
                    <span>• R{scanResult.feeBreakdown.admin}.00 credited to Universal Band Mall Admin</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: QR Code Scanner (Free) */}
          {activeTab === 'qr' && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-2.5 text-xs text-blue-900 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-[#0D47A1] shrink-0" />
                <span>
                  <strong>100% Free Verification:</strong> Point camera at Customer Collection QR OR Driver Store Pickup QR.
                </span>
              </div>

              {/* Embedded Camera Scanner */}
              <div className="rounded-2xl overflow-hidden border-2 border-gray-200">
                <Scanner
                  mode="raw"
                  onTicketVerified={handleQrVerified}
                  onClose={onClose}
                />
              </div>

              {/* Quick PIN Input fallback for Driver Pickup PIN */}
              <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs space-y-2">
                <span className="text-[11px] font-black text-gray-800 block">
                  OR Enter 6-Digit PIN (Driver or Collection PIN):
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter 6-digit PIN code..."
                    id="vendor-manual-pin-input"
                    className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-[#0D47A1]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value;
                        if (val) handleQrVerified(val);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('vendor-manual-pin-input') as HTMLInputElement;
                      if (el && el.value) handleQrVerified(el.value);
                    }}
                    className="py-2 px-3 bg-[#0D47A1] text-white font-bold text-xs rounded-xl shadow cursor-pointer active:scale-95"
                  >
                    Verify PIN
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Phone Number Lookup (R5 Fee) */}
          {activeTab === 'phone' && (
            <div className="space-y-4">
              {/* Fee Explainer Card */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-black text-amber-950">
                  <Coins className="w-4 h-4 text-amber-700" />
                  <span>Phone Number Lookup Rule</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  When a customer collects using their phone number without a QR code, an <strong>R5.00 fee</strong> is charged.
                  <br />
                  • <strong>R2.00</strong> is automatically credited to <strong>YOUR store wallet</strong>.
                  <br />
                  • <strong>R3.00</strong> is credited to the Universal Band Mall platform.
                </p>
              </div>

              {/* Input for Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-gray-800 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#D32F2F]" />
                  <span>Enter Customer Phone Number:</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="tel"
                    value={phoneNumberInput}
                    onChange={(e) => setPhoneNumberInput(e.target.value)}
                    placeholder="e.g. 0712345678 or +27..."
                    className="w-full bg-gray-50 border-2 border-gray-300 focus:border-[#D32F2F] rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-bold focus:outline-none"
                  />
                  {phoneNumberInput && (
                    <button
                      type="button"
                      onClick={() => setPhoneNumberInput('')}
                      className="absolute right-3 text-gray-400 hover:text-gray-600 text-xs font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Matching Orders List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-gray-700">
                  <span>READY FOR PICKUP ORDERS</span>
                  <span className="text-gray-500 font-mono">
                    {matchingOrders.length} {matchingOrders.length === 1 ? 'match' : 'matches'}
                  </span>
                </div>

                {matchingOrders.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-xs">
                    {cleanDigits.length < 6
                      ? 'Type customer phone number above to find orders.'
                      : `No active pickup orders found for "${phoneNumberInput}" at ${storeName}.`}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {matchingOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="bg-gray-50 rounded-2xl p-3.5 border-2 border-gray-200 hover:border-[#D32F2F] transition space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-black text-gray-900 block">
                              {ord.orderNumber} • {ord.customerName}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              Phone: {ord.customerPhone} • Paid R{ord.total.toFixed(2)}
                            </span>
                          </div>
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                            READY
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-700 bg-white p-2 rounded-xl border border-gray-200">
                          <strong>Items:</strong>{' '}
                          {ord.items
                            .map(
                              (i) =>
                                `${i.quantity}x ${i.name}${
                                  i.removedIngredients && i.removedIngredients.length > 0
                                    ? ` (No ${i.removedIngredients.join(', ')})`
                                    : ''
                                }`
                            )
                            .join('; ')}
                        </div>

                        {/* Handover & Charge R5 button */}
                        <button
                          type="button"
                          disabled={isProcessingPhone}
                          onClick={() => handlePhoneCollect(ord.id)}
                          className="w-full py-2.5 px-3 bg-[#D32F2F] hover:bg-red-700 text-white font-black text-xs rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>Hand Over Parcel & Charge R5 Fee (+R2 to Wallet)</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 shrink-0 flex items-center justify-between text-xs text-gray-500">
          <span>Universal Band Mall Handover</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-700 hover:text-black font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
