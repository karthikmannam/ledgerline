import React from 'react';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

interface MoneyDisplayProps {
  paise: string | bigint | number | null | undefined;
  className?: string;
  showCurrency?: boolean;
  showSign?: boolean;
  side?: 'debit' | 'credit';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const MoneyDisplay: React.FC<MoneyDisplayProps> = ({
  paise,
  className,
  showCurrency = true,
  showSign = false,
  side,
  size = 'md',
}) => {
  const formatted = formatPaise(paise, { showCurrency, showSign });

  const sizeClasses = {
    sm: 'text-xs font-medium',
    md: 'text-sm font-semibold',
    lg: 'text-lg font-bold tracking-tight',
    xl: 'text-2xl font-bold tracking-tight',
  };

  const sideColor = side === 'credit'
    ? 'text-emerald-700'
    : side === 'debit'
    ? 'text-rose-700'
    : 'text-slate-900';

  return (
    <span className={cn('tabular-nums font-mono', sizeClasses[size], sideColor, className)}>
      {side === 'credit' && showSign && !formatted.startsWith('+') && '+ '}
      {side === 'debit' && showSign && !formatted.startsWith('-') && '- '}
      {formatted}
    </span>
  );
};
