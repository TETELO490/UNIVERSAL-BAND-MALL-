import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Users, Store, CheckCircle2, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

export const PromoterApplicationModal: React.FC = () => {
  const { currentUser, submitPromoterApplication, setActiveModal } = useApp();

  const [storeName, setStoreName] = useState('');
  const [reason, setReason] = useState('');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!storeName.trim()) {
      setError('Please enter your venue or event business name.');
      return;
    }
    if (!phone.trim()) {
      setError('Please provide a contact phone number.');
      return;
    }

    setIsLoading(true);
    const success = await submitPromoterApplication({
      userId: currentUser.id,
      fullName: currentUser.fullName || currentUser.name || 'User',
      email: currentUser.email,
      phone: phone.trim(),
      storeName: storeName.trim(),
      reason: reason.trim(),
    });
    setIsLoading(false);

    if (success) {
      setSubmitted(true);
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch (e) {}
    } else {
      setError('Failed to submit application. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161616] rounded-3xl border border-white/10 p-6 shadow-2xl relative text-white animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={() => setActiveModal(null)}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-[#FACC15] text-black flex items-center justify-center font-black shadow-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold tracking-tight">Apply to Become a Promoter</h2>
            <p className="text-xs text-gray-400">Submit your venue/promoter application for Admin review</p>
          </div>
        </div>

        {submitted ? (
          <div className="bg-emerald-950/80 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-white">Application Submitted Successfully!</h3>
            <p className="text-xs text-emerald-200/90 leading-relaxed">
              Your promoter application has been sent to the Universal Band support and admin team. Once approved, your account will be upgraded to promoter status.
            </p>
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="w-full mt-2 py-3 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-xl transition cursor-pointer"
            >
              Back to Discover
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-950/80 border border-red-500/40 text-red-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">Full Name</label>
              <input
                type="text"
                value={currentUser.fullName || currentUser.name || ''}
                disabled
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-gray-400 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">Email Address</label>
              <input
                type="email"
                value={currentUser.email || ''}
                disabled
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-gray-400 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">Contact Phone Number *</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 082 123 4567"
                className="w-full bg-black/60 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#FACC15]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">Venue / Event Business Name *</label>
              <div className="relative">
                <Store className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="e.g. Florence Palm Club"
                  className="w-full bg-black/60 border border-white/15 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#FACC15]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">Promoter Experience / Event Details (Optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us about the events or venue you plan to host on Universal Band..."
                rows={3}
                className="w-full bg-black/60 border border-white/15 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-[#FACC15] hover:bg-yellow-400 active:scale-98 text-black font-black text-xs sm:text-sm rounded-2xl shadow-xl transition cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? 'Submitting Application...' : 'Submit Promoter Application'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
