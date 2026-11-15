import React from 'react';
import { useApp } from '../../context/AppContext';
import { X, ClipboardList, Check, MapPin } from 'lucide-react';

export const StoreRequestsModal: React.FC = () => {
  const { storeRequests, updateStoreRequestStatus, setActiveModal } = useApp();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1A1A1A] rounded-2xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => setActiveModal(null)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#FACC15] flex items-center justify-center text-black font-black text-xs">
            UB
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Store Requests</h2>
            <p className="text-[11px] text-gray-400">Vendor POS & Band Integration Approvals</p>
          </div>
        </div>

        {storeRequests.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-xs">
            No pending store requests.
          </div>
        ) : (
          <div className="space-y-3">
            {storeRequests.map((req) => (
              <div
                key={req.id}
                className="bg-[#121212] rounded-xl p-3.5 border border-white/5 space-y-2 text-xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{req.storeName}</h4>
                    <p className="text-gray-400 text-[11px]">Owner: {req.ownerName}</p>
                    <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                      <MapPin className="w-3 h-3 text-[#FACC15]" />
                      <span>{req.location}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      req.status === 'approved'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                        : req.status === 'rejected'
                        ? 'bg-red-950 text-red-400 border border-red-500/30'
                        : 'bg-yellow-950 text-yellow-400 border border-yellow-500/30'
                    }`}
                  >
                    {req.status}
                  </span>
                </div>

                {req.status === 'pending' && (
                  <div className="flex gap-2 pt-1 border-t border-white/5">
                    <button
                      onClick={() => updateStoreRequestStatus(req.id, 'rejected')}
                      className="flex-1 bg-red-950/40 hover:bg-red-900/60 text-red-300 font-bold py-1.5 rounded-lg transition border border-red-500/20 text-[11px]"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => updateStoreRequestStatus(req.id, 'approved')}
                      className="flex-1 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold py-1.5 rounded-lg transition text-[11px] flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Approve POS</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
