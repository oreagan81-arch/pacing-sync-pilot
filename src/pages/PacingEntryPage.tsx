import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Zap, Loader2, CalendarDays, Sparkles, Upload, Database, X } from 'lucide-react';
import PasteImportDialog from '@/components/PasteImportDialog';
import { DaySubjectCard } from '@/components/pacing/DaySubjectCard';
import { PacingEntryHeader } from '@/components/pacing-entry/PacingEntryHeader';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useConfig } from '@/lib/config';
import { evaluateWeekRisk } from '@/lib/risk-engine';
import type { ContentMapEntry } from '@/lib/auto-link';

const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const SCHOOL_YEAR = '2025-2026';

const SUBJECT_TYPES: Record<string, string[]> = {
  Math: ['Lesson', 'Investigation', 'Test', 'Fact Test', 'Study Guide', 'No Class', '-'],
  Reading: ['Lesson', 'Test', 'Checkout', 'No Class', '-'],
  Spelling: ['Lesson', 'Test', 'No Class', '-'],
  'Language Arts': ['Lesson', 'CP', 'Test', 'No Class', '-'],
  History: ['Lesson', 'Test', 'No Class', '-'],
  Science: ['Lesson', 'Test', 'No Class', '-'],
};

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip data URL prefix
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function buildInClass(subject: string, d: DayData): string | null {
  // If teacher typed an explicit in_class value, use it (stripped)
  const explicit = (d.in_class || '').trim();
  if (explicit && !/^\d+$/.test(explicit)) return explicit;

  // Otherwise auto-build from subject + lesson_num
  const n = (d.lesson_num || '').trim();
  if (!n) return explicit || null;

  switch (subject) {
    case 'Math':
      return `Lesson ${n}`;
    case 'Reading':
      return `Reading Lesson ${n}`;
    case 'Spelling':
      return `Spelling Lesson ${n}`;
    case 'Language Arts': {
      // "12.8" -> "Chapter 12, Lesson 8"
      const dot = n.match(/^(\d+)\.(\d+)$/);
      if (dot) return `Chapter ${dot[1]}, Lesson ${dot[2]}`;
      return `Chapter ${n}`;
    }
    case 'History':
    case 'Science':
      return explicit || `Chapter ${n}`;
    default:
      return explicit || `Lesson ${n}`;
  }
}

function buildAtHome(subject: string, d: DayData): string {
  // Use explicit at_home if teacher typed one
  const explicit = (d.at_home || '').trim();
  if (explicit) return explicit;

  // No at_home for these subjects (canvas page handles them differently)
  if (['History', 'Science', 'Language Arts', 'Spelling'].includes(subject)) return '';

  // Only lesson rows get at_home — not tests, reviews, or no-class
  const type = (d.type || '').toLowerCase();
  if (!type || type === '-' || type === 'no class' || type.includes('test') ||
      type.includes('review') || type.includes('study guide')) return '';

  const n = (d.lesson_num || '').trim();
  if (!n) return '';

  if (subject === 'Math') {
    if (d.hint_override === 'evens') return `Lesson ${n} Evens`;
    if (d.hint_override === 'odds') return `Lesson ${n} Odds`;
    if (d.hint_override === 'none') return `Lesson ${n}`;
    const num = parseInt(n);
    const parity = isNaN(num) ? '' : num % 2 === 0 ? ' Evens' : ' Odds';
    return `Lesson ${n}${parity}`;
  }
  if (subject === 'Reading') {
    return `Lesson ${n} Workbook and Comprehension`;
  }
  return '';
}

function buildAutoReminders(weekData: WeekData): string {
  const lines: string[] = [];
  const DAYS_LOCAL = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const DAY_ABBR: Record<string,string> = {
    Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed',
    Thursday:'Thu', Friday:'Fri'
  };
  for (const day of DAYS_LOCAL) {
    for (const subj of Object.keys(weekData)) {
      const cell = weekData[subj]?.[day];
      if (!cell?.type?.toLowerCase().includes('test')) continue;
      const n = cell.lesson_num ? ` ${cell.lesson_num}` : '';
      const label = ({
        Math: `Math Test${n} — ${DAY_ABBR[day]}`,
        Reading: `Reading Mastery Test${n} & Fluency Checkout — ${DAY_ABBR[day]}`,
        Spelling: `Spelling Test — ${DAY_ABBR[day]}`,
        'Language Arts': `Shurley English Test — ${DAY_ABBR[day]}`,
        History: `History Test — ${DAY_ABBR[day]}`,
        Science: `Science Test — ${DAY_ABBR[day]}`,
      } as Record<string, string>)[subj];
      if (label) lines.push(label);
    }
  }
  return lines.join('\n');
}

