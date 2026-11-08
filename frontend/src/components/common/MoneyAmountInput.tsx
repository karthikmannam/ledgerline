import React, { useState, useEffect } from 'react';
import { rupeesToPaise, paiseToDecimalInput, formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { IndianRupee, AlertCircle } from 'lucide-react';

interface MoneyAmountInputProps {
  value: string; // Paise string
  onChange: (paise: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  className?: string;
  maxPaise?: string; // Optional max limit (e.g. available balance)
}

export const MoneyAmountInput: React.FC<MoneyAmountInputProps> = ({
  value,
  onChange,
  label = 'Amount',
  placeholder = '0.00',
  disabled = false,
  error: externalError,
  helperText,
  className,
  maxPaise,
}) => {
  // Local display string in Rupees (e.g. "500.00")
  const [displayValue, setDisplayValue] = useState<string>(() => (value ? paiseToDecimalInput(value) : ''));
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync when value changes externally
  useEffect(() => {
    if (value) {
      const converted = paiseToDecimalInput(value);
      const parsedCurrent = rupeesToPaise(displayValue);
      if (parsedCurrent.success && parsedCurrent.paise === value) {
        // Keep current input as is to not disturb typing
      } else {
        setDisplayValue(converted);
      }
    } else if (!displayValue) {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);

    if (!raw.trim()) {
      setValidationError(null);
      onChange('');
      return;
    }

    const result = rupeesToPaise(raw);
    if (!result.success) {
      setValidationError(result.error);
      onChange('');
    } else {
      // Check maximum if specified
      if (maxPaise && BigInt(result.paise) > BigInt(maxPaise)) {
        setValidationError(`Amount exceeds available balance (${formatPaise(maxPaise)})`);
        onChange('');
        return;
      }

      setValidationError(null);
      onChange(result.paise);
    }
  };

  const activeError = externalError || validationError;
  const convertedPaise = rupeesToPaise(displayValue);

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
          {label}
        </label>
      )}

      <div className="relative rounded-md shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <IndianRupee className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            'block w-full rounded-md border border-slate-300 py-2.5 pl-9 pr-12 text-sm font-medium text-slate-900',
            'placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600',
            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
            activeError && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500'
          )}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <span className="text-xs font-bold text-slate-400">INR</span>
        </div>
      </div>

      {/* Helper text showing integer paise conversion */}
      <div className="flex items-center justify-between text-xs">
        {activeError ? (
          <p className="flex items-center gap-1 font-medium text-rose-600">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            {activeError}
          </p>
        ) : (
          <p className="text-slate-500">{helperText || 'Enter amount in Rupees (₹)'}</p>
        )}

        {convertedPaise.success && !activeError && (
          <span className="font-mono text-[11px] text-slate-400">
            {convertedPaise.paise} paise
          </span>
        )}
      </div>
    </div>
  );
};
