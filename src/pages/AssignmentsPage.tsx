/**
 * THALES OS — Assignments Gatekeeper (v23.0)
 * Preview-first deployment engine. Builds payloads via assignment-build helper,
 * shows status (NEW / UPDATE / NO_CHANGE / SKIP / ERROR), supports per-row deploy
 * via Safety Diff modal. Subject filter chips. DST-correct due dates in ET.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Rocket, Loader2, AlertCircle, ArrowRightLeft, ShieldCheck,
  CheckCircle2, ChevronDown, Eye, SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSystemStore, type PacingCell } from '@/store/useSystemStore';
import { useConfig } from '@/lib/config';
import { callEdge } from '@/lib/edge';
import { supabase } from '@/integrations/supabase/client';
import SafetyDiffModal from '@/components/SafetyDiffModal';
import { useRealtimeDeploy } from '@/hooks/use-realtime-deploy';
import {
  buildAssignmentForCell,
  expandMathRow,
  formatDueET,
  type BuiltAssignment,
} from '@/lib/assignment-build';
import type { ContentMapEntry } from '@/lib/auto-link';
import { logDeployHabit } from '@/lib/teacher-memory';
import { validateDeployment, type ValidationResult } from '@/lib/pre-deploy-validator';

const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'];
const FILTER_CHIPS = ['All', 'Math', 'Reading', 'Language Arts', 'Spelling'];

type DeployStatus = 'NEW' | 'UPDATE' | 'NO_CHANGE' | 'SKIP' | 'ERROR' | 'DEPLOYED';

interface PreviewRow extends BuiltAssignment {
  status: DeployStatus;
  rowId: string | null;
  canvasUrl: string | null;
  storedHash: string | null;
}

interface PacingDbRow {
  id: string;
  subject: string;
  day: string;
  type: string | null;
  lesson_num: string | null;
  content_hash: string | null;
  canvas_assignment_id: string | null;
  canvas_url: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function AssignmentsPage() {
  const config = useConfig();
  const {
    selectedMonth, selectedWeek, pacingData, isLoading,
    setSelectedMonth, setSelectedWeek, fetchPacingData,
  } = useSystemStore();

  const [deploying, setDeploying] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [contentMap, setContentMap] = useState<ContentMapEntry[]>([]);
  const [pacingDbRows, setPacingDbRows] = useState<PacingDbRow[]>([]);
  const [weekId, setWeekId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>('All');
  const [deployResults, setDeployResults] = useState<Record<string, DeployStatus>>({});

  useRealtimeDeploy();

  // Fetch content_map
  useEffect(() => {
    supabase
      .from('content_map')
      .select('lesson_ref, subject, canvas_url, canonical_name')
      .then(({ data }) => { if (data) setContentMap(data as ContentMapEntry[]); });
  }, []);

  // Fetch pacing rows from DB (for hash comparison + canvas IDs)
  useEffect(() => {
    (async () => {
      const { data: week } = await supabase
        .from('weeks')
        .select('id')
        .eq('quarter', selectedMonth)
        .eq('week_num', selectedWeek)
        .maybeSingle();
      if (!week) { setWeekId(null); setPacingDbRows([]); return; }
      setWeekId(week.id);
      const { data: rows } = await supabase
        .from('pacing_rows')
        .select('id, subject, day, type, lesson_num, content_hash, canvas_assignment_id, canvas_url')
        .eq('week_id', week.id);
      setPacingDbRows((rows as PacingDbRow[]) || []);
    })();
  }, [selectedMonth, selectedWeek]);

  useEffect(() => {
    fetchPacingData(selectedMonth, selectedWeek);
    setDeployResults({});
    setSelected(new Set());
  }, [selectedMonth, selectedWeek, fetchPacingData]);

  // History/Science redirect detection
  const historyRedirect = useMemo(() => {
    if (!pacingData) return null;
    const h = pacingData.subjects['History'];
    const s = pacingData.subjects['Science'];
    const allHDash = h?.every((c) => c.isNoClass) ?? true;
    const allSDash = s?.every((c) => c.isNoClass) ?? true;
    if (allHDash && !allSDash) return { from: 'History', to: 'Science' };
    if (allSDash && !allHDash) return { from: 'Science', to: 'History' };
    return null;
  }, [pacingData]);

  // Find DB row matching a built assignment to compare hash + Canvas state
  const findDbRow = (subject: string, dayIndex: number, type: string, lessonNum: string) => {
    return pacingDbRows.find(
      (r) =>
        r.subject === subject &&
        r.day === DAYS[dayIndex] &&
        (r.type || '') === type &&
        (r.lesson_num || '') === lessonNum,
    );
  };

  // Build preview rows whenever inputs change
  useEffect(() => {
    if (!pacingData || !config) { setPreviewRows([]); return; }

    (async () => {
      const built: PreviewRow[] = [];
      const weekDates = pacingData.dates || [];

      for (const subject of SUBJECTS) {
        if (historyRedirect && subject === historyRedirect.from) continue;
        const cells = pacingData.subjects[subject];
        if (!cells) continue;

        for (let dayIdx = 0; dayIdx < cells.length; dayIdx++) {
          const cell: PacingCell = cells[dayIdx];

          // Subject-specific filters (mirror existing rules)
          if (subject === 'Language Arts' && !cell.isTest) {
            const upper = (cell.value || '').toUpperCase();
            if (!upper.includes('CP')) continue;
          }
          if (subject === 'Spelling' && !cell.isTest) continue;
          if (cell.isNoClass || !cell.value || cell.value === '-') continue;

          // Math Triple Logic: Test → 3 items (Written + Fact + Study Guide -1 day)
          if (subject === 'Math') {
            const items = await expandMathRow(dayIdx, cell, { config, contentMap, weekDates });
            for (const a of items) built.push(toPreview(a));
            continue;
          }

          const a = await buildAssignmentForCell(subject, dayIdx, cell, {
            config, contentMap, weekDates,
          });
          if (a) built.push(toPreview(a));
        }
      }

      function toPreview(a: BuiltAssignment): PreviewRow {
        const dbRow = findDbRow(a.subject, a.dayIndex, a.type, a.lessonNum);
        let status: DeployStatus;
        if (a.skipReason) status = 'SKIP';
        else if (!dbRow?.canvas_assignment_id) status = 'NEW';
        else if (dbRow.content_hash === a.contentHash) status = 'NO_CHANGE';
        else status = 'UPDATE';
        return {
          ...a,
          status,
          rowId: dbRow?.id ?? null,
          canvasUrl: dbRow?.canvas_url ?? null,
          storedHash: dbRow?.content_hash ?? null,
        };
      }

      // Sort by day index then subject
      built.sort((a, b) => a.dayIndex - b.dayIndex || a.subject.localeCompare(b.subject));
      setPreviewRows(built);
    })();
  }, [pacingData, config, contentMap, pacingDbRows, historyRedirect]);

  const filtered = useMemo(() => {
    if (filter === 'All') return previewRows;
    return previewRows.filter((r) => r.subject === filter);
  }, [previewRows, filter]);

  const deployable = useMemo(
    () => filtered.filter((r) => r.status === 'NEW' || r.status === 'UPDATE'),
    [filtered],
  );

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllPending = () => {
    setSelected(new Set(deployable.map((r) => r.rowKey)));
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDeploy = async () => {
    setDeploying(true);
    const targets = previewRows.filter((r) => selected.has(r.rowKey));
    const results: Record<string, DeployStatus> = {};
    let ok = 0, fail = 0, skip = 0;

    for (const r of targets) {
      try {
        const res = await callEdge<{ status?: string; canvasUrl?: string; error?: string }>(
          'canvas-deploy-assignment',
          {
            subject: r.subject,
            courseId: r.courseId,
            title: r.title,
            description: r.description,
            points: r.points,
            gradingType: r.gradingType,
            assignmentGroup: r.assignmentGroup,
            dueDate: r.dueDate || undefined,
            omitFromFinal: r.omitFromFinal,
            existingId: r.canvasUrl ? r.canvasUrl.split('/').pop() : undefined,
            rowId: r.rowId || undefined,
            weekId: weekId || undefined,
            contentHash: r.contentHash,
            day: r.day,
            type: r.type,
            isSynthetic: r.isSynthetic,
          },
        );
        if (res.status === 'DEPLOYED') {
          results[r.rowKey] = 'DEPLOYED'; ok++;
          void logDeployHabit(r.subject);
        }
        else if (res.status === 'NO_CHANGE') { results[r.rowKey] = 'NO_CHANGE'; skip++; }
        else { results[r.rowKey] = 'ERROR'; fail++; }
      } catch {
        results[r.rowKey] = 'ERROR'; fail++;
      }
    }

    setDeployResults((prev) => ({ ...prev, ...results }));
    if (fail === 0 && skip === 0) toast.success(`Deployed ${ok} assignments to Canvas`);
    else if (fail === 0) toast.success(`Deployed ${ok}, skipped ${skip} unchanged`);
    else toast.warning(`Deployed ${ok}, skipped ${skip}, failed ${fail}`);

    setDeploying(false);
    setSelected(new Set());
    // Refresh DB rows to pick up new canvas_assignment_id + hashes
    if (weekId) {
      const { data: rows } = await supabase
        .from('pacing_rows')
        .select('id, subject, day, type, lesson_num, content_hash, canvas_assignment_id, canvas_url')
        .eq('week_id', weekId);
      setPacingDbRows((rows as PacingDbRow[]) || []);
    }
  };

  const statusBadge = (s: DeployStatus) => {
    switch (s) {
      case 'NEW':
        return <Badge className="bg-primary/15 text-primary border-primary/30 text-[9px]" variant="outline">NEW</Badge>;
      case 'UPDATE':
        return <Badge className="bg-warning/15 text-warning border-warning/30 text-[9px]" variant="outline">UPDATE</Badge>;
      case 'NO_CHANGE':
        return <Badge className="bg-muted text-muted-foreground text-[9px]" variant="outline">UP TO DATE</Badge>;
      case 'SKIP':
        return <Badge className="bg-muted text-muted-foreground text-[9px]" variant="outline">SKIP</Badge>;
      case 'DEPLOYED':
        return <Badge className="bg-success/15 text-success border-success/30 text-[9px] gap-1" variant="outline"><CheckCircle2 className="h-2.5 w-2.5" />DONE</Badge>;
      case 'ERROR':
        return <Badge variant="destructive" className="text-[9px]">ERROR</Badge>;
    }
  };

  const counts = useMemo(() => {
    const c = { NEW: 0, UPDATE: 0, NO_CHANGE: 0, SKIP: 0 };
    for (const r of filtered) {
      if (r.status in c) c[r.status as keyof typeof c]++;
    }
    return c;
  }, [filtered]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                <SelectItem key={q} value={q}>{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(selectedWeek)} onValueChange={(v) => setSelectedWeek(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>Week {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 ml-2">
            {FILTER_CHIPS.map((chip) => (
              <Button
                key={chip}
                variant={filter === chip ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setFilter(chip)}
              >
                {chip}
              </Button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[9px]">{counts.NEW} NEW</Badge>
            <Badge variant="outline" className="text-[9px]">{counts.UPDATE} UPDATE</Badge>
            <Badge variant="outline" className="text-[9px]">{counts.NO_CHANGE} OK</Badge>
            <Badge variant="outline" className="text-[9px]">{counts.SKIP} SKIP</Badge>
            <Button variant="outline" size="sm" onClick={selectAllPending} disabled={deployable.length === 0}>
              Select Pending ({deployable.length})
            </Button>
            <Button
              onClick={() => setDiffOpen(true)}
              disabled={deploying || selected.size === 0 || isLoading}
              className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
              size="sm"
            >
              {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Deploy Selected ({selected.size})
            </Button>
          </div>
        </div>

        {historyRedirect && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="py-4 flex items-center gap-3">
              <ArrowRightLeft className="h-5 w-5 text-warning" />
              <p className="text-sm">
                <span className="font-semibold">{historyRedirect.from}</span> has no content this week.
                Redirecting to <span className="font-semibold">{historyRedirect.to}</span>.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Preview Table */}
        {isLoading ? (
          <Card>
            <CardContent className="py-12 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No assignments to preview.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Assignment Preview — {selectedMonth} Week {selectedWeek}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="text-xs w-[90px]">Status</TableHead>
                      <TableHead className="text-xs w-[80px]">Day</TableHead>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Group</TableHead>
                      <TableHead className="text-xs text-center w-[60px]">Pts</TableHead>
                      <TableHead className="text-xs">Due (ET)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => {
                      const liveStatus = deployResults[row.rowKey] || row.status;
                      const isSkip = row.status === 'SKIP';
                      const canSelect = row.status === 'NEW' || row.status === 'UPDATE';
                      const isExpanded = expanded.has(row.rowKey);
                      return (
                        <>
                          <TableRow
                            key={row.rowKey}
                            className={
                              liveStatus === 'DEPLOYED' ? 'bg-success/5' :
                              liveStatus === 'ERROR' ? 'bg-destructive/10' :
                              isSkip ? 'opacity-60' : ''
                            }
                          >
                            <TableCell>
                              <Checkbox
                                checked={selected.has(row.rowKey)}
                                onCheckedChange={() => toggleSelect(row.rowKey)}
                                disabled={!canSelect}
                              />
                            </TableCell>
                            <TableCell>
                              <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(row.rowKey)}>
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </Button>
                                </CollapsibleTrigger>
                              </Collapsible>
                            </TableCell>
                            <TableCell>
                              {isSkip && row.skipReason ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1">
                                      {statusBadge(liveStatus)}
                                      <SkipForward className="h-3 w-3 text-muted-foreground" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{row.skipReason}</TooltipContent>
                                </Tooltip>
                              ) : statusBadge(liveStatus)}
                            </TableCell>
                            <TableCell className="text-xs font-medium text-primary">{row.day}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold flex items-center gap-1.5">
                                  {row.title}
                                  {row.isSynthetic && (
                                    <Badge
                                      variant="outline"
                                      className="text-[8px] h-4 px-1 bg-primary/10 text-primary border-primary/30"
                                    >
                                      AUTO
                                    </Badge>
                                  )}
                                </span>
                                <span className="text-[9px] text-muted-foreground">
                                  {row.subject} · Course {row.courseId}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                              {row.assignmentGroup}
                            </TableCell>
                            <TableCell className="text-xs text-center font-mono">{row.points}</TableCell>
                            <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {formatDueET(row.dueDate)}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${row.rowKey}_exp`} className="bg-muted/20">
                              <TableCell colSpan={8} className="p-4">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                                  Description Preview
                                </div>
                                <div
                                  className="text-sm prose prose-sm max-w-none [&_a]:text-primary [&_a]:underline"
                                  dangerouslySetInnerHTML={{ __html: row.description }}
                                />
                                <div className="mt-3 text-[10px] font-mono text-muted-foreground">
                                  hash: {row.contentHash.slice(0, 12)}…
                                  {row.storedHash && ` · stored: ${row.storedHash.slice(0, 12)}…`}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-muted bg-muted/30">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle size={16} className="text-muted-foreground shrink-0" />
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              Friday Exception · History/Science skip · DST-aware due 11:59 PM ET · Hash-skip prevents duplicates.
            </p>
          </CardContent>
        </Card>

        <SafetyDiffModal
          open={diffOpen}
          onOpenChange={setDiffOpen}
          month={selectedMonth}
          week={selectedWeek}
          action="DEPLOY_ASSIGNMENTS"
          itemCount={selected.size}
          items={previewRows
            .filter((r) => selected.has(r.rowKey))
            .map((r) => ({ label: r.title, subject: r.subject }))}
          onApprove={handleDeploy}
          validation={
            diffOpen
              ? validateDeployment({
                  assignments: previewRows.filter((r) => selected.has(r.rowKey)),
                  contentMap,
                })
              : undefined
          }
        />
      </div>
    </TooltipProvider>
  );
}
