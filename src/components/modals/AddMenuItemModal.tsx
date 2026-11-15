import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Plus, Utensils, Wine, Coffee, CheckCircle, Upload, Camera } from 'lucide-react';
import { fileToBase64 } from '../../utils/imageUploadHelper';
import { ensurePhotosPermission } from '../../utils/nativePermissions';

interface AddMenuItemModalProps {
  type: 'food' | 'alcohol' | 'softdrink';
  onClose: () => void;
}

export const AddMenuItemModal: React.FC<AddMenuItemModalProps> = ({ type, onClose }) => {
  const { addMenuItem, selectedStoreId, currentUser } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetStoreId =
    currentUser.role === 'Promoter'
      ? currentUser.assignedStoreId || ''
      : selectedStoreId || '';

  const [name, setName] = useState('');
  const [price, setPrice] = useState(type === 'food' ? 'R50' : type === 'alcohol' ? 'R40' : 'R20');
  const [imageUrl, setImageUrl] = useState(
    type === 'food'
      ? 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'
      : type === 'alcohol'
      ? 'https://images.unsplash.com/photo-1608270119332-9cb76f1837b0?auto=format&fit=crop&w=400&q=80'
      : 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80'
  );
  const [imageFileName, setImageFileName] = useState('');
  const [description, setDescription] = useState('');
  const [ingredientsText, setIngredientsText] = useState('rice, chicken, achaar, salad');
  const [allowIngredientRemoval, setAllowIngredientRemoval] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const getTitle = () => {
    switch (type) {
      case 'food':
        return 'Add Food Item';
      case 'alcohol':
        return 'Add Alcohol Drink';
      case 'softdrink':
        return 'Add Soft Drink';
    }
  };

  const getCollection = () => {
    switch (type) {
      case 'food':
        return 'menu_food' as const;
      case 'alcohol':
        return 'menu_alcohol' as const;
      case 'softdrink':
        return 'menu_softdrinks' as const;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!targetStoreId) {
      setErrorMsg('No target store selected. Open a store first before adding menu items.');
      return;
    }

    setLoading(true);
    const formattedPrice = price.trim().startsWith('R') ? price.trim() : `R${price.trim()}`;

    const parsedIngredients = type === 'food'
      ? ingredientsText
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : undefined;

    const successRes = await addMenuItem(getCollection(), {
      name: name.trim(),
      price: formattedPrice,
      imageUrl: imageUrl.trim(),
      description: description.trim() || undefined,
      category: type,
      storeId: targetStoreId,
      ingredients: parsedIngredients,
      allowIngredientRemoval: type === 'food' ? allowIngredientRemoval : undefined,
    });
    setLoading(false);

    if (successRes) {
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1A1A1A] rounded-2xl border border-white/10 p-5 shadow-2xl relative animate-in fade-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#FACC15] flex items-center justify-center text-black font-black text-xs">
            {type === 'food' ? <Utensils className="w-4 h-4" /> : type === 'alcohol' ? <Wine className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">{getTitle()}</h2>
            <p className="text-[11px] text-gray-400">Save to Firestore {getCollection()}</p>
          </div>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-12 h-12 text-[#FACC15] mx-auto mb-2 animate-bounce" />
            <h3 className="text-white font-bold text-base">Item Added to Menu!</h3>
            <p className="text-xs text-gray-400 mt-1">Available immediately for patrons to tap & pay</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-bold">
                {errorMsg}
              </div>
            )}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                {type === 'food' ? 'Food Name' : 'Drink Name'}
              </label>
              <input
                type="text"
                required
                placeholder={type === 'food' ? 'e.g. Special Kota or Burger' : type === 'alcohol' ? 'e.g. Heineken or Savanna' : 'e.g. Coke or Fanta'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15]"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-gray-300 font-semibold mb-1">Price (ZAR)</label>
              <input
                type="text"
                required
                placeholder="R50"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <div>
              <label className="block text-gray-300 font-semibold mb-1 flex items-center justify-between">
                <span>Item Picture (Upload from Phone)</span>
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
                className="border-2 border-dashed border-white/20 hover:border-[#FACC15] rounded-xl p-3 text-center cursor-pointer transition bg-[#121212] hover:bg-[#1a1a1a] flex items-center gap-3"
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

            {type === 'food' && (
              <>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Description</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Quarter roasted chicken with golden rice, achaar and salad"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-gray-300 font-semibold">
                      Ingredients (comma-separated)
                    </label>
                    <span className="text-[10px] text-gray-400">e.g. rice, chicken, achaar, salad</span>
                  </div>
                  <input
                    type="text"
                    placeholder="rice, chicken, achaar, salad"
                    value={ingredientsText}
                    onChange={(e) => setIngredientsText(e.target.value)}
                    className="w-full bg-[#121212] text-white p-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#FACC15]"
                  />
                  {/* Quick Chips */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['rice', 'chicken', 'achaar', 'salad', 'chips', 'beef patty', 'cheese', 'gravy'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          const current = ingredientsText
                            .split(',')
                            .map((s) => s.trim().toLowerCase())
                            .filter(Boolean);
                          if (!current.includes(chip)) {
                            setIngredientsText(current.concat(chip).join(', '));
                          }
                        }}
                        className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white text-[10px] font-medium border border-white/10 transition cursor-pointer"
                      >
                        +{chip}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[#121212] p-3 rounded-xl border border-white/10 flex items-center justify-between">
                  <div>
                    <label
                      htmlFor="allowRemovalToggle"
                      className="text-white font-bold text-xs block cursor-pointer"
                    >
                      Allow Ingredient Removal
                    </label>
                    <p className="text-[10px] text-gray-400">
                      Customers can uncheck ingredients (e.g. &quot;No salad&quot; or &quot;No achaar&quot;)
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                    <input
                      id="allowRemovalToggle"
                      type="checkbox"
                      checked={allowIngredientRemoval}
                      onChange={(e) => setAllowIngredientRemoval(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FACC15]"></div>
                  </label>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 bg-[#FACC15] hover:bg-yellow-400 active:scale-95 text-black font-extrabold py-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-yellow-400/10 text-xs disabled:opacity-50"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>{loading ? 'Saving to Firestore...' : `Save ${getTitle()}`}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
