import React from 'react';
import { useApp } from '../../context/AppContext';
import { StoreMessage } from '../../types';
import {
  X,
  Bell,
  Sparkles,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  Copy,
  Check,
  ShoppingBag,
  ExternalLink,
  TrendingUp,
  DollarSign,
  Lock,
  PackageCheck,
  QrCode,
  ShieldAlert,
} from 'lucide-react';

interface StoreOwnerMessagesModalProps {
  storeId: string;
  storeName: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenScanner?: () => void;
}

export const StoreOwnerMessagesModal: React.FC<StoreOwnerMessagesModalProps> = ({
  storeId,
  storeName,
  isOpen,
  onClose,
  onOpenScanner,
}) => {
  const {
    storeMessages,
    markStoreMessageRead,
    mallOrders,
    markOrderReady,
    currentUser,
  } = useApp();
  const [copiedPhone, setCopiedPhone] = React.useState<string | null>(null);
  const [markingReadyId, setMarkingReadyId] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isOwner = roleLower === 'admin' || roleLower === 'promoter' || roleLower === 'owner' || roleLower === 'event organiser' || roleLower === 'organizer';
  const isManager = (roleLower === 'manager' || roleLower === 'store manager') && (!storeId || currentUser?.assignedStoreId === storeId || currentUser?.assignedStoreName === storeName);
  const canViewSales = isOwner || isManager || roleLower === 'admin' || roleLower === 'promoter' || roleLower === 'event organiser' || roleLower === 'organizer' || roleLower === 'store manager';

  // Filter messages for this store
  const messages = storeMessages.filter(
    (m) => !storeId || m.storeId === storeId || m.storeName === storeName
  );

  const todayOrders = messages.filter((m) => m.type === 'ORDER_TODAY');

  // Daily Sales calculation (Accessible to Store Owner and Manager)
  const storeOrdersList = mallOrders.filter(
    (o) => !storeId || o.storeId === storeId || o.storeName === storeName
  );
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayMallOrders = storeOrdersList.filter(
    (o) => o.isTodayCollection || o.paidAt?.startsWith(todayDateStr)
  );

  const todayTotalRevenue = todayMallOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const todayTotalItems = todayMallOrders.reduce((sum, o) => sum + (o.totalQuantity || 0), 0);
  const todayCollectedCount = todayMallOrders.filter((o) => o.status === 'collected').length;
  const todayPendingCount = todayMallOrders.filter((o) => o.status !== 'collected').length;

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const handlePressOrderReady = async (orderId: string) => {
    if (!orderId || markingReadyId) return;
    setMarkingReadyId(orderId);
    try {
      await markOrderReady(orderId);
    } catch (e) {
      console.warn('Error marking order ready:', e);
    } finally {
      setMarkingReadyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white text-black rounded-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header - Limpopo Blue #0D47A1 */}
        <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center relative">
              <Bell className="w-5 h-5 text-white" />
              {todayOrders.some((m) => !m.read) && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#D32F2F] rounded-full border-2 border-[#0D47A1] animate-pulse" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight leading-tight">
                {storeName} Orders & Kitchen
              </h2>
              <p className="text-[10px] text-blue-200">
                {isOwner ? 'Store Owner Access' : isManager ? 'Store Manager Access' : 'Store Staff / Kitchen Access'} • {messages.length} Alerts
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

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-3.5">
          {/* DAILY SALES TRACKER: ACCESSIBLE TO OWNER & MANAGER */}
          {canViewSales ? (
            <div className="bg-gradient-to-br from-gray-900 to-black text-white p-3.5 rounded-2xl border border-yellow-500/30 shadow-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[#FACC15] flex items-center gap-1.5 uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4 text-[#FACC15]" />
                  <span>Daily Sales Tracking (Owner & Manager)</span>
                </span>
                <span className="text-[10px] bg-yellow-400/20 text-yellow-300 font-extrabold px-2 py-0.5 rounded-full border border-yellow-400/30">
                  Today
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                  <span className="text-[10px] text-gray-400 block font-medium">Revenue</span>
                  <span className="text-sm font-black text-[#FACC15]">
                    R{todayTotalRevenue.toFixed(0)}
                  </span>
                </div>

                <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                  <span className="text-[10px] text-gray-400 block font-medium">Orders</span>
                  <span className="text-sm font-black text-white">
                    {todayMallOrders.length}
                  </span>
                </div>

                <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                  <span className="text-[10px] text-gray-400 block font-medium">Collected</span>
                  <span className="text-sm font-black text-emerald-400">
                    {todayCollectedCount}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-100 border border-gray-200 rounded-2xl p-2.5 text-xs text-gray-600 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-[11px] font-bold">
                  Daily Sales Tracking: <strong>Store Owner Only</strong>
                </span>
              </div>
              <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-black">
                Worker Mode
              </span>
            </div>
          )}

          {/* Quick Explainer Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-2.5 text-xs text-blue-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-[#0D47A1] shrink-0 mt-0.5" />
            <div className="text-[11px] leading-snug">
              When an order is received, prepare the items. When finished, press <strong>"Order Ready"</strong> so the customer receives their ready notification for pickup!
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="p-10 text-center text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-300 space-y-2">
              <ShoppingBag className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-700">No incoming orders yet</p>
              <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
                Customer orders for this store will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, index) => {
                const isToday = msg.type === 'ORDER_TODAY';
                const isReadyType = msg.type === 'ORDER_READY';

                // Look up matching order to check status
                const linkedOrder = mallOrders.find(
                  (o) => o.id === msg.orderId || (msg.title && msg.title.includes(o.orderNumber))
                );
                const orderStatus = linkedOrder?.status || 'new_order';
                const isNewOrder = orderStatus === 'new_order' || (!linkedOrder?.status && msg.type === 'ORDER_TODAY');
                const isReady = orderStatus === 'ready_for_pickup';
                const isDriverAssigned = orderStatus === 'driver_assigned';
                const isCollectedByDriver = orderStatus === 'collected_by_driver' || orderStatus === 'out_for_delivery';
                const isDelivered = orderStatus === 'delivered';
                const isCollected = orderStatus === 'collected' || isDelivered;
                const isDelivery = linkedOrder?.collectionMethod === 'DELIVERY';

                return (
                  <div
                    key={`${msg.id}-${index}`}
                    className={`rounded-2xl p-3.5 border transition space-y-2.5 ${
                      isDelivered
                        ? 'bg-emerald-50/80 border-emerald-300'
                        : isCollectedByDriver
                        ? 'bg-blue-50/70 border-blue-300'
                        : isDriverAssigned
                        ? 'bg-amber-50/70 border-amber-300'
                        : isReady
                        ? 'bg-yellow-50/70 border-yellow-300'
                        : 'bg-red-50/60 border-red-200 shadow-sm'
                    }`}
                  >
                    {/* Message Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isDelivered ? (
                          <span className="bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>ORDER DELIVERED</span>
                          </span>
                        ) : isCollectedByDriver ? (
                          <span className="bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span>🛵</span>
                            <span>COLLECTED BY DRIVER</span>
                          </span>
                        ) : isDriverAssigned ? (
                          <span className="bg-amber-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span>🛵</span>
                            <span>DRIVER ASSIGNED - {linkedOrder?.deliveryDriverName || 'Driver'}</span>
                          </span>
                        ) : isReady ? (
                          <span className="bg-yellow-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>READY FOR PICKUP</span>
                          </span>
                        ) : (
                          <span className="bg-[#D32F2F] text-white text-[9px] font-black px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                            <span>🚨</span>
                            <span>NEW ORDER</span>
                          </span>
                        )}
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>
                            {msg.createdAt
                              ? new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Today'}
                          </span>
                        </span>
                      </div>

                      {!msg.read && (
                        <button
                          type="button"
                          onClick={() => markStoreMessageRead(msg.id)}
                          className="text-[10px] text-[#0D47A1] hover:underline font-bold cursor-pointer"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>

                    {/* Customer Info */}
                    <div className="flex items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-gray-200">
                      <div>
                        <span className="font-black text-gray-900 block">
                          {msg.customerName}
                        </span>
                        <div className="flex items-center gap-2 text-gray-600 text-[11px] mt-0.5">
                          <Phone className="w-3 h-3 text-[#D32F2F]" />
                          <span className="font-mono font-bold">{msg.customerPhone}</span>
                        </div>
                        {isDelivery && linkedOrder?.deliveryAddress && (
                          <div className="flex items-center gap-2 text-gray-800 text-[11px] mt-1 font-bold">
                            <span className="text-gray-500">📍</span>
                            {linkedOrder.deliveryAddress}
                          </div>
                        )}
                      </div>

                      {/* Quick Call / Copy Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyPhone(msg.customerPhone)}
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition cursor-pointer"
                          title="Copy phone"
                        >
                          {copiedPhone === msg.customerPhone ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={`tel:${msg.customerPhone}`}
                          className="py-1 px-2.5 bg-[#0D47A1] hover:bg-blue-900 text-white font-bold text-[10px] rounded-lg transition flex items-center gap-1 cursor-pointer"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call</span>
                        </a>
                      </div>
                    </div>

                    {/* Ordered Items Breakdown (Financial Total only visible to Store Owner!) */}
                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 text-xs text-gray-800 space-y-1">
                      <div className="flex items-center justify-between font-bold text-gray-900 pb-1 border-b border-gray-100">
                        <span>Items to Prepare ({msg.totalQuantity || 1}):</span>
                        {canViewSales ? (
                          <span className="text-[#D32F2F]">R{(msg.totalAmount || 0).toFixed(2)}</span>
                        ) : (
                          <span className="text-gray-400 text-[10px] font-bold">(Paid)</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-700 font-medium leading-relaxed">
                        {msg.itemsSummary || msg.message}
                      </p>
                      {isDelivery && linkedOrder?.deliveryFee && (
                          <div className="text-[11px] font-bold text-amber-700">Delivery Fee: R{linkedOrder.deliveryFee.toFixed(2)}</div>
                      )}
                    </div>


                    {/* Delivery Driver Info if assigned */}
                    {isDelivery && linkedOrder?.deliveryDriverName && (
                      <div className="bg-blue-50/80 p-2.5 rounded-xl border border-blue-200 text-xs text-blue-900 space-y-1">
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1.5">
                            <span>🛵</span>
                            <span>Assigned Driver: <strong>{linkedOrder.deliveryDriverName}</strong></span>
                          </span>
                          <span className="bg-[#0D47A1] text-white text-[9px] px-2 py-0.5 rounded-full font-bold">
                            {linkedOrder.status === 'out_for_delivery' ? 'ON ROAD' : 'AT STORE'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-blue-800">
                          <span>Plate: <strong>{linkedOrder.deliveryDriverPlate || 'Courier'}</strong></span>
                          {linkedOrder.deliveryDriverPhone && (
                            <a href={`tel:${linkedOrder.deliveryDriverPhone}`} className="font-bold underline">
                              {linkedOrder.deliveryDriverPhone}
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Recorded shop handover note */}
                    {isCollectedByDriver && (
                      <div className="bg-emerald-50 border border-emerald-300 p-2.5 rounded-xl text-xs text-emerald-900 font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Driver has collected the order. Shop has done its part.</span>
                      </div>
                    )}

                    {/* Step 2: "Order Complete / Order Ready" Button */}
                    {!isCollected && !isCollectedByDriver && (
                      <div className="pt-1 flex items-center gap-2">
                        {isNewOrder ? (
                          <button
                            type="button"
                            disabled={Boolean(markingReadyId)}
                            onClick={() => handlePressOrderReady(msg.orderId)}
                            className="flex-1 py-2.5 px-3 bg-[#10B981] hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <PackageCheck className="w-4 h-4" />
                            <span>
                              {markingReadyId === msg.orderId
                                ? 'Updating...'
                                : 'Order Complete / Order Ready'}
                            </span>
                          </button>
                        ) : (
                          <div className="flex-1 py-2 px-3 bg-yellow-100 border border-yellow-300 text-yellow-950 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5">
                            <Clock className="w-4 h-4 text-yellow-700" />
                            <span>
                              {isDriverAssigned
                                ? `Driver ${linkedOrder?.deliveryDriverName || 'Assigned'} is on the way`
                                : 'Ready for Pickup (Waiting for Driver)'}
                            </span>
                          </div>
                        )}

                        {onOpenScanner && isDriverAssigned && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenScanner();
                            }}
                            className="py-2.5 px-3 rounded-xl bg-[#0D47A1] hover:bg-blue-900 text-white font-bold text-xs shadow transition cursor-pointer flex items-center gap-1.5"
                            title="Open Scanner for Driver Handover"
                          >
                            <QrCode className="w-4 h-4" />
                            <span>Scan Driver QR</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 shrink-0 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-black text-xs rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
