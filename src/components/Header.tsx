import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { isAuthorizedAdminEmail } from '../utils/cryptoHelper';
import { CreditCard, Lock, LogOut, Ticket as TicketIcon, User, ShieldCheck, Settings, PieChart, Radio, Download, Smartphone, Sparkles, Camera, Store, Bike } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export const Header: React.FC = () => {
  const {
    currentUser,
    currentWalletBalance,
    firebaseUser,
    signInWithGoogle,
    signOutUser,
    navigateTo,
    currentRoute,
    lockApp,
    wipeAndReset,
    setActiveModal,
    customLogoUrl,
    updateCustomLogo,
  } = useApp();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          updateCustomLogo(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const isAuthPage = currentRoute === '/register' || currentRoute === '/login' || currentRoute === '/signup' || currentRoute === '/signin';
  const isLoggedIn = Boolean(
    firebaseUser ||
    (currentUser?.isRegistered && currentUser?.id !== 'guest_user')
  );

  const isAdmin = Boolean(
    isLoggedIn &&
    (currentUser?.role === 'Admin' || isAuthorizedAdminEmail(currentUser?.email)) &&
    localStorage.getItem('ub_admin_session') === 'true' &&
    sessionStorage.getItem('ub_admin_5locks_passed') === 'true'
  );
  const isPromoter = isLoggedIn && currentUser?.role === 'Promoter';
  const isWorker = isLoggedIn && (currentUser?.role === 'Worker' || currentUser?.role === 'Staff');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingBottom: '8px',
      }}
      className="sticky top-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-md border-b border-white/5 px-3"
    >
      <div className="max-w-md mx-auto flex items-center justify-between min-h-[44px]">
        {/* Left: Universal Band Logo Image */}
        <div className="flex items-center gap-1.5">
          <input
            type="file"
            ref={logoFileInputRef}
            onChange={handleLogoFileChange}
            accept="image/*"
            className="hidden"
            id="header-logo-upload-input"
          />
          <button
            onClick={() => navigateTo('/')}
            className="flex items-center gap-2 text-left group focus:outline-none cursor-pointer"
            title="Universal Band Home"
          >
            <div className="relative h-8 w-8 min-w-8 rounded-lg overflow-hidden border border-[#C9A86A]/60 flex items-center justify-center bg-black group-hover:scale-105 transition-transform shadow-md p-0.5">
              <img
                src={customLogoUrl || '/universal-band-logo.jpg'}
                alt="Universal Band Logo"
                className="w-full h-full object-contain rounded-md"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('universal-band-logo.jpg')) {
                    target.src = '/universal-band-logo.jpg';
                  }
                }}
              />
            </div>
            <span className="text-white font-extrabold text-sm sm:text-base tracking-tight group-hover:text-[#C9A86A] transition-colors leading-none">
              Universal Band Mall
            </span>
          </button>

          {/* Direct "Change Logo" button so users can easily change their logo anytime */}
          <button
            onClick={() => navigateTo('/admin/logo-settings')}
            className="flex items-center gap-1 py-0.5 px-2 rounded-full bg-white/5 hover:bg-[#C9A86A]/15 text-gray-300 hover:text-[#C9A86A] border border-white/10 hover:border-[#C9A86A]/40 active:scale-95 transition-all text-[10px] font-bold cursor-pointer"
            title="Upload Brand Logo / Change Logo"
            aria-label="Upload Brand Logo"
          >
            <Camera className="w-3 h-3 text-[#C9A86A]" />
            <span className="hidden sm:inline">Change Logo</span>
          </button>
        </div>

        {/* Center/Right Actions */}
        <div className="flex items-center gap-2">
          {/* PWA Install Button */}
          <PWAInstallButton />

          {!isLoggedIn ? (
            /* Unregistered/Logged-out User Header Action */
            !isAuthPage && (
              <button
                onClick={() => navigateTo('/register')}
                className="px-3 py-1 rounded-full bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                Register / Login
              </button>
            )
          ) : (
            /* Registered/Logged-in User Actions: Wallet & Profile */
            <>
              {/* Wallet button with yellow border */}
              <button
                onClick={() => setActiveModal('wallet')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#FACC15] text-[#FACC15] bg-black/60 hover:bg-[#FACC15]/10 active:scale-95 transition-all text-xs font-bold tracking-tight shadow-sm cursor-pointer"
                title="Universal Band Cashless Balance"
              >
                <CreditCard className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>Wallet Balance: R{(Number(currentWalletBalance ?? currentUser?.walletBalance ?? 0) || 0).toFixed(2)}</span>
              </button>

              {/* Profile Circle with dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-8 h-8 rounded-full bg-[#383E2A] text-[#FACC15] border border-[#FACC15]/40 flex items-center justify-center font-bold text-sm hover:border-[#FACC15] active:scale-95 transition-all cursor-pointer"
                  aria-label="User Profile Menu"
                >
                  {String(currentUser?.name || 'U').charAt(0).toUpperCase()}
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-[#1A1A1A] rounded-2xl border border-white/10 shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-white/5">
                      <p className="text-xs font-bold text-white truncate">{currentUser.name}</p>
                      {currentUser.email && (
                        <p className="text-[10px] text-gray-400 truncate">{currentUser.email}</p>
                      )}
                      <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-400/20 text-[#FACC15] border border-yellow-400/30">
                        {currentUser.role || 'Customer'}
                      </span>
                    </div>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigateTo('/profile');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>My Profile • ONE QR</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigateTo('/tickets');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2"
                >
                  <TicketIcon className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>My Tickets</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setActiveModal('wallet');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>Wristband Wallet</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigateTo('/every-cent');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2"
                >
                  <PieChart className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>Every Cent Spent</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setActiveModal('driver-dashboard');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#FACC15] hover:bg-white/5 flex items-center gap-2 font-bold border-t border-b border-white/5 py-2.5"
                >
                  <Bike className="w-4 h-4 text-[#FACC15]" />
                  <span>🛵 Courier & Driver Hub</span>
                </button>

                {/* Staff / Promoter Controls */}
                {(isAdmin || isPromoter) && (
                  <>
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        setActiveModal('ticket-qr-scanner');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-[#FACC15] hover:bg-white/5 flex items-center gap-2 font-bold"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#FACC15]" />
                      <span>Scan Ticket QR Code</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigateTo('/staff/check-in');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-white/5 flex items-center gap-2 font-bold"
                    >
                      <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>Event Check-In Door (NFC)</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        setActiveModal('app-lock-settings');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-[#FACC15] hover:bg-white/5 flex items-center gap-2 font-bold"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#FACC15]" />
                      <span>Multi-Lock Security (PIN, Fingerprint, Password, Pattern)</span>
                    </button>
                  </>
                )}

                {/* Promoter Specific Portal */}
                {isPromoter && (
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      setActiveModal('promoter-dashboard');
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-purple-300 hover:bg-white/5 flex items-center gap-2 font-bold"
                  >
                    <Store className="w-3.5 h-3.5 text-purple-400" />
                    <span>Promoter Portal</span>
                  </button>
                )}

                {/* Worker Specific Portal */}
                {isWorker && (
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      if (currentUser?.assignedStoreId) {
                        navigateTo(`/stores/${currentUser.assignedStoreId}`);
                      } else {
                        navigateTo('/');
                      }
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-white/5 flex items-center gap-2 font-bold"
                  >
                    <Store className="w-3.5 h-3.5 text-emerald-400" />
                    <span>My Shop Orders ({currentUser?.assignedStoreName || 'Workplace'})</span>
                  </button>
                )}

                {/* Admin Only Controls */}
                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        setActiveModal('admin-console');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#FACC15]" />
                      <span>Admin Console</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigateTo('/admin/payshap-settings');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-[#FACC15] hover:bg-white/5 flex items-center gap-2 font-bold"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-[#FACC15]" />
                      <span>PayShap Settings (Admin)</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigateTo('/api-settings');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-[#FACC15] hover:bg-white/5 flex items-center gap-2 font-bold"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#FACC15]" />
                      <span>API Settings</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigateTo('/admin/logo-settings');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-[#C9A86A] hover:bg-white/5 flex items-center gap-2 font-bold"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#C9A86A]" />
                      <span>Admin Logo Settings</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigateTo('/admin/icon-settings');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-[#C9A86A] hover:bg-white/5 flex items-center gap-2 font-bold"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-[#C9A86A]" />
                      <span>Change App Icon</span>
                    </button>

                    <a
                      href="/universal-band-complete-app.zip"
                      download="universal-band-app.zip"
                      onClick={() => setDropdownOpen(false)}
                      className="w-full text-left px-3 py-2 text-xs text-yellow-400 hover:bg-white/5 flex items-center gap-2 font-bold"
                    >
                      <Download className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Download App ZIP (.zip)</span>
                    </a>
                  </>
                )}

                {/* Brand Logo & Icon Settings Links */}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigateTo('/admin/logo-settings');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#C9A86A] hover:bg-white/5 flex items-center gap-2 font-bold border-t border-white/5"
                >
                  <Camera className="w-3.5 h-3.5 text-[#C9A86A]" />
                  <span>Upload Brand Logo</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigateTo('/admin/icon-settings');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#C9A86A] hover:bg-white/5 flex items-center gap-2 font-bold"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#C9A86A]" />
                  <span>Change App Icon</span>
                </button>

                {/* Login / Register Quick Navigation */}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigateTo('/login');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2 border-t border-white/5"
                >
                  <User className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>Log In to Account</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigateTo('/register');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-yellow-400 hover:bg-white/5 flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>Register New Account</span>
                </button>

                {/* Google Auth Status / Action */}
                <button
                  onClick={async () => {
                    setDropdownOpen(false);
                    if (firebaseUser) {
                      signOutUser();
                    } else {
                      const res = await signInWithGoogle();
                      if (!res.success && res.error) {
                        navigateTo('/login');
                      }
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 flex items-center gap-2"
                >
                  <span className="w-3.5 h-3.5 flex items-center justify-center font-bold text-[10px] bg-yellow-400 text-black rounded-full">
                    G
                  </span>
                  <span>{firebaseUser ? 'Disconnect Google' : 'Sign in with Google'}</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    lockApp();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/5 flex items-center gap-2 border-t border-white/5"
                >
                  <Lock className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Lock App</span>
                </button>

                <button
                  onClick={async () => {
                    setDropdownOpen(false);
                    await signOutUser();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-white/5 flex items-center gap-2 border-t border-white/5 font-bold"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

          {/* Admin Tools: Direct ZIP & API Settings */}
          {isAdmin && (
            <>
              <a
                href="/universal-band-complete-app.zip"
                download="universal-band-app.zip"
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-xs shadow-md transition active:scale-95 shrink-0"
                title="Download Whole App ZIP"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">ZIP</span>
              </a>

              <button
                type="button"
                onClick={() => navigateTo('/api-settings')}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 hover:text-[#FACC15] border border-white/10 hover:border-[#FACC15]/40 flex items-center justify-center transition cursor-pointer shrink-0"
                title="API Settings"
                aria-label="API Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
