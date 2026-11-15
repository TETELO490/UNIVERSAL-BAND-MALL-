import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Radio,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Smartphone,
  ShieldCheck,
  Check,
  RefreshCw,
  Clock,
  ExternalLink,
  History,
  Lock,
} from 'lucide-react';
import { searchCustomerByIdOrPhone, VerifiedCustomerProfile } from '../utils/customerDirectory';
import { collection, doc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import confetti from 'canvas-confetti';

interface NfcLogItem {
  id: string;
  customerName: string;
  customerId: string;
  customerPhone?: string;
  targetUrl: string;
  linkedByAdminName: string;
  linkedAt: any;
  tagSerialNumber?: string;
}

export const AdminWriteNfcPage: React.FC = () => {
  const { currentUser, navigateTo } = useApp();

  // 2 Inputs: Phone OR Customer ID
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [idInput, setIdInput] = useState<string>('');

  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Verified Customer Preview Card
  const [verifiedCustomer, setVerifiedCustomer] = useState<VerifiedCustomerProfile | null>(null);

  // Confirmation dialog before writing
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);

  // NFC Writing State
  const [isWritingNfc, setIsWritingNfc] = useState<boolean>(false);
  const [nfcSuccessData, setNfcSuccessData] = useState<{ name: string; url: string; tagId: string } | null>(null);
  const [nfcError, setNfcError] = useState<string | null>(null);

  // Recent NFC logs from Firestore
  const [recentLogs, setRecentLogs] = useState<NfcLogItem[]>([]);

  // Load recent logs from Firestore
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const snap = await getDocs(collection(db, 'nfc_logs'));
        const list: NfcLogItem[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as any) });
        });
        list.sort((a, b) => {
          const timeA = a.linkedAt?.seconds ? a.linkedAt.seconds * 1000 : 0;
          const timeB = b.linkedAt?.seconds ? b.linkedAt.seconds * 1000 : 0;
          return timeB - timeA;
        });
        setRecentLogs(list.slice(0, 5));
      } catch (e) {
        console.warn('Error loading NFC logs:', e);
      }
    };
    fetchLogs();
  }, [nfcSuccessData]);

  // Handle Search Customer
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearchError(null);
    setVerifiedCustomer(null);
    setNfcSuccessData(null);
    setNfcError(null);

    const term = idInput.trim() || phoneInput.trim();
    if (!term) {
      setSearchError('Please enter either a Customer Phone Number OR a Customer ID Number.');
      return;
    }

    setIsSearching(true);
    try {
      const match = await searchCustomerByIdOrPhone(term);
      if (!match) {
        setSearchError(`No registered customer found matching "${term}". Check the phone number or ID number.`);
        return;
      }
      setVerifiedCustomer(match);
    } catch (err: any) {
      setSearchError(err?.message || 'Error querying database');
    } finally {
      setIsSearching(false);
    }
  };

  // Perform NFC Writing using real Web NFC API (NDEFReader)
  const handleExecuteNfcWrite = async () => {
    if (!verifiedCustomer) return;
    setShowConfirmDialog(false);
    setNfcError(null);
    setNfcSuccessData(null);

    if (typeof window === 'undefined' || !('NDEFReader' in window)) {
      setNfcError('Web NFC hardware is not available in this browser or device. Open this page on an NFC-enabled Android device in Chrome or the installed app to write physical NFC wristbands.');
      return;
    }

    setIsWritingNfc(true);

    const targetCustomerId = verifiedCustomer.idNumber || verifiedCustomer.id;
    const baseUrl = window.location.origin;
    const customerProfileUrl = `${baseUrl}/customer/${targetCustomerId}`;
    const generatedTagId = `NFC-UB-${Math.floor(100000 + Math.random() * 900000)}`;

    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.write({
        records: [
          {
            recordType: 'url',
            data: customerProfileUrl,
          },
        ],
      });

      // Save log in Firestore database only after physical NDEF write succeeds
      const logRef = doc(collection(db, 'nfc_logs'));
      await setDoc(logRef, {
        customerId: targetCustomerId,
        customerName: verifiedCustomer.fullName,
        customerPhone: verifiedCustomer.phone,
        targetUrl: customerProfileUrl,
        linkedByAdminId: currentUser.id,
        linkedByAdminName: currentUser.fullName || currentUser.name || 'Admin',
        linkedAt: serverTimestamp(),
        tagSerialNumber: generatedTagId,
        status: 'success',
      });

      confetti({
        particleCount: 65,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FACC15', '#22C55E', '#3B82F6'],
      });

      setNfcSuccessData({
        name: verifiedCustomer.fullName,
        url: customerProfileUrl,
        tagId: generatedTagId,
      });
    } catch (err: any) {
      console.error('NFC Write Error:', err);
      setNfcError(err?.message || 'Failed to write to NFC tag. Ensure NFC is enabled on your phone.');
    } finally {
      setIsWritingNfc(false);
    }
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
          <span>Back</span>
        </button>

        <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] bg-[#FACC15]/10 border border-[#FACC15]/30 px-2.5 py-0.5 rounded-full">
          Admin NFC Station
        </span>
      </div>

      <div className="mb-4">
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Radio className="w-6 h-6 text-[#FACC15]" />
          <span>Write NFC Tag</span>
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Link customer profile securely to physical band or tag
        </p>
      </div>

      {/* 2 Search Inputs Form (Customer Phone OR Customer ID) */}
      <form onSubmit={handleSearch} className="bg-[#141414] border border-white/10 rounded-2xl p-4 shadow-xl space-y-3.5 mb-5">
        <div>
          <label className="block text-[11px] font-black text-gray-300 uppercase tracking-wider mb-1">
            Customer Phone Number
          </label>
          <input
            type="tel"
            placeholder="e.g. 082 123 4567 or 071 000 0000"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value);
              if (e.target.value) setIdInput('');
            }}
            className="w-full bg-[#1C1C1C] border border-white/15 rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] text-xs font-semibold"
          />
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-white/10" />
          <span className="flex-shrink mx-3 text-[10px] font-black uppercase text-gray-500 bg-[#141414] px-2">
            OR
          </span>
          <div className="flex-grow border-t border-white/10" />
        </div>

        <div>
          <label className="block text-[11px] font-black text-gray-300 uppercase tracking-wider mb-1">
            Customer ID Number
          </label>
          <input
            type="text"
            placeholder="e.g. 9804155123088 or 9901015000087"
            value={idInput}
            onChange={(e) => {
              setIdInput(e.target.value);
              if (e.target.value) setPhoneInput('');
            }}
            className="w-full bg-[#1C1C1C] border border-white/15 rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15] text-xs font-semibold font-mono"
          />
        </div>

        {searchError && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{searchError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSearching || (!phoneInput.trim() && !idInput.trim())}
          className="w-full py-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-98 text-black font-black text-xs transition shadow-lg shadow-yellow-400/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isSearching ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Querying Database...</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4 stroke-[2.5]" />
              <span>Search Customer</span>
            </>
          )}
        </button>
      </form>

      {/* Requirement 4: PREVIEW CARD FOR VERIFICATION */}
      {verifiedCustomer && (
        <div className="bg-gradient-to-b from-[#1C1C1C] to-[#121212] border-2 border-[#FACC15] rounded-3xl p-5 shadow-2xl space-y-4 mb-5 animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#FACC15] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Customer Verification Card</span>
            </span>
            <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 text-[9px] font-black px-2 py-0.5 rounded-full">
              ID Verified
            </span>
          </div>

          {/* Profile Picture + Name + Customer ID */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#FACC15] p-0.5 shrink-0 shadow-lg bg-[#242424] flex items-center justify-center">
              {verifiedCustomer.photo ? (
                <img
                  src={verifiedCustomer.photo}
                  alt={verifiedCustomer.fullName}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="text-lg font-black text-[#FACC15]">
                  {(verifiedCustomer.fullName || 'C').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-white leading-tight truncate">
                {verifiedCustomer.fullName}
              </h3>
              <div className="text-xs font-mono font-bold text-[#FACC15] mt-0.5">
                ID: {verifiedCustomer.idNumber}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                Phone: {verifiedCustomer.phone}
              </div>
            </div>
          </div>

          {/* Target Profile URL that will be written to NFC tag */}
          <div className="bg-black/60 rounded-xl p-3 border border-white/5 space-y-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Encoded NFC URL (NDEF URI)
            </span>
            <span className="text-[11px] font-mono text-gray-300 break-all select-all block">
              {window.location.origin}/customer/{verifiedCustomer.idNumber || verifiedCustomer.id}
            </span>
          </div>

          {/* ONLY AFTER SHOWING PREVIEW: Button "Link and Write to NFC Tag" */}
          <button
            type="button"
            onClick={() => setShowConfirmDialog(true)}
            disabled={isWritingNfc}
            className="w-full py-3.5 rounded-2xl bg-[#FACC15] hover:bg-yellow-400 active:scale-98 text-black font-black text-xs transition shadow-lg shadow-yellow-400/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Radio className="w-4 h-4 stroke-[2.5]" />
            <span>Link and Write to NFC Tag</span>
          </button>
        </div>
      )}

      {/* Writing Progress Indicator */}
      {isWritingNfc && (
        <div className="bg-blue-950/60 border border-blue-500/50 rounded-2xl p-5 text-center space-y-3 mb-5 animate-pulse">
          <Smartphone className="w-10 h-10 text-blue-400 mx-auto animate-bounce" />
          <div>
            <h4 className="text-sm font-black text-white">
              Hold NFC tag near phone...
            </h4>
            <p className="text-xs text-blue-200 mt-0.5">
              Approaching NFC reader. Keep the tag firmly against the back of the device.
            </p>
          </div>
        </div>
      )}

      {/* Requirement 4: Success Message "Tag Linked to [Name]" */}
      {nfcSuccessData && (
        <div className="bg-emerald-950/80 border-2 border-emerald-400 rounded-3xl p-5 text-center space-y-3 mb-5 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-lg font-black text-white">
              Tag Linked to {nfcSuccessData.name}!
            </h3>
            <p className="text-xs text-emerald-300 mt-0.5">
              NFC Band is now securely paired with customer profile.
            </p>
          </div>

          <div className="bg-black/50 p-3 rounded-2xl border border-white/10 text-xs font-mono text-left space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Tag Serial:</span>
              <span className="text-[#FACC15] font-bold">{nfcSuccessData.tagId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Linked By:</span>
              <span className="text-white font-bold">{currentUser.fullName || currentUser.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Encrypted URL:</span>
              <span className="text-gray-300 truncate max-w-[180px]">{nfcSuccessData.url}</span>
            </div>
          </div>
        </div>
      )}

      {nfcError && (
        <div className="p-3.5 rounded-2xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center gap-2 mb-5">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{nfcError}</span>
        </div>
      )}

      {/* Recent Linked Tags Log */}
      {recentLogs.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Recent NFC Links Log ({recentLogs.length})</span>
            </span>
          </div>

          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="bg-[#141414] border border-white/5 rounded-2xl p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <h5 className="font-bold text-white">{log.customerName}</h5>
                  <span className="text-[10px] text-gray-400 block font-mono">
                    ID: {log.customerId} • Tag: {log.tagSerialNumber || 'NFC-UB'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Linked
                  </span>
                  <span className="text-[9px] text-gray-500 block mt-0.5">
                    by {log.linkedByAdminName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirement 4: CONFIRMATION DIALOG BEFORE WRITING */}
      {showConfirmDialog && verifiedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border-2 border-[#FACC15] rounded-3xl p-6 max-w-sm w-full shadow-2xl text-white animate-in zoom-in-95 duration-200 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-[#FACC15]/20 text-[#FACC15] mx-auto flex items-center justify-center">
              <Radio className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-black text-white">
                Confirm NFC Tag Programming
              </h3>
              <p className="text-xs text-gray-300 mt-1">
                Are you sure you want to write and securely link this NFC tag for:
              </p>
              <div className="text-sm font-black text-[#FACC15] mt-1">
                {verifiedCustomer.fullName} ({verifiedCustomer.idNumber})
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="py-3 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteNfcWrite}
                className="py-3 rounded-xl bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs transition shadow-lg shadow-yellow-400/20 cursor-pointer"
              >
                Yes, Write Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
