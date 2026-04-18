import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, Clock, Send } from 'lucide-react';
import { subjectColor } from '@/types/thales';
import type { AnnouncementDraft } from '@/types/thales';
import { cn } from '@/lib/utils';

interface AnnouncementPreviewProps {
  announcement: Pick<
    AnnouncementDraft,
    'title' | 'content' | 'subject' | 'status' | 'scheduled_post' | 'posted_at' | 'course_id'
  >;
  className?: string;
}

function statusBadge(status: string | null | undefined) {
  switch (status) {
    case 'POSTED':    return { className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', Icon: CheckCircle2, label: 'Posted' };
    case 'SCHEDULED': return { className: 'bg-blue-500/15 text-blue-300 border-blue-500/40', Icon: Clock, label: 'Scheduled' };
    case 'ERROR':     return { className: 'bg-destructive/15 text-destructive border-destructive/40', Icon: Send, label: 'Error' };
    default:          return { className: 'bg-muted text-muted-foreground border-border', Icon: Send, label: 'Draft' };
  }
}

function formatET(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET';
}

export function AnnouncementPreview({ announcement, className }: AnnouncementPreviewProps) {
  const c = subjectColor(announcement.subject);
  const s = statusBadge(announcement.status);
  const when = formatET(announcement.scheduled_post) || formatET(announcement.posted_at);

  return (
    <Card className={cn('border', c.border, className)}>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn('text-[10px] border', c.chip)}>
            {announcement.subject || 'General'}
          </Badge>
          <Badge variant="outline" className={cn('text-[10px] border gap-1', s.className)}>
            <s.Icon className="h-3 w-3" /> {s.label}
          </Badge>
          {announcement.course_id != null && (
            <Badge variant="outline" className="text-[10px] font-mono">#{announcement.course_id}</Badge>
          )}
          {when && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 ml-auto">
              <Calendar className="h-3 w-3" /> {when}
            </span>
          )}
        </div>
        <h3 className={cn('text-sm font-semibold leading-tight', c.text)}>
          {announcement.title || 'Untitled announcement'}
        </h3>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          className="prose prose-invert prose-sm max-w-none text-xs text-foreground/90 [&_p]:my-1 [&_ul]:my-1"
          dangerouslySetInnerHTML={{ __html: announcement.content || '<em class="text-muted-foreground">No content</em>' }}
        />
      </CardContent>
    </Card>
  );
}
