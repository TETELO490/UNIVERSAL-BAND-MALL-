import React, { useRef, useState } from 'react';

interface PatternGridProps {
  dots?: number[];
  value: number[];
  onChange: (next: number[]) => void;
  showNumbers?: boolean;
  disabled?: boolean;
  sizeClassName?: string;
}

export const PatternGrid: React.FC<PatternGridProps> = ({
  dots = [0, 1, 2, 3, 4, 5, 6, 7, 8],
  value,
  onChange,
  showNumbers = true,
  disabled = false,
  sizeClassName = 'w-60 h-60',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const appendDot = (dot: number, base: number[]): number[] => {
    if (base.includes(dot)) return base;
    return [...base, dot];
  };

  const getDotFromPoint = (clientX: number, clientY: number): number | null => {
    if (typeof document === 'undefined') return null;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const target = el.closest('[data-pattern-dot]') as HTMLElement | null;
    if (!target) return null;
    const raw = target.getAttribute('data-pattern-dot');
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    setIsDrawing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const dot = getDotFromPoint(e.clientX, e.clientY);
    if (dot !== null) {
      const next = appendDot(dot, value);
      if (next !== value) {
        onChange(next);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || disabled) return;
    const dot = getDotFromPoint(e.clientX, e.clientY);
    if (dot !== null && !value.includes(dot)) {
      onChange([...value, dot]);
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  // Compute SVG center coordinates (0..100 percentage space) for each 3x3 cell
  const getDotCoords = (dot: number) => {
    const idx = dots.indexOf(dot);
    if (idx < 0) return null;
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    // Grid centers at 16.67%, 50%, 83.33%
    const x = ((col * 2 + 1) / 6) * 100;
    const y = ((row * 2 + 1) / 6) * 100;
    return { x, y };
  };

  const linePoints = value
    .map((dot) => getDotCoords(dot))
    .filter((pt): pt is { x: number; y: number } => pt !== null);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      className={`${sizeClassName} mx-auto bg-black/60 border border-white/15 rounded-2xl p-4 grid grid-cols-3 grid-rows-3 gap-4 select-none touch-none relative`}
    >
      {/* Connector lines SVG overlay */}
      {linePoints.length >= 2 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-0 p-4"
        >
          <polyline
            fill="none"
            stroke="#FACC15"
            strokeOpacity={showNumbers ? 0.85 : 0.45}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={linePoints.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        </svg>
      )}

      {dots.map((dot) => {
        const isSelected = value.includes(dot);
        const order = value.indexOf(dot);
        return (
          <div
            key={dot}
            data-pattern-dot={dot}
            role="button"
            tabIndex={0}
            aria-label={`Pattern dot ${dot}`}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                if (!value.includes(dot)) {
                  onChange([...value, dot]);
                }
              }
            }}
            className={`relative z-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isSelected
                ? 'bg-[#FACC15] scale-110 shadow-[0_0_15px_#FACC15]'
                : 'bg-white/15 hover:bg-white/30'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full pointer-events-none ${
                isSelected ? 'bg-black' : 'bg-white/60'
              }`}
            />
            {isSelected && showNumbers && (
              <span className="absolute -top-1 -right-1 bg-black text-[#FACC15] text-[9px] font-black w-4 h-4 rounded-full border border-[#FACC15] flex items-center justify-center pointer-events-none">
                {order + 1}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
