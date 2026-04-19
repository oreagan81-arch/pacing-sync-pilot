import { Brain, RefreshCw, BookOpen, Activity, Sparkles, History, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  useDetectedChanges,
  useLastSync,
  useLearnedPatterns,
  useSnapshotStats,
  useStyleConfidence,
  useSyncNow,
} from '@/hooks/useCanvasBrain';
import { CONNECTED_COURSES, subjectForCourseId } from '@/lib/canvas-brain';
import { subjectColor } from '@/types/thales';
import { formatDistanceToNow } from 'date-fns';

export default function CanvasBrainPage() {
  const stats = useSnapshotStats();
  const patterns = useLearnedPatterns();
  const lastSync = useLastSync();
  const changes = useDetectedChanges();
  const sync = useSyncNow();
  const confidence = useStyleConfidence();

  const groupedPatterns = (patterns.data ?? []).reduce<Record<string, typeof patterns.data>>(
    (acc, p) => {
      (acc[p.pattern_type] ||= []).push(p);
      return acc;
    },
    {} as Record<string, NonNullable<typeof patterns.data>>,
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Canvas Brain
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reads existing Canvas courses and learns Mr. Reagan's teaching patterns. Read-only.
          </p>
        </div>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending} size="lg">
          <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />
          {sync.isPending ? 'Syncing…' : 'Sync Now'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* 1. Connected Courses */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Connected Courses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {CONNECTED_COURSES.map((c) => {
              const color = subjectColor(c.subject);
              const count = stats.data?.byCourse[c.id] ?? 0;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={color.chip}>
                      {c.subject}
                    </Badge>
                    <span className="text-xs text-muted-foreground">#{c.id}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{count} items</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* 2. Last Sync */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Last Sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastSync.data?.at ? (
              <>
                <div className="text-2xl font-bold">
                  {formatDistanceToNow(new Date(lastSync.data.at), { addSuffix: true })}
                </div>
                <Badge
                  className="mt-2"
                  variant={lastSync.data.status === 'OK' ? 'default' : 'destructive'}
                >
                  {lastSync.data.status}
                </Badge>
                <div className="mt-3 text-xs text-muted-foreground">
                  {stats.data?.total ?? 0} total snapshots cached
                </div>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {Object.entries(stats.data?.byType ?? {}).map(([t, n]) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}: {n}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                Never synced. Click "Sync Now" to begin.
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Learned Patterns (count summary) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Learned Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{patterns.data?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground">
              across {Object.keys(groupedPatterns).length} pattern types
            </div>
            <div className="mt-3 flex gap-1.5 flex-wrap">
              {Object.entries(groupedPatterns).map(([type, list]) => (
                <Badge key={type} variant="outline" className="text-[10px]">
                  {type.replace(/_/g, ' ')}: {list.length}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Preferred Templates (top patterns per type) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Preferred Templates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {Object.entries(groupedPatterns).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No patterns yet. Run a sync to learn from existing Canvas content.
            </p>
          )}
          {Object.entries(groupedPatterns).map(([type, list]) => (
            <div key={type}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                {type.replace(/_/g, ' ')}
              </div>
              <div className="space-y-1.5">
                {list.slice(0, 5).map((p) => {
                  const subj = p.pattern_value.subject ?? '';
                  const val = p.pattern_value.value ?? '';
                  const color = subjectColor(subj);
                  return (
                    <div
                      key={p.pattern_key}
                      className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2"
                    >
                      <Badge variant="outline" className={`${color.chip} shrink-0`}>
                        {subj || '—'}
                      </Badge>
                      <span className="text-sm truncate flex-1 font-mono">{String(val)}</span>
                      <div className="w-24 shrink-0">
                        <Progress value={p.confidence} className="h-1.5" />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                        {p.confidence}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 5. Detected Changes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Detected Changes (most recent)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(changes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshots yet.</p>
          ) : (
            <div className="space-y-1">
              {(changes.data ?? []).map((c, i) => {
                const subject = subjectForCourseId(c.course_id);
                const color = subjectColor(subject);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/40"
                  >
                    <Badge variant="outline" className={color.chip}>
                      {subject}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {c.content_type}
                    </Badge>
                    <span className="text-sm flex-1 truncate">{c.title ?? '(untitled)'}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
