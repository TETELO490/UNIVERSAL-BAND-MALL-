import React from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles, X, BellRing, CheckCircle2 } from 'lucide-react';

export const WelcomeBanner: React.FC = () => {
  const {
    welcomeMessage,
    setWelcomeMessage,
    notificationBanner,
    dismissNotificationBanner,
    setActiveModal,
    setIsSupportModalOpen,
    setActiveAdminSupportChatId,
    navigateTo,
  } = useApp();

  if (!welcomeMessage && !notificationBanner) return null;

  const isWaiting = notificationBanner?.variant === 'waiting';
  const isSupportBanner = notificationBanner?.id?.startsWith('support_');

  return (
    <div className="fixed top-16 left-4 right-4 max-w-md mx-auto z-[9997] space-y-2 animate-in slide-in-from-top-4 fade-in duration-200">
      {notificationBanner && (
        <div
          className={`rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-2.5 border-2 ${
            isWaiting
              ? 'bg-amber-400 text-black border-black/20'
              : 'bg-emerald-500 text-black border-black/20'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              dismissNotificationBanner();
              if (isSupportBanner) {
                if (notificationBanner.role === 'admin') {
                  setActiveAdminSupportChatId('__INBOX__');
                  setActiveModal('admin-console');
                } else {
                  setIsSupportModalOpen(true);
                }
              } else if (notificationBanner.role === 'admin') {
                setActiveModal('admin-console');
              } else {
                navigateTo('/tickets');
              }
            }}
            className="flex items-center gap-2.5 text-left flex-1 min-w-0 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-black text-[#FACC15] flex items-center justify-center shrink-0">
              {isWaiting ? (
                <BellRing className="w-4 h-4 text-amber-300" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-black/75">
                {notificationBanner.title}
              </p>
              <p className="text-sm font-extrabold text-black leading-tight break-words">
                {notificationBanner.message}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={dismissNotificationBanner}
            className="min-w-[44px] min-h-[44px] rounded-full hover:bg-black/10 text-black/80 flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {welcomeMessage && (
        <div className="bg-[#FACC15] text-black rounded-2xl p-3.5 shadow-2xl flex items-center justify-between border-2 border-black/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-black text-[#FACC15] flex items-center justify-center font-black shrink-0">
              <Sparkles className="w-4 h-4 fill-[#FACC15]" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-black/70">
                Universal Band
              </p>
              <p className="text-sm font-extrabold text-black leading-tight">{welcomeMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWelcomeMessage(null)}
            className="p-1.5 rounded-full hover:bg-black/10 text-black/80 transition cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}
    </div>
  );
};
export default WelcomeBanner;
