import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, X, Smartphone, Check } from 'lucide-react';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed, hide prompt
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          className ||
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs shadow-md transition-all duration-200 active:scale-95 cursor-pointer'
        }
        title="Install UB Universal Band PWA to your Home Screen"
      >
        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            className ||
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-yellow-400 font-bold text-xs border border-yellow-400/30 transition-all duration-200 active:scale-95 cursor-pointer'
          }
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Add to Home Screen</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-[#141414] border border-white/20 p-6 shadow-2xl text-white">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FACC15] flex items-center justify-center text-black font-black text-xs">
                    UB
                  </div>
                  <h3 className="text-base font-black text-white">Install on iPhone / iPad</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-gray-300">
                <div className="flex items-start gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="w-6 h-6 rounded-full bg-[#FACC15] text-black font-black flex items-center justify-center shrink-0 text-xs">
                    1
                  </span>
                  <p className="leading-relaxed">
                    Tap the <strong className="text-white">Share icon</strong>{' '}
                    <Share2 className="inline w-3.5 h-3.5 text-yellow-400" /> at the bottom of Safari.
                  </p>
                </div>

                <div className="flex items-start gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="w-6 h-6 rounded-full bg-[#FACC15] text-black font-black flex items-center justify-center shrink-0 text-xs">
                    2
                  </span>
                  <p className="leading-relaxed">
                    Scroll down and tap <strong className="text-white">"Add to Home Screen"</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="w-6 h-6 rounded-full bg-[#FACC15] text-black font-black flex items-center justify-center shrink-0 text-xs">
                    3
                  </span>
                  <p className="leading-relaxed">
                    Tap <strong className="text-white">Add</strong> in the top-right corner to launch Universal Band full-screen.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#FACC15] py-2.5 text-xs font-black text-black hover:bg-yellow-400 transition active:scale-95"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
export default PWAInstallButton;
