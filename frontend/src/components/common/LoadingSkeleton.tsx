import React from 'react';
import { cn } from '@/lib/utils';

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 4,
}) => {
  return (
    <div className="w-full space-y-3 animate-pulse">
      <div className="h-9 w-full bg-slate-200 rounded-md" />
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="flex gap-4">
          {Array.from({ length: columns }).map((_, cIdx) => (
            <div key={cIdx} className="h-10 flex-1 bg-slate-100 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="h-32 rounded-xl border border-slate-200 bg-slate-100 p-6" />
      ))}
    </div>
  );
};
