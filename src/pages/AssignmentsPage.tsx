/**
 * THALES OS — Assignments Gatekeeper (v22.0)
 * Deploys assignments directly to Canvas via canvas-deploy-assignment edge function.
 * Orphan detection: checks files table for matching content.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Rocket, Loader2, Zap, AlertCircle, ArrowRightLeft, ShieldCheck, CircleAlert, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSystemStore, type PacingCell } from '@/store/useSystemStore';
import { useConfig } from '@/lib/config';
import { callEdge } from '@/lib/edge';
import { supabase } from '@/integrations/supabase/client';
import SafetyDiffModal from '@/components/SafetyDiffModal';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'];

interface SimulatedAssignment {
  id: string;
  day: string;
  dayIndex: number;
  subject: string;
  title: string;
  groupName: string;
  points: number;
  isSynthetic: boolean;
  type: string;
  isOrphan: boolean;
  dueDate: string;
  lessonNum: string;
}

interface ContentMapRecord {
  lesson_ref: string;
  subject: string;
  type: string | null;
  canonical_name: string | null;
  canvas_file_id: string | null;
  canvas_url: string | null;
}

const CATEGORY_WEIGHTS: Record<string, string> = {
  'Written Assessments': '40%',
  'Fact Assessments': '20%',
  'Homework/Class Work': '40%',
  'Assessments': '50%',
  'Classwork/Homework': '50%',
  'Check Out': '25%',
  'Homework': '25%',
};

export default function AssignmentsPage() {
  const config = useConfig();
  const {
    selectedMonth, selectedWeek, pacingData, isLoading,
    setSelectedMonth, setSelectedWeek, fetchPacingData,
  } = useSystemStore();

  const [deploying, setDeploying] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [contentMap, setContentMap] = useState<ContentMapRecord[]>([]);
  const [deployResults, setDeployResults] = useState<Record<string, 'DEPLOYED' | 'ERROR' | 'PENDING'>>({});

  // Fetch content_map table
  useEffect(() => {
    supabase.from('content_map').select('lesson_ref, subject, type, canonical_name, canvas_file_id, canvas_url')
      .then(({ data }) => { if (data) setContentMap(data as ContentMapRecord[]); });
  }, []);

  useEffect(() => {
    fetchPacingData(selectedMonth, selectedWeek);
    setDeployResults({});
  }, [selectedMonth, selectedWeek, fetchPacingData]);

  // Check for History/Science redirect
  const historyRedirect = useMemo(() => {
    if (!pacingData) return null;
    const historyCells = pacingData.subjects['History'];
    const scienceCells = pacingData.subjects['Science'];
    const allHistoryDash = historyCells?.every(c => c.isNoClass) ?? true;
    const allScienceDash = scienceCells?.every(c => c.isNoClass) ?? true;
    if (allHistoryDash && !allScienceDash) return { from: 'History', to: 'Science' };
    if (allScienceDash && !allHistoryDash) return { from: 'Science', to: 'History' };
    return null;
  }, [pacingData]);

  // Check if a file exists in content map by matching lesson_ref patterns
  const findFile = (subject: string, lessonNum: string, type: string): ContentMapRecord | undefined => {
    // Build expected lesson_ref patterns based on subject and type
    const subjectPrefix = subject === 'Language Arts' ? 'ELA' : 
                          subject === 'Reading' ? 'Reading' :
                          subject === 'Spelling' ? 'Spelling' : subject;
    
    // Try exact match patterns like Math_SB_L096, Reading_L001, etc.
    const paddedNum = lessonNum.padStart(3, '0');
    return contentMap.find(f => {
      const ref = f.lesson_ref;
      // Match patterns like Math_SB_L096, Math_HW_Evens, Reading_L001, etc.
      if (ref.includes(`_L${paddedNum}`) && f.subject === subject) return true;
      if (ref.includes(`_${lessonNum}`) && f.subject === subject) return true;
      return false;
    });
  };

  const hasFile = (subject: string, lessonNum: string, type: string = ''): boolean => {
    return !!findFile(subject, lessonNum, type);
  };

  // Build simulated assignments from pacing data
  const simulated: SimulatedAssignment[] = useMemo(() => {
    if (!pacingData || !config) return [];
    const result: SimulatedAssignment[] = [];
    let idCounter = 0;

    for (const subject of SUBJECTS) {
      const cells = pacingData.subjects[subject];
      if (!cells) continue;

      if (historyRedirect && subject === historyRedirect.from) continue;

      const prefix = config.assignmentPrefixes[subject] || '';

      cells.forEach((cell: PacingCell, dayIdx: number) => {
        const day = DAYS[dayIdx];
        const dueDate = pacingData.dates?.[dayIdx] || '';

        // Friday exception
        if (dayIdx === 4) return;
        if (cell.isNoClass || !cell.value || cell.value === '-') return;

        // Shurley English Filter: only CP or Test
        if (subject === 'Language Arts') {
          const upper = cell.value.toUpperCase();
          if (!upper.includes('CP') && !cell.isTest) return;
        }

        // Spelling Filter: only Test
        if (subject === 'Spelling' && !cell.isTest) return;

        // Math Triple Sequence
        if (subject === 'Math' && cell.isTest) {
          const num = cell.lessonNum;
          result.push({
            id: `sim_${idCounter++}`, day, dayIndex: dayIdx, subject, dueDate, lessonNum: num,
            title: `${prefix} Written Test ${num}`,
            groupName: 'Written Assessments', points: 100, isSynthetic: false, type: 'Test',
            isOrphan: !hasFile('Math', num),
          });
          result.push({
            id: `sim_${idCounter++}`, day, dayIndex: dayIdx, subject, dueDate, lessonNum: num,
            title: `${prefix} Fact Test ${num}`,
            groupName: 'Fact Assessments', points: 100, isSynthetic: true, type: 'Fact Test',
            isOrphan: !hasFile('Math', num),
          });
          if (dayIdx > 0) {
            result.push({
              id: `sim_${idCounter++}`, day: DAYS[dayIdx - 1], dayIndex: dayIdx - 1, subject,
              dueDate: pacingData.dates?.[dayIdx - 1] || '', lessonNum: num,
              title: `${prefix} Study Guide ${num}`,
              groupName: 'Homework/Class Work', points: 0, isSynthetic: true, type: 'Study Guide',
              isOrphan: false, // study guides don't need files
            });
          }
          return;
        }

        // Normal assignment
        let title = '';
        let groupName = 'Assignments';
        let points = 100;
        const num = cell.lessonNum;

        if (subject === 'Math') {
          const isEven = num ? parseInt(num) % 2 === 0 : false;
          title = `${prefix} ${isEven ? 'Evens' : 'Odds'} HW — Lesson ${num}`;
          groupName = 'Homework/Class Work';
        } else if (subject === 'Reading') {
          title = cell.isTest
            ? `${prefix} Mastery Test ${num}`
            : `${prefix} Reading HW ${num}`;
          groupName = cell.isTest ? 'Assessments' : 'Homework';
        } else if (subject === 'Spelling') {
          title = `${prefix} Spelling Test ${num}`;
          groupName = 'Assessments';
        } else if (subject === 'Language Arts') {
          const upper = cell.value.toUpperCase();
          if (cell.isTest) {
            title = `${prefix} Shurley Test`;
            groupName = 'Assessments';
          } else if (upper.includes('CP')) {
            title = `${prefix} Classroom Practice ${num}`;
            groupName = 'Classwork/Homework';
          }
        } else {
          title = `${subject} — ${cell.value}`;
        }

        // History/Science don't need file matching
        const skipOrphanCheck = subject === 'History' || subject === 'Science';

        result.push({
          id: `sim_${idCounter++}`, day, dayIndex: dayIdx, subject, dueDate, lessonNum: num,
          title, groupName, points,
          isSynthetic: false, type: cell.isTest ? 'Test' : 'Lesson',
          isOrphan: skipOrphanCheck ? false : !hasFile(subject, num),
        });
      });
    }

    return result.sort((a, b) => a.dayIndex - b.dayIndex);
  }, [pacingData, config, historyRedirect, contentMap]);

  const orphanCount = simulated.filter(s => s.isOrphan).length;
  const deployable = simulated.filter(s => !s.isOrphan);

  const handleDeploy = async () => {
    if (!config) return;
    setDeploying(true);
    const results: Record<string, 'DEPLOYED' | 'ERROR' | 'PENDING'> = {};
    let successCount = 0;
    let errorCount = 0;

    for (const assignment of deployable) {
      try {
        const courseId = config.courseIds[assignment.subject];
        if (!courseId) {
          results[assignment.id] = 'ERROR';
          errorCount++;
          continue;
        }

        const res = await callEdge<{ status?: string; error?: string; canvasUrl?: string }>('canvas-deploy-assignment', {
          subject: assignment.subject,
          courseId,
          title: assignment.title,
          description: '',
          points: assignment.points,
          gradingType: 'points',
          assignmentGroup: assignment.groupName,
          dueDate: assignment.dueDate || undefined,
          omitFromFinal: assignment.type === 'Study Guide',
        });

        if (res.status === 'DEPLOYED') {
          results[assignment.id] = 'DEPLOYED';
          successCount++;
        } else {
          results[assignment.id] = 'ERROR';
          errorCount++;
        }
      } catch {
        results[assignment.id] = 'ERROR';
        errorCount++;
      }
    }

    setDeployResults(results);
    if (errorCount === 0) {
      toast.success(`Deployed ${successCount} assignments to Canvas!`);
    } else {
      toast.warning(`Deployed ${successCount}, failed ${errorCount}`);
    }
    setDeploying(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
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

        <div className="ml-auto flex items-center gap-2">
          {simulated.length > 0 && (
            <Badge variant="outline" className="text-xs">{deployable.length} deployable</Badge>
          )}
          {orphanCount > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <CircleAlert className="h-3 w-3" /> {orphanCount} orphans
            </Badge>
          )}
          <Button
            onClick={() => setDiffOpen(true)}
            disabled={deploying || deployable.length === 0 || isLoading}
            className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
            size="sm"
          >
            <Rocket className="h-3.5 w-3.5" />
            Deploy to Canvas
          </Button>
        </div>
      </div>

      {/* History/Science Redirect Card */}
      {historyRedirect && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-4 flex items-center gap-3">
            <ArrowRightLeft className="h-5 w-5 text-warning" />
            <p className="text-sm">
              <span className="font-semibold">{historyRedirect.from}</span> has no content this week.
              Redirecting to <span className="font-semibold">{historyRedirect.to}</span> unit.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Simulation Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : simulated.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No assignments to preview. Fetch pacing data first.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Assignment Preview — {selectedMonth} Week {selectedWeek}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[80px]">Status</TableHead>
                    <TableHead className="text-xs w-[100px]">Day</TableHead>
                    <TableHead className="text-xs">Subject</TableHead>
                    <TableHead className="text-xs">Assignment Title</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Weight</TableHead>
                    <TableHead className="text-xs text-center">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simulated.map((row) => {
                    const status = deployResults[row.id];
                    return (
                      <TableRow key={row.id} className={
                        row.isOrphan ? 'bg-destructive/10' :
                        row.isSynthetic ? 'bg-primary/5' :
                        status === 'DEPLOYED' ? 'bg-success/10' :
                        status === 'ERROR' ? 'bg-destructive/10' : ''
                      }>
                        <TableCell className="text-xs">
                          {row.isOrphan ? (
                            <Badge variant="destructive" className="text-[9px] gap-0.5">
                              🔴 Missing
                            </Badge>
                          ) : status === 'DEPLOYED' ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : status === 'ERROR' ? (
                            <CircleAlert className="h-4 w-4 text-destructive" />
                          ) : (
                            <Badge variant="outline" className="text-[9px]">Ready</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-primary">{row.day}</TableCell>
                        <TableCell className="text-xs font-semibold">{row.subject}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold">{row.title}</span>
                            {row.isSynthetic && (
                              <span className="text-[9px] text-primary/70 font-mono uppercase tracking-tight flex items-center gap-1">
                                <Zap size={10} className="fill-current" /> Auto-Generated
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                          {row.groupName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[9px] font-bold tabular-nums">
                            {CATEGORY_WEIGHTS[row.groupName] || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-center font-mono">{row.points}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Friday Exception Notice */}
      <Card className="border-muted bg-muted/30">
        <CardContent className="py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-muted-foreground shrink-0" />
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            Friday Exception: No Homework / No Assignments — column muted by design.
          </p>
        </CardContent>
      </Card>

      {/* Kernel Info */}
      <div className="flex items-center gap-3 p-4 bg-accent/5 border border-border rounded-xl">
        <AlertCircle size={16} className="text-primary shrink-0" />
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest leading-relaxed">
          Gatekeeper v22.0: Canvas Direct Deploy active. Orphan detection via content map. Math Triple Sequence active.
        </p>
      </div>

      <SafetyDiffModal
        open={diffOpen}
        onOpenChange={setDiffOpen}
        month={selectedMonth}
        week={selectedWeek}
        action="DEPLOY_ASSIGNMENTS"
        itemCount={deployable.length}
        items={deployable.map(s => ({ label: s.title, subject: s.subject }))}
        onApprove={handleDeploy}
      />
    </div>
  );
}
