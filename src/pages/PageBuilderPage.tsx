import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Rocket, Eye, Code, ExternalLink, Copy, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useConfig } from '@/lib/config';
import { generateCanvasPageHtml, type CanvasPageRow } from '@/lib/canvas-html';
import { useRealtimeDeploy } from '@/hooks/use-realtime-deploy';
import { useSystemStore } from '@/store/useSystemStore';
import SafetyDiffModal from '@/components/SafetyDiffModal';

const GAS_URL = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;

const PAGE_SUBJECTS = ['Math', 'Reading', 'Language Arts', 'History', 'Science'] as const;
const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

interface WeekOption {
  id: string;
  quarter: string;
  week_num: number;
  date_range: string | null;
  reminders: string | null;
  resources: string | null;
}

interface DeployResult {
  status: string;
  canvasUrl?: string;
  error?: string;
}

export default function PageBuilderPage() {
  const config = useConfig();
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<WeekOption | null>(null);
  const [activeSubject, setActiveSubject] = useState<string>('Math');
  const [previewMode, setPreviewMode] = useState<'preview' | 'code'>('preview');
  const [deploying, setDeploying] = useState<Record<string, boolean>>({});
  const [deployStatuses, setDeployStatuses] = useState<Record<string, { status: string; canvasUrl?: string }>>({});
  const [deployingAll, setDeployingAll] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const { selectedMonth, selectedWeek: storeWeek, pacingData, fetchPacingData } = useSystemStore();

  // Realtime deploy notifications — update statuses live
  const handleRealtimeEvent = useCallback((event: any) => {
    if (event.action === 'page_deploy' && event.subject) {
      setDeployStatuses((prev) => ({
        ...prev,
        [event.subject]: { status: event.status || 'DEPLOYED', canvasUrl: event.canvas_url || undefined },
      }));
    }
  }, []);
  useRealtimeDeploy(handleRealtimeEvent);

  // Load weeks list
  useEffect(() => {
    supabase.from('weeks').select('*').order('quarter').order('week_num').then(({ data }) => {
      if (data) setWeeks(data);
    });
  }, []);

  // Load week details + fetch GAS pacing data when week changes
  useEffect(() => {
    if (!selectedWeekId) return;
    const week = weeks.find((w) => w.id === selectedWeekId);
    setSelectedWeek(week || null);

    // Fetch GAS pacing data for this week
    if (week) {
      fetchPacingData(week.quarter, week.week_num);
    }

    // Load deploy log for this week's pages
    supabase
      .from('deploy_log')
      .select('*')
      .eq('week_id', selectedWeekId)
      .eq('action', 'page_deploy')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const statuses: Record<string, { status: string; canvasUrl?: string }> = {};
          for (const log of data) {
            if (log.subject && !statuses[log.subject]) {
              statuses[log.subject] = { status: log.status || 'PENDING', canvasUrl: log.canvas_url || undefined };
            }
          }
          setDeployStatuses(statuses);
        }
      });
  }, [selectedWeekId, weeks, fetchPacingData]);

  // Build CanvasPageRow[] from GAS pacing data
  const rows: CanvasPageRow[] = useMemo(() => {
    if (!pacingData) return [];
    const result: CanvasPageRow[] = [];
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    for (const [subject, cells] of Object.entries(pacingData.subjects)) {
      cells.forEach((cell, idx) => {
        result.push({
          day: DAYS[idx],
          type: cell.isTest ? 'Test' : cell.isReview ? 'Review' : 'Lesson',
          lesson_num: cell.lessonNum || null,
          in_class: cell.value || null,
          at_home: null,
          canvas_url: null,
          canvas_assignment_id: null,
          object_id: null,
          subject,
          resources: null,
        });
      });
    }
    return result;
  }, [pacingData]);

  // Get rows for active subject (Reading tab merges Reading + Spelling)
  const subjectRows = useMemo(() => {
    if (activeSubject === 'Reading') {
      return rows.filter((r) => r.subject === 'Reading' || r.subject === 'Spelling');
    }
    return rows.filter((r) => r.subject === activeSubject);
  }, [rows, activeSubject]);

  // Generate HTML for active subject
  const generatedHtml = useMemo(() => {
    if (!selectedWeek || subjectRows.length === 0 || !config) return '';
    const quarterColor = config.quarterColors[selectedWeek.quarter] || '#0065a7';
    return generateCanvasPageHtml({
      subject: activeSubject === 'Reading' ? 'Reading & Spelling' : activeSubject,
      rows: subjectRows,
      quarter: selectedWeek.quarter,
      weekNum: selectedWeek.week_num,
      dateRange: selectedWeek.date_range || '',
      reminders: selectedWeek.reminders || '',
      resources: selectedWeek.resources || '',
      quarterColor,
    });
  }, [subjectRows, selectedWeek, activeSubject, config]);

  const getPageUrl = (subject: string, weekNum: number) => {
    const slug = subject === 'Reading' ? 'reading-spelling' : subject.toLowerCase().replace(/\s+/g, '-');
    return `week-${weekNum}-${slug}-agenda`;
  };

  // Deploy single subject page
  const handleDeploy = async (subject: string) => {
    if (!selectedWeek || !config) return;
    const sRows = subject === 'Reading'
      ? rows.filter((r) => r.subject === 'Reading' || r.subject === 'Spelling')
      : rows.filter((r) => r.subject === subject);

    if (sRows.length === 0) {
      toast.error(`No data for ${subject}`);
      return;
    }

    setDeploying((p) => ({ ...p, [subject]: true }));

    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({
          action: 'DEPLOY_AGENDAS',
          month: selectedMonth,
          week: storeWeek,
          subject,
          courseId: config.courseIds[subject],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();

      if (result.status === 'success') {
        setDeployStatuses((p) => ({ ...p, [subject]: { status: 'DEPLOYED', canvasUrl: result.canvasUrl } }));
        toast.success(`${subject} agenda deployed!`, {
          action: result.canvasUrl ? { label: 'Open', onClick: () => window.open(result.canvasUrl, '_blank') } : undefined,
        });
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (e: any) {
      toast.error(`Deploy failed — ${subject}`, { description: e.message });
      setDeployStatuses((p) => ({ ...p, [subject]: { status: 'ERROR' } }));
    }
    setDeploying((p) => ({ ...p, [subject]: false }));
  };

  const deployableSubjects = useMemo(() => {
    return PAGE_SUBJECTS.filter((s) => {
      const sRows = s === 'Reading'
        ? rows.filter((r) => r.subject === 'Reading' || r.subject === 'Spelling')
        : rows.filter((r) => r.subject === s);
      return sRows.length > 0;
    });
  }, [rows]);

  // Deploy all pages with progress toast
  const handleDeployAll = async () => {
    setDeployingAll(true);

    if (deployableSubjects.length === 0) {
      toast.error('No data to deploy');
      setDeployingAll(false);
      return;
    }

    const toastId = toast.loading(`Deploying 0/${deployableSubjects.length} pages\u2026`);
    let done = 0;
    let errors = 0;

    for (const subject of deployableSubjects) {
      toast.loading(`Deploying ${subject} (${done + 1}/${deployableSubjects.length})\u2026`, { id: toastId });
      try {
        await handleDeploy(subject);
      } catch {
        errors++;
      }
      done++;
    }

    if (errors > 0) {
      toast.warning(`Deployed ${done - errors}/${deployableSubjects.length} pages (${errors} failed)`, { id: toastId });
    } else {
      toast.success(`All ${deployableSubjects.length} pages deployed! \u2705`, { id: toastId });
    }
    setDeployingAll(false);
  };

  const copyHtml = () => {
    navigator.clipboard.writeText(generatedHtml);
    toast.success('HTML copied!');
  };

  const statusBadge = (subject: string) => {
    const s = deployStatuses[subject];
    if (!s) return <Badge variant="outline" className="text-[10px]">PENDING</Badge>;
    if (s.status === 'DEPLOYED') return <Badge className="text-[10px] bg-success text-success-foreground">DEPLOYED</Badge>;
    if (s.status === 'NO_CHANGE') return <Badge variant="secondary" className="text-[10px]">NO CHANGE</Badge>;
    if (s.status === 'ERROR') return <Badge variant="destructive" className="text-[10px]">ERROR</Badge>;
    return <Badge variant="outline" className="text-[10px]">{s.status}</Badge>;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedWeekId} onValueChange={setSelectedWeekId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select a week\u2026" />
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

        <div className="ml-auto">
          <Button
            variant="deploy"
            size="sm"
            onClick={() => setDiffOpen(true)}
            disabled={deployingAll || !selectedWeekId || deployableSubjects.length === 0}
            className="gap-1.5"
          >
            {deployingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            {deployingAll ? 'Deploying\u2026' : 'Deploy All Pages'}
          </Button>
        </div>
      </div>

      <SafetyDiffModal
        open={diffOpen}
        onOpenChange={setDiffOpen}
        month={selectedMonth}
        week={storeWeek}
        action="DEPLOY_AGENDAS"
        itemCount={deployableSubjects.length}
        items={deployableSubjects.map(s => ({ label: `${s === 'Reading' ? 'Reading & Spelling' : s} Agenda`, subject: s }))}
        onApprove={handleDeployAll}
      />

      {!selectedWeekId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">Select a saved week to preview and deploy agenda pages.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* LEFT — Subject tabs + cards */}
          <div className="space-y-4">
            <Tabs value={activeSubject} onValueChange={setActiveSubject}>
              <TabsList>
                {PAGE_SUBJECTS.map((s) => (
                  <TabsTrigger key={s} value={s} className="text-xs gap-1.5">
                    {s === 'Reading' ? 'Reading & Spelling' : s}
                    {deployStatuses[s]?.status === 'DEPLOYED' && <CheckCircle2 className="h-3 w-3 text-success" />}
                    {deployStatuses[s]?.status === 'ERROR' && <AlertTriangle className="h-3 w-3 text-destructive" />}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {activeSubject === 'Reading' ? 'Reading & Spelling' : activeSubject} Agenda
                  </CardTitle>
                  {statusBadge(activeSubject)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Page URL:</strong> {selectedWeek ? getPageUrl(activeSubject, selectedWeek.week_num) : '\u2014'}</p>
                  <p><strong>Course ID:</strong> {config?.courseIds[activeSubject] || '\u2014'}</p>
                  {deployStatuses[activeSubject]?.canvasUrl && (
                    <p>
                      <strong>Canvas URL:</strong>{' '}
                      <a
                        href={deployStatuses[activeSubject].canvasUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline inline-flex items-center gap-1"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="deploy"
                    onClick={() => handleDeploy(activeSubject)}
                    disabled={deploying[activeSubject]}
                    className="gap-1.5"
                  >
                    {deploying[activeSubject] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                    {deploying[activeSubject] ? 'Deploying\u2026' : 'Deploy Page'}
                  </Button>
                </div>

                {/* Row summary */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left p-2">Day</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Lesson</th>
                        <th className="text-left p-2">In Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS_ORDER.map((day) => {
                        const dayRows = subjectRows.filter((r) => r.day === day);
                        if (dayRows.length === 0) return null;
                        return dayRows.map((r, i) => (
                          <tr key={`${day}-${i}`} className="border-t">
                            <td className="p-2 font-medium">{i === 0 ? day : ''}</td>
                            <td className="p-2">{r.type || '\u2014'}</td>
                            <td className="p-2">{r.lesson_num || '\u2014'}</td>
                            <td className="p-2 max-w-[200px] truncate">{r.in_class || '\u2014'}</td>
                          </tr>
                        ));
                      })}
                      {subjectRows.length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No pacing data for this subject.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT — Preview / HTML Code */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant={previewMode === 'preview' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewMode('preview')}
                className="gap-1.5"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </Button>
              <Button
                variant={previewMode === 'code' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewMode('code')}
                className="gap-1.5"
              >
                <Code className="h-3.5 w-3.5" />
                HTML Code
              </Button>
              {previewMode === 'code' && (
                <Button variant="outline" size="sm" onClick={copyHtml} className="gap-1.5 ml-auto">
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              )}
            </div>

            <Card className="min-h-[500px]">
              <CardContent className="p-4">
                {!generatedHtml ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Globe className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-sm">No data for this subject/week.</p>
                  </div>
                ) : previewMode === 'preview' ? (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-3 uppercase tracking-wider font-semibold">
                      Exact HTML being deployed
                    </p>
                    <div dangerouslySetInnerHTML={{ __html: generatedHtml }} />
                  </div>
                ) : (
                  <pre className="text-xs bg-slate-950 text-slate-100 p-4 rounded-lg overflow-auto max-h-[600px] whitespace-pre-wrap font-mono">
                    {generatedHtml}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
