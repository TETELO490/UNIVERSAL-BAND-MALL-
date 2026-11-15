import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 left-4 right-4 md:left-auto md:right-4 z-[9998] flex items-center gap-2 rounded-xl bg-amber-500/95 backdrop-blur-md px-3.5 py-2 text-xs font-bold text-black shadow-xl border border-amber-300">
      <WifiOff className="w-4 h-4 shrink-0 text-black animate-pulse" />
      <span>Offline Mode — Cached tickets & stores available.</span>
    </div>
  );
};
export default OfflineIndicator;
