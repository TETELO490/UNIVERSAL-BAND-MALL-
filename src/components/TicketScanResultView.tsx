import React, { useEffect, useState, useRef } from 'react';
import { User, Clock, AlertCircle, Check, ArrowRight, ShieldAlert, LogOut, LogIn, XCircle, CheckCircle2 } from 'lucide-react';

export interface TicketScanResultProps {
  status: 'approved' | 'declined' | 'already-inside' | 'exited';
  title?: string;
  subtitle?: string;
  attendeeName?: string;
  ticketCode?: string;
  eventTitle?: string;
  reason?: string;
  timestamp?: string;
  details?: Array<{ label: string; value: string }>;
  onScanNext: () => void;
  onCheckOut?: () => void;
  onCheckIn?: () => void;
  autoCloseSeconds?: number;
  isFullScreen?: boolean;
  children?: React.ReactNode;
}

export const TicketScanResultView: React.FC<TicketScanResultProps> = ({
  status,
  title,
  subtitle,
  attendeeName,
  ticketCode,
  eventTitle,
  reason,
  timestamp,
  details,
  onScanNext,
  onCheckOut,
  onCheckIn,
  autoCloseSeconds = 5,
  isFullScreen = false,
  children,
}) => {
  const isApproved = status === 'approved';
  const isDeclined = status === 'declined';
  const isAlreadyInside = status === 'already-inside';
  const isExited = status === 'exited';

  const [secondsLeft, setSecondsLeft] = useState<number>(autoCloseSeconds);
  const onScanNextRef = useRef(onScanNext);

  // Keep ref up to date without triggering interval re-runs
  useEffect(() => {
    onScanNextRef.current = onScanNext;
  }, [onScanNext]);

  // Robust countdown timer: runs once on mount, counts down accurately to 0
  useEffect(() => {
    setSecondsLeft(autoCloseSeconds);

    const startTime = Date.now();
    const totalMs = autoCloseSeconds * 1000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingSec = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
      setSecondsLeft(remainingSec);

      if (remainingSec <= 0) {
        clearInterval(interval);
        onScanNextRef.current();
      }
    }, 250);

    const safetyTimeout = setTimeout(() => {
      clearInterval(interval);
      onScanNextRef.current();
    }, totalMs + 100);

    return () => {
      clearInterval(interval);
      clearTimeout(safetyTimeout);
    };
  }, [autoCloseSeconds]);

  const handleSkip = () => {
    onScanNextRef.current();
  };

  const displayTime =
    timestamp ||
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center p-4 sm:p-5 bg-[#141414] rounded-3xl border border-white/10 shadow-2xl text-white animate-in zoom-in-95 duration-200">
      {/* 5-Second Animated Progress Bar */}
      <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-5">
        <div
          className={`h-full ${
            isApproved
              ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]'
              : isAlreadyInside
              ? 'bg-amber-500 shadow-[0_0_8px_#F59E0B]'
              : isExited
              ? 'bg-blue-500 shadow-[0_0_8px_#3B82F6]'
              : 'bg-rose-500 shadow-[0_0_8px_#EF4444]'
          } animate-progress-5s`}
          style={{ animationDuration: `${autoCloseSeconds}s` }}
        />
      </div>

      {/* Professional Animated Circle & Status Mark */}
      <div className="relative mb-4 flex items-center justify-center">
        {/* Approved State: Animated Circle created -> Fills green -> Inside green circle, white checkmark draws */}
        {isApproved && (
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* Soft outer aura ripple */}
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ripple-pulse" />

            <svg
              className="w-28 h-28 relative z-10 drop-shadow-[0_0_18px_rgba(16,185,129,0.5)]"
              viewBox="0 0 100 100"
            >
              {/* Animated Drawing Circle that fills with emerald green */}
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="#10B981"
                strokeWidth="5.5"
                strokeLinecap="round"
                className="animate-draw-circle animate-circle-fill-green"
              />
              {/* Animated Drawing White Checkmark inside the green circle */}
              <path
                d="M30 52 L43 65 L70 36"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-draw-check"
              />
            </svg>
          </div>
        )}

        {/* Declined / Invalid State: Animated Circle created in Red -> Fills red -> Inside red circle, white cross draws */}
        {isDeclined && (
          <div className="relative w-28 h-28 flex items-center justify-center animate-shake">
            {/* Soft outer aura ripple */}
            <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ripple-pulse" />

            <svg
              className="w-28 h-28 relative z-10 drop-shadow-[0_0_18px_rgba(239,68,68,0.5)]"
              viewBox="0 0 100 100"
            >
              {/* Animated Drawing Circle that fills with crimson red */}
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="#EF4444"
                strokeWidth="5.5"
                strokeLinecap="round"
                className="animate-draw-circle animate-circle-fill-red"
              />
              {/* Animated Drawing Cross (X) inside the circle */}
              <line
                x1="34"
                y1="34"
                x2="66"
                y2="66"
                stroke="#FFFFFF"
                strokeWidth="6"
                strokeLinecap="round"
                className="animate-draw-cross-1"
              />
              <line
                x1="66"
                y1="34"
                x2="34"
                y2="66"
                stroke="#FFFFFF"
                strokeWidth="6"
                strokeLinecap="round"
                className="animate-draw-cross-2"
              />
            </svg>
          </div>
        )}

        {/* Already Inside State: Animated Amber Circle */}
        {isAlreadyInside && (
          <div className="relative w-28 h-28 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ripple-pulse" />
            <svg
              className="w-28 h-28 relative z-10 drop-shadow-[0_0_18px_rgba(245,158,11,0.5)]"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="5.5"
                strokeLinecap="round"
                className="animate-draw-circle animate-circle-fill-amber"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <ShieldAlert className="w-12 h-12 text-black animate-scale-in-success stroke-[2.5]" />
            </div>
          </div>
        )}

        {/* Exited State: Animated Blue Circle */}
        {isExited && (
          <div className="relative w-28 h-28 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ripple-pulse" />
            <svg
              className="w-28 h-28 relative z-10 drop-shadow-[0_0_18px_rgba(59,130,246,0.5)]"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="5.5"
                strokeLinecap="round"
                className="animate-draw-circle animate-circle-fill-blue"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <LogIn className="w-12 h-12 text-white animate-scale-in-success stroke-[2.5]" />
            </div>
          </div>
        )}
      </div>

      {/* Main Title & Subtitle Badge */}
      <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1 text-white">
        {title ||
          (isApproved
            ? 'TICKET VERIFIED'
            : isAlreadyInside
            ? 'ALREADY INSIDE'
            : isExited
            ? 'PASS EXITED'
            : 'TICKET NOT VALID')}
      </h2>

      <div className="mb-4">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
            isApproved
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : isAlreadyInside
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : isExited
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
          }`}
        >
          {isApproved ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Access Granted • Admitted Inside</span>
            </>
          ) : isAlreadyInside ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Person Already Inside Venue</span>
            </>
          ) : isExited ? (
            <>
              <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Person Exited • Re-Entry Allowed</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Access Denied • Invalid Pass</span>
            </>
          )}
        </span>
      </div>

      {/* Reason Box for Declined / Invalid / Alert */}
      {reason && (
        <div
          className={`w-full text-xs font-bold p-3 rounded-xl mb-3 text-left border ${
            isAlreadyInside
              ? 'border-amber-500/40 text-amber-200 bg-amber-500/10'
              : 'border-rose-500/40 text-rose-200 bg-rose-500/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1 leading-snug">{reason}</div>
          </div>
        </div>
      )}

      {/* Attendee / Ticket Details Card */}
      <div className="w-full bg-[#1A1A1A] rounded-2xl border border-white/10 p-3.5 space-y-2 text-left mb-4 shadow-inner text-xs">
        {attendeeName && attendeeName !== 'Attendee' && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400 font-medium">Attendee</span>
            <span className="text-white font-bold">{attendeeName}</span>
          </div>
        )}
        {eventTitle && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400 font-medium">Event / Venue</span>
            <span className="text-white font-bold truncate max-w-[200px]">{eventTitle}</span>
          </div>
        )}
        {ticketCode && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400 font-medium">Scanned Code</span>
            <span className="font-mono text-[#FACC15] font-bold tracking-wider">{ticketCode}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
          <span className="text-gray-400 font-medium">Scan Time</span>
          <span className="text-gray-300 font-semibold">{displayTime}</span>
        </div>
      </div>

      {/* Extra Action: Check Out Attendee (Send Outside) if Already Inside */}
      {isAlreadyInside && onCheckOut && (
        <button
          type="button"
          onClick={onCheckOut}
          className="w-full mb-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow cursor-pointer"
        >
          <LogOut className="w-4 h-4 stroke-[2.5]" />
          <span>Check Out Attendee (Send Outside)</span>
        </button>
      )}

      {/* Extra Action: Allow Re-Entry if Exited */}
      {isExited && onCheckIn && (
        <button
          type="button"
          onClick={onCheckIn}
          className="w-full mb-2.5 bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow cursor-pointer"
        >
          <LogIn className="w-4 h-4 stroke-[2.5]" />
          <span>Allow Re-Entry (Check In)</span>
        </button>
      )}

      {/* Primary Action: SCAN NEXT PERSON Button */}
      <button
        type="button"
        onClick={handleSkip}
        className={`w-full font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow-lg cursor-pointer ${
          isApproved
            ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
            : isDeclined
            ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
            : isAlreadyInside
            ? 'bg-[#FACC15] hover:bg-yellow-400 text-black shadow-yellow-500/20'
            : 'bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/20'
        }`}
      >
        <span>Scan Next Person</span>
        <ArrowRight className="w-4 h-4 stroke-[3]" />
      </button>

      {children}

      {/* Countdown Footnote */}
      <p className="text-[11px] text-gray-400 mt-3 font-medium">
        Auto-advancing in <span className="text-white font-bold">{secondsLeft}s</span>
      </p>
    </div>
  );
};
