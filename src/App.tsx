import React, { Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { OfflineIndicator } from './components/OfflineIndicator';
import { WelcomeBanner } from './components/WelcomeBanner';
import { LoadingScreen } from './components/LoadingScreen';
import { FloatingSupportButton } from './components/support/FloatingSupportButton';
import { PermissionNeededNotice } from './components/PermissionNeededNotice';
import { PaymentAlarmOverlay } from './components/PaymentAlarmOverlay';
import { isAuthorizedAdminEmail } from './utils/cryptoHelper';

// Statically import the default landing page for immediate instant rendering
import { StoresPage } from './pages/StoresPage';

// Helper so stale/interrupted dynamic imports reload cleanly once instead of crashing into ErrorBoundary
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      const mod = await factory();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('ub_lazy_retry');
      }
      return mod;
    } catch (err) {
      if (typeof window !== 'undefined' && !sessionStorage.getItem('ub_lazy_retry')) {
        sessionStorage.setItem('ub_lazy_retry', '1');
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch {}
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

// Lazy load secondary pages on demand
const AboutPage = lazyWithRetry(() => import('./pages/AboutPage').then(m => ({ default: m.AboutPage })));
const ContactPage = lazyWithRetry(() => import('./pages/ContactPage').then(m => ({ default: m.ContactPage })));
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })));
const PrivacyPolicyPage = lazyWithRetry(() => import('./pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })));
const RefundPolicyPage = lazyWithRetry(() => import('./pages/RefundPolicyPage').then(m => ({ default: m.RefundPolicyPage })));
const StoreDetailPage = lazyWithRetry(() => import('./pages/StoreDetailPage').then(m => ({ default: m.StoreDetailPage })));
const FoodMenuPage = lazyWithRetry(() => import('./pages/FoodMenuPage').then(m => ({ default: m.FoodMenuPage })));
const RegisterPage = lazyWithRetry(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const WalletPage = lazyWithRetry(() => import('./pages/WalletPage').then(m => ({ default: m.WalletPage })));
const TicketsPage = lazyWithRetry(() => import('./pages/TicketsPage').then(m => ({ default: m.TicketsPage })));
const ProfilePage = lazyWithRetry(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const CheckInPage = lazyWithRetry(() => import('./pages/CheckInPage').then(m => ({ default: m.CheckInPage })));
const StaffCheckInPage = lazyWithRetry(() => import('./pages/StaffCheckInPage').then(m => ({ default: m.StaffCheckInPage })));
const HistoryPage = lazyWithRetry(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const EveryCentPage = lazyWithRetry(() => import('./pages/EveryCentPage').then(m => ({ default: m.EveryCentPage })));
const CustomerProfileViewPage = lazyWithRetry(() => import('./pages/CustomerProfileViewPage').then(m => ({ default: m.CustomerProfileViewPage })));
const FoodDrinksPage = lazyWithRetry(() => import('./pages/FoodDrinksPage').then(m => ({ default: m.FoodDrinksPage })));
const VerifyIdPage = lazyWithRetry(() => import('./pages/VerifyIdPage').then(m => ({ default: m.VerifyIdPage })));
const ReservedPage = lazyWithRetry(() => import('./pages/ReservedPage').then(m => ({ default: m.ReservedPage })));
const ApiSettingsPage = lazyWithRetry(() => import('./pages/ApiSettingsPage').then(m => ({ default: m.ApiSettingsPage })));
const AdminVerificationsPage = lazyWithRetry(() => import('./pages/AdminVerificationsPage').then(m => ({ default: m.AdminVerificationsPage })));
const AdminWriteNfcPage = lazyWithRetry(() => import('./pages/AdminWriteNfcPage').then(m => ({ default: m.AdminWriteNfcPage })));
const AdminBinPage = lazyWithRetry(() => import('./pages/AdminBinPage').then(m => ({ default: m.AdminBinPage })));
const AdminLogoSettingsPage = lazyWithRetry(() => import('./pages/AdminLogoSettingsPage').then(m => ({ default: m.AdminLogoSettingsPage })));
const AppIconSettingsPage = lazyWithRetry(() => import('./pages/AppIconSettingsPage').then(m => ({ default: m.AppIconSettingsPage })));
const AppLockPage = lazyWithRetry(() => import('./pages/AppLockPage').then(m => ({ default: m.AppLockPage })));
const AdminEventsPage = lazyWithRetry(() => import('./pages/AdminEventsPage').then(m => ({ default: m.AdminEventsPage })));
const AdminPayshapSettingsPage = lazyWithRetry(() => import('./pages/AdminPayshapSettingsPage').then(m => ({ default: m.AdminPayshapSettingsPage })));
const AdminLivePaymentsPage = lazyWithRetry(() => import('./pages/AdminLivePaymentsPage').then(m => ({ default: m.AdminLivePaymentsPage })));
const PayshapTopUpPage = lazyWithRetry(() => import('./pages/PayshapTopUpPage').then(m => ({ default: m.PayshapTopUpPage })));

// Lazy load modals on demand
const WalletModal = lazyWithRetry(() => import('./components/modals/WalletModal').then(m => ({ default: m.WalletModal })));
const TicketDetailModal = lazyWithRetry(() => import('./components/modals/TicketDetailModal').then(m => ({ default: m.TicketDetailModal })));
const BuyTicketModal = lazyWithRetry(() => import('./components/modals/BuyTicketModal').then(m => ({ default: m.BuyTicketModal })));
const AddEventModal = lazyWithRetry(() => import('./components/modals/AddEventModal').then(m => ({ default: m.AddEventModal })));
const MyStoresModal = lazyWithRetry(() => import('./components/modals/MyStoresModal').then(m => ({ default: m.MyStoresModal })));
const StoreRequestsModal = lazyWithRetry(() => import('./components/modals/StoreRequestsModal').then(m => ({ default: m.StoreRequestsModal })));
const PromoterDashboardModal = lazyWithRetry(() => import('./components/modals/PromoterDashboardModal').then(m => ({ default: m.PromoterDashboardModal })));
const AdminConsoleModal = lazyWithRetry(() => import('./components/modals/AdminConsoleModal').then(m => ({ default: m.AdminConsoleModal })));
const AdminSecurityModal = lazyWithRetry(() => import('./components/modals/AdminSecurityModal').then(m => ({ default: m.AdminSecurityModal })));
const AppLockSettingsModal = lazyWithRetry(() => import('./components/modals/AppLockSettingsModal').then(m => ({ default: m.AppLockSettingsModal })));
const StoreManagerModal = lazyWithRetry(() => import('./components/modals/StoreManagerModal').then(m => ({ default: m.StoreManagerModal })));
const ResetPasswordOtpModal = lazyWithRetry(() => import('./components/modals/ResetPasswordOtpModal').then(m => ({ default: m.ResetPasswordOtpModal })));
const NewPasswordModal = lazyWithRetry(() => import('./components/modals/NewPasswordModal').then(m => ({ default: m.NewPasswordModal })));
const TermsModal = lazyWithRetry(() => import('./components/modals/TermsModal').then(m => ({ default: m.TermsModal })));
const TicketQrScannerModal = lazyWithRetry(() => import('./components/modals/TicketQrScannerModal').then(m => ({ default: m.TicketQrScannerModal })));
const EventFoodPreOrderModal = lazyWithRetry(() => import('./components/modals/EventFoodPreOrderModal').then(m => ({ default: m.EventFoodPreOrderModal })));
const DriverDashboardModal = lazyWithRetry(() => import('./components/modals/DriverDashboardModal').then(m => ({ default: m.DriverDashboardModal })));
const TicketHistoryModal = lazyWithRetry(() => import('./components/modals/TicketHistoryModal').then(m => ({ default: m.TicketHistoryModal })));
const CustomerSupportModal = lazyWithRetry(() => import('./components/modals/CustomerSupportModal').then(m => ({ default: m.CustomerSupportModal })));

const ViewLoadingFallback: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3 py-16">
    <div className="w-8 h-8 border-2 border-yellow-400/20 border-t-yellow-400 rounded-full animate-spin" />
    <span className="text-xs text-gray-400 font-medium tracking-wide">Loading...</span>
  </div>
);

const ModalLoadingFallback: React.FC = () => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
    <div className="p-4 bg-[#18181B] border border-white/10 rounded-2xl flex items-center space-x-3 text-white shadow-xl">
      <div className="w-5 h-5 border-2 border-yellow-400/20 border-t-yellow-400 rounded-full animate-spin" />
      <span className="text-sm font-medium">Opening...</span>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const {
    currentUser,
    firebaseUser,
    isLocked,
    currentRoute,
    navigateTo,
    activeModal,
    setActiveModal,
    selectedBuyingEvent,
    eventPreorderEvent,
    setEventPreorderEvent,
    isAdminSecurityModalOpen,
    setIsAdminSecurityModalOpen,
    handleAdminSecuritySuccess,
    isSupportModalOpen,
    isAppReady,
  } = useApp();

  const isUserLoggedIn = Boolean(
    firebaseUser ||
    (currentUser?.isRegistered && currentUser?.id !== 'guest_user')
  );

  const isAdmin = Boolean(
    isUserLoggedIn &&
    (currentUser?.role === 'Admin' || isAuthorizedAdminEmail(currentUser?.email)) &&
    localStorage.getItem('ub_admin_session') === 'true' &&
    sessionStorage.getItem('ub_admin_5locks_passed') === 'true'
  );
  const isPromoter = isUserLoggedIn && currentUser?.role === 'Promoter';
  const isStaff = isAdmin || isPromoter;

  const hasRegistered = currentUser?.isRegistered || localStorage.getItem('ub_has_registered') === 'true';

  if (!isAppReady) {
    return <LoadingScreen />;
  }

  // If locked, show the App Lock screen
  // Removed default lock for better onboarding
  if (currentRoute === '/app-lock') {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <AppLockPage />
      </Suspense>
    );
  }

  // Determine current page view
  const renderCurrentView = () => {
    // 1. 100% Public Compliance Pages (No login required)
    if (currentRoute === '/about') {
      return <AboutPage />;
    }
    if (currentRoute === '/contact') {
      return <ContactPage />;
    }
    if (currentRoute === '/terms' || currentRoute === '/terms-and-conditions') {
      return <TermsPage />;
    }
    if (currentRoute === '/privacy' || currentRoute === '/privacy-policy') {
      return <PrivacyPolicyPage />;
    }
    if (currentRoute === '/refund' || currentRoute === '/refund-policy' || currentRoute === '/refunds') {
      return <RefundPolicyPage />;
    }

    // 2. Register & Signup Pages (ALWAYS accessible so users can register a new account)
    if (currentRoute === '/register' || currentRoute === '/signup') {
      return <RegisterPage />;
    }

    // 3. Login & Switch User Pages (ALWAYS accessible so users can log in or switch accounts)
    if (currentRoute === '/login' || currentRoute === '/signin') {
      return <LoginPage />;
    }

    // 4. Discovery, Events & Catalog (Accessible to everyone - NO login wall)
    if (currentRoute === '/' || currentRoute === '/home' || currentRoute === '/events' || currentRoute === '/stores') {
      return <StoresPage />;
    }
    if (currentRoute.startsWith('/store/') || currentRoute.startsWith('/stores/')) {
      return <StoreDetailPage />;
    }
    if (currentRoute === '/menu' || currentRoute === '/food') {
      return <FoodMenuPage />;
    }

    // 5. Protected Routes - Require Login (Take unauthenticated visitors to Register/Login)
    if (!isUserLoggedIn) {
      return <RegisterPage />;
    }

    // 5. Protected Admin & Staff routes
    if (currentRoute.startsWith('/admin') && !isAdmin) {
      return (
        <div className="p-8 text-center text-red-500 font-bold max-w-md mx-auto my-12 bg-red-500/10 border border-red-500/30 rounded-2xl">
          Access Denied - Admin privileges required.
        </div>
      );
    }
    if (currentRoute === '/admin' || currentRoute === '/admin/console') {
      return isAdmin ? <AdminConsoleModal /> : <StoresPage />;
    }
    if (currentRoute === '/dashboard' || currentRoute.startsWith('/dashboard')) {
      return isAdmin ? <AdminConsoleModal /> : <PromoterDashboardModal />;
    }
    if (currentRoute === '/promoter' || currentRoute.startsWith('/promoter')) {
      return isStaff ? <PromoterDashboardModal /> : <ProfilePage />;
    }
    if (currentRoute === '/api-settings') {
      return isAdmin ? <ApiSettingsPage /> : <ProfilePage />;
    }
    if (currentRoute === '/admin/events' || currentRoute === '/admin-events') {
      return isAdmin ? <AdminEventsPage /> : <ProfilePage />;
    }
    if (currentRoute === '/admin/verifications') {
      return isAdmin ? <AdminVerificationsPage /> : <ProfilePage />;
    }
    if (currentRoute === '/admin/write-nfc') {
      return isAdmin ? <AdminWriteNfcPage /> : <ProfilePage />;
    }
    if (currentRoute === '/admin/bin' || currentRoute === '/admin/recycle-bin') {
      return isAdmin ? <AdminBinPage /> : <ProfilePage />;
    }
    if (
      currentRoute === '/admin/payshap-settings' ||
      currentRoute === '/admin/settings' ||
      currentRoute === '/payshap-settings'
    ) {
      return isAdmin ? (
        <AdminPayshapSettingsPage />
      ) : (
        <div className="p-8 text-center text-red-500 font-bold max-w-md mx-auto my-12 bg-red-500/10 border border-red-500/30 rounded-2xl">
          Access Denied - Admin privileges required.
        </div>
      );
    }
    if (
      currentRoute === '/admin/live-payments' ||
      currentRoute === '/live-payments'
    ) {
      return isAdmin ? (
        <AdminLivePaymentsPage />
      ) : (
        <div className="p-8 text-center text-red-500 font-bold max-w-md mx-auto my-12 bg-red-500/10 border border-red-500/30 rounded-2xl">
          Access Denied - Admin privileges required.
        </div>
      );
    }
    if (
      currentRoute === '/admin/logo-settings' ||
      currentRoute === '/admin/logo' ||
      currentRoute === '/logo-settings' ||
      currentRoute === '/change-logo' ||
      currentRoute === '/branding'
    ) {
      return isAdmin ? (
        <AdminLogoSettingsPage />
      ) : (
        <div className="p-8 text-center text-red-500 font-bold max-w-md mx-auto my-12 bg-red-500/10 border border-red-500/30 rounded-2xl">
          Access Denied - Admin privileges required.
        </div>
      );
    }
    if (
      currentRoute === '/admin/icon-settings' ||
      currentRoute === '/admin/app-icon' ||
      currentRoute === '/app-icon' ||
      currentRoute === '/icon-settings' ||
      currentRoute === '/change-icon'
    ) {
      return isAdmin ? (
        <AppIconSettingsPage />
      ) : (
        <div className="p-8 text-center text-red-500 font-bold max-w-md mx-auto my-12 bg-red-500/10 border border-red-500/30 rounded-2xl">
          Access Denied - Admin privileges required.
        </div>
      );
    }

    // 6. Protected User Account routes
    if (currentRoute === '/wallet') {
      return <WalletPage />;
    }
    if (currentRoute === '/top-up' || currentRoute === '/wallet/top-up') {
      return <PayshapTopUpPage />;
    }
    if (currentRoute === '/tickets') {
      return <TicketsPage />;
    }
    if (currentRoute === '/profile') {
      return <ProfilePage />;
    }
    if (currentRoute === '/check-in') {
      return isStaff ? <CheckInPage /> : <TicketsPage />;
    }
    if (currentRoute === '/staff/check-in' || currentRoute === '/check-in-door') {
      return isStaff ? <StaffCheckInPage /> : <TicketsPage />;
    }
    if (currentRoute === '/history') {
      return <HistoryPage />;
    }
    if (currentRoute === '/every-cent' || currentRoute === '/spending-breakdown' || currentRoute === '/statement') {
      return <EveryCentPage />;
    }
    if (currentRoute.startsWith('/customer/')) {
      return <CustomerProfileViewPage />;
    }
    if (currentRoute === '/food-drinks' || currentRoute === '/orders' || currentRoute === '/cart') {
      return <FoodDrinksPage />;
    }
    if (currentRoute === '/verify-id') {
      return <VerifyIdPage />;
    }
    if (currentRoute === '/reserved') {
      return <ReservedPage />;
    }

    return <StoresPage />;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col selection:bg-[#FACC15] selection:text-black">
      {/* Top Header */}
      <Header />

      {/* Welcome Toast Banner */}
      <WelcomeBanner />

      {/* Main Page Content */}
      <main className="flex-1 w-full max-w-md mx-auto relative px-3 pb-28">
        <Suspense fallback={<ViewLoadingFallback />}>
          {renderCurrentView()}
        </Suspense>
      </main>

      {/* Fixed Bottom Navigation - ONLY show if user is registered */}
      <BottomNav />

      {/* Lazy Modals wrapped in Suspense for instant main page load */}
      <Suspense fallback={<ModalLoadingFallback />}>
        {/* Buy Ticket with ID tracking modal */}
        {selectedBuyingEvent && <BuyTicketModal />}

        {/* Active Modals */}
        {activeModal === 'wallet' && <WalletModal />}
        {activeModal === 'ticket-history' && <TicketHistoryModal />}
        {(activeModal === 'ticket-detail' || activeModal === 'ticket-success') && (
          <TicketDetailModal />
        )}
        {activeModal === 'add-event' && <AddEventModal />}
        {activeModal === 'my-stores' && <MyStoresModal />}
        {activeModal === 'store-requests' && <StoreRequestsModal />}
        {activeModal === 'promoter-dashboard' && <PromoterDashboardModal />}
        {activeModal === 'admin-console' && <AdminConsoleModal />}
        {activeModal === 'app-lock-settings' && <AppLockSettingsModal />}
        {(activeModal === 'store-manager' || activeModal === 'add-store') && <StoreManagerModal />}
        {activeModal === 'reset-password-otp' && <ResetPasswordOtpModal />}
        {activeModal === 'new-password' && <NewPasswordModal />}
        {activeModal === 'terms' && <TermsModal />}
        {activeModal === 'ticket-qr-scanner' && (
          <TicketQrScannerModal
            isOpen={true}
            onClose={() => setActiveModal(null)}
          />
        )}
        {(activeModal === 'event-food-preorder' || eventPreorderEvent) && (
          <EventFoodPreOrderModal
            event={eventPreorderEvent}
            isOpen={activeModal === 'event-food-preorder'}
            onClose={() => {
              setActiveModal(null);
              setEventPreorderEvent(null);
            }}
          />
        )}

        {/* Admin 5-Lock Security Modal */}
        {isAdminSecurityModalOpen && (
          <AdminSecurityModal
            isOpen={isAdminSecurityModalOpen}
            onClose={() => setIsAdminSecurityModalOpen(false)}
            onSuccess={handleAdminSecuritySuccess}
          />
        )}

        {/* Driver Dashboard Hub Modal */}
        {(activeModal === 'driver-dashboard' || currentRoute === '/driver' || currentRoute === '/driver-dashboard' || currentUser?.role === 'Driver') && (
          <DriverDashboardModal
            isOpen={true}
            onClose={() => {
              setActiveModal(null);
              if (currentRoute === '/driver' || currentRoute === '/driver-dashboard' || currentUser?.role === 'Driver') {
                navigateTo('/');
              }
            }}
          />
        )}
        {/* Customer Support Chat Modal */}
        {isSupportModalOpen && <CustomerSupportModal />}
      </Suspense>

      {/* Floating Customer Support Button visible on ALL screens */}
      <FloatingSupportButton />

      {/* Real-time Network Offline Warning */}
      <OfflineIndicator />

      {/* Real System Permission Denied Dialog + Open Settings */}
      <PermissionNeededNotice />

      {/* Urgent Payment Alarm Overlay (loops until manually dismissed) */}
      <PaymentAlarmOverlay />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
