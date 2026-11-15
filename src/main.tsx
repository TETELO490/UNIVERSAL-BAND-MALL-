import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';

async function clearServiceWorkersAndCaches() {
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch {}
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
}

function sanitizeCorruptLocalStorage() {
  try {
    localStorage.removeItem('ub_locked');

    const arrayKeys = [
      'ub_local_stores',
      'ub_local_events',
      'ub_user_tickets',
      'ub_wallet_transactions',
      'tymebank_sms_logs',
      'ub_mall_orders',
      'ub_store_messages',
      'ub_store_workers',
    ];
    for (const key of arrayKeys) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    }

    const objectKeys = ['ub_mall_carts', 'ub_store_presence', 'ub_user_profile'];
    for (const key of objectKeys) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    }

    const rawBal = localStorage.getItem('wallet_balance');
    if (rawBal !== null && (isNaN(Number(rawBal)) || !isFinite(Number(rawBal)))) {
      localStorage.setItem('wallet_balance', '0');
    }
  } catch {}
}

// Run lightweight storage sanitization immediately before first mount so corrupt cache never crashes launch
sanitizeCorruptLocalStorage();

// Clean up any stale service workers in dev/preview or native Capacitor APK environment
if (typeof window !== 'undefined' && (import.meta.env.DEV || Capacitor.isNativePlatform())) {
  clearServiceWorkersAndCaches();
}

// Auto-recover cleanly if a lazy-loaded Vite chunk is stale after a new deployment
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const reloadFlag = 'ub_chunk_reload_attempted';
    if (!sessionStorage.getItem(reloadFlag)) {
      sessionStorage.setItem(reloadFlag, '1');
      clearServiceWorkersAndCaches().finally(() => {
        window.location.reload();
      });
    }
  });
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = async () => {
    sanitizeCorruptLocalStorage();
    try {
      sessionStorage.clear();
    } catch {}
    await clearServiceWorkersAndCaches();
    this.setState({ hasError: false, error: null });
    window.location.replace('/');
  };

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || 'Unexpected startup error';
      return (
        <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 text-center">
          <img
            src="/universal-band-logo.jpg"
            alt="Universal Band"
            className="w-16 h-16 rounded-2xl object-cover border border-[#FACC15]/40 mb-4 shadow-lg"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <h1 className="text-xl font-black mb-2 text-white">Universal Band App</h1>
          <p className="text-xs text-gray-400 mb-3 max-w-sm">
            Something went wrong while launching. Click below to clear cached session data and launch directly.
          </p>
          <p className="text-[11px] font-mono text-amber-300/90 bg-white/5 border border-white/10 rounded-xl px-3 py-2 mb-6 max-w-sm break-words">
            {errMsg}
          </p>
          <button
            onClick={this.handleReset}
            className="bg-[#FACC15] hover:bg-yellow-400 text-black font-extrabold text-sm px-6 py-3 rounded-xl shadow-lg transition cursor-pointer"
          >
            Launch Universal Band App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
