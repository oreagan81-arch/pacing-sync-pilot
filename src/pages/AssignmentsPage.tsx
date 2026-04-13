/**
 * THALES OS — Assignments Gatekeeper (v21.0)
 * Simulation view: previews what will be created before POST to GAS.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Rocket, Loader2, Zap, AlertCircle, ArrowRightLeft, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useSystemStore, type PacingCell } from '@/store/useSystemStore';
import { useConfig } from '@/lib/config';
import SafetyDiffModal from '@/components/SafetyDiffModal';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'];
const GAS_URL = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;

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

  useEffect(() => {
    fetchPacingData(selectedMonth, selectedWeek);
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

  // Build simulated assignments from pacing data
  const simulated: SimulatedAssignment[] = useMemo(() => {
    if (!pacingData || !config) return [];
    const result: SimulatedAssignment[] = [];
    let idCounter = 0;

    for (const subject of SUBJECTS) {
      const cells = pacingData.subjects[subject];
      if (!cells) continue;

      // History/Science redirect: skip the empty one
      if (historyRedirect && subject === historyRedirect.from) continue;

      const prefix = config.assignmentPrefixes[subject] || '';

      cells.forEach((cell: PacingCell, dayIdx: number) => {
        const day = DAYS[dayIdx];

        // Friday exception
        if (dayIdx === 4) return;

        if (cell.isNoClass || !cell.value || cell.value === '-') return;

        // Shurley English Filter: only CP or Test
        if (subject === 'Language Arts') {
          const upper = cell.value.toUpperCase();
          const isCP = upper.includes('CP');
          const isTest = cell.isTest;
          if (!isCP && !isTest) return;
        }

        // Spelling Filter: only Test
        if (subject === 'Spelling' && !cell.isTest) return;

        // Math Triple Sequence
        if (subject === 'Math' && cell.isTest) {
          const num = cell.lessonNum;
          // Written Test
          result.push({
            id: `sim_${idCounter++}`,
            day, dayIndex: dayIdx, subject,
            title: `${prefix} Written Test ${num}`,
            groupName: 'Written Assessments',
            points: 100, isSynthetic: false, type: 'Test',
          });
          // Fact Test
          result.push({
            id: `sim_${idCounter++}`,
            day, dayIndex: dayIdx, subject,
            title: `${prefix} Fact Test ${num}`,
            groupName: 'Fact Assessments',
            points: 100, isSynthetic: true, type: 'Fact Test',
          });
          // Study Guide (Day N-1)
          if (dayIdx > 0) {
            result.push({
              id: `sim_${idCounter++}`,
              day: DAYS[dayIdx - 1], dayIndex: dayIdx - 1, subject,
              title: `${prefix} Study Guide ${num}`,
              groupName: 'Homework/Class Work',
              points: 0, isSynthetic: true, type: 'Study Guide',
            });
          }
          return;
        }

        // Normal assignment
        let title = '';
        let groupName = 'Assignments';
        let points = 100;

        if (subject === 'Math') {
          const num = cell.lessonNum;
          const isEven = num ? parseInt(num) % 2 === 0 : false;
          title = `${prefix} ${isEven ? 'Evens' : 'Odds'} HW — Lesson ${num}`;
          groupName = 'Homework/Class Work';
        } else if (subject === 'Reading') {
          title = cell.isTest
            ? `${prefix} Mastery Test ${cell.lessonNum}`
            : `${prefix} Reading HW ${cell.lessonNum}`;
          groupName = cell.isTest ? 'Assessments' : 'Homework';
        } else if (subject === 'Spelling') {
          title = `${prefix} Spelling Test ${cell.lessonNum}`;
          groupName = 'Assessments';
        } else if (subject === 'Language Arts') {
          const upper = cell.value.toUpperCase();
          if (cell.isTest) {
            title = `${prefix} Shurley Test`;
            groupName = 'Assessments';
          } else if (upper.includes('CP')) {
            title = `${prefix} Classroom Practice ${cell.lessonNum}`;
            groupName = 'Classwork/Homework';
          }
        } else {
          title = `${subject} — ${cell.value}`;
        }

        result.push({
          id: `sim_${idCounter++}`,
          day, dayIndex: dayIdx, subject,
          title, groupName, points,
          isSynthetic: false, type: cell.isTest ? 'Test' : 'Lesson',
        });
      });
    }

    return result.sort((a, b) => a.dayIndex - b.dayIndex);
  }, [pacingData, config, historyRedirect]);

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DEPLOY_ASSIGNMENTS',
          month: selectedMonth,
          week: selectedWeek,
          assignments: simulated.map(s => ({
            title: s.title,
            subject: s.subject,
            groupName: s.groupName,
            points: s.points,
            day: s.day,
          })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Deployed ${simulated.length} assignments!`);
    } catch (e: any) {
      toast.error('Deployment failed', { description: e.message });
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
            <Badge variant="outline" className="text-xs">{simulated.length} assignments</Badge>
          )}
          <Button
            onClick={() => setDiffOpen(true)}
            disabled={deploying || simulated.length === 0 || isLoading}
            className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
            size="sm"
          >
            <Rocket className="h-3.5 w-3.5" />
            Deploy All
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
                    <TableHead className="text-xs w-[100px]">Day</TableHead>
                    <TableHead className="text-xs">Subject</TableHead>
                    <TableHead className="text-xs">Assignment Title</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Weight</TableHead>
                    <TableHead className="text-xs text-center">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simulated.map((row) => (
                    <TableRow key={row.id} className={row.isSynthetic ? 'bg-primary/5' : ''}>
                      <TableCell className="text-xs font-medium text-primary">
                        {row.dayIndex === 4 ? (
                          <span className="text-muted-foreground italic">Friday</span>
                        ) : row.day}
                      </TableCell>
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
                  ))}
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
          Gatekeeper v21.0: Math Triple Sequence active. Shurley CP-only filter active. Spelling Test-only filter active.
        </p>
      </div>

      <SafetyDiffModal
        open={diffOpen}
        onOpenChange={setDiffOpen}
        month={selectedMonth}
        week={selectedWeek}
        action="DEPLOY_ASSIGNMENTS"
        itemCount={simulated.length}
        items={simulated.map(s => ({ label: s.title, subject: s.subject }))}
        onApprove={handleDeploy}
      />
    </div>
  );
}
