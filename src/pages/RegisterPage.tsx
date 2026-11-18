import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  User,
  Phone,
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  ShoppingBag,
  Calendar,
  Store as StoreIcon,
  Bike,
  Briefcase,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { sendFirebaseVerificationLink } from '../utils/emailVerificationService';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export type UserRoleChoice = 'Customer' | 'Event Organiser' | 'Seller' | 'Driver' | 'Shop Worker';

export const RegisterPage: React.FC = () => {
  const {
    setCurrentUser,
    navigateTo,
    setWelcomeMessage,
    stores,
    setSelectedBuyingEvent,
    pendingCheckoutTarget,
    setPendingCheckoutTarget,
    signInWithGoogle,
    setAuthRegistrationLock,
  } = useApp();

  // Registration Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRoleChoice | null>(null);

  // Role-Specific Fields
  // 1. Shop Worker
  const [assignedStoreId, setAssignedStoreId] = useState<string>(stores[0]?.id || '');
  // 2. Seller
  const [shopName, setShopName] = useState('');
  const [whatToSell, setWhatToSell] = useState<'Food' | 'Drinks' | 'Both' | 'Merch & Fashion'>('Food');
  // 3. Event Organiser
  const [organisationName, setOrganisationName] = useState('');
  // 4. Driver
  const [vehicleType, setVehicleType] = useState<'Delivery Scooter / Motorbike' | 'Delivery Car / Hatchback' | 'Delivery Bakkie / Van' | 'Delivery Bicycle'>('Delivery Scooter / Motorbike');
  const [licensePlate, setLicensePlate] = useState('');
  const [driverLicenseNumber, setDriverLicenseNumber] = useState('');

  // UI Flow States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPendingApprovalView, setIsPendingApprovalView] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (stores.length > 0 && !assignedStoreId) {
      setAssignedStoreId(stores[0].id);
    }
  }, [stores, assignedStoreId]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^\d\s+]/g, '');
    setPhone(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (!cleanName || cleanName.length < 2) {
      setError('Please enter your Full Name.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError('Please enter a valid Real Email Address.');
      return;
    }
    if (!cleanPhone) {
      setError('Please enter your Phone Number.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (!selectedRole) {
      showToast('Please choose your role first');
      setError('Please choose your role first.');
      return;
    }

    // Role-specific validations
    if (selectedRole === 'Shop Worker') {
      if (!assignedStoreId) {
        setError('Please select which Shop you work for.');
        return;
      }
    } else if (selectedRole === 'Seller') {
      if (!shopName.trim()) {
        setError('Please enter your Shop Name.');
        return;
      }
    } else if (selectedRole === 'Event Organiser') {
      if (!organisationName.trim()) {
        setError('Please enter your Organisation Name.');
        return;
      }
    } else if (selectedRole === 'Driver') {
      if (!licensePlate.trim() || !driverLicenseNumber.trim()) {
        setError('Please enter your License Plate and Driver\'s License Number.');
        return;
      }
    }

    setIsSubmitting(true);
    setAuthRegistrationLock(true);

    try {
      // 1. Create or authenticate user with Firebase Auth
      let user = auth.currentUser;
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        user = cred.user;
      } catch (authErr: any) {
        if (authErr?.code === 'auth/email-already-in-use') {
          try {
            const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
            user = cred.user;
          } catch (signInErr: any) {
            const sCode = signInErr?.code || '';
            if (sCode === 'auth/invalid-credential' || sCode === 'auth/wrong-password') {
              throw new Error(
                `An account for ${cleanEmail} already exists in Firebase. Tap "Log In" at the top right with your existing password, use "Continue with Google", or reset your password.`
              );
            }
            throw signInErr;
          }
        } else {
          throw authErr;
        }
      }

      if (!user) {
        throw new Error('Could not establish Firebase session. Please try again.');
      }

      try {
        await updateProfile(user, { displayName: cleanName });
      } catch (e) {}

      // Automatically send Firebase email verification link for email/password signups
      if (!user.emailVerified) {
        await sendFirebaseVerificationLink(user);
      }

      const uid = user.uid;
      const targetStoreObj = stores.find((s) => s.id === assignedStoreId);
      const isCustomer = selectedRole === 'Customer';

      // 2. Prepare user profile document
      const userProfile = {
        id: uid,
        name: cleanName,
        fullName: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        role: selectedRole,
        // Customers are active and approved immediately; others require Admin approval
        status: isCustomer ? 'active' : 'pending',
        isApproved: isCustomer,
        createdAt: new Date().toISOString(),
        walletBalance: 0,
        isRegistered: true,
        emailVerified: Boolean(user.emailVerified),
        // Role specific metadata
        ...(selectedRole === 'Shop Worker' && {
          assignedStoreId: assignedStoreId,
          assignedStoreName: targetStoreObj?.name || 'Assigned Shop',
        }),
        ...(selectedRole === 'Seller' && {
          shopName: shopName.trim(),
          whatToSell: whatToSell,
        }),
        ...(selectedRole === 'Event Organiser' && {
          organisationName: organisationName.trim(),
        }),
        ...(selectedRole === 'Driver' && {
          vehicleType: vehicleType,
          licensePlate: licensePlate.trim().toUpperCase(),
          driverLicenseNumber: driverLicenseNumber.trim().toUpperCase(),
        }),
      };

      // 3. Persist to Firestore > users collection
      try {
        await setDoc(doc(db, 'users', uid), userProfile, { merge: true });
        if (isCustomer) {
          await setDoc(doc(db, 'wallets', uid), {
            userId: uid,
            balance: 0,
            createdAt: new Date().toISOString(),
          }, { merge: true });
        }
      } catch (dbErr) {
        console.warn('Firestore write notice:', dbErr);
      }

      // Also persist to local cache for instant reload
      try {
        const existingRaw = localStorage.getItem('ub_registered_users');
        const existingList = existingRaw ? JSON.parse(existingRaw) : [];
        const filtered = existingList.filter((u: any) => u.email?.toLowerCase() !== cleanEmail);
        filtered.push(userProfile);
        localStorage.setItem('ub_registered_users', JSON.stringify(filtered));
      } catch (e) {}

      // 4. ROLE LOGIN LOGIC (VERY IMPORTANT)
      if (isCustomer) {
        // Customer: Automatically log in immediately and resume checkout without waiting
        setCurrentUser(userProfile);
        localStorage.setItem('wallet_balance', '0');
        localStorage.setItem(`ub_wallet_balance_${cleanEmail}`, '0');
        localStorage.setItem('ub_user_profile', JSON.stringify(userProfile));
        localStorage.setItem('ub_has_registered', 'true');
        setWelcomeMessage(`Welcome ${cleanName}! Your account is now active.`);

        try {
          confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
        } catch (e) {}

        // Resume pending checkout if any
        if (pendingCheckoutTarget) {
          const target = pendingCheckoutTarget;
          setPendingCheckoutTarget(null);
          if (target.type === 'ticket' && target.data) {
            setSelectedBuyingEvent(target.data);
            navigateTo('/');
            return;
          }
          if (target.type === 'cart') {
            navigateTo('/food-drinks');
            return;
          }
          if (target.type === 'topup') {
            navigateTo('/top-up');
            return;
          }
        }
        navigateTo('/');
      } else {
        // Event Organiser OR Seller OR Driver OR Shop Worker:
        // Do NOT log them in automatically. Sign out and display pending approval screen.
        await signOut(auth);
        localStorage.removeItem('ub_admin_session');
        localStorage.removeItem('ub_user_profile');
        localStorage.removeItem('ub_has_registered');
        setIsPendingApprovalView(true);
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError(`An account for ${cleanEmail} already exists with different credentials. Tap "Log In" above or reset your password.`);
      } else if (code === 'auth/email-already-in-use') {
        setError(`An account for ${cleanEmail} already exists. Please tap "Log In" above.`);
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak. Please choose at least 6 characters.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection and try again.');
      } else {
        setError(err?.message || 'Registration failed. Please check your details.');
      }
    } finally {
      setAuthRegistrationLock(false);
      setIsSubmitting(false);
    }
  };

  const ROLE_DISPLAY_NAMES: Record<UserRoleChoice, string> = {
    Customer: 'Customer',
    'Event Organiser': 'Event Organiser',
    Seller: 'Seller / Vendor',
    Driver: 'Driver (Order Delivery)',
    'Shop Worker': 'Shop Worker',
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    if (!selectedRole) {
      showToast('Please choose your role first');
      return;
    }
    if (selectedRole !== 'Customer') {
      showToast('Only Customers can log in with Google. Please complete the form above for approval.');
      return;
    }
    if (isGoogleLoading || isSubmitting) return;

    setIsGoogleLoading(true);
    try {
      const res = await signInWithGoogle({
        role: 'Customer',
      });
      if (!res.success) {
        setError(res.error || 'Google sign-in cancelled.');
      }
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // SCREEN 4: PENDING APPROVAL VIEW (FOR ORGANISER, SELLER, DRIVER, WORKER)
  if (isPendingApprovalView) {
    return (
      <div className="min-h-[85vh] flex flex-col justify-center px-4 py-8 max-w-md mx-auto text-white animate-in fade-in duration-200">
        <div className="bg-[#181818] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5 text-center">
          <div className="w-16 h-16 rounded-3xl bg-yellow-400/20 text-[#FACC15] flex items-center justify-center mx-auto border border-[#FACC15]/40 shadow-lg">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase text-[#FACC15] bg-[#FACC15]/10 px-3 py-1 rounded-full border border-[#FACC15]/20">
              Role: {selectedRole}
            </span>
            {/* EXACT REQUIRED NOTIFICATION STRING */}
            <h2 className="text-lg font-black text-white tracking-tight leading-snug pt-2">
              Your account is pending approval.
            </h2>
            <p className="text-xs text-gray-300 leading-relaxed max-w-xs mx-auto">
              Our team will review your application. You will get an SMS / notification when approved.
            </p>
          </div>

          <div className="bg-black/60 p-3.5 rounded-2xl border border-white/5 text-left space-y-1.5 text-xs text-gray-300">
            <p className="font-bold text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Application Details Logged:</span>
            </p>
            <p className="text-gray-400 text-[11px]">
              Name: <strong className="text-white">{fullName}</strong>
            </p>
            <p className="text-gray-400 text-[11px]">
              Email: <strong className="text-white">{email}</strong>
            </p>
            <p className="text-gray-400 text-[11px]">
              Phone: <strong className="text-white">{phone}</strong>
            </p>
            {selectedRole === 'Shop Worker' && (
              <p className="text-gray-400 text-[11px]">
                Workplace Shop: <strong className="text-[#FACC15]">{stores.find(s => s.id === assignedStoreId)?.name || 'Store'}</strong>
              </p>
            )}
            {selectedRole === 'Seller' && (
              <p className="text-gray-400 text-[11px]">
                Shop Name: <strong className="text-[#FACC15]">{shopName}</strong> ({whatToSell})
              </p>
            )}
            {selectedRole === 'Event Organiser' && (
              <p className="text-gray-400 text-[11px]">
                Organisation: <strong className="text-[#FACC15]">{organisationName}</strong>
              </p>
            )}
            {selectedRole === 'Driver' && (
              <p className="text-gray-400 text-[11px]">
                Vehicle: <strong className="text-[#FACC15]">{vehicleType}</strong> ({licensePlate})
              </p>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="w-full py-3.5 bg-[#FACC15] hover:bg-yellow-400 text-black font-black text-xs rounded-2xl shadow-xl transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              <span>Browse Discovery as Guest</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPendingApprovalView(false);
                setSelectedRole('Customer');
              }}
              className="text-xs text-gray-400 hover:text-white underline pt-1 block mx-auto cursor-pointer"
            >
              Register a different account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
      {toastMessage && (
        <div
          role="alert"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm bg-[#161616] border border-[#FACC15] text-[#FACC15] px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-black animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-[#FACC15]" />
          <span>{toastMessage}</span>
        </div>
      )}
      {/* Top Header Branding */}
      <div className="text-center mb-5">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="w-14 h-14 rounded-2xl bg-[#FACC15] text-black flex items-center justify-center font-black text-xl mx-auto shadow-xl mb-2.5 active:scale-95 transition cursor-pointer"
          title="Back to Discovery"
        >
          UB
        </button>
        <h1 className="text-xl font-black tracking-tight text-white uppercase">
          Universal Band Mall
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Discovery, Ticketing & Marketplace for South Africa
        </p>
      </div>

      {/* Main Registration Card */}
      <div className="bg-[#161616] border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Header with Title and Login Link */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wide">
              Create an Account
            </h2>
            <p className="text-[11px] text-gray-400">
              Pick your role to get access in seconds
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigateTo('/login')}
            className="text-xs text-[#FACC15] font-black hover:underline cursor-pointer"
          >
            Log In ➔
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs rounded-2xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 1. Full Name */}
          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              <span>Full Name *</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Tetelo Phokwane"
              className="w-full bg-black/60 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-[#FACC15]"
            />
          </div>

          {/* 2. Phone Number */}
          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-400" />
              <span>Phone Number *</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-black text-[#FACC15]">🇿🇦 +27</span>
              <input
                type="tel"
                required
                value={phone}
                onChange={handlePhoneChange}
                placeholder="082 123 4567"
                className="w-full bg-black/60 border border-white/15 rounded-xl pl-16 pr-3.5 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-[#FACC15]"
              />
            </div>
          </div>

          {/* 3. Email */}
          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-gray-400" />
              <span>Email Address *</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. tetelophokwane98@gmail.com"
              className="w-full bg-black/60 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-[#FACC15]"
            />
          </div>

          {/* 4. Password */}
          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-gray-400" />
              <span>Password (Min 6 characters) *</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/60 border border-white/15 rounded-xl px-3.5 pr-10 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-[#FACC15]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 5. "What are you registering as?" - MUST PICK ONE (REQUIREMENT 3) */}
          <div className="pt-2">
            <label className="block text-xs font-black text-[#FACC15] uppercase tracking-wide mb-2">
              What are you registering as? *
            </label>
            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  {
                    role: 'Customer',
                    label: 'a) Customer',
                    desc: 'Buy event tickets, food & merchandise (Instant access)',
                    icon: ShoppingBag,
                  },
                  {
                    role: 'Event Organiser',
                    label: 'b) Event Organiser',
                    desc: 'Create events, sell tickets & scan passes at gates',
                    icon: Calendar,
                  },
                  {
                    role: 'Seller',
                    label: 'c) Seller / Vendor',
                    desc: 'Manage your shop, list products & fulfill orders',
                    icon: StoreIcon,
                  },
                  {
                    role: 'Driver',
                    label: 'd) Driver (Order Delivery)',
                    desc: 'Deliver store food, drinks & merchandise orders to customers',
                    icon: Bike,
                  },
                  {
                    role: 'Shop Worker',
                    label: 'e) Shop Worker',
                    desc: 'Works inside an approved shop to prepare orders',
                    icon: Briefcase,
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const isSelected = selectedRole === option.role;
                return (
                  <button
                    key={option.role}
                    type="button"
                    onClick={() => setSelectedRole(option.role)}
                    className={`w-full p-3 rounded-2xl border transition text-left flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-[#FACC15]/15 border-[#FACC15] text-white shadow-md'
                        : 'bg-black/40 border-white/10 text-gray-300 hover:bg-black/70'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-[#FACC15] text-black font-black'
                          : 'bg-white/5 text-gray-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-black block tracking-tight">
                        {option.label}
                      </span>
                      <span className="text-[10px] text-gray-400 block truncate">
                        {option.desc}
                      </span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-[#FACC15] bg-[#FACC15]'
                          : 'border-white/30'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. ROLE-SPECIFIC CONDITIONAL FIELDS (REQUIREMENT 3) */}
          {/* If Shop Worker: "Which Shop do you work for?" - dropdown of existing shops */}
          {selectedRole === 'Shop Worker' && (
            <div className="p-3.5 bg-black/70 border border-emerald-500/30 rounded-2xl space-y-2 animate-in fade-in">
              <label className="block text-xs font-bold text-emerald-400">
                Which Shop do you work for? *
              </label>
              <select
                value={assignedStoreId}
                onChange={(e) => setAssignedStoreId(e.target.value)}
                className="w-full bg-[#181818] border border-white/20 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-[#FACC15]"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-black text-white">
                    {s.name} ({s.location || 'Limpopo'})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400">
                You will only have access to this shop's order queue once approved.
              </p>
            </div>
          )}

          {/* If Seller: Shop Name, What do you sell? */}
          {selectedRole === 'Seller' && (
            <div className="p-3.5 bg-black/70 border border-yellow-500/30 rounded-2xl space-y-3 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-yellow-300 mb-1">
                  Shop Name *
                </label>
                <input
                  type="text"
                  required
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g. Marbi Grill Masters"
                  className="w-full bg-[#181818] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-yellow-300 mb-1">
                  What do you sell? *
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['Food', 'Drinks', 'Both', 'Merch & Fashion'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setWhatToSell(opt)}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition cursor-pointer ${
                        whatToSell === opt
                          ? 'bg-[#FACC15] text-black border-[#FACC15]'
                          : 'bg-black/50 text-gray-300 border-white/10 hover:bg-black/80'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* If Event Organiser: Organisation Name */}
          {selectedRole === 'Event Organiser' && (
            <div className="p-3.5 bg-black/70 border border-purple-500/30 rounded-2xl space-y-2 animate-in fade-in">
              <label className="block text-xs font-bold text-purple-300">
                Organisation Name *
              </label>
              <input
                type="text"
                required
                value={organisationName}
                onChange={(e) => setOrganisationName(e.target.value)}
                placeholder="e.g. Limpopo Summer Fest Promotions"
                className="w-full bg-[#181818] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-[#FACC15]"
              />
              <p className="text-[10px] text-gray-400">
                Your organisation profile will be displayed on ticket checkout and passes.
              </p>
            </div>
          )}

          {/* If Driver: Vehicle Type, License Plate, Driver's License Number */}
          {selectedRole === 'Driver' && (
            <div className="p-3.5 bg-black/70 border border-blue-500/30 rounded-2xl space-y-3 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-blue-300 mb-1">
                  Delivery Vehicle Type *
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as any)}
                  className="w-full bg-[#181818] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-[#FACC15]"
                >
                  <option value="Delivery Scooter / Motorbike">Delivery Scooter / Motorbike</option>
                  <option value="Delivery Car / Hatchback">Delivery Car / Hatchback</option>
                  <option value="Delivery Bakkie / Van">Delivery Bakkie / Van</option>
                  <option value="Delivery Bicycle">Delivery Bicycle</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Used exclusively for delivering customer orders from stores, kitchens, and bars.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-blue-300 mb-1">
                  Vehicle License Plate *
                </label>
                <input
                  type="text"
                  required
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  placeholder="e.g. DH 84 LP GP"
                  className="w-full bg-[#181818] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-bold uppercase focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-blue-300 mb-1">
                  Courier Driver's License Number *
                </label>
                <input
                  type="text"
                  required
                  value={driverLicenseNumber}
                  onChange={(e) => setDriverLicenseNumber(e.target.value)}
                  placeholder="e.g. 9501015800088A"
                  className="w-full bg-[#181818] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-bold uppercase focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || isGoogleLoading}
            className="w-full py-3.5 bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-xs rounded-2xl shadow-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            <span>
              {isSubmitting
                ? 'Creating Account...'
                : !selectedRole || selectedRole === 'Customer'
                ? 'Register & Start Shopping'
                : 'Submit Application for Approval'}
            </span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] uppercase font-black tracking-widest text-gray-500">OR</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google Sign-In Button (Enabled & yellow ONLY for Customer role) */}
        <div className="space-y-1.5">
          <div className="bg-black p-1 rounded-2xl border border-white/10">
            <button
              type="button"
              aria-disabled={selectedRole !== 'Customer'}
              onClick={handleGoogleSignUp}
              className={
                selectedRole === 'Customer'
                  ? 'w-full py-3.5 px-4 bg-[#FACC15] hover:bg-yellow-400 active:scale-[0.99] text-black font-black text-xs rounded-xl shadow-xl transition cursor-pointer flex items-center justify-center gap-2.5'
                  : 'w-full py-3.5 px-4 bg-white/10 text-gray-400 font-black text-xs rounded-xl border border-white/10 opacity-55 cursor-not-allowed flex items-center justify-center gap-2.5 transition'
              }
            >
              <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              </span>
              <span>
                {isGoogleLoading
                  ? 'Signing in with Google...'
                  : selectedRole === 'Customer'
                  ? 'Continue with Google as Customer'
                  : selectedRole
                  ? 'Google Sign-In is for Customers only'
                  : 'Select a role to continue with Google'}
              </span>
            </button>
          </div>
          {selectedRole && selectedRole !== 'Customer' && (
            <p className="text-[10px] text-center text-gray-400">
              {ROLE_DISPLAY_NAMES[selectedRole]} accounts must register via the form above so admin can review your details.
            </p>
          )}
        </div>

        {/* Guest Browse Option */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="text-xs text-gray-400 hover:text-white transition cursor-pointer underline font-medium"
          >
            Continue browsing Discovery as Guest
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
