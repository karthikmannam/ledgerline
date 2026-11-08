import React from 'react';
import { Info, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UnsupportedNoticeProps {
  featureTitle: string;
  backendReason: string;
  missingEndpoint?: string;
  className?: string;
}

export const UnsupportedNotice: React.FC<UnsupportedNoticeProps> = ({
  featureTitle,
  backendReason,
  missingEndpoint,
  className,
}) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-amber-200 bg-amber-50/60 p-5 text-amber-900',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Info className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Backend Capability Notice: {featureTitle}
            </h4>
            <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              Not Exposed in API
            </span>
          </div>
          <p className="text-xs text-amber-800/90 leading-relaxed">
            {backendReason}
          </p>
          {missingEndpoint && (
            <p className="font-mono text-[11px] text-amber-700">
              Missing backend route: <code className="rounded bg-amber-100 px-1 py-0.5">{missingEndpoint}</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
