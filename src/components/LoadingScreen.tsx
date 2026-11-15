import React from 'react';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[100] bg-[#0A0A0A] flex flex-col items-center justify-center">
      <div className="w-16 h-16 rounded-full border-4 border-yellow-400/20 border-t-yellow-400 animate-spin mb-4" />
      <h1 className="text-xl font-black text-white tracking-tight">Universal Band</h1>
      <p className="text-xs text-gray-500 font-medium mt-1">Preparing your experience...</p>
    </div>
  );
};
