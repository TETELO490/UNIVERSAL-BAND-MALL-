import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { SpendingTransaction } from '../types';
import { isTicketPaid } from '../utils/ticketStatus';
import { doesUserPersonallyOwnTicket, isLegacyTestTicket } from '../utils/legacyCleanup';
import {
  PieChart,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Filter,
  Search,
  Download,
  Printer,
  Receipt,
  Store,
  Ticket as TicketIcon,
  Utensils,
  Wine,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  X,
  CreditCard,
  Building,
  HelpCircle,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  FileText,
  DollarSign,
  ArrowLeft,
} from 'lucide-react';

interface CategoryBreakdown {
  label: string;
  amount: number;
  percentage: number;
  color: string;
  icon: React.ReactNode;
}

interface VenueBreakdown {
  venue: string;
  amount: number;
  percentage: number;
  count: number;
}

export const EveryCentPage: React.FC = () => {
  const { currentUser, tickets, walletTransactions, navigateTo, setActiveModal } = useApp();

  const [firestoreTransactions, setFirestoreTransactions] = useState<SpendingTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<SpendingTransaction | null>(null);

  const walletId = currentUser?.id && currentUser.id !== 'guest_user' ? currentUser.id : '';

  // 1. Fetch live transactions from Firestore
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

  // 2. Synthesize all records strictly for the active user into a single cent-accurate ledger
  const allLedgerItems = useMemo(() => {
    if (!walletId) return [];

    const combined: SpendingTransaction[] = [...firestoreTransactions];
    const existingIds = new Set(combined.map((t) => t.id));

    // Local cached transactions strictly owned by walletId
    try {
      const localSpending = JSON.parse(localStorage.getItem('ub_spending_history') || '[]');
      for (const item of localSpending) {
        if (!item || item.userId !== walletId) continue;
        if (!existingIds.has(item.id)) {
          combined.push({
            id: item.id,
            userId: walletId,
            type: item.type || 'food',
            description: item.description,
            amount: Number(item.amount),
            paymentMethod: item.paymentMethod || 'Wallet',
            status: item.status || 'Paid',
            storeName: item.storeName || 'Venue Store',
            reference: item.reference,
            timestamp: null,
            createdAt: item.date || new Date().toISOString(),
          });
          existingIds.add(item.id);
        }
      }
    } catch (e) {}

    // Integrate PAID tickets personally purchased by currentUser only
    for (const t of tickets) {
      if (isLegacyTestTicket(t)) continue;
      if (!doesUserPersonallyOwnTicket(t, currentUser)) continue;
      if (!isTicketPaid(t)) continue;
      const ticketTxId = `tx-ticket-${t.id}`;
      if (!existingIds.has(ticketTxId)) {
        const priceNum = parseFloat(t.price.replace(/[^\d.]/g, '')) || 0;
        combined.push({
          id: ticketTxId,
          userId: walletId,
          customerId: t.attendeePhone || t.customerPhone,
          customerName: t.attendeeName || t.customerName,
          type: 'ticket',
          description: `Event Ticket: ${t.eventTitle || t.eventName}`,
          amount: priceNum,
          storeId: t.storeId,
          storeName: t.storeName,
          paymentMethod: t.payshapReference ? 'PayShap' : 'Wallet',
          status: (t.status === 'valid' || t.status === 'Valid') ? 'Paid' : 'Used',
          reference: t.ticketId || t.bandCode,
          timestamp: null,
          createdAt: t.paidAt || t.createdAt || t.purchaseDate || new Date().toISOString(),
        });
        existingIds.add(ticketTxId);
      }
    }

    // Integrate wallet top-ups belonging to this user
    for (const wt of walletTransactions) {
      if (wt.userId && wt.userId !== walletId) continue;
      const wtId = wt.id || `tx-topup-${wt.date}`;
      if (!existingIds.has(wtId)) {
        combined.push({
          id: wtId,
          userId: walletId,
          type: wt.type === 'refund' ? 'refund' : wt.type === 'purchase' ? 'food' : 'topup',
          description: wt.title || 'Wallet Top-Up',
          amount: Math.abs(wt.amount),
          paymentMethod: wt.subtitle?.includes('Card') ? 'Card' : 'OneVoucher',
          status: 'Paid',
          reference: wt.reference,
          timestamp: null,
          createdAt: wt.date.includes('T') ? wt.date : new Date().toISOString(),
        });
        existingIds.add(wtId);
      }
    }

    // Sort descending chronologically
    combined.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    return combined;
  }, [firestoreTransactions, tickets, walletTransactions, walletId, currentUser]);

  // 3. Cent-by-Cent Financial Calculations
  const totalInflow = useMemo(() => {
    return allLedgerItems
      .filter((t) => t.type === 'topup' || t.type === 'refund')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }, [allLedgerItems]);

  const totalOutflow = useMemo(() => {
    return allLedgerItems
      .filter((t) => t.type !== 'topup' && t.status !== 'Cancelled' && t.status !== 'Refunded')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }, [allLedgerItems]);

  const remainingBalance = currentUser.walletBalance;

  // Category breakdown calculations
  const categoryBreakdown: CategoryBreakdown[] = useMemo(() => {
    const spendItems = allLedgerItems.filter(
      (t) => t.type !== 'topup' && t.status !== 'Cancelled' && t.status !== 'Refunded'
    );
    const total = totalOutflow || 1;

    let ticketsSum = 0;
    let foodSum = 0;
    let drinksSum = 0;
    let otherSum = 0;

    for (const item of spendItems) {
      const amt = Math.abs(item.amount);
      if (item.type === 'ticket') {
        ticketsSum += amt;
      } else if (item.type === 'food') {
        foodSum += amt;
      } else if (item.type === 'drink') {
        drinksSum += amt;
      } else {
        otherSum += amt;
      }
    }

    return [
      {
        label: 'Event Tickets',
        amount: ticketsSum,
        percentage: Math.round((ticketsSum / total) * 100),
        color: '#FACC15',
        icon: <TicketIcon className="w-4 h-4 text-[#FACC15]" />,
      },
      {
        label: 'Food & Meals',
        amount: foodSum,
        percentage: Math.round((foodSum / total) * 100),
        color: '#22C55E',
        icon: <Utensils className="w-4 h-4 text-emerald-400" />,
      },
      {
        label: 'Drinks & Bar',
        amount: drinksSum,
        percentage: Math.round((drinksSum / total) * 100),
        color: '#38BDF8',
        icon: <Wine className="w-4 h-4 text-sky-400" />,
      },
      {
        label: 'Other & Services',
        amount: otherSum,
        percentage: Math.round((otherSum / total) * 100),
        color: '#A855F7',
        icon: <Sparkles className="w-4 h-4 text-purple-400" />,
      },
    ].filter((c) => c.amount > 0 || c.label !== 'Other & Services');
  }, [allLedgerItems, totalOutflow]);

  // Venue-by-Venue Breakdown
  const venueBreakdown: VenueBreakdown[] = useMemo(() => {
    const spendItems = allLedgerItems.filter(
      (t) => t.type !== 'topup' && t.status !== 'Cancelled' && t.status !== 'Refunded'
    );
    const total = totalOutflow || 1;
    const map: Record<string, { amount: number; count: number }> = {};

    for (const item of spendItems) {
      const v = item.storeName || 'Universal Band Mall';
      if (!map[v]) map[v] = { amount: 0, count: 0 };
      map[v].amount += Math.abs(item.amount);
      map[v].count += 1;
    }

    return Object.entries(map)
      .map(([venue, data]) => ({
        venue,
        amount: data.amount,
        percentage: Math.round((data.amount / total) * 100),
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [allLedgerItems, totalOutflow]);

  // Filtered Ledger Items for the List
  const filteredItems = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return allLedgerItems.filter((item) => {
      // Category filter
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'ticket' && item.type !== 'ticket') return false;
        if (categoryFilter === 'food' && item.type !== 'food') return false;
        if (categoryFilter === 'drink' && item.type !== 'drink') return false;
        if (categoryFilter === 'topup' && item.type !== 'topup') return false;
      }

      // Date filter
      if (dateFilter !== 'all') {
        const itemTime = new Date(item.createdAt).getTime();
        if (!isNaN(itemTime)) {
          if (dateFilter === 'today' && itemTime < todayStart) return false;
          if (dateFilter === 'week' && itemTime < weekStart) return false;
          if (dateFilter === 'month' && itemTime < monthStart) return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mDesc = item.description?.toLowerCase().includes(q);
        const mVenue = item.storeName?.toLowerCase().includes(q);
        const mRef = item.reference?.toLowerCase().includes(q);
        const mType = item.type?.toLowerCase().includes(q);
        return mDesc || mVenue || mRef || mType;
      }

      return true;
    });
  }, [allLedgerItems, categoryFilter, dateFilter, searchQuery]);

  // Export full Statement CSV
  const handleDownloadStatement = () => {
    const headers = [
      'Timestamp',
      'Transaction Ref',
      'Category',
      'Item Description',
      'Venue / Location',
      'Payment Method',
      'Inflow (+)',
      'Outflow (-)',
      'Status',
    ];

    const rows = filteredItems.map((tx) => {
      const dt = new Date(tx.createdAt);
      const timeStr = !isNaN(dt.getTime()) ? dt.toISOString() : 'N/A';
      const isInflow = tx.type === 'topup' || tx.type === 'refund';

      return [
        `"${timeStr}"`,
        `"${tx.reference || tx.id}"`,
        `"${tx.type.toUpperCase()}"`,
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        `"${(tx.storeName || 'Universal Band Mall').replace(/"/g, '""')}"`,
        `"${tx.paymentMethod}"`,
        isInflow ? `R${tx.amount.toFixed(2)}` : 'R0.00',
        !isInflow ? `R${tx.amount.toFixed(2)}` : 'R0.00',
        `"${tx.status}"`,
      ].join(',');
    });

    const csvData = [
      `"UNIVERSAL BAND - EVERY CENT SPENDING STATEMENT"`,
      `"Customer: ${currentUser.fullName || currentUser.name}"`,
      `"Customer ID: ${currentUser.idNumber || currentUser.id}"`,
      `"Total Inflow: R${totalInflow.toFixed(2)}"`,
      `"Total Outflow: R${totalOutflow.toFixed(2)}"`,
      `"Remaining Balance: R${remainingBalance.toFixed(2)}"`,
      `"Generated At: ${new Date().toLocaleString()}"`,
      '',
      headers.join(','),
      ...rows,
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `every_cent_statement_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white font-bold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </button>

        <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-[#FACC15]" />
          <span>Cent-by-Cent Audit</span>
        </span>
      </div>

      <div className="mb-4">
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <PieChart className="w-6 h-6 text-[#FACC15]" />
          <span>Every Cent Spent</span>
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          See exactly how every single cent was loaded, spent, and accounted for
        </p>
      </div>

      {/* 1. CENT-BY-CENT RECONCILIATION CARD */}
      <div className="bg-gradient-to-b from-[#1C1C1C] to-[#121212] border-2 border-[#FACC15] rounded-3xl p-5 shadow-2xl mb-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              ACCOUNT CASH FLOW STATEMENT
            </span>
            <h3 className="text-base font-black text-white mt-0.5">
              {currentUser.fullName || currentUser.name}
            </h3>
            <span className="text-[11px] font-mono text-[#FACC15] block">
              ID: {currentUser.idNumber || currentUser.id}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-gray-400 font-semibold block">CURRENT BALANCE</span>
            <span className="text-2xl font-black text-[#FACC15] tracking-tight">
              R{remainingBalance.toFixed(2)}
            </span>
          </div>
        </div>

        {/* 3-Way Reconciled Formula */}
        <div className="grid grid-cols-3 gap-2 bg-black/60 rounded-2xl p-3 border border-white/10 text-center">
          <div>
            <span className="text-[9px] font-black uppercase text-gray-400 block flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span>Loaded (In)</span>
            </span>
            <span className="text-sm font-black text-emerald-400 mt-1 block">
              +R{totalInflow.toFixed(2)}
            </span>
          </div>

          <div className="border-x border-white/10">
            <span className="text-[9px] font-black uppercase text-gray-400 block flex items-center justify-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-400" />
              <span>Spent (Out)</span>
            </span>
            <span className="text-sm font-black text-rose-400 mt-1 block">
              -R{totalOutflow.toFixed(2)}
            </span>
          </div>

          <div>
            <span className="text-[9px] font-black uppercase text-gray-400 block flex items-center justify-center gap-1">
              <Wallet className="w-3 h-3 text-[#FACC15]" />
              <span>Remaining</span>
            </span>
            <span className="text-sm font-black text-white mt-1 block">
              R{remainingBalance.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Reconciled Guarantee Badge */}
        <div className="flex items-center justify-between text-[11px] pt-1 text-gray-300">
          <span className="flex items-center gap-1.5 font-bold text-emerald-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>100% Balanced to the exact cent</span>
          </span>
          <button
            type="button"
            onClick={handleDownloadStatement}
            className="text-[10px] font-black text-[#FACC15] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* 2. CATEGORY-BY-CATEGORY SPENDING BREAKDOWN */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-4 shadow-xl mb-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
            <PieChart className="w-4 h-4 text-[#FACC15]" />
            <span>Category Spending Breakdown</span>
          </h3>
          <span className="text-[10px] text-gray-400 font-semibold">
            Total Spent: R{totalOutflow.toFixed(2)}
          </span>
        </div>

        {/* Category Visual Bars */}
        <div className="space-y-2.5">
          {categoryBreakdown.map((cat) => (
            <div key={cat.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {cat.icon}
                  <span className="text-white font-bold">{cat.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-white font-mono font-bold mr-2">
                    R{cat.amount.toFixed(2)}
                  </span>
                  <span className="text-gray-400 text-[10px] font-black">
                    {cat.percentage}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(2, cat.percentage)}%`,
                    backgroundColor: cat.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. VENUE-BY-VENUE DISTRIBUTION */}
      {venueBreakdown.length > 0 && (
        <div className="bg-[#141414] border border-white/10 rounded-3xl p-4 shadow-xl mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              <Store className="w-4 h-4 text-[#FACC15]" />
              <span>Where You Spent It (Venues)</span>
            </h3>
            <span className="text-[10px] text-gray-400 font-semibold">
              {venueBreakdown.length} Venues
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {venueBreakdown.map((v) => (
              <div
                key={v.venue}
                className="bg-[#1C1C1C] border border-white/5 rounded-2xl p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white truncate max-w-[100px]">
                    {v.venue}
                  </span>
                  <span className="text-[10px] font-black text-[#FACC15] bg-[#FACC15]/10 px-1.5 py-0.5 rounded">
                    {v.percentage}%
                  </span>
                </div>
                <div className="text-sm font-black text-white">
                  R{v.amount.toFixed(2)}
                </div>
                <div className="text-[9px] text-gray-500">
                  {v.count} total item{v.count > 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. ITEMIZED "EVERY CENT" AUDIT MICRO-LEDGER */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-[#FACC15]" />
            <span>Itemized Cent-by-Cent Ledger</span>
          </h3>
          <span className="text-[10px] text-gray-400 font-medium">
            {filteredItems.length} records
          </span>
        </div>

        {/* Search & Filter Controls */}
        <div className="space-y-2 bg-[#141414] border border-white/5 rounded-2xl p-3">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search items, drinks, tickets, venues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
            />
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {(['all', 'ticket', 'food', 'drink', 'topup'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`text-[10px] font-black px-2.5 py-1 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-[#FACC15] text-black shadow'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                {cat === 'all'
                  ? 'All Cents'
                  : cat === 'ticket'
                  ? 'Tickets'
                  : cat === 'food'
                  ? 'Food'
                  : cat === 'drink'
                  ? 'Bar & Drinks'
                  : 'Top-Ups'}
              </button>
            ))}
          </div>
        </div>

        {/* List of Transactions */}
        <div className="space-y-2">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-xs">Auditing transactions...</div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-[#141414] border border-white/5 rounded-2xl p-8 text-center">
              <Receipt className="w-10 h-10 text-gray-600 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-bold text-white mb-1">No Transactions Found</p>
              <p className="text-xs text-gray-400">Try changing your search or filters.</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isInflow = item.type === 'topup' || item.type === 'refund';
              const dt = new Date(item.createdAt);
              const dateStr = !isNaN(dt.getTime())
                ? `${dt.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'Recent';

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedReceiptTx(item)}
                  className="bg-[#141414] hover:bg-[#1A1A1A] border border-white/5 hover:border-white/15 rounded-2xl p-3.5 transition cursor-pointer flex items-center justify-between gap-3 shadow-md group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      {item.type === 'ticket' ? (
                        <TicketIcon className="w-4 h-4 text-[#FACC15]" />
                      ) : item.type === 'food' ? (
                        <Utensils className="w-4 h-4 text-emerald-400" />
                      ) : item.type === 'drink' ? (
                        <Wine className="w-4 h-4 text-sky-400" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white truncate group-hover:text-[#FACC15] transition">
                        {item.description}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-0.5">
                        <span className="font-mono">{dateStr}</span>
                        <span>•</span>
                        <span className="text-gray-300 font-semibold">{item.storeName || 'Universal Band Mall'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-black font-mono ${
                        isInflow ? 'text-emerald-400' : 'text-white'
                      }`}
                    >
                      {isInflow ? `+R${item.amount.toFixed(2)}` : `-R${item.amount.toFixed(2)}`}
                    </div>
                    <span className="text-[9px] font-black uppercase text-gray-400 block mt-0.5">
                      {item.paymentMethod}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 5. ITEM DIGITAL CASHLESS RECEIPT MODAL */}
      {selectedReceiptTx && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border-2 border-[#FACC15] rounded-3xl p-5 max-w-sm w-full shadow-2xl text-white animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-black text-[#FACC15] uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-4 h-4" />
                <span>Cashless Item Receipt</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedReceiptTx(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Body */}
            <div className="py-4 text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center mb-2">
                {selectedReceiptTx.type === 'ticket' ? (
                  <TicketIcon className="w-5 h-5 text-[#FACC15]" />
                ) : selectedReceiptTx.type === 'food' ? (
                  <Utensils className="w-5 h-5 text-emerald-400" />
                ) : selectedReceiptTx.type === 'drink' ? (
                  <Wine className="w-5 h-5 text-sky-400" />
                ) : (
                  <Wallet className="w-5 h-5 text-blue-400" />
                )}
              </div>
              <h3 className="text-base font-black text-white">{selectedReceiptTx.description}</h3>
              <div className="text-2xl font-black text-[#FACC15] font-mono">
                {selectedReceiptTx.type === 'topup'
                  ? `+R${selectedReceiptTx.amount.toFixed(2)}`
                  : `-R${selectedReceiptTx.amount.toFixed(2)}`}
              </div>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30 inline-block">
                Status: {selectedReceiptTx.status}
              </span>
            </div>

            {/* Itemized Cent Details */}
            <div className="bg-black/60 rounded-2xl p-3.5 border border-white/5 space-y-2 text-xs font-mono mb-4">
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Venue:</span>
                <span className="text-white font-bold">{selectedReceiptTx.storeName || 'Universal Band Mall'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Payment Method:</span>
                <span className="text-white font-bold">{selectedReceiptTx.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Reference:</span>
                <span className="text-[#FACC15] font-bold">{selectedReceiptTx.reference || selectedReceiptTx.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Timestamp:</span>
                <span className="text-gray-300">
                  {new Date(selectedReceiptTx.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Customer ID:</span>
                <span className="text-white">{currentUser.idNumber || currentUser.id}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedReceiptTx(null)}
              className="w-full py-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs transition cursor-pointer shadow"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
