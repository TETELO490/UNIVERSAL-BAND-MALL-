import React from 'react';
import { useApp } from '../../context/AppContext';
import { Headphones, MessageCircle } from 'lucide-react';
import { isAuthorizedAdminEmail } from '../../utils/cryptoHelper';

export const FloatingSupportButton: React.FC = () => {
  const {
    currentUser,
    firebaseUser,
    unreadAdminSupportCount,
    unreadCustomerSupportCount,
    setIsSupportModalOpen,
    isSupportModalOpen,
    setActiveModal,
    setActiveAdminSupportChatId,
    currentRoute,
  } = useApp();

  const isUserLoggedIn = Boolean(
    firebaseUser ||
      (currentUser?.isRegistered && currentUser?.id !== 'guest_user') ||
      localStorage.getItem('ub_admin_session') === 'true'
  );

  const roleLower = (currentUser?.role || '').toLowerCase();
  const isAdmin =
    isUserLoggedIn &&
    (roleLower === 'admin' ||
      isAuthorizedAdminEmail(currentUser?.email) ||
      localStorage.getItem('ub_admin_session') === 'true');

  const unreadCount = isAdmin ? unreadAdminSupportCount : unreadCustomerSupportCount;

  // Don't render floating button if support modal is already open or during app lock
  if (isSupportModalOpen || currentRoute === '/app-lock') {
    return null;
  }

  const handleOpenSupport = () => {
    if (isAdmin) {
      setActiveAdminSupportChatId('__INBOX__');
      setActiveModal('admin-console');
    } else {
      setIsSupportModalOpen(true);
    }
  };

  return (
    <aside
      aria-label="Customer Support Assistant"
      className="fixed bottom-20 right-4 z-40 flex items-center select-none"
    >
      <button
        type="button"
        onClick={handleOpenSupport}
        aria-label={`Open Customer Support Chat${unreadCount > 0 ? `, ${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : ''}`}
        title="Customer Support Chat & Payment Help"
        className="group relative w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center shadow-2xl shadow-emerald-950/70 border-2 border-emerald-400/50 cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
      >
        {/* Glow halo */}
        <span className="absolute -inset-1 rounded-full bg-emerald-500/20 blur-sm pointer-events-none group-hover:bg-emerald-500/30 transition" />

        {/* Support Icon */}
        <div className="relative flex items-center justify-center">
          <Headphones className="w-6 h-6 stroke-[2.3] text-white transition-transform group-hover:scale-110" />
        </div>

        {/* Red Unread Notification Badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 bg-red-600 text-white text-[11px] font-black rounded-full border-2 border-[#0A0A0A] flex items-center justify-center animate-bounce shadow-lg"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </aside>
  );
};

export default FloatingSupportButton;
