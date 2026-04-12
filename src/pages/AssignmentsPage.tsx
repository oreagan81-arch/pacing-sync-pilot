/**
 * THALES ACADEMIC OS — Assignments Page (v15.0 Stable)
 * ---------------------------------------------------------
 * Universal Build: All Grade 4A classroom rules enforced.
 * Triple Math, Shurley CP Only, Spelling Test Only.
 */
import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Rocket, ExternalLink, ClipboardList, Loader2, Zap, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useConfig } from '@/lib/config';
import { generateAssignmentTitle, resolveAssignmentGroup } from '@/lib/assignment-logic';
import { callEdge } from '@/lib/edge';

interface PacingRow {
  id: string;
  week_id: string;
  subject: string;
  day: string;
  type: string | null;
  lesson_num: string | null;
  in_class: string | null;
  at_home: string | null;
  resources: string | null;
  create_assign: boolean | null;
  object_id: string | null;
  canvas_assignment_id: string | null;
  canvas_url: string | null;
  deploy_status: string | null;
}

interface WeekOption {
  id: string;
  quarter: string;
  week_num: number;
  date_range: string | null;
}

interface AssignmentRow extends PacingRow {
  title: string;
  groupName: string;
  points: number;
  gradingType: string;
  omitFromFinal?: boolean;
  isSynthetic?: boolean;
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const CATEGORY_WEIGHTS: Record<string, string> = {
  'Math Written Assessments': '40%',
  'Math Fact Assessments': '20%',
  'Math Homework/Class Work': '40%',
  'Assessments': '50%',
  'Classwork/Homework': '50%',
  'Check Out': '25%',
  'Homework': '25%',
};

export default function AssignmentsPage() {
  const config = useConfig();
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState('');
  const [selectedWeek, setSelectedWeek] = useState<WeekOption | null>(null);
  const [rawRows, setRawRows] = useState<PacingRow[]>([]);
  const [deploying, setDeploying] = useState<Record<string, boolean>>({});
  const [deployingAll, setDeployingAll] = useState(false);

  useEffect(() => {
    supabase.from('weeks').select('id, quarter, week_num, date_range').order('quarter').order('week_num').then(({ data }) => {
      if (data) setWeeks(data);
    });
  }, []);

  useEffect(() => {
    if (!selectedWeekId) return;
    setSelectedWeek(weeks.find((w) => w.id === selectedWeekId) || null);
    supabase.from('pacing_rows').select('*').eq('week_id', selectedWeekId).then(({ data }) => {
      if (data) setRawRows(data as PacingRow[]);
    });
  }, [selectedWeekId, weeks]);

  const assignmentRows: AssignmentRow[] = useMemo(() => {
    if (!config) return [];
    const result: AssignmentRow[] = [];

    for (const row of rawRows) {
      if (!row.type || row.type === '-' || row.type === 'X' || row.type === 'No Class') continue;

      // FIX 6: Language Arts — only CP and Test create assignments
      if (row.subject === 'Language Arts') {
        const isCP = row.in_class?.toUpperCase().includes('CP') || row.type === 'CP';
        const isTest = row.type === 'Test';
        if (!isCP && !isTest) continue;
      }

      // FIX 8: Spelling — Tests only
      if (row.subject === 'Spelling' && row.type !== 'Test') continue;

      const isNoAssign = config.autoLogic.historyScienceNoAssign && (row.subject === 'History' || row.subject === 'Science');
      const isFriday = row.day === 'Friday';
      const shouldCreate = row.create_assign && !isNoAssign && !isFriday;

      if (!shouldCreate) {
        result.push({
          ...row,
          title: '—',
          groupName: '—',
          points: 0,
          gradingType: '—',
        });
        continue;
      }

      const prefix = config.assignmentPrefixes[row.subject] || '';
      const group = resolveAssignmentGroup(row.subject, row.type || 'Lesson');

      // FIX 7: Math Test auto-triples
      if (row.subject === 'Math' && row.type === 'Test' && config.autoLogic.mathTestTriple) {
        // Test
        result.push({
          ...row,
          title: generateAssignmentTitle('Math', 'Test', row.lesson_num, prefix),
          ...resolveAssignmentGroup('Math', 'Test'),
        });
        // Fact Test
        result.push({
          ...row,
          id: `fact_${row.id}`,
          title: generateAssignmentTitle('Math', 'Fact Test', row.lesson_num, prefix),
          ...resolveAssignmentGroup('Math', 'Fact Test'),
          isSynthetic: true,
        });
        // Study Guide (day before)
        const dayIdx = DAYS_ORDER.indexOf(row.day);
        if (dayIdx > 0) {
          result.push({
            ...row,
            id: `sg_${row.id}`,
            day: DAYS_ORDER[dayIdx - 1],
            title: generateAssignmentTitle('Math', 'Study Guide', row.lesson_num, prefix),
            ...resolveAssignmentGroup('Math', 'Study Guide'),
            points: 0,
            isSynthetic: true,
          });
        }
        continue;
      }

      result.push({
        ...row,
        title: generateAssignmentTitle(row.subject, row.type || 'Lesson', row.lesson_num, prefix),
        ...group,
      });
    }

    result.sort((a, b) => {
      const dayDiff = DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      const typePriority: Record<string, number> = { 'Study Guide': 1, 'Fact Test': 2, 'Test': 3 };
      return (typePriority[a.type || ''] || 0) - (typePriority[b.type || ''] || 0);
    });

    return result;
  }, [rawRows, config]);

  const pendingRows = assignmentRows.filter(
    (r) => r.points > 0 && r.deploy_status !== 'DEPLOYED' && r.title !== '—'
  );

  const handleDeploy = async (row: AssignmentRow) => {
    if (!config || !selectedWeek) return;
    const courseId = config.courseIds[row.subject];
    if (!courseId) {
      toast.error(`No course ID for ${row.subject}`);
      return;
    }

    const realRowId = row.id.includes('-') ? row.id.split('-')[0] : row.id;
    setDeploying((p) => ({ ...p, [row.id]: true }));
    const toastId = toast.loading(`Creating: ${row.title}…`);

    try {
      const result = await callEdge<{ status: string; assignmentId?: string; canvasUrl?: string }>(
        'canvas-deploy-assignment',
        {
          subject: row.subject,
          courseId,
          title: row.title,
          description: row.at_home || '',
          points: row.points,
          gradingType: row.gradingType,
          assignmentGroup: row.groupName,
          dueDate: null,
          existingId: row.canvas_assignment_id || null,
          rowId: realRowId,
          weekId: selectedWeek.id,
          omitFromFinal: row.omitFromFinal || false,
        }
      );

      toast.success('Assignment created!', {
        id: toastId,
        action: result.canvasUrl
          ? { label: 'Open', onClick: () => window.open(result.canvasUrl, '_blank') }
          : undefined,
      });

      const { data } = await supabase.from('pacing_rows').select('*').eq('week_id', selectedWeekId);
      if (data) setRawRows(data as PacingRow[]);
    } catch (e: any) {
      toast.error('Deploy failed', { id: toastId, description: e.message });
    }
    setDeploying((p) => ({ ...p, [row.id]: false }));
  };

  const handleDeployAll = async () => {
    setDeployingAll(true);
    const toastId = toast.loading(`Deploying ${pendingRows.length} assignments…`);
    let done = 0;
    for (const row of pendingRows) {
      done++;
      toast.loading(`Deploying (${done}/${pendingRows.length})…`, { id: toastId });
      await handleDeploy(row);
    }
    toast.success(`All ${pendingRows.length} assignments deployed!`, { id: toastId });
    setDeployingAll(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Week Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedWeekId} onValueChange={setSelectedWeekId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select a week…" />
          </SelectTrigger>
          <SelectContent>
            {weeks.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.quarter} Week {w.week_num}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedWeek && (
          <span className="text-sm text-muted-foreground">{selectedWeek.date_range}</span>
        )}

        <div className="ml-auto flex gap-2">
          {pendingRows.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {pendingRows.length} pending
            </Badge>
          )}
          <Button
            variant="deploy"
            size="sm"
            onClick={handleDeployAll}
            disabled={deployingAll || pendingRows.length === 0}
            className="gap-1.5"
          >
            <Rocket className="h-3.5 w-3.5" />
            Deploy All Pending
          </Button>
        </div>
      </div>

      {!selectedWeekId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Select a saved week to review and deploy assignments.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[100px]">Day</TableHead>
                    <TableHead className="text-xs">Assignment Label</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Weighting</TableHead>
                    <TableHead className="text-xs text-center">Points</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentRows.map((row) => {
                    const isDisabled = row.title === '—';
                    return (
                      <TableRow key={row.id} className={isDisabled ? 'opacity-40' : ''}>
                        <TableCell className="text-xs font-medium text-primary">{row.day}</TableCell>
                        <TableCell className="text-xs max-w-[250px]">
                          {isDisabled ? (
                            <span className="italic text-muted-foreground">No Assignment (auto-logic)</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold">{row.title}</span>
                              {row.isSynthetic && (
                                <span className="text-[9px] text-primary/70 font-mono uppercase tracking-tight flex items-center gap-1">
                                  <Zap size={10} className="fill-current" /> Auto-Generated
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">{row.groupName}</TableCell>
                        <TableCell>
                          {!isDisabled && (
                            <Badge variant="outline" className="text-[9px] font-bold tabular-nums">
                              {CATEGORY_WEIGHTS[row.groupName] || '—'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-center font-mono">{isDisabled ? '—' : row.points}</TableCell>
                        <TableCell className="text-xs text-center">
                          {isDisabled ? '—' : (
                            row.deploy_status === 'DEPLOYED'
                              ? <Badge className="text-[10px] bg-success text-success-foreground">DEPLOYED</Badge>
                              : row.deploy_status === 'ERROR'
                                ? <Badge variant="destructive" className="text-[10px]">ERROR</Badge>
                                : <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">PENDING</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {!isDisabled && (
                            <div className="flex items-center justify-end gap-1">
                              {row.canvas_url && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(row.canvas_url!, '_blank')}>
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="deploy"
                                size="sm"
                                className="h-7 text-[11px] gap-1"
                                onClick={() => handleDeploy(row)}
                                disabled={deploying[row.id]}
                              >
                                {deploying[row.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Rocket className="h-3 w-3" /> Deploy</>}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {assignmentRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No pacing data for this week.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kernel Info */}
      <div className="flex items-center gap-3 p-4 bg-accent/50 border border-border rounded-xl">
        <AlertCircle size={16} className="text-primary shrink-0" />
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-relaxed">
          Kernel Sync: Math Written Tests auto-generate Fact Test + Study Guide. LA uses Shurley CP-only rule. Spelling deploys Tests only.
        </p>
      </div>
    </div>
  );
}
