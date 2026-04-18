import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, FileText, X } from 'lucide-react';
import { ConfidenceMeter } from '@/components/memory/ConfidenceMeter';
import { subjectColor } from '@/types/thales';
import { cn } from '@/lib/utils';

interface FileRenameRow {
  id: string;
  original_name: string | null;
  friendly_name: string | null;
  subject: string | null;
  type: string | null;
  lesson_num: string | null;
  confidence: string | null;
  needs_rename: boolean;
}

interface FileRenameCardProps {
  file: FileRenameRow;
  onApprove: (file: FileRenameRow) => void | Promise<void>;
  onSkip: (file: FileRenameRow) => void | Promise<void>;
  busy?: boolean;
}

function confidenceToValue(c: string | null): number {
  switch ((c || '').toLowerCase()) {
    case 'high': case 'manual': return 0.95;
    case 'medium':              return 0.6;
    case 'low':                 return 0.35;
    case 'unclassified':        return 0.1;
    default: return 0.5;
  }
}

export function FileRenameCard({ file, onApprove, onSkip, busy }: FileRenameCardProps) {
  const c = subjectColor(file.subject);
  return (
    <Card className={cn('border', c.border)}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <FileText className={cn('h-4 w-4 mt-0.5 shrink-0', c.text)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {file.subject && (
                <Badge variant="outline" className={cn('text-[10px] border', c.chip)}>{file.subject}</Badge>
              )}
              {file.type && <Badge variant="outline" className="text-[10px]">{file.type}</Badge>}
              {file.lesson_num && <Badge variant="outline" className="text-[10px] font-mono">L{file.lesson_num}</Badge>}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground line-through truncate" title={file.original_name || ''}>
                {file.original_name || '(no name)'}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground truncate" title={file.friendly_name || ''}>
                {file.friendly_name || '(awaiting)'}
              </span>
            </div>
            <ConfidenceMeter value={confidenceToValue(file.confidence)} className="mt-2" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onSkip(file)} disabled={busy} className="h-7 px-2 gap-1">
            <X className="h-3 w-3" /> Skip
          </Button>
          <Button size="sm" onClick={() => onApprove(file)} disabled={busy || !file.friendly_name} className="h-7 px-2 gap-1">
            <Check className="h-3 w-3" /> Apply
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
