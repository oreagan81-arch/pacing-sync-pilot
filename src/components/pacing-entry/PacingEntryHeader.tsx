/**
 * THALES OS — Pacing Entry Header
 *
 * Information-dense header bar for the weekly pacing entry screen.
 * Shows quarter/week/date range, save status, and primary actions.
 */
import { Button } from '@/components/ui/button';
import { Download, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PacingEntryHeaderProps {
  quarter?: string;
  weekNum?: number;
  /** Pre-formatted date range string (e.g. "May 4–8, 2026"). Empty if no week selected. */
  dateRange?: string;
  /** Whether the current week exists in the saved set AND grid has no unsaved edits. */
  isSaved?: boolean;
  onSyncResources: () => void | Promise<void>;
  syncing?: boolean;
  onSave: () => void | Promise<void>;
  saving?: boolean;
  /** Optional accent color for the quarter pill (matches global quarter color). */
  quarterColor?: string;
}

export function PacingEntryHeader({
  quarter,
  weekNum,
  dateRange,
  isSaved = false,
  onSyncResources,
  syncing = false,
  onSave,
  saving = false,
  quarterColor,
}: PacingEntryHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pacing Entry
        </span>

        {quarter ? (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: quarterColor || 'hsl(var(--primary))' }}
          >
            {quarter}
          </span>
        ) : null}

        <span className="text-muted-foreground/60">·</span>
        <span className="text-sm font-medium">Week {weekNum ?? '—'}</span>

        <span className="text-muted-foreground/60">·</span>
        {dateRange ? (
          <span className="text-sm text-muted-foreground">{dateRange}</span>
        ) : (
          <span className="text-sm text-muted-foreground/70 italic">Select a week →</span>
        )}

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            isSaved
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-amber-500/10 text-amber-500',
          )}
          title={isSaved ? 'All changes saved' : 'Unsaved changes'}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              isSaved ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse',
            )}
          />
          {isSaved ? 'Saved' : 'Unsaved'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void onSyncResources()}
          disabled={syncing}
          className="gap-1.5"
          title="Pull the latest Canvas + Drive resources for this week"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {syncing ? 'Grabbing…' : 'Grab Resources'}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={() => void onSave()}
          disabled={saving}
          className="gap-1.5"
          title="Save week (⌘/Ctrl+S)"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
