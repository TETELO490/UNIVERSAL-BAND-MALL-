import React from 'react';
import { useApp } from '../../context/AppContext';
import { MallOrder } from '../../types';
import {
  X,
  CheckCircle2,
  Phone,
  Calendar,
  MapPin,
  Sparkles,
  Download,
  Info,
  ShieldCheck,
  User,
} from 'lucide-react';

interface MallOrderSuccessModalProps {
  order: MallOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

export const MallOrderSuccessModal: React.FC<MallOrderSuccessModalProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  const { navigateTo } = useApp();

  if (!isOpen || !order) return null;

  const isDelivery = order.collectionMethod === 'DELIVERY';
  const isToday = order.isTodayCollection || order.collectionDate === 'Today';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white text-black rounded-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header - Limpopo Blue #0D47A1 */}
        <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-sm font-black tracking-tight leading-tight">
                {isDelivery ? 'Delivery Order Confirmed!' : 'Order Paid & Confirmed!'}
              </h2>
              <p className="text-[10px] text-blue-200">
                Universal Band Mall • {order.orderNumber}
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

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-3.5 text-center">
          {/* DELIVERY TRACKER & DRIVER BADGE */}
          {isDelivery ? (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-[#0D47A1]/30 rounded-2xl p-3 text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-[#0D47A1] tracking-wider flex items-center gap-1">
                  <span>🛵</span>
                  <span>DELIVERY SERVICE MODULE</span>
                </span>
                <span className="bg-[#0D47A1] text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                  {order.status === 'out_for_delivery'
                    ? 'ON THE WAY'
                    : order.deliveryDriverId
                    ? 'DRIVER ASSIGNED'
                    : order.status === 'ready_for_pickup'
                    ? 'READY FOR DRIVER'
                    : 'PREPARING'}
                </span>
              </div>

              {order.deliveryDriverName ? (
                <div className="bg-white p-2.5 rounded-xl border border-blue-200 text-xs text-gray-800 space-y-0.5">
                  <span className="text-[10px] text-gray-500 block font-bold">Assigned Courier:</span>
                  <div className="font-black text-sm text-[#0D47A1]">
                    {order.deliveryDriverName}
                  </div>
                  <div className="text-[11px] text-gray-600 flex items-center justify-between pt-0.5">
                    <span>Plate: <strong>{order.deliveryDriverPlate || 'Courier'}</strong></span>
                    {order.deliveryDriverPhone && (
                      <a href={`tel:${order.deliveryDriverPhone}`} className="text-[#0D47A1] font-bold underline">
                        {order.deliveryDriverPhone}
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 p-2 rounded-xl border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span>Looking for closest driver in the area to accept...</span>
                </div>
              )}

              <div className="text-[11px] text-gray-700">
                <strong>Drop-Off Destination:</strong> {order.deliveryAddress || 'Your Address'}
              </div>
            </div>
          ) : (
            isToday && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-left flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-emerald-900">
                    ⚡ TODAY PICKUP: Store Owner Notified!
                  </h4>
                  <p className="text-[11px] text-emerald-700 mt-0.5 leading-snug">
                    The store owner at <strong>{order.storeName}</strong> has received a notification showing what you ordered and is preparing your parcel.
                  </p>
                </div>
              </div>
            )
          )}

          {/* Large Alphanumeric Code / PIN */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-2.5">
            <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">
              {isDelivery ? 'Customer Delivery PIN (Backup)' : 'Collection Code'}
            </span>
            <span className="text-xl font-black text-[#0D47A1] tracking-widest font-mono">
              {isDelivery ? (order.deliveryPin || '123456') : order.collectionCode}
            </span>
          </div>

          {/* Linked to Profile ONE QR */}
          <div className="bg-blue-50 p-4 rounded-2xl border border-[#0D47A1]/25 flex flex-col items-center justify-center space-y-2.5">
            <p className="text-xs font-extrabold text-[#0D47A1]">
              {isDelivery
                ? 'Added to your Profile ONE QR — show your Profile ONE QR to the driver on drop-off'
                : 'Added to your Profile ONE QR — show your Profile ONE QR at the store counter to collect'}
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigateTo('/profile');
              }}
              className="w-full min-h-[44px] py-2.5 px-4 bg-[#0D47A1] hover:bg-blue-900 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <User className="w-4 h-4" />
              <span>Open My ONE QR on Profile</span>
            </button>
          </div>

          {/* Order Details & Store Info */}
          <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200 text-left space-y-1.5 text-xs text-gray-700">
            <div className="flex items-center justify-between font-bold text-gray-900 pb-1 border-b border-gray-200">
              <span>{order.storeName}</span>
              <span className="text-[#D32F2F]">R{order.total.toFixed(2)} Paid</span>
            </div>

            <div className="flex items-center gap-1.5 text-gray-600 text-[11px]">
              <Calendar className="w-3.5 h-3.5 text-[#0D47A1] shrink-0" />
              <span>Type: <strong>{isDelivery ? 'Delivery to Address' : 'In-Store Collection'}</strong></span>
            </div>

            <div className="flex items-center gap-1.5 text-gray-600 text-[11px]">
              <Phone className="w-3.5 h-3.5 text-[#D32F2F] shrink-0" />
              <span>Customer Phone: <strong>{order.customerPhone}</strong></span>
            </div>

            {isDelivery && order.deliveryFee && (
              <div className="text-[11px] text-emerald-700 font-bold">
                Delivery Fee: R{order.deliveryFee.toFixed(2)} Included
              </div>
            )}

            <div className="pt-1.5 text-[11px] text-gray-600 border-t border-gray-200">
              <span className="font-bold text-gray-800 block mb-0.5">Items Ordered ({order.totalQuantity}):</span>
              <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                {order.items.map((item, idx) => (
                  <li key={idx} className="text-left py-0.5">
                    <span className="font-semibold text-gray-800">
                      {item.quantity}x {item.name}
                    </span>{' '}
                    <span>(R{(item.price * item.quantity).toFixed(2)})</span>
                    {item.removedIngredients && item.removedIngredients.length > 0 && (
                      <span className="block text-[10px] font-bold text-rose-700 pl-4">
                        ⚠️ Request: No {item.removedIngredients.map((i) => i.charAt(0).toUpperCase() + i.slice(1)).join(', No ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Phone Lookup Collection Explainer Card (for collection) */}
          {!isDelivery && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-black text-amber-950">
                <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>No QR Code with you?</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                You can also collect your parcel by giving the vendor your phone number (<strong>{order.customerPhone}</strong>). When using phone lookup, an <strong>R5.00 fee</strong> is charged (R2 to the store owner's wallet, R3 to Universal Band Mall).
              </p>
            </div>
          )}
        </div>

        {/* Footer Close Button - Limpopo Red #D32F2F */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 bg-[#D32F2F] hover:bg-red-700 text-white font-black text-xs rounded-xl shadow transition active:scale-95 cursor-pointer"
          >
            Done • Save to My Orders
          </button>
        </div>
      </div>
    </div>
  );
};
