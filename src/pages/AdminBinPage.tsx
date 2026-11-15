import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { BinnedItem } from '../types';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Ticket as TicketIcon,
  Utensils,
  Search,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  Calendar,
} from 'lucide-react';
import {
  runAutoBinCheck,
  restoreBinnedItem,
  permanentlyDeleteBinnedItem,
  emptyRecycleBin,
} from '../utils/autoBinService';

export const AdminBinPage: React.FC = () => {
  const { navigateTo } = useApp();

  const [binnedItems, setBinnedItems] = useState<BinnedItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<'all' | 'ticket' | 'food_drink'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRunningSweep, setIsRunningSweep] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Confirmation modal state
  const [itemToDelete, setItemToDelete] = useState<BinnedItem | null>(null);
  const [itemToRestore, setItemToRestore] = useState<BinnedItem | null>(null);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState<boolean>(false);

  // Subscribe to binned_items collection
  useEffect(() => {
    const q = query(collection(db, 'binned_items'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: BinnedItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as BinnedItem;
          // Calculate remaining days from deleteAt (60 days from binnedAt)
          let daysLeft = 60;
          if (data.deleteAt) {
            const deleteTime = new Date(data.deleteAt).getTime();
            const now = Date.now();
            if (!isNaN(deleteTime)) {
              daysLeft = Math.max(0, Math.ceil((deleteTime - now) / (1000 * 60 * 60 * 24)));
            }
          }

          list.push({
            ...data,
            id: docSnap.id,
            daysRemaining: daysLeft,
          });
        });

        // Sort by daysRemaining ascending (items expiring soonest first)
        list.sort((a, b) => (a.daysRemaining ?? 60) - (b.daysRemaining ?? 60));

        setBinnedItems(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Error fetching binned items:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Run Manual Auto-Bin Check
  const handleTriggerSweep = async () => {
    setIsRunningSweep(true);
    setActionMessage(null);
    try {
      const res = await runAutoBinCheck();
      setActionMessage(
        `Sweep Complete! Binned ${res.binnedTicketsCount} tickets and ${res.binnedReservationsCount} food/alcohol reservations. Purged ${res.purgedItemsCount} expired items.`
      );
    } catch (err: any) {
      setActionMessage('Auto-bin check encountered an error: ' + err.message);
    } finally {
      setIsRunningSweep(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  // Restore item back to active
  const confirmRestore = async () => {
    if (!itemToRestore) return;
    const item = itemToRestore;
    setItemToRestore(null);
    const ok = await restoreBinnedItem(item);
    if (ok) {
      setActionMessage(`Restored "${item.title}" successfully.`);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  // Permanently delete single item
  const handlePermanentDelete = async () => {
    if (!itemToDelete) return;
    const ok = await permanentlyDeleteBinnedItem(itemToDelete.id);
    if (ok) {
      setActionMessage(`Permanently purged "${itemToDelete.title}".`);
      setTimeout(() => setActionMessage(null), 3500);
    }
    setItemToDelete(null);
  };

  // Empty all binned items
  const handleEmptyAll = async () => {
    const ok = await emptyRecycleBin(binnedItems);
    if (ok) {
      setActionMessage('Recycle Bin emptied permanently.');
      setTimeout(() => setActionMessage(null), 3500);
    }
    setShowEmptyConfirm(false);
  };

  // Filtered List
  const filteredList = binnedItems.filter((item) => {
    if (filterType === 'ticket' && item.originalCollection !== 'tickets') return false;
    if (filterType === 'food_drink' && item.originalCollection !== 'reservations') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchCustomer = item.customerName?.toLowerCase().includes(q) || item.attendeePhone?.includes(q) || item.customerPhone?.includes(q);
      const matchStore = item.storeName?.toLowerCase().includes(q);
      return matchTitle || matchCustomer || matchStore;
    }

    return true;
  });

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white font-bold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 bg-rose-950/60 border border-rose-500/40 px-2.5 py-0.5 rounded-full">
          Admin Recycle Bin
        </span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-rose-500" />
            <span>Event Day Bin</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Auto-binned at 00:00 midnight • 60-day auto-purge policy
          </p>
        </div>

        <button
          type="button"
          onClick={handleTriggerSweep}
          disabled={isRunningSweep}
          className="inline-flex items-center gap-1.5 text-xs font-black text-black bg-[#FACC15] hover:bg-yellow-400 px-3 py-1.5 rounded-xl transition shadow cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRunningSweep ? 'animate-spin' : ''}`} />
          <span>Run Sweep</span>
        </button>
      </div>

      {/* Action Notice */}
      {actionMessage && (
        <div className="mb-4 p-3 bg-[#1C1C1C] border-2 border-[#FACC15] text-[#FACC15] rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#FACC15]" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Auto-Bin Policy Card */}
      <div className="bg-[#141414] border border-rose-500/30 rounded-2xl p-4 mb-4 space-y-2">
        <div className="flex items-center gap-2 text-rose-400 text-xs font-black">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>00:00 Midnight Event Day Automated Policy</span>
        </div>
        <p className="text-[11px] text-gray-300 leading-relaxed">
          On the day of an event at <strong>00:00 midnight</strong>, all tickets and all food & alcohol reservations for that event automatically move to this Bin collection. They are <strong>unusable for check-in</strong> after that time.
        </p>
        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-gray-400">
          <span>Retention Period: 60 Days</span>
          <span className="text-amber-400 font-bold">Auto-Purge Triggered Daily</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-2.5 mb-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by title, customer name, ID, or venue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#161616] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
          />
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`text-xs font-black px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterType === 'all'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-[#181818] text-gray-400 hover:text-white'
              }`}
            >
              All ({binnedItems.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('ticket')}
              className={`text-xs font-black px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterType === 'ticket'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-[#181818] text-gray-400 hover:text-white'
              }`}
            >
              Tickets
            </button>
            <button
              type="button"
              onClick={() => setFilterType('food_drink')}
              className={`text-xs font-black px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterType === 'food_drink'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-[#181818] text-gray-400 hover:text-white'
              }`}
            >
              Food & Drinks
            </button>
          </div>

          {binnedItems.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEmptyConfirm(true)}
              className="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition cursor-pointer"
            >
              Empty Bin
            </button>
          )}
        </div>
      </div>

      {/* Binned Items List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-xs">Loading Recycle Bin...</div>
        ) : filteredList.length === 0 ? (
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-8 text-center">
            <Trash2 className="w-10 h-10 text-gray-600 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-bold text-white mb-1">Recycle Bin is Clean</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto mb-3">
              No expired event tickets or reservations are currently binned.
            </p>
            <button
              type="button"
              onClick={handleTriggerSweep}
              className="text-xs font-black text-[#FACC15] hover:underline cursor-pointer"
            >
              Run Sweep Now
            </button>
          </div>
        ) : (
          filteredList.map((item) => {
            const isTicket = item.originalCollection === 'tickets';
            const daysLeft = item.daysRemaining ?? 60;

            return (
              <div
                key={item.id}
                className="bg-[#161616] border border-white/5 hover:border-rose-500/30 rounded-2xl p-4 transition shadow-lg space-y-3"
              >
                {/* Header: Item Title & Type & Countdown */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      {isTicket ? (
                        <TicketIcon className="w-4 h-4 text-[#FACC15]" />
                      ) : (
                        <Utensils className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white">{item.title}</h4>
                      <span className="text-[10px] text-gray-400 block font-medium">
                        {item.storeName || 'Venue'} {item.eventDate ? `• ${item.eventDate}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Requirement 3: COUNTDOWN "Deletes in X days" */}
                  <div className="shrink-0 text-right">
                    <span className="inline-flex items-center gap-1 bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow">
                      <Clock className="w-3 h-3 text-rose-400 animate-pulse" />
                      <span>Deletes in {daysLeft} days</span>
                    </span>
                  </div>
                </div>

                {/* Customer Details */}
                <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 text-[11px] font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-sans">Customer:</span>
                    <span className="text-white font-bold">{item.customerName || 'Registered User'}</span>
                  </div>
                  {(item.attendeePhone || item.customerPhone) && (
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-sans">Phone:</span>
                      <span className="text-[#FACC15] font-bold">{item.attendeePhone || item.customerPhone}</span>
                    </div>
                  )}
                  {item.amount && (
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-sans">Value:</span>
                      <span className="text-gray-300">R{item.amount}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-white/5 text-[10px]">
                    <span className="text-gray-500 font-sans">Reason:</span>
                    <span className="text-rose-400 font-sans italic">{item.binnedReason}</span>
                  </div>
                </div>

                {/* Actions: Restore & Permanent Delete */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setItemToRestore(item)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-300 hover:text-white bg-[#222] hover:bg-[#2A2A2A] px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore Item</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setItemToDelete(item)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-500/30 px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete Permanently</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Single Item Restore Confirmation Modal */}
      {itemToRestore && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-emerald-500/40 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-white animate-in zoom-in-95 duration-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-600/20 text-emerald-400 mx-auto flex items-center justify-center">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-white">Restore Binned Item?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Restore "{itemToRestore.title}" back to active status?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToRestore(null)}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs cursor-pointer shadow"
              >
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Item Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-rose-500/40 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-white animate-in zoom-in-95 duration-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-600/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-white">Permanently Delete Item?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Are you sure you want to permanently delete "{itemToDelete.title}"? This cannot be undone.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePermanentDelete}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty All Confirmation Modal */}
      {showEmptyConfirm && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-rose-500/40 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-white animate-in zoom-in-95 duration-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-600/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-white">Empty All Binned Items?</h3>
              <p className="text-xs text-gray-400 mt-1">
                This will permanently delete all {binnedItems.length} items from the database.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEmptyConfirm(false)}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmptyAll}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow"
              >
                Empty Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
