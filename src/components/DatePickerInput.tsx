import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { parseEventDate } from '../utils/dateHelper';

export interface DatePickerInputProps {
  value: string; // Displayed e.g. "26 Aug 2026, 18:00" or "26 Aug 2026"
  onChange: (formattedValue: string) => void;
  includeTime?: boolean; // whether to include HH:mm
  label?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  hasError?: boolean;
  disabled?: boolean;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  value,
  onChange,
  includeTime = true,
  label,
  placeholder = 'Tap to select date from calendar',
  className = '',
  required = false,
  hasError = false,
  disabled = false,
}) => {
  const nativePickerRef = useRef<HTMLInputElement>(null);

  // Helper: Format raw ISO / native picker value to "DD MMM YYYY" or "DD MMM YYYY, HH:mm"
  const formatNativeToDisplay = (rawString: string): string => {
    if (!rawString) return '';
    const parsed = parseEventDate(rawString);
    const dateObj = parsed instanceof Date ? parsed : new Date(rawString);
    if (isNaN(dateObj.getTime())) return rawString;

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = SHORT_MONTHS[dateObj.getMonth()];
    const year = dateObj.getFullYear();

    if (includeTime) {
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      return `${day} ${month} ${year}, ${hours}:${minutes}`;
    }

    return `${day} ${month} ${year}`;
  };

  // Helper: Convert display string e.g. "26 Aug 2026, 18:00" or "26 Aug 2026" into YYYY-MM-DD or YYYY-MM-DDTHH:mm
  const getNativeInputValue = (): string => {
    if (!value) return '';
    const parsed = parseEventDate(value);
    const dateObj = parsed instanceof Date ? parsed : new Date(value);
    if (isNaN(dateObj.getTime())) return '';

    const pad = (num: number) => String(num).padStart(2, '0');
    const y = dateObj.getFullYear();
    const m = pad(dateObj.getMonth() + 1);
    const d = pad(dateObj.getDate());

    if (includeTime) {
      const hh = pad(dateObj.getHours());
      const mm = pad(dateObj.getMinutes());
      return `${y}-${m}-${d}T${hh}:${mm}`;
    }

    return `${y}-${m}-${d}`;
  };

  // Trigger browser's native picker popup
  const triggerNativePicker = () => {
    if (disabled) return;
    const el = nativePickerRef.current;
    if (el) {
      try {
        if ('showPicker' in el && typeof (el as any).showPicker === 'function') {
          (el as any).showPicker();
        } else {
          el.focus();
          el.click();
        }
      } catch (err) {
        el.focus();
        el.click();
      }
    }
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue) {
      const formatted = formatNativeToDisplay(rawValue);
      onChange(formatted);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-gray-300 font-semibold mb-1 text-xs flex items-center justify-between">
          <span>
            {label} {required && <span className="text-[#FACC15]">*</span>}
          </span>
          <span className="text-[10px] text-gray-500 font-normal">Pick from calendar</span>
        </label>
      )}

      {/* Visible Clickable Field (Triggers Native Calendar Popup) */}
      <div
        onClick={triggerNativePicker}
        className={`w-full bg-[#121212] text-white px-3 py-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-white/5'
            : hasError
            ? 'border-red-500 focus:border-red-400 text-red-200'
            : 'border-white/10 hover:border-[#FACC15]'
        }`}
      >
        <span className={`text-xs font-bold truncate ${value ? 'text-white font-mono' : 'text-gray-500'}`}>
          {value || placeholder}
        </span>

        {/* Clickable Calendar Icon */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerNativePicker();
          }}
          disabled={disabled}
          className="p-1 hover:bg-white/10 rounded-lg text-[#FACC15] transition cursor-pointer shrink-0 ml-2"
          title="Click to open calendar"
        >
          <Calendar className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* Hidden Native Date/Datetime Picker Input */}
      <input
        ref={nativePickerRef}
        type={includeTime ? 'datetime-local' : 'date'}
        value={getNativeInputValue()}
        onChange={handleNativeInputChange}
        required={required}
        disabled={disabled}
        className="sr-only opacity-0 absolute inset-0 w-full h-full pointer-events-none"
        tabIndex={-1}
      />
    </div>
  );
};
