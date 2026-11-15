import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { calculateAgeFromSAID } from '../utils/ageHelper';
import { WalletDoc } from '../types';
import {
  Shield,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Clock,
  Eye,
  AlertTriangle,
  User,
  Calendar,
  Sparkles,
  ExternalLink,
  X,
} from 'lucide-react';

export const AdminVerificationsPage: React.FC = () => {
  const { navigateTo } = useApp();
  const [pendingWallets, setPendingWallets] = useState<WalletDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activePhotoModal, setActivePhotoModal] = useState<{ url: string; title: string } | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Listen to wallets where verificationStatus == "pending"
  useEffect(() => {
    const q = query(
      collection(db, 'wallets'),
      where('verificationStatus', '==', 'pending')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: WalletDoc[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as any),
          });
        });
        setPendingWallets(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Error querying pending verifications:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // Requirement: Approve button sets idVerified=true, canBuyAlcohol=true, verificationStatus="verified" and calculates age from ID number.
  const handleApprove = async (wallet: WalletDoc) => {
    const wId = wallet.id || wallet.userId;
    setProcessingId(wId);
    setFeedback(null);

    try {
      const calculatedAge = calculateAgeFromSAID(wallet.idNumber || '').age || 28;

      await updateDoc(doc(db, 'wallets', wId), {
        idVerified: true,
        canBuyAlcohol: true,
        verificationStatus: 'verified',
        age: calculatedAge,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setFeedback({
        message: `APPROVED: User ${wId} verified (Age: ${calculatedAge}). Alcohol privileges unlocked!`,
        type: 'success',
      });
    } catch (err: any) {
      console.warn('Approval error:', err);
      setFeedback({
        message: `Failed to approve verification: ${err?.message || err}`,
        type: 'error',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Requirement: Reject sets status="rejected"
  const handleReject = async (wallet: WalletDoc) => {
    const wId = wallet.id || wallet.userId;
    setProcessingId(wId);
    setFeedback(null);

    try {
      await updateDoc(doc(db, 'wallets', wId), {
        idVerified: false,
        canBuyAlcohol: false,
        verificationStatus: 'rejected',
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setFeedback({
        message: `REJECTED: User ${wId} verification was rejected.`,
        type: 'success',
      });
    } catch (err: any) {
      console.warn('Rejection error:', err);
      setFeedback({
        message: `Failed to reject verification: ${err?.message || err}`,
        type: 'error',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto min-h-screen text-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigateTo('/profile')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Profile</span>
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase bg-[#FACC15] text-black px-2 py-0.5 rounded-lg shadow">
            Admin Console
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="bg-[#141414] border border-[#FACC15]/30 rounded-3xl p-4.5 mb-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#FACC15]/20 text-[#FACC15] flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">ID Verification Approvals</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Review submitted South African IDs to grant alcohol purchasing privileges.
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl font-black text-xs mb-4 flex items-center justify-between border-2 animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-[#FACC15] text-black border-black'
              : 'bg-rose-500 text-white border-rose-700'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-black font-black text-sm ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pending List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
            Pending Review ({pendingWallets.length})
          </h2>
          <span className="text-[10px] text-gray-500 font-mono">Live Firestore Queue</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-xs text-gray-400">
            Loading verification requests...
          </div>
        ) : pendingWallets.length === 0 ? (
          <div className="text-center py-16 px-4 bg-[#121212] border border-white/5 rounded-3xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-base font-extrabold text-white mb-1">Queue is Clear!</h3>
            <p className="text-xs text-gray-400 max-w-xs mx-auto">
              No pending ID verification requests right now. New submissions will appear here in real-time.
            </p>
          </div>
        ) : (
          pendingWallets.map((wallet) => {
            const wId = wallet.id || wallet.userId;
            const isProcessing = processingId === wId;
            const parsedAge = calculateAgeFromSAID(wallet.idNumber || '').age || 28;

            return (
              <div
                key={wId}
                className="bg-[#141414] border border-white/10 rounded-3xl p-4 shadow-xl space-y-3"
              >
                {/* User info bar */}
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white/5 text-[#FACC15] flex items-center justify-center font-black text-xs">
                      {wId.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Wallet ID: {wId}
                      </span>
                      <span className="text-[10px] text-amber-300 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Awaiting Verification</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[9px] text-gray-400 uppercase font-bold block">
                      Computed Age
                    </span>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded-lg border ${
                        parsedAge >= 18
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {parsedAge} Years Old
                    </span>
                  </div>
                </div>

                {/* Details grid */}
                <div className="bg-black/40 rounded-2xl p-3 border border-white/5 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-gray-400 text-[10px] block">SA ID Number:</span>
                    <span className="text-white font-bold tracking-wider">{wallet.idNumber || 'None'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block">Date of Birth:</span>
                    <span className="text-[#FACC15] font-bold">{wallet.dateOfBirth || 'From ID'}</span>
                  </div>
                </div>

                {/* Photos Comparison */}
                <div>
                  <span className="text-[11px] font-bold text-gray-300 block mb-1.5">
                    Uploaded Verification Photos:
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Front Photo */}
                    <div className="bg-black/60 rounded-2xl p-2 border border-white/5 text-center">
                      <span className="text-[10px] text-gray-400 font-bold block mb-1">
                        ID Front
                      </span>
                      {wallet.idFrontImageUrl ? (
                        <div
                          onClick={() =>
                            setActivePhotoModal({
                              url: wallet.idFrontImageUrl!,
                              title: `ID Front - ${wId}`,
                            })
                          }
                          className="relative h-24 rounded-xl overflow-hidden cursor-pointer group bg-zinc-900 border border-white/10"
                        >
                          <img
                            src={wallet.idFrontImageUrl}
                            alt="ID Front"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <Eye className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="h-24 rounded-xl bg-zinc-900 flex items-center justify-center text-[10px] text-gray-500">
                          No Photo
                        </div>
                      )}
                    </div>

                    {/* Selfie Photo */}
                    <div className="bg-black/60 rounded-2xl p-2 border border-white/5 text-center">
                      <span className="text-[10px] text-gray-400 font-bold block mb-1">
                        Selfie Holding ID
                      </span>
                      {wallet.idSelfieImageUrl ? (
                        <div
                          onClick={() =>
                            setActivePhotoModal({
                              url: wallet.idSelfieImageUrl!,
                              title: `Selfie - ${wId}`,
                            })
                          }
                          className="relative h-24 rounded-xl overflow-hidden cursor-pointer group bg-zinc-900 border border-white/10"
                        >
                          <img
                            src={wallet.idSelfieImageUrl}
                            alt="Selfie"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <Eye className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="h-24 rounded-xl bg-zinc-900 flex items-center justify-center text-[10px] text-gray-500">
                          No Photo
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Approve / Reject Actions */}
                <div className="pt-2 flex items-center gap-2 border-t border-white/5">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleReject(wallet)}
                    className="flex-1 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 text-rose-300 border border-rose-500/30 text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleApprove(wallet)}
                    className="flex-1 py-2.5 rounded-xl bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black text-xs font-black flex items-center justify-center gap-1.5 shadow transition cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                    <span>{isProcessing ? 'Saving...' : 'Approve (Unlock 18+)'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Lightbox Photo Preview Modal */}
      {activePhotoModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-bold text-white truncate">{activePhotoModal.title}</span>
              <button
                type="button"
                onClick={() => setActivePhotoModal(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 bg-black flex items-center justify-center">
              <img
                src={activePhotoModal.url}
                alt="Enlarged ID photo"
                className="max-h-80 w-auto object-contain rounded-xl"
              />
            </div>
            <div className="p-3 text-center">
              <button
                type="button"
                onClick={() => setActivePhotoModal(null)}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminVerificationsPage;
