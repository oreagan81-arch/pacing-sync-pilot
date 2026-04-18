import { cn } from '@/lib/utils';

interface ConfidenceMeterProps {
  value: number; // 0..1
  showLabel?: boolean;
  className?: string;
}

/**
 * Visualizes teacher_memory confidence (0..1).
 * Thresholds: <0.4 destructive, 0.4-0.6 warning (amber), ≥0.6 success (emerald).
 * Memory is only applied at the resolver level when confidence ≥ 0.6.
 */
export function ConfidenceMeter({ value, showLabel = true, className }: ConfidenceMeterProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(v * 100);

  const tier =
    v >= 0.6 ? { bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'Trusted' }
    : v >= 0.4 ? { bar: 'bg-amber-500', text: 'text-amber-400', label: 'Learning' }
    : { bar: 'bg-destructive', text: 'text-destructive', label: 'Low' };

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <div className="relative h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('absolute inset-y-0 left-0 transition-all', tier.bar)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showLabel && (
        <span className={cn('text-[10px] font-mono tabular-nums shrink-0', tier.text)}>
          {pct}% · {tier.label}
        </span>
      )}
    </div>
  );
}
