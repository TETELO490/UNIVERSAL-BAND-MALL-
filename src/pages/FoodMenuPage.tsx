import React from 'react';
import { useApp } from '../context/AppContext';
import { Store, Utensils, MapPin, ArrowRight, ShieldCheck, History } from 'lucide-react';

export const FoodMenuPage: React.FC = () => {
  const { stores, navigateTo, setSelectedStoreId } = useApp();

  const handleSelectStore = (storeId: string) => {
    setSelectedStoreId(storeId);
    navigateTo(`/store/${storeId}`);
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Utensils className="w-5 h-5 text-[#FACC15]" />
            <span>Select Venue to Pre-Order</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Menus and collections are strictly store-scoped
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigateTo('/reserved')}
            className="text-xs font-bold text-black bg-[#FACC15] hover:bg-yellow-400 px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow"
          >
            <Utensils className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Reserved</span>
          </button>
          <button
            onClick={() => navigateTo('/history')}
            className="text-xs font-bold text-[#FACC15] bg-[#FACC15]/10 hover:bg-[#FACC15]/20 border border-[#FACC15]/30 px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1"
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>
        </div>
      </div>

      {/* Info notice explaining strict store-scoped rules */}
      <div className="bg-[#121212] border border-white/10 rounded-2xl p-3.5 mb-5 shadow-lg">
        <div className="flex items-center gap-2 text-xs font-bold text-[#FACC15] mb-1">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Store-Scoped Reservation Policy</span>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          To ensure accurate preparation, you reserve directly inside each venue page. Orders made for <strong>Florence Palm</strong> can only be collected at Florence Palm; orders for <strong>Mphela Resort</strong> can only be collected at Mphela Resort.
        </p>
      </div>

      {/* Venues Grid / Cards */}
      <div className="space-y-4">
        {stores.map((store) => (
          <div
            key={store.id}
            onClick={() => handleSelectStore(store.id)}
            className="bg-[#1A1A1A] hover:bg-[#222222] border border-white/5 hover:border-[#FACC15]/40 rounded-2xl overflow-hidden shadow-xl transition-all cursor-pointer group"
          >
            <div className="h-32 w-full bg-zinc-800 relative overflow-hidden">
              <img
                src={store.imageUrl}
                alt={store.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute top-2 left-2">
                <span className="bg-black/80 backdrop-blur-sm text-[#FACC15] text-[10px] font-black px-2 py-0.5 rounded shadow border border-white/10">
                  EXCLUSIVE MENU & BAR
                </span>
              </div>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-white text-sm group-hover:text-yellow-300 transition-colors">
                  {store.name}
                </h3>
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                  <span>{store.location}</span>
                </div>
              </div>

              <button
                type="button"
                className="bg-[#FACC15] group-hover:bg-yellow-400 text-black font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
              >
                <span>Open Menu</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default FoodMenuPage;
