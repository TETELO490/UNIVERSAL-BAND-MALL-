import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { searchCustomerByIdOrPhone, VerifiedCustomerProfile } from '../utils/customerDirectory';
import {
  ShieldCheck,
  User,
  Radio,
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Ticket as TicketIcon,
  Utensils,
  CreditCard,
  MapPin,
} from 'lucide-react';

export const CustomerProfileViewPage: React.FC = () => {
  const { currentRoute, navigateTo, tickets } = useApp();
  const [customer, setCustomer] = useState<VerifiedCustomerProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Extract ID from route: e.g. /customer/9804155123088
  const customerIdParam = currentRoute.replace('/customer/', '').replace('/customer', '');

  useEffect(() => {
    const fetchProfile = async () => {
      const cleanParam = customerIdParam.trim();
      if (!cleanParam) {
        setCustomer(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await searchCustomerByIdOrPhone(cleanParam);
      setCustomer(res);
      setLoading(false);
    };
    fetchProfile();
  }, [customerIdParam]);

  const customerTickets = tickets.filter(
    (t) =>
      (customer?.phone && (t.attendeePhone === customer.phone || t.customerPhone === customer.phone)) ||
      t.userId === customer?.id ||
      t.attendeeName === customer?.fullName
  );

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
          <span>Home</span>
        </button>

        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 rounded-full flex items-center gap-1">
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span>NFC Band Verified</span>
        </span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-xs">Reading NFC Band credentials...</div>
      ) : !customer ? (
        <div className="bg-[#141414] border border-white/10 rounded-3xl p-8 text-center space-y-3">
          <User className="w-12 h-12 text-gray-600 mx-auto" />
          <h3 className="text-base font-bold text-white">Customer Record Not Found</h3>
          <p className="text-xs text-gray-400">
            No profile matches ID: <span className="font-mono text-[#FACC15]">{customerIdParam}</span>
          </p>
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="px-4 py-2 bg-[#FACC15] text-black font-black text-xs rounded-xl"
          >
            Return to Discovery
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Verified Customer Card */}
          <div className="bg-gradient-to-b from-[#1C1C1C] to-[#121212] border-2 border-[#FACC15] rounded-3xl p-5 shadow-2xl text-center relative overflow-hidden">
            <div className="w-24 h-24 rounded-full mx-auto p-1 border-2 border-[#FACC15] relative shadow-xl mb-3 bg-[#242424] flex items-center justify-center">
              {customer.photo ? (
                <img
                  src={customer.photo}
                  alt={customer.fullName}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="text-3xl font-black text-[#FACC15]">
                  {(customer.fullName || 'C').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="absolute -bottom-1 -right-1 bg-[#FACC15] text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow">
                VERIFIED
              </div>
            </div>

            <h2 className="text-xl font-black text-white">{customer.fullName}</h2>
            <div className="inline-block mt-1 font-mono text-sm font-bold text-[#FACC15] bg-[#FACC15]/10 px-3 py-0.5 rounded-full border border-[#FACC15]/30">
              ID: {customer.idNumber}
            </div>

            <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 my-4 space-y-1.5 text-xs text-left font-mono">
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Role:</span>
                <span className="text-white font-bold">{customer.role || 'Event Customer'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Phone:</span>
                <span className="text-white font-bold">{customer.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-sans">Unique Account ID:</span>
                <span className="text-emerald-400 font-bold">{customer.id}</span>
              </div>
            </div>

            {customer.customerQrId && (
              <div className="bg-black/40 border border-[#FACC15]/25 rounded-xl py-2 px-3 my-1 text-center">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 block">Customer ONE QR ID</span>
                <span className="text-xs font-mono font-bold text-[#FACC15]">{customer.customerQrId}</span>
              </div>
            )}
          </div>

          {/* Quick Action to write NFC or manage */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => navigateTo('/admin/write-nfc')}
              className="py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>NFC Writer</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/history')}
              className="py-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <span>Spending History</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
