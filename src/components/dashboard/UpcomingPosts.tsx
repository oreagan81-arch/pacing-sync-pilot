import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, Megaphone } from 'lucide-react';
import { useUpcomingAnnouncements } from '@/hooks/useAnnouncements';
import { subjectColor } from '@/types/thales';
import { cn } from '@/lib/utils';

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }) + ' ET';
}

interface UpcomingPostsProps {
  limit?: number;
}

export function UpcomingPosts({ limit = 5 }: UpcomingPostsProps) {
  const { data: posts = [], isLoading } = useUpcomingAnnouncements(limit);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" /> Upcoming Posts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center py-4 text-muted-foreground">
            <Megaphone className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No scheduled posts</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => {
              const c = subjectColor(p.subject);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 border', c.chip)}>
                        {p.subject || 'General'}
                      </Badge>
                      <span className="text-xs font-medium truncate">{p.title || 'Untitled'}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatWhen(p.scheduled_post)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
