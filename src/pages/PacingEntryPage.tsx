import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Zap, Sheet, Loader2, CalendarDays } from 'lucide-react';
import PasteImportDialog from '@/components/PasteImportDialog';
import { DaySubjectCard, type DayCellData } from '@/components/pacing/DaySubjectCard';
import { PacingEntryHeader } from '@/components/pacing-entry/PacingEntryHeader';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useConfig } from '@/lib/config';
import { evaluateWeekRisk } from '@/lib/risk-engine';
import type { ContentMapEntry } from '@/lib/auto-link';
import { useSystemStore } from '@/store/useSystemStore';
import { upsertPacingFromGAS } from '@/lib/gas-import';
import { FullSheetImportDialog } from '@/components/pacing-entry/FullSheetImportDialog';

const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

// Subject name mapping from API keys to our internal names
const API_SUBJECT_MAP: Record<string, string> = {
  Math: 'Math',
  Reading: 'Reading',
  Spelling: 'Spelling',
  English: 'Language Arts',
  'Language Arts': 'Language Arts',
  History: 'History',
  Science: 'Science',
};

const SUBJECT_TYPES: Record<string, string[]> = {
  Math: ['Lesson', 'Investigation', 'Test', 'Fact Test', 'Study Guide', 'No Class', '-'],
  Reading: ['Lesson', 'Test', 'Checkout', 'No Class', '-'],
  Spelling: ['Lesson', 'Test', 'No Class', '-'],
  'Language Arts': ['Lesson', 'CP', 'Test', 'No Class', '-'],
  History: ['Lesson', 'Test', 'No Class', '-'],
  Science: ['Lesson', 'Test', 'No Class', '-'],
};

// Language Arts only deploys assignments for these types
const LA_ASSIGNABLE_TYPES = new Set(['CP', 'Classroom Practice', 'Test']);
const isLanguageArtsAssignable = (type: string | null | undefined) =>
  LA_ASSIGNABLE_TYPES.has(type ?? '');

interface DayData {
  type: string;
  lesson_num: string;
  in_class: string;
  at_home: string;
  resources: string;
  create_assign: boolean;
  hint_override?: 'evens' | 'odds' | 'none' | null;
}

type WeekData = Record<string, Record<string, DayData>>;

interface PacingEntryPageProps {
  activeQuarter: string;
  setActiveQuarter: (q: string) => void;
  activeWeek: number;
  setActiveWeek: (w: number) => void;
  setRiskLevel: (l: 'LOW' | 'MEDIUM' | 'HIGH') => void;
  setRiskScore: (s: number) => void;
  quarterColor: string;
}

function emptyDay(): DayData {
  return { type: '', lesson_num: '', in_class: '', at_home: '', resources: '', create_assign: true, hint_override: null };
}

function initWeekData(): WeekData {
  const data: WeekData = {};
  for (const subj of SUBJECTS) {
    data[subj] = {};
    for (const day of DAYS) {
      data[subj][day] = emptyDay();
    }
  }
  return data;
}

