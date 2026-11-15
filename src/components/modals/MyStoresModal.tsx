import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { isAuthorizedAdminEmail } from '../../utils/cryptoHelper';
import { fileToBase64 } from '../../utils/imageUploadHelper';
import { ensurePhotosPermission } from '../../utils/nativePermissions';
import {
  X,
  Store as StoreIcon,
  Plus,
  MapPin,
  ArrowRight,
  Trash2,
  Edit3,
  Calendar,
  Search,
  ExternalLink,
  AlertTriangle,
  Shield,
  Upload,
  Camera,
} from 'lucide-react';
import { Store } from '../../types';

export const MyStoresModal: React.FC = () => {
  const {
    stores,
    events,
    currentUser,
    firebaseUser,
    addNewStore,
    deleteStore,
    navigateTo,
    setActiveModal,
    setEditingStore,
  } = useApp();

  const isUserLoggedIn = Boolean(
    firebaseUser ||
    (currentUser?.isRegistered && currentUser?.id && currentUser?.id !== 'guest_user') ||
    localStorage.getItem('ub_admin_session') === 'true'
  );

  const isAdmin = isUserLoggedIn && (currentUser.role === 'Admin' || isAuthorizedAdminEmail(currentUser.email));
  const isPromoter = isUserLoggedIn && currentUser.role === 'Promoter';

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteStoreId, setConfirmDeleteStoreId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFileName, setImageFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMsg(null);
      setImageFileName(file.name);
      const base64 = await fileToBase64(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
      setImageUrl(base64);
    } catch (err) {
      console.error('Image upload error:', err);
      setErrorMsg('Failed to process image. Please try another photo.');
    }
  };

  // STRICT ACCESS RULE:
  // Admin: Sees ALL stores across the platform
  // Promoter: Sees ONLY the store owned / assigned to this promoter
  const promoterStoreId = currentUser.assignedStoreId || '';
  const accessibleStores = isAdmin
    ? stores
    : isPromoter
    ? stores.filter(
        (store) =>
          store.id === promoterStoreId ||
          (store as any).ownerId === currentUser.id ||
          (store as any).promoterEmail?.toLowerCase() === currentUser.email?.toLowerCase()
      )
    : [];

  // Filter accessible stores by search query
  const filteredStores = accessibleStores.filter((store) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (store.name || '').toLowerCase().includes(q) ||
      (store.location || '').toLowerCase().includes(q) ||
      (store.id || '').toLowerCase().includes(q)
    );
  });

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await addNewStore({
      name: name.trim(),
      location: location.trim() || 'South Africa',
      imageUrl:
        imageUrl.trim() ||
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
      description: `Official Universal Band Cashless Venue at ${location}.`,
    });
    setLoading(false);
    setShowAddForm(false);
    setName('');
    setLocation('');
    setImageUrl('');
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!isAdmin) {
      setErrorMsg('Only platform administrators can delete venue stores.');
      return;
    }
    setIsDeleting(true);
    await deleteStore(storeId);
    setIsDeleting(false);
    setConfirmDeleteStoreId(null);
  };

  const handleOpenStore = (storeId: string) => {
    setActiveModal(null);
    navigateTo(`/store/${storeId}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161616] rounded-3xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={() => setActiveModal(null)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-2xl bg-[#FACC15] flex items-center justify-center text-black font-black text-xs shadow-md shadow-yellow-400/20">
            UB
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-tight flex items-center gap-1.5">
              <span>{isAdmin ? 'All Stores & Venues' : 'My Assigned Store'}</span>
              {isAdmin && (
                <span className="text-[10px] font-bold bg-[#FACC15]/20 text-[#FACC15] px-2 py-0.5 rounded-full border border-[#FACC15]/30">
                  Admin Access
                </span>
              )}
            </h2>
            <p className="text-[11px] text-gray-400">
              {isAdmin
                ? `Admin Root Access: Viewing all ${stores.length} partner stores`
                : `Promoter Access: Scoped strictly to your assigned venue`}
            </p>
          </div>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-bold">
            {errorMsg}
          </div>
        )}

        {/* Search Bar - only show if multiple stores */}
        {accessibleStores.length > 1 && (
          <div className="mb-3 relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stores by name or location..."
              className="w-full pl-9 pr-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FACC15]"
            />
          </div>
        )}

        {/* Add Store Form or Stores List */}
        {showAddForm ? (
          <form onSubmit={handleCreateStore} className="space-y-3 text-xs overflow-y-auto pr-1">
            <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-3">
              <h3 className="text-white font-black text-sm flex items-center gap-1.5">
                <StoreIcon className="w-4 h-4 text-[#FACC15]" />
                <span>Create New Venue / Store</span>
              </h3>
              <div>
                <label className="block text-gray-300 font-bold mb-1">Store / Venue Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pretoria Gold Lounge"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#111] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15]"
                />
              </div>
              <div>
                <label className="block text-gray-300 font-bold mb-1">Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hatfield Plaza, Pretoria"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-[#111] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15]"
                />
              </div>
              <div>
                <label className="block text-gray-300 font-bold mb-1 flex items-center justify-between">
                  <span>Store Image (Upload from Phone)</span>
                  <span className="text-[10px] text-emerald-400">Gallery & Camera</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                <div
                  onClick={async () => {
                    const perm = await ensurePhotosPermission();
                    if (!perm.granted) return;
                    fileInputRef.current?.click();
                  }}
                  className="border-2 border-dashed border-white/20 hover:border-[#FACC15] rounded-xl p-3 text-center cursor-pointer transition bg-[#111] hover:bg-[#1a1a1a] flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    {imageUrl && imageUrl.startsWith('data:') ? (
                      <img src={imageUrl} alt="Preview" className="w-10 h-10 object-cover rounded-lg" />
                    ) : (
                      <Upload className="w-5 h-5 text-[#FACC15]" />
                    )}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {imageFileName ? `Selected: ${imageFileName}` : 'Choose Photo or Take Picture'}
                    </p>
                    <p className="text-[10px] text-gray-400">Tap to open phone gallery or camera</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 bg-[#262626] hover:bg-[#333] text-white font-bold py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold py-2.5 rounded-xl cursor-pointer"
                >
                  {loading ? 'Creating...' : 'Save Venue'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {filteredStores.length === 0 ? (
              <div className="text-center py-8 bg-black/40 rounded-2xl border border-white/5 p-4">
                <StoreIcon className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-xs text-gray-300 font-bold">No stores accessible</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {isAdmin
                    ? 'Click below to add a new venue.'
                    : 'You have not been assigned to a venue yet. Contact admin.'}
                </p>
              </div>
            ) : (
              filteredStores.map((store) => {
                const storeEventCount = events.filter((e) => e.storeId === store.id).length;
                const isConfirming = confirmDeleteStoreId === store.id;

                return (
                  <div
                    key={store.id}
                    className="p-3 bg-[#111] rounded-2xl border border-white/10 hover:border-[#FACC15]/40 transition space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={
                            store.imageUrl ||
                            'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80'
                          }
                          alt={store.name}
                          className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-white tracking-tight truncate">
                            {store.name}
                          </h4>
                          <div className="flex items-center gap-1 text-[11px] text-gray-400 truncate mt-0.5">
                            <MapPin className="w-3 h-3 text-[#FACC15] shrink-0" />
                            <span className="truncate">{store.location || 'Limpopo'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-bold text-gray-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                              {storeEventCount} {storeEventCount === 1 ? 'Event' : 'Events'}
                            </span>
                            <span className="text-[9px] font-mono text-gray-500">
                              ID: {store.id}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Inline Delete Confirmation or Action Buttons */}
                    {isConfirming ? (
                      <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-xl space-y-2 animate-in fade-in">
                        <div className="flex items-center gap-1.5 text-xs text-rose-300 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>Delete "{store.name}" and its events?</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteStore(store.id)}
                            disabled={isDeleting}
                            className="flex-1 py-1.5 px-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[11px] rounded-lg cursor-pointer transition"
                          >
                            {isDeleting ? 'Deleting...' : 'Yes, Delete Store'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteStoreId(null)}
                            className="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-gray-300 font-bold text-[11px] rounded-lg cursor-pointer transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                        {/* 1. ACCESS / OPEN STORE */}
                        <button
                          type="button"
                          onClick={() => handleOpenStore(store.id)}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs flex items-center justify-center gap-1 cursor-pointer transition active:scale-95 shadow-sm"
                        >
                          <span>Access Store</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {/* 2. EDIT STORE */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStore(store);
                            setActiveModal('store-manager');
                          }}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 cursor-pointer transition"
                          title="Edit Store"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* 3. DELETE STORE (Admin Only) */}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteStoreId(store.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 cursor-pointer transition"
                            title="Delete Store"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Bottom Actions: Add Store Button (Admin Only) */}
        {!showAddForm && isAdmin && (
          <div className="pt-3 mt-3 border-t border-white/10 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="flex-1 bg-[#FACC15] hover:bg-yellow-400 text-black font-black py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md shadow-yellow-400/15"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add New Store / Venue</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyStoresModal;

