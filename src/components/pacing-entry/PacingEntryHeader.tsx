/**
 * THALES OS — Pacing Entry Header
 *
 * Slim header bar for the weekly pacing entry screen. Owns the
 * "Grab Resources" affordance that lets the teacher pull the latest
 * Canvas / Drive resource map for the active week without leaving the
 * planner. Parent owns the network call via `onSyncResources`.
 */
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

export interface PacingEntryHeaderProps {
  /** Active quarter label (e.g. "Q3"). Optional — purely cosmetic. */
  quarter?: string;
  /** Active week number. Optional — purely cosmetic. */
  weekNum?: number;
  /** Date range string (e.g. "Jan 6–10"). Optional — purely cosmetic. */
  dateRange?: string;
  /**
   * Fired when the teacher clicks "Grab Resources". Parent should fetch
   * the latest content_map / Drive resources and refresh local state.
   */
  onSyncResources: () => void | Promise<void>;
  /** Disables the Grab button while a sync is in flight. */
  syncing?: boolean;
}

export function PacingEntryHeader({
  quarter,
  weekNum,
  dateRange,
  onSyncResources,
  syncing = false,
}: PacingEntryHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
      <div className="flex flex-col">
        <h1 className="text-lg font-semibold tracking-tight">
          Pacing Entry
          {quarter && weekNum ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {quarter} · Week {weekNum}
            </span>
          ) : null}
        </h1>
        {dateRange ? (
          <p className="text-xs text-muted-foreground">{dateRange}</p>
        ) : null}
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
      </div>
    </div>
  );
}
