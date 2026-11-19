import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, Clock, CheckSquare, Square, Receipt } from 'lucide-react';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { SnapScanOrderRecord, toggleSnapScanOrderPaid } from '../utils/snapscanHelper';

export const SnapScanOrdersPage: React.FC = () => {
  const { navigateTo } = useApp();
  const [orders, setOrders] = useState<SnapScanOrderRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'snapscan_orders'),
      (snap) => {
        const list: SnapScanOrderRecord[] = [];
        snap.forEach((d) => {
          const data = d.data() as SnapScanOrderRecord;
          list.push({ ...data, id: d.id });
        });
        // Sort newest first by createdAt
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setOrders(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleTogglePaid = async (order: SnapScanOrderRecord) => {
    setUpdatingId(order.id);
    try {
      await toggleSnapScanOrderPaid(order.id, order.status !== 'Paid');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="pb-24 pt-4 px-2 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo('/profile')}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Back</span>
        </button>
        <span className="text-xs font-black text-[#FACC15] uppercase tracking-wider">
          SnapScan Orders List
        </span>
      </div>

      <div className="bg-[#161616] border border-[#FACC15]/30 rounded-2xl p-4 space-y-1">
        <h1 className="text-lg font-black text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-[#FACC15]" />
          <span>SnapScan Orders (Newest First)</span>
        </h1>
        <p className="text-xs text-gray-400">
          Match the <strong className="text-white">Amount</strong> and <strong className="text-[#FACC15]">Time PAY was pressed</strong> with your SnapScan app, then tick the order as <strong className="text-emerald-400">Paid</strong>.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-gray-400">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="bg-[#161616] border border-white/10 rounded-2xl p-8 text-center text-xs text-gray-400">
          No SnapScan orders yet.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const isPaid = order.status === 'Paid';
            return (
              <div
                key={order.id}
                className={`rounded-2xl p-4 border transition space-y-3 ${
                  isPaid
                    ? 'bg-emerald-950/30 border-emerald-500/40'
                    : 'bg-[#161616] border-amber-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xl font-black text-white tracking-tight">
                      {order.orderNumber}
                    </div>
                    <div className="text-xs font-bold text-[#FACC15] flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{order.pressedPayLabel || `Pressed PAY at ${order.pressedPayTime}`}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-[#FACC15] font-mono tabular-nums">
                      R{Number(order.totalRands || 0).toFixed(2)}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full mt-1 ${
                        isPaid
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      <span>{order.status}</span>
                    </span>
                  </div>
                </div>

                {(order.attempts && order.attempts.length > 0) && (
                  <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 space-y-1">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Payment Attempts ({order.attempts.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {order.attempts.map((t, idx) => (
                        <span
                          key={`${order.id}-att-${idx}`}
                          className="text-[11px] font-mono font-bold text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-2 py-0.5 rounded-lg"
                        >
                          #{idx + 1} · {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(order.customerName || order.storeName) && (
                  <div className="text-[11px] text-gray-400 flex items-center justify-between border-t border-white/10 pt-2">
                    <span>{order.customerName || 'Customer'}</span>
                    <span className="truncate max-w-[160px]">{order.storeName || ''}</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={updatingId === order.id}
                  onClick={() => void handleTogglePaid(order)}
                  className={`w-full min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 ${
                    isPaid
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                      : 'bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black shadow-md'
                  }`}
                >
                  {isPaid ? (
                    <>
                      <CheckSquare className="w-4 h-4 stroke-[2.5]" />
                      <span>Paid ✓ (Tap to undo)</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 stroke-[2.5]" />
                      <span>{updatingId === order.id ? 'Updating...' : 'Tick as Paid'}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SnapScanOrdersPage;
