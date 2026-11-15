import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { SpendingTransaction } from '../types';
import {
  History,
  Wallet,
  Download,
  Filter,
  Calendar,
  Ticket as TicketIcon,
  Utensils,
  CreditCard,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  Clock,
  Sparkles,
  Receipt,
  FileSpreadsheet,
  PieChart,
} from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const { currentUser, tickets, walletTransactions, setActiveModal, navigateTo } = useApp();

  const [firestoreTransactions, setFirestoreTransactions] = useState<SpendingTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ticket' | 'food' | 'drink' | 'topup' | 'refund'>('all');
  const [selectedTx, setSelectedTx] = useState<SpendingTransaction | null>(null);

  const walletId = currentUser?.id && currentUser.id !== 'guest_user' ? currentUser.id : '';

  // 1. Fetch from Firestore transactions collection
  useEffect(() => {
    if (!walletId) {
      setFirestoreTransactions([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', walletId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: SpendingTransaction[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          list.push({
            id: docSnap.id,
            userId: data.userId || walletId,
            customerId: data.customerId,
            customerName: data.customerName,
            type: data.type || 'food',
            description: data.description || 'Transaction',
            amount: Number(data.amount || 0),
            storeId: data.storeId,
            storeName: data.storeName,
            paymentMethod: data.paymentMethod || 'Wallet',
            status: data.status || 'Paid',
            reference: data.reference,
            timestamp: data.timestamp,
            createdAt: data.createdAt || new Date().toISOString(),
          });
        });
        setFirestoreTransactions(list);
        setLoading(false);
      },
      (error) => {
        console.warn('Error fetching spending transactions:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [walletId]);

  // 2. Synthesize complete transaction history combining Firestore, Tickets, Reservations, and Wallet
  const allTransactions: SpendingTransaction[] = useMemo(() => {
    const combined: SpendingTransaction[] = [...firestoreTransactions];
    const existingIds = new Set(combined.map((t) => t.id));

    // Also load local storage spending transactions
    try {
      const localSpending = JSON.parse(localStorage.getItem('ub_spending_history') || '[]');
      for (const item of localSpending) {
        if (!existingIds.has(item.id)) {
          combined.push({
            id: item.id,
            userId: walletId,
            type: item.type || 'food',
            description: item.description,
            amount: Number(item.amount),
            paymentMethod: item.paymentMethod || 'Wallet',
            status: item.status || 'Paid',
            storeName: item.storeName,
            reference: item.reference,
            timestamp: null,
            createdAt: item.date || new Date().toISOString(),
          });
          existingIds.add(item.id);
        }
      }
    } catch (e) {}

    // Integrate tickets as ticket purchases
    for (const t of tickets) {
      const ticketTxId = `tx-ticket-${t.id}`;
      if (!existingIds.has(ticketTxId)) {
        const priceNum = parseFloat(t.price.replace(/[^\d.]/g, '')) || 0;
        combined.push({
          id: ticketTxId,
          userId: walletId,
          customerId: t.attendeePhone || t.customerPhone,
          customerName: t.attendeeName || t.customerName,
          type: 'ticket',
          description: `Ticket: ${t.eventTitle || t.eventName}`,
          amount: priceNum,
          storeId: t.storeId,
          storeName: t.storeName,
          paymentMethod: 'Wallet',
          status: (t.status === 'valid' || t.status === 'Valid') ? 'Paid' : 'Used',
          reference: t.ticketId || t.bandCode,
          timestamp: null,
          createdAt: t.createdAt || t.purchaseDate || new Date().toISOString(),
        });
        existingIds.add(ticketTxId);
      }
    }

    // Integrate wallet top-ups
    for (const wt of walletTransactions) {
      const wtId = wt.id || `tx-topup-${wt.date}`;
      if (!existingIds.has(wtId)) {
        combined.push({
          id: wtId,
          userId: walletId,
          type: 'topup',
          description: wt.title || 'Wallet Top-Up',
          amount: wt.amount, // positive
          paymentMethod: wt.subtitle?.includes('Card') ? 'Card' : 'OneVoucher',
          status: 'Paid',
          reference: wt.reference,
          timestamp: null,
          createdAt: wt.date.includes('T') ? wt.date : new Date().toISOString(),
        });
        existingIds.add(wtId);
      }
    }

    // Sort descending by date
    combined.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    return combined;
  }, [firestoreTransactions, tickets, walletTransactions, walletId]);

  // 3. Filter by Date & Type
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return allTransactions.filter((tx) => {
      // Type Filter
      if (typeFilter !== 'all') {
        if (typeFilter === 'food' && tx.type !== 'food') return false;
        if (typeFilter === 'drink' && tx.type !== 'drink') return false;
        if (typeFilter === 'ticket' && tx.type !== 'ticket') return false;
        if (typeFilter === 'topup' && tx.type !== 'topup') return false;
        if (typeFilter === 'refund' && tx.type !== 'refund') return false;
      }

      // Date Filter
      if (dateFilter !== 'all') {
        const txTime = new Date(tx.createdAt).getTime();
        if (isNaN(txTime)) return true;

        if (dateFilter === 'today' && txTime < todayStart) return false;
        if (dateFilter === 'week' && txTime < weekStart) return false;
        if (dateFilter === 'month' && txTime < monthStart) return false;
      }

      return true;
    });
  }, [allTransactions, dateFilter, typeFilter]);

  // 4. Calculate Totals (Requirement 2: Total Spent, Total Remaining Balance)
  const totalSpent = useMemo(() => {
    return allTransactions
      .filter((t) => t.type !== 'topup' && t.status !== 'Cancelled' && t.status !== 'Refunded')
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);
  }, [allTransactions]);

  const totalRemainingBalance = currentUser.walletBalance;

  // 5. Export to CSV (Requirement 2)
  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Time',
      'Transaction ID',
      'Type',
      'Description',
      'Venue / Store',
      'Amount (ZAR)',
      'Payment Method',
      'Status',
      'Reference',
    ];

    const rows = filteredTransactions.map((tx) => {
      const dt = new Date(tx.createdAt);
      const datePart = !isNaN(dt.getTime()) ? dt.toLocaleDateString() : 'N/A';
      const timePart = !isNaN(dt.getTime()) ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';

      return [
        `"${datePart}"`,
        `"${timePart}"`,
        `"${tx.id}"`,
        `"${tx.type.toUpperCase()}"`,
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        `"${(tx.storeName || 'Universal Band Hub').replace(/"/g, '""')}"`,
        tx.type === 'topup' ? `+${tx.amount.toFixed(2)}` : `-${tx.amount.toFixed(2)}`,
        `"${tx.paymentMethod}"`,
        `"${tx.status}"`,
        `"${tx.reference || 'N/A'}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `universal_band_spending_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ticket':
        return <TicketIcon className="w-4 h-4 text-[#FACC15]" />;
      case 'food':
        return <Utensils className="w-4 h-4 text-emerald-400" />;
      case 'drink':
        return <Sparkles className="w-4 h-4 text-cyan-400" />;
      case 'topup':
        return <ArrowDownLeft className="w-4 h-4 text-blue-400" />;
      case 'refund':
        return <RotateCcw className="w-4 h-4 text-amber-400" />;
      default:
        return <CreditCard className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Paid':
        return (
          <span className="bg-emerald-950/70 text-emerald-400 border border-emerald-500/30 text-[9px] font-black px-2 py-0.5 rounded-full">
            Paid
          </span>
        );
      case 'Used':
        return (
          <span className="bg-blue-950/70 text-blue-400 border border-blue-500/30 text-[9px] font-black px-2 py-0.5 rounded-full">
            Used
          </span>
        );
      case 'Refunded':
        return (
          <span className="bg-amber-950/70 text-amber-400 border border-amber-500/30 text-[9px] font-black px-2 py-0.5 rounded-full">
            Refunded
          </span>
        );
      case 'Cancelled':
        return (
          <span className="bg-rose-950/70 text-rose-400 border border-rose-500/30 text-[9px] font-black px-2 py-0.5 rounded-full">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="bg-zinc-800 text-gray-300 text-[9px] font-black px-2 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-[#FACC15]" />
            <span>Wallet & Spending</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Full transaction history & balance statement
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1.5 text-xs font-black text-black bg-[#FACC15] hover:bg-yellow-400 active:scale-95 px-3 py-1.5 rounded-xl transition shadow-md cursor-pointer"
          title="Export CSV"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Requirement 2: TOP METRICS (Total Spent & Total Remaining Balance) */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {/* Total Spent Card */}
        <div className="bg-gradient-to-br from-[#1E1E1E] to-[#141414] border border-white/10 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-1 font-semibold">
            <span>TOTAL SPENT</span>
            <ArrowUpRight className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            R{totalSpent.toFixed(2)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Across tickets, food & drinks</p>
        </div>

        {/* Total Remaining Balance Card */}
        <div className="bg-gradient-to-br from-[#1F1C12] to-[#141414] border border-[#FACC15]/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-[#FACC15] text-xs mb-1 font-bold">
            <span>REMAINING BALANCE</span>
            <Wallet className="w-4 h-4 text-[#FACC15]" />
          </div>
          <div className="text-2xl font-black text-[#FACC15] tracking-tight">
            R{totalRemainingBalance.toFixed(2)}
          </div>
          <button
            type="button"
            onClick={() => setActiveModal('wallet')}
            className="text-[10px] font-black text-[#FACC15] hover:underline mt-1 block cursor-pointer"
          >
            + Top Up Wallet
          </button>
        </div>
      </div>

      {/* Every Cent Breakdown Feature Banner */}
      <button
        type="button"
        onClick={() => navigateTo('/every-cent')}
        className="w-full mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-yellow-500/20 via-amber-500/10 to-transparent border border-[#FACC15]/40 hover:border-[#FACC15] flex items-center justify-between text-left transition shadow-lg cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FACC15] text-black flex items-center justify-center font-black shrink-0 shadow-md">
            <PieChart className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-xs font-black text-white group-hover:text-[#FACC15] flex items-center gap-1.5 transition">
              <span>See Where Every Cent Went</span>
              <span className="text-[9px] bg-[#FACC15] text-black px-1.5 py-0.2 rounded font-extrabold">NEW</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Cent-by-cent audit, venue cash flow & category breakdown
            </p>
          </div>
        </div>
        <span className="text-[#FACC15] text-xs font-black group-hover:translate-x-1 transition-transform">➔</span>
      </button>

      {/* Filters (Date filter & Category filter) */}
      <div className="space-y-2 mb-4 bg-[#141414] border border-white/5 rounded-2xl p-3">
        {/* Date Filters */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          <span className="text-[10px] uppercase font-black text-gray-400 flex items-center gap-1 shrink-0 mr-1">
            <Calendar className="w-3 h-3 text-[#FACC15]" />
            <span>Date:</span>
          </span>
          {(['all', 'today', 'week', 'month'] as const).map((df) => (
            <button
              key={df}
              type="button"
              onClick={() => setDateFilter(df)}
              className={`text-[11px] font-black px-2.5 py-1 rounded-lg transition whitespace-nowrap cursor-pointer ${
                dateFilter === df
                  ? 'bg-[#FACC15] text-black shadow'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              {df === 'all' ? 'All Time' : df === 'today' ? 'Today' : df === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>

        {/* Type Filters */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1 border-t border-white/5">
          <span className="text-[10px] uppercase font-black text-gray-400 flex items-center gap-1 shrink-0 mr-1">
            <Filter className="w-3 h-3 text-[#FACC15]" />
            <span>Type:</span>
          </span>
          {(['all', 'ticket', 'food', 'drink', 'topup', 'refund'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTypeFilter(tf)}
              className={`text-[10px] font-black px-2 py-0.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                typeFilter === tf
                  ? 'bg-white text-black shadow'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              {tf === 'all'
                ? 'All'
                : tf === 'ticket'
                ? 'Tickets'
                : tf === 'food'
                ? 'Food'
                : tf === 'drink'
                ? 'Drinks'
                : tf === 'topup'
                ? 'Top-Ups'
                : 'Refunds'}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black uppercase tracking-wider text-gray-400">
            Transactions ({filteredTransactions.length})
          </span>
          <span className="text-[10px] text-gray-500 font-medium">
            Tap item for receipt
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-xs">Loading spending history...</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-8 text-center">
            <Receipt className="w-10 h-10 text-gray-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-white mb-1">No Transactions Found</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto mb-3">
              No transactions match the selected date or category filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setDateFilter('all');
                setTypeFilter('all');
              }}
              className="text-xs font-bold text-[#FACC15] hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredTransactions.map((tx) => {
            const isCredit = tx.type === 'topup' || tx.type === 'refund';
            const dt = new Date(tx.createdAt);
            const dateStr = !isNaN(dt.getTime())
              ? `${dt.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Recent';

            return (
              <div
                key={tx.id}
                onClick={() => setSelectedTx(tx)}
                className="bg-[#141414] hover:bg-[#1A1A1A] border border-white/5 hover:border-white/15 rounded-2xl p-3.5 transition cursor-pointer flex items-center justify-between gap-3 shadow-md group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    {getTypeIcon(tx.type)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-white truncate group-hover:text-[#FACC15] transition">
                      {tx.description}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span className="font-semibold text-gray-300">{tx.paymentMethod}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`text-sm font-black ${
                      isCredit ? 'text-emerald-400' : 'text-white'
                    }`}
                  >
                    {isCredit ? `+R${tx.amount.toFixed(2)}` : `-R${tx.amount.toFixed(2)}`}
                  </div>
                  <div className="mt-0.5">{getStatusBadge(tx.status)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Transaction Details Modal Receipt */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-white animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-black text-[#FACC15] uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-4 h-4" />
                <span>Transaction Receipt</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center mb-2">
                {getTypeIcon(selectedTx.type)}
              </div>
              <h3 className="text-base font-black text-white">{selectedTx.description}</h3>
              <div className="text-2xl font-black text-[#FACC15] mt-1">
                {selectedTx.type === 'topup' ? `+R${selectedTx.amount.toFixed(2)}` : `-R${selectedTx.amount.toFixed(2)}`}
              </div>
            </div>

            <div className="bg-black/50 rounded-2xl p-3.5 border border-white/5 space-y-2 text-xs font-mono mb-4">
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Payment Method:</span>
                <span className="text-white font-bold">{selectedTx.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Status:</span>
                <span className="text-emerald-400 font-bold uppercase">{selectedTx.status}</span>
              </div>
              {selectedTx.storeName && (
                <div className="flex justify-between">
                  <span className="text-gray-400 font-sans">Venue:</span>
                  <span className="text-white font-bold">{selectedTx.storeName}</span>
                </div>
              )}
              {selectedTx.reference && (
                <div className="flex justify-between">
                  <span className="text-gray-400 font-sans">Reference:</span>
                  <span className="text-[#FACC15] font-bold">{selectedTx.reference}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Date:</span>
                <span className="text-gray-300">
                  {new Date(selectedTx.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedTx(null)}
              className="w-full py-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs transition cursor-pointer shadow"
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