const POWER_UP_MAP: Record<number,string> = {
  1:'A',2:'A',3:'A',4:'A',5:'A',6:'A',7:'A',8:'A',
  9:'B',10:'B',11:'B',12:'B',13:'B',14:'B',15:'B',
  16:'C',17:'C',18:'C',19:'C',20:'D',21:'D',
  22:'F',23:'E',24:'F',25:'D',26:'F',27:'F',28:'E',29:'F',
  30:'D',31:'F',32:'E',33:'F',34:'D',35:'F',36:'E',37:'F',38:'D',39:'F',
  40:'E',41:'F',42:'D',43:'E',44:'F',45:'D',46:'F',47:'F',
  48:'G',49:'G',50:'F',51:'G',52:'F',53:'F',54:'G',55:'F',56:'G',
  57:'F',58:'G',59:'F',60:'G',61:'F',62:'G',63:'F',64:'F',
  65:'C',66:'F',67:'G',68:'E',69:'F',70:'G',71:'C',72:'D',
  73:'F',74:'G',75:'C',76:'H',77:'H',78:'H',79:'H',80:'H',
  81:'H',82:'H',83:'H',84:'H',85:'H',86:'H',87:'H',88:'H',
  89:'F',90:'F',91:'I',92:'I',93:'I',94:'I',95:'I',96:'I',
  97:'I',98:'I',99:'I',100:'I',101:'J',102:'J',103:'J',104:'J',
  105:'J',106:'J',107:'J',108:'J',109:'J',110:'J',
  111:'K',112:'K',113:'K',114:'K',115:'K',116:'K',117:'K',
  118:'K',119:'K',120:'K'
};

