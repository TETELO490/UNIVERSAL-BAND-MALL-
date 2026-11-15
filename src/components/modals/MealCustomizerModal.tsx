import React, { useState } from 'react';
import { X, Check, Utensils, AlertCircle, Sparkles, Plus, Minus } from 'lucide-react';
import { MenuItemDoc } from '../../types';

interface MealCustomizerModalProps {
  item: MenuItemDoc;
  storeId: string;
  storeName: string;
  initialQuantity?: number;
  initialRemovedIngredients?: string[];
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (
    item: MenuItemDoc,
    quantity: number,
    customization: { removedIngredients: string[]; customizedIngredients: string[] }
  ) => void;
}

export const MealCustomizerModal: React.FC<MealCustomizerModalProps> = ({
  item,
  storeId,
  storeName,
  initialQuantity = 1,
  initialRemovedIngredients = [],
  isOpen,
  onClose,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState<number>(Math.max(1, initialQuantity));
  const rawIngredients = item.ingredients && item.ingredients.length > 0
    ? item.ingredients
    : ['rice', 'chicken', 'achaar', 'salad']; // Default fallback for meal
  
  const allowRemoval = item.allowIngredientRemoval !== false; // default true if configured

  const [removedIngredients, setRemovedIngredients] = useState<string[]>(initialRemovedIngredients);

  if (!isOpen) return null;

  const numericPrice = typeof item.price === 'number'
    ? item.price
    : parseFloat(String(item.price).replace(/[^0-9.]/g, '')) || 0;
  
  const totalPrice = numericPrice * quantity;

  const toggleIngredient = (ingredient: string) => {
    if (!allowRemoval) return;

    setRemovedIngredients((prev) => {
      const lower = ingredient.toLowerCase();
      const exists = prev.some((i) => i.toLowerCase() === lower);
      if (exists) {
        return prev.filter((i) => i.toLowerCase() !== lower);
      } else {
        return [...prev, ingredient];
      }
    });
  };

  const handleConfirm = () => {
    const customized = rawIngredients.filter(
      (ing) => !removedIngredients.some((rem) => rem.toLowerCase() === ing.toLowerCase())
    );

    onAddToCart(item, quantity, {
      removedIngredients,
      customizedIngredients: customized,
    });
    onClose();
  };

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#181818] text-white rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[92vh]">
        {/* Header with image */}
        <div className="relative h-44 w-full bg-zinc-900 overflow-hidden shrink-0">
          <img
            src={
              item.image ||
              item.imageUrl ||
              'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=400&q=80'
            }
            alt={item.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-black/40" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/90 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="bg-[#FACC15] text-black text-[10px] font-black px-2.5 py-1 rounded-full uppercase shadow">
              {item.category?.toUpperCase() || 'MEAL'}
            </span>
            {allowRemoval && (
              <span className="bg-black/80 backdrop-blur-md border border-[#FACC15]/40 text-[#FACC15] text-[10px] font-extrabold px-2 py-1 rounded-full">
                Customizable
              </span>
            )}
          </div>

          <div className="absolute bottom-3 left-3 right-3">
            <h2 className="text-lg font-black text-white leading-tight drop-shadow-md">
              {item.name}
            </h2>
            <div className="flex items-center justify-between text-xs mt-0.5">
              <span className="text-gray-300 font-medium">{storeName}</span>
              <span className="text-[#FACC15] font-black text-base">
                R{numericPrice.toFixed(0)}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {item.description && (
            <p className="text-xs text-gray-300 leading-relaxed bg-black/40 p-2.5 rounded-2xl border border-white/5">
              {item.description}
            </p>
          )}

          {/* Ingredients Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>Ingredients Customization</span>
              </label>
              {allowRemoval ? (
                <span className="text-[10px] font-bold text-[#FACC15]">
                  Click to remove
                </span>
              ) : (
                <span className="text-[10px] font-bold text-gray-400">
                  Fixed recipe
                </span>
              )}
            </div>

            {allowRemoval ? (
              <p className="text-[11px] text-[#FACC15] font-bold leading-snug">
                Press any ingredient below to cancel it from your meal before checking out (e.g. Cancel achaar or Cancel salad):
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 leading-snug">
                This meal comes prepared as a standard set recipe.
              </p>
            )}

            {/* Ingredient Pills */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {rawIngredients.map((ingredient) => {
                const isRemoved = removedIngredients.some(
                  (rem) => rem.toLowerCase() === ingredient.toLowerCase()
                );

                return (
                  <button
                    key={ingredient}
                    type="button"
                    disabled={!allowRemoval}
                    onClick={() => toggleIngredient(ingredient)}
                    className={`p-2.5 rounded-2xl border text-xs font-bold transition flex items-center justify-between cursor-pointer select-none active:scale-95 ${
                      isRemoved
                        ? 'bg-rose-950/80 border-2 border-rose-500 text-rose-200 line-through'
                        : 'bg-[#222222] hover:bg-[#2A2A2A] border-2 border-emerald-500/50 text-white'
                    }`}
                  >
                    <span className="truncate">{capitalize(ingredient)}</span>
                    {isRemoved ? (
                      <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded no-underline shrink-0 ml-1.5">
                        CANCELED
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-emerald-400 shrink-0 ml-1.5">
                        ✓ Keep
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Customization Status Banner */}
            <div
              className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                removedIngredients.length > 0
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                  : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {removedIngredients.length > 0 ? (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-[11px]">
                    Customized: <strong>No {removedIngredients.map(capitalize).join(', No ')}</strong>
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-[11px]">
                    Full Standard Meal (All {rawIngredients.length} ingredients included)
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Quantity Stepper */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <span className="text-xs font-black text-gray-300 uppercase tracking-wider">
              Quantity
            </span>
            <div className="flex items-center gap-3 bg-[#121212] border border-white/10 rounded-2xl p-1">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-black transition cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center text-sm font-black text-white">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-black transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer with Add to Cart / Checkout Button */}
        <div className="p-4 bg-[#121212] border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#D32F2F] hover:bg-red-700 active:scale-95 text-white font-black text-xs shadow-lg transition flex items-center justify-between cursor-pointer touch-manipulation"
          >
            <span>
              {removedIngredients.length > 0
                ? `Save Recipe (No ${removedIngredients.map(capitalize).join(', ')}) & Add to Cart`
                : 'Confirm Ingredients & Add to Cart'}
            </span>
            <span className="bg-white/20 px-2.5 py-1 rounded-xl text-white font-mono">
              R{totalPrice.toFixed(0)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