export default function PacingEntryPage({
  activeQuarter,
  setActiveQuarter,
  activeWeek,
  setActiveWeek,
  setRiskLevel,
  setRiskScore,
  quarterColor,
}: PacingEntryPageProps) {
  const config = useConfig();
  const [weekData, setWeekData] = useState<WeekData>(initWeekData);
  const [dateRange, setDateRange] = useState('');
  const [reminders, setReminders] = useState('');
  const [resources, setResources] = useState('');
  const [saving, setSaving] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [activeHsSubject, setActiveHsSubject] = useState<string>('Both');
  const [savedWeeks, setSavedWeeks] = useState<{ id: string; quarter: string; week_num: number }[]>([]);
  const [contentMap, setContentMap] = useState<ContentMapEntry[]>([]);
  const [syncingResources, setSyncingResources] = useState(false);
  const [gasImporting, setGasImporting] = useState(false);
  const fetchPacingData = useSystemStore((s) => s.fetchPacingData);

  // Load content_map for resource badges
  const loadContentMap = useCallback(async () => {
    const { data } = await supabase
      .from('content_map')
      .select('lesson_ref, subject, canvas_url, canonical_name');
    if (data) setContentMap(data as ContentMapEntry[]);
  }, []);
  useEffect(() => {
    void loadContentMap();
  }, [loadContentMap]);

  // "Grab Resources" — re-pull the latest content_map for this week.
  const handleSyncResources = useCallback(async () => {
    setSyncingResources(true);
    try {
      await loadContentMap();
      toast.success('Resources refreshed');
    } catch (e: any) {
      toast.error('Could not refresh resources', { description: e?.message });
    } finally {
      setSyncingResources(false);
    }
  }, [loadContentMap]);

  // Compute risk on every change
  useEffect(() => {
    const rows = SUBJECTS.flatMap((subj) =>
      DAYS.map((day) => ({
        type: weekData[subj][day].type,
        day,
        create_assign:
          weekData[subj][day].create_assign &&
          !(config?.autoLogic.historyScienceNoAssign && (subj === 'History' || subj === 'Science')) &&
          day !== 'Friday',
      }))
    );
    const risk = evaluateWeekRisk(rows);
    setRiskLevel(risk.level);
    setRiskScore(risk.score);
  }, [weekData, config, setRiskLevel, setRiskScore]);

  // Load saved weeks list
  useEffect(() => {
    supabase
      .from('weeks')
      .select('id, quarter, week_num')
      .order('quarter')
      .order('week_num')
      .then(({ data }) => {
        if (data) setSavedWeeks(data);
      });
  }, []);

  const updateCell = useCallback(
    (subject: string, day: string, field: keyof DayData, value: string | boolean | null | undefined) => {
      setWeekData((prev) => ({
        ...prev,
        [subject]: {
          ...prev[subject],
          [day]: { ...prev[subject][day], [field]: value },
        },
      }));
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert week
      const { data: weekRow, error: weekErr } = await supabase
        .from('weeks')
        .upsert(
          {
            quarter: activeQuarter,
            week_num: activeWeek,
            date_range: dateRange,
            reminders,
            resources,
            active_hs_subject: activeHsSubject === 'Both' ? null : activeHsSubject,
          } as any,
          { onConflict: 'quarter,week_num' }
        )
        .select('id')
        .single();

      if (weekErr || !weekRow) throw new Error(weekErr?.message || 'Failed to save week');

      // Upsert pacing_rows
      const rows = SUBJECTS.flatMap((subj) =>
        DAYS.map((day) => {
          const d = weekData[subj][day];
          const isNoAssign =
            config?.autoLogic.historyScienceNoAssign && (subj === 'History' || subj === 'Science');
          const isFriday = day === 'Friday';
          const isLA = subj === 'Language Arts';
          const laBlocked = isLA && !isLanguageArtsAssignable(d.type);
          return {
            week_id: weekRow.id,
            subject: subj,
            day,
            type: d.type || null,
            lesson_num: d.lesson_num || null,
            in_class: d.in_class || null,
            at_home: isFriday ? null : d.at_home || null,
            resources: d.resources || null,
            create_assign: isNoAssign || isFriday || laBlocked ? false : d.create_assign,
            hint_override: d.hint_override ?? null,
          };
        })
      );

      const { error: rowsErr } = await supabase
        .from('pacing_rows')
        .upsert(rows, { onConflict: 'week_id,subject,day' });

      if (rowsErr) throw new Error(rowsErr.message);

      // Mark this week as the active one (clear others first to satisfy unique index)
      await supabase.from('weeks').update({ is_active: false }).neq('id', weekRow.id);
      await supabase.from('weeks').update({ is_active: true }).eq('id', weekRow.id);

      toast.success('Week saved!');
      // Refresh saved weeks list
      const { data: updated } = await supabase
        .from('weeks')
        .select('id, quarter, week_num')
        .order('quarter')
        .order('week_num');
      if (updated) setSavedWeeks(updated);
    } catch (e: any) {
      toast.error('Save failed', { description: e.message });
    }
    setSaving(false);
  };

  const loadWeekById = useCallback(async (weekId: string, showToast = true) => {
    const week = savedWeeks.find((w) => w.id === weekId);
    if (!week) return;

    setActiveQuarter(week.quarter);
    setActiveWeek(week.week_num);

    const [{ data: weekData2 }, { data: rows }] = await Promise.all([
      supabase.from('weeks').select('*').eq('id', weekId).single(),
      supabase.from('pacing_rows').select('*').eq('week_id', weekId),
    ]);

    // Mark loaded week as active
    await supabase.from('weeks').update({ is_active: false }).neq('id', weekId);
    await supabase.from('weeks').update({ is_active: true }).eq('id', weekId);

    if (weekData2) {
      setDateRange(weekData2.date_range || '');
      setReminders(weekData2.reminders || '');
      setResources(weekData2.resources || '');
      setActiveHsSubject(((weekData2 as any).active_hs_subject as string) || 'Both');
    }

    if (rows) {
      const newData = initWeekData();
      for (const row of rows) {
        if (newData[row.subject] && newData[row.subject][row.day]) {
          newData[row.subject][row.day] = {
            type: row.type || '',
            lesson_num: row.lesson_num || '',
            in_class: row.in_class || '',
            at_home: row.at_home || '',
            resources: row.resources || '',
            create_assign: row.create_assign ?? true,
            hint_override: ((row as any).hint_override ?? null) as DayData['hint_override'],
          };
        }
      }
      setWeekData(newData);
    }

    if (showToast) {
      toast.success(`Loaded ${week.quarter} Week ${week.week_num}`);
    }
  }, [savedWeeks, setActiveQuarter, setActiveWeek]);

  useEffect(() => {
    if (savedWeeks.length === 0) return; // Don't reset while still loading
    const matchingWeek = savedWeeks.find((week) => week.quarter === activeQuarter && week.week_num === activeWeek);
    if (matchingWeek) {
      void loadWeekById(matchingWeek.id, false);
    }
  }, [savedWeeks, activeQuarter, activeWeek, loadWeekById]);

  const handleLoadWeek = async (weekId: string) => {
    await loadWeekById(weekId, true);
  };

  const handleAutoRemind = () => {
    const testDays: string[] = [];
    for (const subj of SUBJECTS) {
      for (const day of DAYS) {
        if (weekData[subj][day].type?.toLowerCase().includes('test')) {
          testDays.push(`${subj} Test — ${day}`);
        }
      }
    }
    if (testDays.length > 0) {
      setReminders((prev) => {
        const existing = prev ? prev + '\n' : '';
        return existing + testDays.join('\n');
      });
      toast.success(`Added ${testDays.length} test reminders`);
    } else {
      toast.info('No tests found this week');
    }
  };

  const handleGasImport = async () => {
    setGasImporting(true);
    try {
      await fetchPacingData(activeQuarter, activeWeek);
      const pacing = useSystemStore.getState().pacingData;
      if (!pacing || !pacing.subjects) {
        toast.error('GAS pull returned no data');
        return;
      }
      const result = await upsertPacingFromGAS(activeQuarter, activeWeek, pacing);
      toast.success(`Imported ${result.rowsUpserted} rows from GAS pacing sheet`);
      // Refresh saved weeks list
      const { data: updated } = await supabase
        .from('weeks')
        .select('id, quarter, week_num')
        .order('quarter')
        .order('week_num');
      if (updated) setSavedWeeks(updated);
      // Reload form data directly from Supabase for the imported week
      const [{ data: weekRow2 }, { data: rows }] = await Promise.all([
        supabase.from('weeks').select('*').eq('id', result.weekId).single(),
        supabase.from('pacing_rows').select('*').eq('week_id', result.weekId),
      ]);
      if (weekRow2) {
        setDateRange((weekRow2 as any).date_range || '');
        setReminders((weekRow2 as any).reminders || '');
        setResources((weekRow2 as any).resources || '');
      }
      if (rows) {
        const newData = initWeekData();
        for (const row of rows) {
          if (newData[row.subject]?.[row.day]) {
            newData[row.subject][row.day] = {
              type: row.type || '',
              lesson_num: row.lesson_num || '',
              in_class: row.in_class || '',
              at_home: row.at_home || '',
              resources: row.resources || '',
              create_assign: row.create_assign ?? true,
              hint_override: ((row as any).hint_override ?? null) as DayData['hint_override'],
            };
          }
        }
        setWeekData(newData);
      }
    } catch (e: any) {
      toast.error('GAS import failed', { description: e?.message });
    } finally {
      setGasImporting(false);
    }
  };

  const handleSheetImport = async () => {
    setSheetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sheets-import', {
        body: {},
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const rows: string[][] = data?.rows ?? [];
      if (!rows.length) {
        toast.info('Sheet returned no data');
        setSheetLoading(false);
        return;
      }

      // Parse CSV rows to find the week matching activeQuarter + activeWeek.
      // Week blocks are separated by header rows (date range or "Week N" in col 0).
      // Subject rows have a recognizable label in col 0 and day values in cols 2-6.
      const SUBJECT_MAP: Record<string, string> = {
        saxon: 'Math', math: 'Math',
        reading: 'Reading', rm4: 'Reading',
        spelling: 'Spelling',
        shurley: 'Language Arts', english: 'Language Arts', ela: 'Language Arts', 'language arts': 'Language Arts',
        history: 'History',
        science: 'Science',
      };

      function matchSubject(label: string): string | null {
        const l = label.toLowerCase().trim();
        for (const [key, val] of Object.entries(SUBJECT_MAP)) {
          if (l.includes(key)) return val;
        }
        return null;
      }

      function isWeekHeader(label: string): boolean {
        const l = label.trim();
        return /^week\s*\d+/i.test(l) || /[A-Za-z]{3,}\s*\d{1,2}\s*[-–]/.test(l);
      }

      // Collect all week blocks
      const allWeeks: Array<{ weekNum: number; dateRange: string; cells: Record<string, Record<string, string>> }> = [];
      let current: typeof allWeeks[number] | null = null;

      for (const row of rows) {
        const col0 = (row[0] ?? '').trim();
        if (isWeekHeader(col0)) {
          if (current) allWeeks.push(current);
          current = { weekNum: allWeeks.length + 1, dateRange: col0, cells: {} };
          continue;
        }
        const subj = matchSubject(col0);
        if (!subj) continue;
        if (!current) current = { weekNum: 1, dateRange: '', cells: {} };
        current.cells[subj] = {};
        ['Monday','Tuesday','Wednesday','Thursday','Friday'].forEach((day, i) => {
          current!.cells[subj][day] = (row[2 + i] ?? '').trim();
        });
      }
      if (current) allWeeks.push(current);

      // Find the week matching activeWeek number
      const target = allWeeks.find(w => w.weekNum === activeWeek) ?? allWeeks[activeWeek - 1];
      if (!target) {
        toast.info(`Week ${activeWeek} not found in sheet (sheet has ${allWeeks.length} weeks)`);
        setSheetLoading(false);
        return;
      }

      // Build weekData from the matched week
      const newData = initWeekData();
      let cellCount = 0;
      for (const [subj, dayCells] of Object.entries(target.cells)) {
        for (const [day, raw] of Object.entries(dayCells)) {
          if (!newData[subj]?.[day]) continue;
          const lower = raw.toLowerCase();
          const isTest = lower.includes('test');
          const isNoClass = raw === '-' || lower === 'no class' || raw === '';
          const isFact = lower.includes('fact');
          const isSG = /\bsg\b/i.test(raw) || lower.includes('study guide');
          const type = isFact ? 'Fact Test' : isSG ? 'Study Guide' : isTest ? 'Test' : isNoClass ? '-' : 'Lesson';
          const lessonNum = raw.match(/\d+/)?.[0] ?? '';
          newData[subj][day] = {
            type,
            lesson_num: lessonNum,
            in_class: raw,
            at_home: '',
            resources: '',
            create_assign: !isNoClass && day !== 'Friday',
          };
          cellCount++;
        }
      }

      if (target.dateRange) {
        setDateRange(target.dateRange);
      }

      setWeekData(newData);
      toast.success(`Loaded Week ${activeWeek} from Google Sheet (${cellCount} cells)`);
    } catch (e: any) {
      toast.error('Sheet import failed', { description: e.message });
    }
    setSheetLoading(false);
  };

  const isTestWeek = (subject: string) =>
    DAYS.some((d) => weekData[subject][d].type?.toLowerCase().includes('test'));

  const getPowerUp = (lessonNum: string) => {
    if (!config || !lessonNum) return null;
    return config.powerUpMap[lessonNum] || null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PacingEntryHeader
        quarter={activeQuarter}
        weekNum={activeWeek}
        dateRange={dateRange}
        onSyncResources={handleSyncResources}
        syncing={syncingResources}
      />
      {/* Sticky sub-header */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Quarter pills */}
        {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
          <button
            key={q}
            onClick={() => setActiveQuarter(q)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              activeQuarter === q
                ? 'text-white shadow-md'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            style={activeQuarter === q ? { backgroundColor: quarterColor } : undefined}
          >
            {q}
          </button>
        ))}

        <Select value={String(activeWeek)} onValueChange={(v) => setActiveWeek(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                Week {i + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Date range (e.g. Jan 6–10)"
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="w-48"
        />

        <PasteImportDialog onImport={(data) => setWeekData(data)} />

        <Button variant="outline" size="sm" onClick={handleSheetImport} disabled={sheetLoading} className="gap-1.5">
          {sheetLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5" />}
          {sheetLoading ? 'Importing...' : 'Google Sheets'}
        </Button>

        <FullSheetImportDialog
          onImported={async () => {
            const { data: updated } = await supabase
              .from('weeks')
              .select('id, quarter, week_num')
              .order('quarter')
              .order('week_num');
            if (updated) setSavedWeeks(updated);
          }}
        />

        <Button variant="outline" size="sm" onClick={handleGasImport} disabled={gasImporting} className="gap-1.5">
          {gasImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span aria-hidden>🔄</span>}
          {gasImporting ? 'Importing...' : 'Import from GAS Sheet'}
        </Button>

        <Button variant="outline" size="sm" onClick={handleAutoRemind} className="gap-1.5">
          <Zap className="h-3.5 w-3.5" />
          Auto-Remind
        </Button>

        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save Draft'}
        </Button>

        {savedWeeks.length > 0 && (
          <Select onValueChange={handleLoadWeek}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Load Week..." />
            </SelectTrigger>
            <SelectContent>
              {savedWeeks.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.quarter} Wk {w.week_num}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Week-level fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reminders
          </label>
          <Textarea
            value={reminders}
            onChange={(e) => setReminders(e.target.value)}
            placeholder="One reminder per line..."
            className="border-l-4 bg-[#fff8fb]"
            style={{ borderLeftColor: '#c51062' }}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resources
          </label>
          <Textarea
            value={resources}
            onChange={(e) => setResources(e.target.value)}
            placeholder="Resource links or labels..."
            className="border-l-4 bg-[#faf8ff]"
            style={{ borderLeftColor: '#6644bb' }}
            rows={3}
          />
        </div>
      </div>

      {/* Active H/S subject toggle */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Active H/S Subject
        </label>
        <div className="flex gap-1">
          {(['Both', 'History', 'Science'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setActiveHsSubject(opt)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeHsSubject === opt
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        {activeHsSubject !== 'Both' && (
          <span className="text-xs text-muted-foreground">
            The {activeHsSubject === 'History' ? 'Science' : 'History'} Canvas page will show a redirect to {activeHsSubject}.
          </span>
        )}
      </div>

      {/* Day × Subject grid — desktop (≥md) */}
      <div className="hidden md:block rounded-lg border border-border bg-card/30 overflow-x-auto">
        <div className="min-w-[1100px]">
          {/* Day header row */}
          <div className="grid grid-cols-[120px_repeat(5,1fr)] gap-2 p-2 border-b border-border bg-muted/30 sticky top-0 z-10">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Subject
            </div>
            {DAYS.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Subject rows */}
          {SUBJECTS.map((subject) => {
            const courseId = config?.courseIds[subject];
            const prefix = config?.assignmentPrefixes[subject] ?? '';
            const isHsBlocked =
              !!config?.autoLogic.historyScienceNoAssign &&
              (subject === 'History' || subject === 'Science');
            if (
              activeHsSubject !== 'Both' &&
              ((subject === 'History' && activeHsSubject === 'Science') ||
                (subject === 'Science' && activeHsSubject === 'History'))
            ) {
              return null;
            }
            return (
              <div
                key={subject}
                className="grid grid-cols-[120px_repeat(5,1fr)] gap-2 p-2 border-b border-border/50 last:border-b-0"
              >
                <div className="flex flex-col justify-center gap-1 px-2">
                  <span className="text-sm font-bold leading-tight">{subject}</span>
                  {courseId && (
                    <span className="text-[9px] font-mono text-muted-foreground">
                      Course {courseId}
                    </span>
                  )}
                  {isTestWeek(subject) && (
                    <span className="inline-flex items-center w-fit rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                      Test Week
                    </span>
                  )}
                  {subject === 'Math' &&
                    (() => {
                      const mondayLesson = weekData.Math.Monday.lesson_num;
                      const pu = getPowerUp(mondayLesson);
                      return pu ? (
                        <span className="inline-flex items-center w-fit rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-foreground">
                          Power Up {pu}
                        </span>
                      ) : null;
                    })()}
                </div>

                {DAYS.map((day) => {
                  const cell = weekData[subject][day];
                  const isLaBlocked =
                    subject === 'Language Arts' && !isLanguageArtsAssignable(cell.type);
                  return (
                    <DaySubjectCard
                      key={day}
                      subject={subject}
                      day={day}
                      cell={cell}
                      prefix={prefix}
                      isFriday={day === 'Friday'}
                      isHsBlocked={isHsBlocked}
                      isLaBlocked={isLaBlocked}
                      availableTypes={SUBJECT_TYPES[subject] ?? ['Lesson', 'Test', '-']}
                      contentMap={contentMap}
                      subjectAccent="hsl(var(--primary))"
                      onChange={(field, value) =>
                        updateCell(subject, day, field as keyof typeof cell, value)
                      }
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile (<md): subjects stack vertically; days scroll horizontally inside each row */}
      <div className="md:hidden space-y-3">
        {SUBJECTS.map((subject) => {
          const courseId = config?.courseIds[subject];
          const prefix = config?.assignmentPrefixes[subject] ?? '';
          const isHsBlocked =
            !!config?.autoLogic.historyScienceNoAssign &&
            (subject === 'History' || subject === 'Science');
          if (
            activeHsSubject !== 'Both' &&
            ((subject === 'History' && activeHsSubject === 'Science') ||
              (subject === 'Science' && activeHsSubject === 'History'))
          ) {
            return null;
          }
          return (
            <div key={subject} className="rounded-lg border border-border bg-card/30 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold leading-tight truncate">{subject}</span>
                  {courseId && (
                    <span className="text-[9px] font-mono text-muted-foreground">#{courseId}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isTestWeek(subject) && (
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">
                      Test
                    </span>
                  )}
                  {subject === 'Math' &&
                    (() => {
                      const pu = getPowerUp(weekData.Math.Monday.lesson_num);
                      return pu ? (
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-foreground">
                          PU {pu}
                        </span>
                      ) : null;
                    })()}
                </div>
              </div>
              <div className="overflow-x-auto snap-x snap-mandatory">
                <div className="flex gap-2 p-2" style={{ minWidth: 'max-content' }}>
                  {DAYS.map((day) => {
                    const cell = weekData[subject][day];
                    const isLaBlocked =
                      subject === 'Language Arts' && !isLanguageArtsAssignable(cell.type);
                    return (
                      <div key={day} className="snap-start w-[260px] shrink-0">
                        <DaySubjectCard
                          subject={subject}
                          day={day}
                          cell={cell}
                          prefix={prefix}
                          isFriday={day === 'Friday'}
                          isHsBlocked={isHsBlocked}
                          isLaBlocked={isLaBlocked}
                          availableTypes={SUBJECT_TYPES[subject] ?? ['Lesson', 'Test', '-']}
                          contentMap={contentMap}
                          subjectAccent="hsl(var(--primary))"
                          onChange={(field, value) =>
                            updateCell(subject, day, field as keyof typeof cell, value)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