function buildResourceRefs(rows: any[]): Set<string> {
  const resourceRefs = new Set<string>();
  for (const row of rows) {
    const n = row.lesson_num;
    if (!n) continue;
    const num = parseInt(n);
    if (isNaN(num)) continue;
    const pad3 = String(num).padStart(3,'0');

    if (row.subject === 'Math' && row.type !== 'Test') {
      resourceRefs.add('HW_Evens');
      resourceRefs.add('HW_Odds');
      resourceRefs.add('Math_Textbook');
      resourceRefs.add(`Math_Lesson_${pad3}`);
      if (POWER_UP_MAP[num]) resourceRefs.add(`Math_PowerUp_${POWER_UP_MAP[num]}`);
      const reteachStart = Math.floor((num-1)/10)*10+1;
      resourceRefs.add(`Math_Reteaching_L${String(reteachStart).padStart(3,'0')}`);
    }
    if (row.subject === 'Math' && row.type === 'Test') {
      const pad2 = String(num).padStart(2,'0');
      resourceRefs.add(`Math_StudyGuide_${pad2}_Blank`);
      resourceRefs.add(`Math_StudyGuide_${pad2}_Completed`);
    }
    if (row.subject === 'Reading') {
      const chunkStart = Math.floor((num-1)/25)*25+1;
      resourceRefs.add(`Reading_Book_L${String(chunkStart).padStart(3,'0')}`);
      resourceRefs.add('Reading_Workbook_Part1');
      resourceRefs.add('Reading_Workbook_Part2');
      resourceRefs.add('Reading_Glossary_A');
      resourceRefs.add('Reading_Glossary_B');
      resourceRefs.add('Reading_Glossary_C');
      resourceRefs.add('Spelling_Master_List');
    }
    if (row.subject === 'Language Arts' && row.type === 'CP') {
      resourceRefs.add(`Classroom_Practice_${pad3}`);
    }
  }
  return resourceRefs;
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
  const dateEditedByUser = useRef(false);
  const [reminders, setReminders] = useState('');
  const [resources, setResources] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeHsSubject, setActiveHsSubject] = useState<string>('Both');
  const [savedWeeks, setSavedWeeks] = useState<{ id: string; quarter: string; week_num: number }[]>([]);
  const [contentMap, setContentMap] = useState<ContentMapEntry[]>([]);
  const [syncingResources, setSyncingResources] = useState(false);

  // Smart input panel state
  const [pastedText, setPastedText] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showAiBanner, setShowAiBanner] = useState(false);
  const [masterRows, setMasterRows] = useState<any[]>([]);
  const [masterLoading, setMasterLoading] = useState(false);

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

  // Compute risk
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
      setShowAiBanner(false);
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
            in_class: buildInClass(subj, d),
            at_home: isFriday ? null : buildAtHome(subj, d) || null,
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

      await supabase.from('weeks').update({ is_active: false }).neq('id', weekRow.id);
      await supabase.from('weeks').update({ is_active: true }).eq('id', weekRow.id);

      toast.success('Week saved!');
      dateEditedByUser.current = false;
      setShowAiBanner(false);
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

    await supabase.from('weeks').update({ is_active: false }).neq('id', weekId);
    await supabase.from('weeks').update({ is_active: true }).eq('id', weekId);

    if (weekData2) {
      if (!dateEditedByUser.current) {
        setDateRange(weekData2.date_range || '');
      }
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
    if (savedWeeks.length === 0) return;
    const matchingWeek = savedWeeks.find((week) => week.quarter === activeQuarter && week.week_num === activeWeek);
    if (matchingWeek) {
      void loadWeekById(matchingWeek.id, false);
    }
  }, [savedWeeks, activeQuarter, activeWeek, loadWeekById]);

  const handleLoadWeek = async (weekId: string) => {
    dateEditedByUser.current = false;
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

  // ─── AI Parse ───
  const applyParsedRows = (rows: any[]) => {
    const newData = initWeekData();
    for (const row of rows) {
      if (!newData[row.subject]?.[row.day]) continue;
      newData[row.subject][row.day] = {
        type: row.type || '',
        lesson_num: row.lesson_num || '',
        in_class: row.in_class || '',
        at_home: row.at_home || '',
        resources: '',
        create_assign: row.type !== '-' && row.type !== 'No Class',
        hint_override: null,
      };
    }
    setWeekData(newData);
    setShowAiBanner(true);
    toast.success(`Parsed ${rows.length} cells — review and save`);
  };

  const runAiParse = async (payload: { pastedText?: string; imageBase64?: string; mimeType?: string }) => {
    setAiParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('pacing-parse', { body: payload });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const rows = data?.rows ?? [];
      if (!rows.length) {
        toast.info('AI returned no rows');
        return;
      }
      applyParsedRows(rows);
    } catch (e: any) {
      toast.error('AI parse failed', { description: e?.message });
    } finally {
      setAiParsing(false);
    }
  };

  const handleParseText = () => {
    if (!pastedText.trim()) {
      toast.info('Paste some pacing text first');
      return;
    }
    void runAiParse({ pastedText });
  };

  const handleFileDrop = async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/octet-stream';
      if (mimeType.startsWith('image/')) {
        setImagePreview(`data:${mimeType};base64,${base64}`);
      } else {
        setImagePreview(null);
      }
      await runAiParse({ pastedText: '', imageBase64: base64, mimeType });
    } catch (e: any) {
      toast.error('Could not read file', { description: e?.message });
    }
  };

  // ─── Master ───
  const loadMaster = useCallback(async () => {
    setMasterLoading(true);
    const { data, error } = await supabase
      .from('annual_pacing_master' as any)
      .select('*')
      .eq('school_year', SCHOOL_YEAR)
      .eq('quarter', activeQuarter)
      .eq('week_num', activeWeek)
      .order('subject')
      .order('day');
    if (error) {
      toast.error('Could not load master', { description: error.message });
    }
    setMasterRows((data as any[]) ?? []);
    setMasterLoading(false);
  }, [activeQuarter, activeWeek]);

  useEffect(() => {
    void loadMaster();
  }, [loadMaster]);

  const loadMasterIntoGrid = () => {
    if (!masterRows.length) {
      toast.info('No master rows for this Q/W yet');
      return;
    }
    applyParsedRows(masterRows);
  };

  const saveGridToMaster = async () => {
    const rows = SUBJECTS.flatMap((subj) =>
      DAYS.map((day) => {
        const d = weekData[subj][day];
        return {
          school_year: SCHOOL_YEAR,
          quarter: activeQuarter,
          week_num: activeWeek,
          subject: subj,
          day,
          type: d.type || null,
          lesson_num: d.lesson_num || null,
          in_class: d.in_class || null,
          at_home: d.at_home || null,
        };
      })
    );
    const { error } = await supabase
      .from('annual_pacing_master' as any)
      .upsert(rows, { onConflict: 'school_year,quarter,week_num,subject,day' });
    if (error) {
      toast.error('Save to master failed', { description: error.message });
      return;
    }
    toast.success(`Saved ${rows.length} rows to master (${activeQuarter} W${activeWeek})`);
    void loadMaster();
  };

  const isTestWeek = (subject: string) =>
    DAYS.some((d) => weekData[subject][d].type?.toLowerCase().includes('test'));

  const getPowerUp = (lessonNum: string) => {
    if (!config || !lessonNum) return null;
    return config.powerUpMap[lessonNum] || null;
  };

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* ───── Smart Input Panel ───── */}
        <aside className="w-full lg:w-[380px] lg:shrink-0">
          <div className="lg:sticky lg:top-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Smart Pacing Entry
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="paste" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="paste" className="text-xs gap-1">
                      <Sparkles className="h-3 w-3" /> Type / Paste
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="text-xs gap-1">
                      <Upload className="h-3 w-3" /> Upload
                    </TabsTrigger>
                    <TabsTrigger value="master" className="text-xs gap-1">
                      <Database className="h-3 w-3" /> Master
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab 1: Paste */}
                  <TabsContent value="paste" className="space-y-3 mt-3">
                    <Textarea
                      rows={10}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder={`Paste or type your pacing for this week.\nAny format works — shorthand, full text, or copied from any source.\n\nExample:\nMath: 101, 102, 103, 104, Test 10\nReading: 109, 110, 111, 112, Test 11\nSpelling: L97, L98, L99, review, Test\nELA: 12.1, 12.2, 12.3 CP44, CP44, Test\nHistory: Ch5, Ch5, Ch6, Ch6, -\nScience: -, -, -, -, -`}
                      className="text-xs font-mono"
                    />
                    <Button
                      onClick={handleParseText}
                      disabled={aiParsing}
                      className="w-full gap-1.5"
                    >
                      {aiParsing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Parse with AI ✦
                    </Button>
                  </TabsContent>

                  {/* Tab 2: Upload */}
                  <TabsContent value="upload" className="space-y-3 mt-3">
                    <label
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('border-primary', 'bg-primary/5');
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
                        const file = e.dataTransfer.files?.[0];
                        if (file) void handleFileDrop(file);
                      }}
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    >
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Drop a screenshot, photo, or PDF of your pacing guide
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        PNG · JPG · HEIC · PDF
                      </span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleFileDrop(file);
                        }}
                      />
                    </label>
                    {imagePreview && (
                      <div className="relative rounded border border-border overflow-hidden">
                        <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover" />
                        <button
                          onClick={() => setImagePreview(null)}
                          className="absolute top-1 right-1 rounded-full bg-background/80 p-1 hover:bg-background"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {aiParsing && (
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Parsing with AI...
                      </div>
                    )}
                  </TabsContent>

                  {/* Tab 3: Master */}
                  <TabsContent value="master" className="space-y-3 mt-3">
                    <div className="text-xs text-muted-foreground">
                      School year <span className="font-mono">{SCHOOL_YEAR}</span> · {activeQuarter} W{activeWeek}
                    </div>
                    <div className="max-h-64 overflow-auto rounded border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left font-semibold">Subject</th>
                            <th className="px-2 py-1 text-left font-semibold">Day</th>
                            <th className="px-2 py-1 text-left font-semibold">Lesson</th>
                            <th className="px-2 py-1 text-left font-semibold">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {masterLoading ? (
                            <tr>
                              <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                                Loading...
                              </td>
                            </tr>
                          ) : masterRows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                                No master rows yet
                              </td>
                            </tr>
                          ) : (
                            masterRows.map((r) => (
                              <tr key={r.id} className="border-t border-border/50">
                                <td className="px-2 py-1">{r.subject}</td>
                                <td className="px-2 py-1">{r.day}</td>
                                <td className="px-2 py-1 font-mono">{r.lesson_num || '—'}</td>
                                <td className="px-2 py-1">{r.type || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" onClick={loadMasterIntoGrid} disabled={masterLoading || masterRows.length === 0}>
                        Load into Grid
                      </Button>
                      <Button size="sm" onClick={saveGridToMaster}>
                        Save Grid → Master
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </aside>

        {/* ───── Header + Grid ───── */}
        <div className="flex-1 min-w-0 space-y-6">
          <PacingEntryHeader
            quarter={activeQuarter}
            weekNum={activeWeek}
            dateRange={dateRange}
            onSyncResources={handleSyncResources}
            syncing={syncingResources}
          />

          {/* Sub-header controls */}
          <div className="flex flex-wrap items-center gap-3">
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
              onChange={(e) => { dateEditedByUser.current = true; setDateRange(e.target.value); }}
              className="w-48"
            />

            <PasteImportDialog onImport={(data) => setWeekData(data)} />

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

          {/* AI banner */}
          {showAiBanner && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              <span>✦ AI parse complete — review all fields before saving</span>
              <button onClick={() => setShowAiBanner(false)} className="opacity-70 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

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

          {/* Day × Subject grid — desktop */}
          <div className="hidden md:block rounded-lg border border-border bg-card/30 overflow-x-auto">
            <div className="min-w-[1100px]">
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

          {/* Mobile grid */}
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
      </div>
    </div>
  );
}
