import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Activity, AlertTriangle, Clock, FileWarning } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'default' | 'success' | 'warning' | 'destructive';
  hint?: string;
}

function StatCard({ label, value, icon: Icon, tone, hint }: StatCardProps) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    destructive: 'text-destructive',
  }[tone];
  const iconTone = {
    default: 'text-muted-foreground/40',
    success: 'text-emerald-400/40',
    warning: 'text-amber-400/40',
    destructive: 'text-destructive/40',
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={cn('text-2xl font-bold', toneClass)}>{value}</p>
            {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
          </div>
          <Icon className={cn('h-8 w-8 shrink-0', iconTone)} />
        </div>
      </CardContent>
    </Card>
  );
}

export function QuickStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard_quick_stats'],
    queryFn: async () => {
      const [pending, failedJobs, orphanFiles, latestSnap] = await Promise.all([
        supabase.from('pacing_rows').select('id', { count: 'exact', head: true }).neq('deploy_status', 'DEPLOYED'),
        supabase.from('automation_jobs').select('id', { count: 'exact', head: true }).eq('status', 'error'),
        supabase.from('files').select('id', { count: 'exact', head: true }).is('canvas_url', null),
        supabase.from('system_health_snapshots').select('score, canvas_status').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        pending: pending.count ?? 0,
        failed: failedJobs.count ?? 0,
        orphans: orphanFiles.count ?? 0,
        score: latestSnap.data?.score ?? null,
        canvasStatus: latestSnap.data?.canvas_status ?? null,
      };
    },
    refetchInterval: 30_000,
  });

  const score = data?.score;
  const scoreTone: StatCardProps['tone'] =
    score == null ? 'default' : score >= 80 ? 'success' : score >= 50 ? 'warning' : 'destructive';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Pending Deploys"
        value={isLoading ? '—' : data?.pending ?? 0}
        icon={Clock}
        tone={(data?.pending ?? 0) > 0 ? 'warning' : 'success'}
      />
      <StatCard
        label="Failed Jobs"
        value={isLoading ? '—' : data?.failed ?? 0}
        icon={AlertTriangle}
        tone={(data?.failed ?? 0) > 0 ? 'destructive' : 'success'}
      />
      <StatCard
        label="Orphan Files"
        value={isLoading ? '—' : data?.orphans ?? 0}
        icon={FileWarning}
        tone={(data?.orphans ?? 0) > 0 ? 'warning' : 'success'}
        hint="No Canvas link"
      />
      <StatCard
        label="Health Score"
        value={isLoading ? '—' : score ?? '—'}
        icon={Activity}
        tone={scoreTone}
        hint={data?.canvasStatus ? `Canvas: ${data.canvasStatus}` : undefined}
      />
    </div>
  );
}
