/**
 * THALES OS — Day × Subject Pacing Card
 * Single cell of the weekly planner grid. Inline-edits a pacing row,
 * shows live assignment preview (title + group + points), and surfaces
 * resource badges from content_map for that lesson.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink, FileText, Sparkles, Plus, X, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateAssignmentTitle, resolveAssignmentGroup } from '@/lib/assignment-logic';
import type { ContentMapEntry } from '@/lib/auto-link';
import { parseResources, serializeResources, type Resource } from '@/types/thales';
import { StyleSuggestions } from '@/components/canvas-brain/StyleSuggestions';

export interface DayCellData {
  type: string;
  lesson_num: string;
  in_class: string;
  at_home: string;
  /** JSON-serialized Resource[] — use parseResources/serializeResources from @/types/thales. */
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
  const isInvestigation = subject === 'Math' && cell.type === 'Investigation';
  const isEven = cell.lesson_num ? parseInt(cell.lesson_num) % 2 === 0 : null;

  const hideAssign = isHsBlocked;
  // Investigations never create their own HW assignment (SG ride-along is owned by the Test row).
  const assignDisabled =
    (isFriday && !isTest) || isLaBlocked || isHsBlocked || isInvestigation;

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
    const refs = [
      `L${num}`,
      `Lesson ${num}`,
      `SG${num}`,
      `Test ${num}`,
      `INV${num}`,
      `Investigation ${num}`,
    ];
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

        <BrainHints
          subject={subject}
          assignDisabled={assignDisabled}
          onPickInClass={(v) => onChange('in_class', v)}
        />

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

        {/* Auto-detected resource badges (from content_map by lesson #) */}
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

        {/* Manual structured resources — each row = separate bullet on Canvas */}
        <ResourceListEditor
          value={cell.resources}
          contentMap={contentMap}
          subject={subject}
          onChange={(serialized) => onChange('resources', serialized)}
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
                isInvestigation
                  ? 'Investigation — no HW assignment. SG auto-deploys via day-after Test.'
                  : isLaBlocked
                  ? 'LA — only CP and Test create assignments'
                  : isFriday && !isTest
                  ? 'Friday — assignments disabled (Tests OK)'
                  : ''
              }
            >
              Create assignment
              {isInvestigation
                ? ' (Investigation — none)'
                : isLaBlocked
                ? ' (CP/Test only)'
                : isFriday && !isTest
                ? ' (locked)'
                : ''}
            </label>
          </div>
        )}

        {/* Smart hints */}
        <div className="flex flex-wrap gap-1">
          {subject === 'Math' && isEven !== null && !isTest && !isInvestigation && (
            <Badge variant="outline" className="text-[8px] h-4 px-1">
              {isEven ? 'Evens' : 'Odds'}
            </Badge>
          )}
          {isInvestigation && (
            <Badge variant="outline" className="text-[8px] h-4 px-1 border-primary/30 text-primary">
              Investigation — no HW
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

/**
 * Inline editor for structured resources. Each row = one bullet point on Canvas.
 * Auto-fills URL from content_map when label matches a known lesson_ref (e.g. "SG92").
 */
interface ResourceListEditorProps {
  value: string;
  contentMap: ContentMapEntry[];
  subject: string;
  onChange: (serialized: string) => void;
}

function ResourceListEditor({ value, contentMap, subject, onChange }: ResourceListEditorProps) {
  const items: Resource[] = useMemo(() => parseResources(value), [value]);

  const commit = (next: Resource[]) => {
    onChange(serializeResources(next) ?? '');
  };

  const update = (idx: number, patch: Partial<Resource>) => {
    const next = items.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    // Auto-link from content_map if URL is empty and label looks like a lesson ref
    if (patch.label !== undefined && !next[idx].url) {
      const lookup = patch.label.trim().toUpperCase();
      const subjectFilter = subject === 'Reading' ? ['Reading', 'Spelling'] : [subject];
      const match = contentMap.find(
        (e) =>
          subjectFilter.includes(e.subject) &&
          e.canvas_url &&
          e.lesson_ref?.toUpperCase() === lookup,
      );
      if (match?.canvas_url) next[idx] = { ...next[idx], url: match.canvas_url };
    }
    commit(next);
  };

  const remove = (idx: number) => commit(items.filter((_, i) => i !== idx));
  const add = () => commit([...items, { label: '' }]);

  return (
    <div className="space-y-1">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Resources
      </div>
      {items.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            placeholder="Name"
            value={r.label}
            onChange={(e) => update(i, { label: e.target.value })}
            className="h-6 text-[10px] flex-1 min-w-0"
          />
          <Input
            placeholder="URL (optional)"
            value={r.url ?? ''}
            onChange={(e) => update(i, { url: e.target.value })}
            className="h-6 text-[10px] flex-1 min-w-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => remove(i)}
            aria-label="Remove resource"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        className="h-6 w-full text-[10px] gap-1"
      >
        <Plus className="h-3 w-3" />
        Add resource
      </Button>
    </div>
  );
}

/**
 * Compact "Canvas Brain" hint trigger for a pacing card.
 * Shows a small chip that, when clicked, expands learned page-section patterns
 * for this subject. Picking one fills the In-Class field.
 * Auto-hides if no patterns exist (StyleSuggestions returns null).
 */
function BrainHints({
  subject,
  assignDisabled,
  onPickInClass,
}: {
  subject: string;
  assignDisabled: boolean;
  onPickInClass: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (assignDisabled) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
        title="Show learned Canvas patterns for this subject"
      >
        <Brain className="h-2.5 w-2.5" />
        Brain
      </button>
      {open && (
        <StyleSuggestions
          type="page_section_order"
          subject={subject}
          label={`Learned in-class — ${subject}`}
          onPick={(v) => {
            onPickInClass(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
