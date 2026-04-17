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
import { generateCanvasPageHtml, generateHomeroomPageHtml, generateRedirectPageHtml, type CanvasPageRow } from '@/lib/canvas-html';
import type { ContentMapEntry } from '@/lib/auto-link';
import { callEdge } from '@/lib/edge';
import { useRealtimeDeploy } from '@/hooks/use-realtime-deploy';
import { useSystemStore } from '@/store/useSystemStore';
import SafetyDiffModal from '@/components/SafetyDiffModal';
import {
  filterTogetherPageRows,
  resolveTogetherCourseId,
} from '@/lib/together-logic';

const PAGE_SUBJECTS = ['Math', 'Reading', 'Language Arts', 'History', 'Science', 'Homeroom'] as const;
const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// SHA-256 of an HTML string → hex digest. Used for hash-based deploy skip.
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface WeekOption {
  id: string;
  quarter: string;
  week_num: number;
  date_range: string | null;
  reminders: string | null;
  resources: string | null;
  active_hs_subject?: string | null;
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
  const [savedRows, setSavedRows] = useState<CanvasPageRow[]>([]);
  const [contentMap, setContentMap] = useState<ContentMapEntry[]>([]);
  const [latestNewsletter, setLatestNewsletter] = useState<{ homeroom_notes: string | null; birthdays: string | null } | null>(null);
  const [activeSubject, setActiveSubject] = useState<string>('Math');
  const [previewMode, setPreviewMode] = useState<'preview' | 'code'>('preview');
  const [deploying, setDeploying] = useState<Record<string, boolean>>({});
  const [deployStatuses, setDeployStatuses] = useState<Record<string, { status: string; canvasUrl?: string }>>({});
  const [deployingAll, setDeployingAll] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const { selectedMonth, selectedWeek: storeWeek, pacingData, fetchPacingData } = useSystemStore();

  const handleRealtimeEvent = useCallback((event: any) => {
    if (event.action === 'page_deploy' && event.subject) {
      setDeployStatuses((prev) => ({
        ...prev,
        [event.subject]: { status: event.status || 'DEPLOYED', canvasUrl: event.canvas_url || undefined },
      }));
    }
  }, []);
  useRealtimeDeploy(handleRealtimeEvent);

  useEffect(() => {
    supabase.from('weeks').select('*').order('quarter').order('week_num').then(({ data }) => {
      if (data) setWeeks(data);
    });
    supabase.from('content_map').select('lesson_ref, subject, canvas_url, canonical_name').then(({ data }) => {
      if (data) setContentMap(data as ContentMapEntry[]);
    });
    supabase
      .from('newsletters')
      .select('homeroom_notes, birthdays')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLatestNewsletter(data ?? null));
  }, []);

  useEffect(() => {
    if (selectedWeekId || weeks.length === 0) return;
    const matchingWeek = weeks.find((week) => week.quarter === selectedMonth && week.week_num === storeWeek);
    if (matchingWeek) {
      setSelectedWeekId(matchingWeek.id);
    }
  }, [weeks, selectedWeekId, selectedMonth, storeWeek]);

  useEffect(() => {
    if (!selectedWeekId) return;
    const week = weeks.find((w) => w.id === selectedWeekId) || null;
    setSelectedWeek(week);

    if (week) {
      fetchPacingData(week.quarter, week.week_num);
    }

    supabase
      .from('pacing_rows')
      .select('*')
      .eq('week_id', selectedWeekId)
      .then(({ data }) => {
        setSavedRows((data as unknown as CanvasPageRow[]) || []);
      });

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

  const rows: CanvasPageRow[] = useMemo(() => {
    if (!pacingData) return savedRows;

    const savedRowMap = new Map(savedRows.map((row) => [`${row.subject}:${row.day}`, row]));
    const result: CanvasPageRow[] = [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    for (const [subject, cells] of Object.entries(pacingData.subjects)) {
      cells.forEach((cell, idx) => {
        const day = days[idx];
        const savedRow = savedRowMap.get(`${subject}:${day}`);
        result.push({
          day,
          type: savedRow?.type || (cell.isTest ? 'Test' : cell.isReview ? 'Review' : cell.isNoClass ? '-' : 'Lesson'),
          lesson_num: cell.lessonNum || savedRow?.lesson_num || null,
          in_class: cell.value || savedRow?.in_class || null,
          at_home: savedRow?.at_home || null,
          canvas_url: savedRow?.canvas_url || null,
          canvas_assignment_id: savedRow?.canvas_assignment_id || null,
          object_id: savedRow?.object_id || null,
          subject,
          resources: savedRow?.resources || null,
        });
      });
    }

    return result;
  }, [pacingData, savedRows]);

  // Get rows for active subject (Reading tab merges Reading + Spelling via Together Logic)
  const subjectRows = useMemo(() => {
    return filterTogetherPageRows(rows, activeSubject);
  }, [rows, activeSubject]);

  // Generate HTML for active subject
  const generatedHtml = useMemo(() => {
    if (!selectedWeek || !config) return '';
    const quarterColor = config.quarterColors[selectedWeek.quarter] || '#0065a7';

    if (activeSubject === 'Homeroom') {
      // Collect upcoming tests across all subjects this week
      const tests = rows
        .filter((r) => r.type === 'Test' || (r.in_class || '').toLowerCase().includes('test'))
        .map((r) => `${r.day}: ${r.subject}${r.lesson_num ? ` \u2014 ${r.lesson_num}` : ''}`);
      return generateHomeroomPageHtml({
        weekNum: selectedWeek.week_num,
        quarter: selectedWeek.quarter,
        dateRange: selectedWeek.date_range || '',
        quarterColor,
        reminders: selectedWeek.reminders || '',
        resources: selectedWeek.resources || '',
        homeroomNotes: latestNewsletter?.homeroom_notes || '',
        birthdays: latestNewsletter?.birthdays || '',
        upcomingTests: tests,
      });
    }

    // History/Science redirect routing — inactive subject shows redirect
    const activeHs = selectedWeek.active_hs_subject;
    if ((activeSubject === 'History' || activeSubject === 'Science') && activeHs && activeHs !== activeSubject) {
      return generateRedirectPageHtml({
        thisSubject: activeSubject as 'History' | 'Science',
        activeSubject: activeHs as 'History' | 'Science',
        weekNum: selectedWeek.week_num,
        quarter: selectedWeek.quarter,
        dateRange: selectedWeek.date_range || '',
        quarterColor,
      });
    }

    if (subjectRows.length === 0) return '';
    return generateCanvasPageHtml({
      subject: activeSubject === 'Reading' ? 'Reading & Spelling' : activeSubject,
      rows: subjectRows,
      quarter: selectedWeek.quarter,
      weekNum: selectedWeek.week_num,
      dateRange: selectedWeek.date_range || '',
      reminders: selectedWeek.reminders || '',
      resources: selectedWeek.resources || '',
      quarterColor,
      contentMap,
    });
  }, [subjectRows, rows, selectedWeek, activeSubject, config, contentMap, latestNewsletter]);

  // Canvas page naming: Q4W2, Q3W5, etc.
  const getPageSlug = (quarter: string, weekNum: number) => {
    // Extract quarter number from "Q4" or "Quarter 4" etc.
    const qMatch = quarter.match(/(\d+)/);
    const qNum = qMatch ? qMatch[1] : quarter;
    return `q${qNum}w${weekNum}`;
  };

  const getPageTitle = (quarter: string, weekNum: number) => {
    const qMatch = quarter.match(/(\d+)/);
    const qNum = qMatch ? qMatch[1] : quarter;
    return `Q${qNum}W${weekNum}`;
  };

  // Deploy single subject page via canvas-deploy-page edge function
  const handleDeploy = async (subject: string) => {
    if (!selectedWeek || !config) return;

    let sRows: CanvasPageRow[] = [];
    let html = '';
    let courseId: number | undefined;
    const quarterColor = config.quarterColors[selectedWeek.quarter] || '#0065a7';
    const pageSlug = getPageSlug(selectedWeek.quarter, selectedWeek.week_num);
    const pageTitle = getPageTitle(selectedWeek.quarter, selectedWeek.week_num);

    if (subject === 'Homeroom') {
      courseId = config.courseIds['Homeroom'];
      const tests = rows
        .filter((r) => r.type === 'Test' || (r.in_class || '').toLowerCase().includes('test'))
        .map((r) => `${r.day}: ${r.subject}${r.lesson_num ? ` \u2014 ${r.lesson_num}` : ''}`);
      html = generateHomeroomPageHtml({
        weekNum: selectedWeek.week_num,
        quarter: selectedWeek.quarter,
        dateRange: selectedWeek.date_range || '',
        quarterColor,
        reminders: selectedWeek.reminders || '',
        resources: selectedWeek.resources || '',
        homeroomNotes: latestNewsletter?.homeroom_notes || '',
        birthdays: latestNewsletter?.birthdays || '',
        upcomingTests: tests,
      });
    } else {
      const activeHs = selectedWeek.active_hs_subject;
      const isInactiveHs =
        (subject === 'History' || subject === 'Science') && activeHs && activeHs !== subject;

      if (isInactiveHs) {
        // Deploy redirect page instead of full agenda
        courseId = config.courseIds[subject];
        html = generateRedirectPageHtml({
          thisSubject: subject as 'History' | 'Science',
          activeSubject: activeHs as 'History' | 'Science',
          weekNum: selectedWeek.week_num,
          quarter: selectedWeek.quarter,
          dateRange: selectedWeek.date_range || '',
          quarterColor,
        });
      } else {
        sRows = filterTogetherPageRows(rows, subject);

        if (sRows.length === 0) {
          toast.error(`No data for ${subject}`);
          return;
        }

        courseId = resolveTogetherCourseId(subject) ?? config.courseIds[subject];

        html = generateCanvasPageHtml({
          subject: subject === 'Reading' ? 'Reading & Spelling' : subject,
          rows: sRows,
          quarter: selectedWeek.quarter,
          weekNum: selectedWeek.week_num,
          dateRange: selectedWeek.date_range || '',
          reminders: selectedWeek.reminders || '',
          resources: selectedWeek.resources || '',
          quarterColor,
          contentMap,
        });
      }
    }

    if (!courseId) {
      toast.error(`No course ID configured for ${subject}`);
      return;
    }

    setDeploying((p) => ({ ...p, [subject]: true }));

    try {
      const result = await callEdge<{ status?: string; canvasUrl?: string; error?: string }>('canvas-deploy-page', {
        subject,
        courseId,
        pageUrl: pageSlug,
        pageTitle,
        bodyHtml: html,
        published: true,
        setFrontPage: true,
        weekId: selectedWeekId || null,
      });

      if (result.status === 'DEPLOYED' || result.status === 'NO_CHANGE') {
        setDeployStatuses((p) => ({ ...p, [subject]: { status: result.status!, canvasUrl: result.canvasUrl } }));
        toast.success(`${subject} agenda ${result.status === 'NO_CHANGE' ? 'up to date' : 'deployed & set as homepage'}`, {
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
    const activeHs = selectedWeek?.active_hs_subject;
    return PAGE_SUBJECTS.filter((s) => {
      if (s === 'Homeroom') return true; // always deployable
      // Inactive H/S still deploys (as a redirect page)
      if ((s === 'History' || s === 'Science') && activeHs && activeHs !== s) return true;
      const sRows = filterTogetherPageRows(rows, s);
      return sRows.length > 0;
    });
  }, [rows, selectedWeek]);

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
                  <p><strong>Page URL:</strong> {selectedWeek ? getPageSlug(selectedWeek.quarter, selectedWeek.week_num) : '\u2014'}</p>
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
                        <th className="text-left p-2">At Home</th>
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
                            <td className="p-2 max-w-[200px] truncate text-muted-foreground">{day === 'Friday' ? 'No Homework' : (r.at_home || '\u2014')}</td>
                          </tr>
                        ));
                      })}
                      {subjectRows.length === 0 && (
                        <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No pacing data for this subject.</td></tr>
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
                      Mobile preview \u2014 sandboxed exact HTML being deployed
                    </p>
                    <iframe
                      title="Canvas page preview"
                      sandbox=""
                      srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><style>body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:16px;background:#fff;color:#222;line-height:1.5}h2,h3,h4{margin:0}h3{padding:10px 16px;border-radius:4px 4px 0 0;font-size:18px}h2{padding:14px;border-radius:4px;font-size:22px}.kl_subtitle{text-align:center;color:#666;font-style:italic;margin:8px 0 16px}.kl_wrapper>div{margin-bottom:18px;border:1px solid #e3e3e3;border-radius:6px;overflow:hidden}.kl_wrapper>div>*:not(h2):not(h3){padding-left:16px;padding-right:16px}p{margin:8px 0}a{color:#0065a7}img{max-width:100%;height:auto}</style></head><body>${generatedHtml}</body></html>`}
                      style={{ width: '100%', minHeight: '600px', border: '1px solid hsl(var(--border))', borderRadius: '6px', background: '#fff' }}
                    />
                  </div>
                ) : (
                  <pre className="text-xs bg-muted text-foreground p-4 rounded-lg overflow-auto max-h-[600px] whitespace-pre-wrap font-mono">
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
