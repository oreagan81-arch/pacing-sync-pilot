/**
 * THALES OS — Day × Subject Pacing Card
 * Single cell of the weekly planner grid. Inline-edits a pacing row,
 * shows live assignment preview (title + group + points), and surfaces
 * resource badges from content_map for that lesson.
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink, FileText, Sparkles } from 'lucide-react';
import { generateAssignmentTitle, resolveAssignmentGroup } from '@/lib/assignment-logic';
import type { ContentMapEntry } from '@/lib/auto-link';

export interface DayCellData {
  type: string;
  lesson_num: string;
  in_class: string;
  at_home: string;
  resources: string;
  create_assign: boolean;
}

interface Props {
  subject: string;
  day: string;
  cell: DayCellData;
  prefix: string;
  isFriday: boolean;
  isHsBlocked: boolean; // History/Science → never assign
  isLaBlocked: boolean; // LA non-CP/Test → never assign
  availableTypes: string[];
  contentMap: ContentMapEntry[];
  subjectAccent: string; // hsl token e.g. 'hsl(var(--primary))'
  onChange: (field: keyof DayCellData, value: string | boolean) => void;
}

const SUBJECT_ACCENTS: Record<string, string> = {
  Math: 'hsl(25 95% 53%)',
  Reading: 'hsl(217 91% 60%)',
  Spelling: 'hsl(217 91% 60%)',
  'Language Arts': 'hsl(160 84% 39%)',
  Science: 'hsl(271 76% 53%)',
  History: 'hsl(199 89% 48%)',
};

export function DaySubjectCard({
  subject,
  day,
  cell,
  prefix,
  isFriday,
  isHsBlocked,
  isLaBlocked,
  availableTypes,
  contentMap,
  onChange,
}: Props) {
  const accent = SUBJECT_ACCENTS[subject] ?? 'hsl(var(--primary))';

  const isTest = cell.type?.toLowerCase().includes('test') ?? false;
  const isReview = cell.in_class?.toLowerCase().includes('review') ?? false;
  const isNoClass = cell.type === '-' || cell.type === 'No Class';
  const isEven = cell.lesson_num ? parseInt(cell.lesson_num) % 2 === 0 : null;

  const hideAssign = isHsBlocked;
  const assignDisabled = (isFriday && !isTest) || isLaBlocked || isHsBlocked;

  // Live assignment preview
  const preview = useMemo(() => {
    if (assignDisabled || !cell.type || isNoClass) return null;
    const title = generateAssignmentTitle(subject, cell.type, cell.lesson_num, prefix);
    const group = resolveAssignmentGroup(subject, cell.type);
    return { title, group: group.groupName, points: group.points };
  }, [subject, cell.type, cell.lesson_num, prefix, assignDisabled, isNoClass]);

  // Resource matches from content_map
  const resources = useMemo(() => {
    if (!cell.lesson_num) return [];
    const subjectFilter = subject === 'Reading' ? ['Reading', 'Spelling'] : [subject];
    const num = cell.lesson_num;
    const refs = [`L${num}`, `Lesson ${num}`, `SG${num}`, `Test ${num}`];
    return contentMap.filter(
      (e) =>
        subjectFilter.includes(e.subject) &&
        e.canvas_url &&
        refs.some((r) => e.lesson_ref?.toLowerCase() === r.toLowerCase()),
    );
  }, [contentMap, cell.lesson_num, subject]);

  return (
    <Card
      className="relative overflow-hidden border-border bg-card/50 transition-all hover:bg-card hover:shadow-md"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {isTest && (
        <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-warning/20 text-warning text-[8px] font-bold uppercase tracking-wider rounded-bl-md">
          Test
        </div>
      )}
      {isReview && !isTest && (
        <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-muted text-muted-foreground text-[8px] font-bold uppercase tracking-wider rounded-bl-md">
          Review
        </div>
      )}

      <CardHeader className="p-2.5 pb-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
            {day.slice(0, 3)}
          </span>
          {cell.lesson_num && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
              L{cell.lesson_num}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-2.5 pt-0 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <Select value={cell.type} onValueChange={(v) => onChange('type', v)}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="#"
            value={cell.lesson_num}
            onChange={(e) => onChange('lesson_num', e.target.value)}
            className="h-7 text-[11px]"
          />
        </div>

        <Textarea
          placeholder="In class"
          value={cell.in_class}
          onChange={(e) => onChange('in_class', e.target.value)}
          className="text-[11px] min-h-[42px] resize-none"
          rows={2}
        />

        {!isFriday && (
          <Textarea
            placeholder="At home"
            value={cell.at_home}
            onChange={(e) => onChange('at_home', e.target.value)}
            className="text-[11px] min-h-[42px] resize-none"
            rows={2}
          />
        )}
        {isFriday && (
          <div className="rounded border border-dashed border-muted-foreground/30 px-2 py-1 text-[9px] italic text-muted-foreground">
            Friday — no At Home
          </div>
        )}

        {/* Assignment preview */}
        {preview && (
          <div className="rounded border border-success/20 bg-success/5 p-1.5 space-y-0.5">
            <div className="flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 text-success shrink-0" />
              <span className="text-[8px] font-bold uppercase tracking-wider text-success">
                Will deploy
              </span>
            </div>
            <div className="text-[10px] font-semibold leading-tight truncate" title={preview.title}>
              {preview.title}
            </div>
            <div className="flex items-center justify-between text-[9px] text-muted-foreground">
              <span className="truncate">{preview.group}</span>
              <span className="font-mono shrink-0 ml-1">{preview.points}pt</span>
            </div>
          </div>
        )}

        {/* Resource badges */}
        {resources.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {resources.slice(0, 3).map((r) => (
              <a
                key={r.lesson_ref + r.canvas_url}
                href={r.canvas_url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary hover:bg-primary/20 transition-colors"
                title={r.canonical_name ?? r.lesson_ref}
              >
                <FileText className="h-2.5 w-2.5" />
                {r.lesson_ref}
                <ExternalLink className="h-2 w-2" />
              </a>
            ))}
            {resources.length > 3 && (
              <span className="text-[9px] text-muted-foreground">+{resources.length - 3}</span>
            )}
          </div>
        )}

        {/* Manual resources field */}
        <Input
          placeholder="Resources"
          value={cell.resources}
          onChange={(e) => onChange('resources', e.target.value)}
          className="h-6 text-[10px]"
        />

        {/* Assignment toggle */}
        {!hideAssign && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <Checkbox
              id={`a-${subject}-${day}`}
              checked={assignDisabled ? false : cell.create_assign}
              disabled={assignDisabled}
              onCheckedChange={(v) => onChange('create_assign', v === true)}
              className="h-3 w-3"
            />
            <label
              htmlFor={`a-${subject}-${day}`}
              className="text-[9px] text-muted-foreground select-none cursor-pointer"
              title={
                isLaBlocked
                  ? 'LA — only CP and Test create assignments'
                  : isFriday && !isTest
                  ? 'Friday — assignments disabled (Tests OK)'
                  : ''
              }
            >
              Create assignment
              {isLaBlocked ? ' (CP/Test only)' : isFriday && !isTest ? ' (locked)' : ''}
            </label>
          </div>
        )}

        {/* Smart hints */}
        <div className="flex flex-wrap gap-1">
          {subject === 'Math' && isEven !== null && !isTest && (
            <Badge variant="outline" className="text-[8px] h-4 px-1">
              {isEven ? 'Evens' : 'Odds'}
            </Badge>
          )}
          {subject === 'Math' && isTest && (
            <Badge variant="outline" className="text-[8px] h-4 px-1 border-warning/30 text-warning">
              Triple (Test+Fact+SG)
            </Badge>
          )}
          {hideAssign && cell.type && !isNoClass && (
            <Badge variant="secondary" className="text-[8px] h-4 px-1">
              No assignment
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
