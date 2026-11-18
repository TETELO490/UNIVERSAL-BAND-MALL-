import React from 'react';
import { useApp } from '../context/AppContext';
import { Home, Calendar, ShoppingBag, User, Ticket as TicketIcon } from 'lucide-react';
import { getRoleScopedTickets } from '../utils/legacyCleanup';

export const BottomNav: React.FC = () => {
  const {
    currentRoute,
    navigateTo,
    currentUser,
    firebaseUser,
    totalCartCount,
    setPendingCheckoutTarget,
    tickets,
    events,
    stores,
  } = useApp();

  const isAuthPage =
    currentRoute === '/register' ||
    currentRoute === '/login' ||
    currentRoute === '/signup' ||
    currentRoute === '/signin' ||
    currentRoute === '/app-lock';

  const isLoggedIn = Boolean(
    firebaseUser ||
    (currentUser?.isRegistered && currentUser?.id !== 'guest_user') ||
    localStorage.getItem('ub_admin_session') === 'true'
  );

  // Hide ONLY on dedicated full-screen auth / onboarding pages
  if (isAuthPage) {
    return null;
  }

  const isHome = currentRoute === '/' || currentRoute === '/home';
  const isEvents = currentRoute === '/events' || (currentRoute === '/' && window.location.hash === '#upcoming-events');
  const isTickets = currentRoute === '/tickets';
  const isCart = currentRoute === '/cart' || currentRoute === '/food-drinks' || currentRoute === '/orders';
  const isProfile =
    currentRoute === '/profile' ||
    currentRoute.startsWith('/admin') ||
    currentRoute.startsWith('/promoter');

  const safeTickets = Array.isArray(tickets) ? tickets : [];
  const userTicketsCount = isLoggedIn
    ? getRoleScopedTickets({ tickets: safeTickets, currentUser, events, stores }).length
    : 0;

  const handleEventsClick = () => {
    navigateTo('/events');
  };

  const handleTicketsClick = () => {
    if (isLoggedIn) {
      navigateTo('/tickets');
    } else {
      setPendingCheckoutTarget({ type: 'ticket' });
      navigateTo('/register');
    }
  };

  const handleCartClick = () => {
    if (isLoggedIn) {
      navigateTo('/food-drinks');
    } else {
      setPendingCheckoutTarget({ type: 'cart' });
      navigateTo('/register');
    }
  };

  const handleProfileClick = () => {
    if (!isLoggedIn) {
      navigateTo('/register');
      return;
    }
    navigateTo('/profile');
  };

  return (
    <nav
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        paddingTop: '8px',
        height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
      }}
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A0A0A]/95 backdrop-blur-md border-t border-white/10 px-2 shadow-2xl flex flex-col justify-center"
    >
      <div className="max-w-md w-full mx-auto grid grid-cols-5 gap-0.5 items-center">
        {/* 1. Home (Discovery) */}
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-0.5 transition-colors cursor-pointer ${
            isHome ? 'text-[#FACC15]' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Home className={`w-[21px] h-[21px] ${isHome ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] font-bold tracking-tight">Home</span>
        </button>

        {/* 2. Events */}
        <button
          type="button"
          onClick={handleEventsClick}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-0.5 transition-colors cursor-pointer ${
            isEvents ? 'text-[#FACC15]' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Calendar className={`w-[21px] h-[21px] ${isEvents ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] font-bold tracking-tight">Events</span>
        </button>

        {/* 3. My Tickets */}
        <button
          type="button"
          onClick={handleTicketsClick}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-0.5 relative transition-colors cursor-pointer ${
            isTickets ? 'text-[#FACC15]' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <div className="relative">
            <TicketIcon className={`w-[21px] h-[21px] ${isTickets ? 'stroke-[2.5]' : 'stroke-2'}`} />
            {userTicketsCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-[#FACC15] text-black font-black text-[9px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center shadow-md tabular-nums">
                {userTicketsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold tracking-tight">Tickets</span>
        </button>

        {/* 4. Cart */}
        <button
          type="button"
          onClick={handleCartClick}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-0.5 relative transition-colors cursor-pointer ${
            isCart ? 'text-[#FACC15]' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <div className="relative">
            <ShoppingBag className={`w-[21px] h-[21px] ${isCart ? 'stroke-[2.5]' : 'stroke-2'}`} />
            {totalCartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#FACC15] text-black font-black text-[9px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center shadow-md tabular-nums">
                {totalCartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold tracking-tight">Cart</span>
        </button>

        {/* 5. Profile / ONE QR */}
        <button
          type="button"
          onClick={handleProfileClick}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-0.5 transition-colors cursor-pointer ${
            isProfile ? 'text-[#FACC15]' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <User className={`w-[21px] h-[21px] ${isProfile ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] font-bold tracking-tight truncate max-w-[55px]">
            {!isLoggedIn ? 'Account' : 'Profile'}
          </span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;

