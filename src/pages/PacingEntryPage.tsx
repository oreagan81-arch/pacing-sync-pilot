import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Save, RefreshCw, Zap, Sheet, Loader2 } from 'lucide-react';
import PasteImportDialog from '@/components/PasteImportDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useConfig } from '@/lib/config';
import { evaluateWeekRisk } from '@/lib/risk-engine';

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
  Math: ['Lesson', 'Test', 'Fact Test', 'Study Guide', 'No Class', '-'],
  Reading: ['Lesson', 'Test', 'Checkout', 'No Class', '-'],
  Spelling: ['Lesson', 'Test', 'No Class', '-'],
  'Language Arts': ['Lesson', 'Test', 'No Class', '-'],
  History: ['Lesson', 'Test', 'No Class', '-'],
  Science: ['Lesson', 'Test', 'No Class', '-'],
};

interface DayData {
  type: string;
  lesson_num: string;
  in_class: string;
  at_home: string;
  resources: string;
  create_assign: boolean;
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
  return { type: '', lesson_num: '', in_class: '', at_home: '', resources: '', create_assign: true };
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
  const [savedWeeks, setSavedWeeks] = useState<{ id: string; quarter: string; week_num: number }[]>([]);

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
    (subject: string, day: string, field: keyof DayData, value: string | boolean) => {
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
          },
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
          return {
            week_id: weekRow.id,
            subject: subj,
            day,
            type: d.type || null,
            lesson_num: d.lesson_num || null,
            in_class: d.in_class || null,
            at_home: isFriday ? null : d.at_home || null,
            resources: d.resources || null,
            create_assign: isNoAssign || isFriday ? false : d.create_assign,
          };
        })
      );

      const { error: rowsErr } = await supabase
        .from('pacing_rows')
        .upsert(rows, { onConflict: 'week_id,subject,day' });

      if (rowsErr) throw new Error(rowsErr.message);

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

    if (weekData2) {
      setDateRange(weekData2.date_range || '');
      setReminders(weekData2.reminders || '');
      setResources(weekData2.resources || '');
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

  const handleSheetImport = async () => {
    setSheetLoading(true);
    try {
      const { data: sheetData, error: sheetErr } = await supabase.functions.invoke('sheets-import', {
        body: { weekNum: activeWeek },
      });
      if (sheetErr) throw new Error(sheetErr.message);
      if (sheetData?.error) throw new Error(sheetData.error);

      const payload = sheetData?.data ?? sheetData;
      const apiData = payload?.data ?? payload;
      const dates = apiData?.dates;
      const subjects = apiData?.subjects;

      if (!subjects || typeof subjects !== 'object') {
        toast.info('No data found in sheet');
        setSheetLoading(false);
        return;
      }

      if (Array.isArray(dates) && dates.length >= 2) {
        const start = new Date(dates[0]);
        const end = new Date(dates[dates.length - 1]);
        const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setDateRange(`${fmt(start)}–${fmt(end)}`);
      }

      const newData = initWeekData();
      let cellCount = 0;

      for (const [apiSubject, values] of Object.entries(subjects)) {
        const subject = API_SUBJECT_MAP[apiSubject];
        if (!subject || !newData[subject] || !Array.isArray(values)) continue;

        (values as any[]).forEach((val, i) => {
          const day = DAYS[i];
          if (!day || !newData[subject][day]) return;

          const cellVal = String(val ?? '');
          const lowerVal = cellVal.toLowerCase();
          const isTest = lowerVal.includes('test');
          const isNoClass = cellVal === '-' || lowerVal === 'no class';
          const numMatch = cellVal.match(/\d+/);
          const lessonNum = numMatch ? numMatch[0] : '';

          newData[subject][day] = {
            type: isTest ? 'Test' : isNoClass ? '-' : 'Lesson',
            lesson_num: lessonNum,
            in_class: cellVal,
            at_home: '',
            resources: '',
            create_assign: !isNoClass && day !== 'Friday',
          };
          cellCount++;
        });
      }

      setWeekData(newData);
      toast.success(`Imported ${cellCount} cells from Google Sheets`);
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

      {/* Subject accordion sections */}
      <Accordion type="multiple" defaultValue={SUBJECTS.map(String)}>
        {SUBJECTS.map((subject) => {
          const courseId = config?.courseIds[subject];

          return (
            <AccordionItem key={subject} value={subject}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: quarterColor }} />
                  <span className="font-bold text-base">{subject}</span>
                  {courseId && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {courseId}
                    </Badge>
                  )}
                  {isTestWeek(subject) && (
                    <Badge variant="destructive" className="text-[10px]">
                      TEST WEEK
                    </Badge>
                  )}
                  {subject === 'Math' && (() => {
                    const mondayLesson = weekData.Math.Monday.lesson_num;
                    const pu = getPowerUp(mondayLesson);
                    return pu ? (
                      <Badge className="text-[10px] bg-accent text-accent-foreground">
                        Power Up {pu}
                      </Badge>
                    ) : null;
                  })()}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-5 gap-3">
                  {DAYS.map((day) => {
                    const cell = weekData[subject][day];
                    const isFriday = day === 'Friday';
                    const isNoAssignSubject =
                      config?.autoLogic.historyScienceNoAssign &&
                      (subject === 'History' || subject === 'Science');
                    const hideAssign = isFriday || isNoAssignSubject;
                    const isEven = cell.lesson_num ? parseInt(cell.lesson_num) % 2 === 0 : null;

                    // Conditional styling based on cell content
                    const cellText = cell.in_class?.toLowerCase() || '';
                    const isTest = cellText.includes('test');
                    const isReview = cellText.includes('review');
                    const cardStyle: React.CSSProperties = isTest
                      ? { backgroundColor: '#fde047' }
                      : isReview
                      ? { backgroundColor: '#f3f4f6' }
                      : {};

                    return (
                      <Card key={day} className="shadow-sm" style={cardStyle}>
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-xs font-bold">{day}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-2">
                          <Select
                            value={cell.type}
                            onValueChange={(v) => updateCell(subject, day, 'type', v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              {(SUBJECT_TYPES[subject] || ['Lesson', 'Test', '-']).map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Input
                            placeholder="Lesson #"
                            value={cell.lesson_num}
                            onChange={(e) => updateCell(subject, day, 'lesson_num', e.target.value)}
                            className="h-8 text-xs"
                          />

                          <Textarea
                            placeholder="In Class"
                            value={cell.in_class}
                            onChange={(e) => updateCell(subject, day, 'in_class', e.target.value)}
                            className={`text-xs min-h-[60px] border-l-2 ${isTest ? 'font-bold text-red-600' : ''}`}
                            style={{ borderLeftColor: '#0065a7' }}
                            rows={2}
                          />

                          {!isFriday && (
                            <Textarea
                              placeholder="At Home"
                              value={cell.at_home}
                              onChange={(e) => updateCell(subject, day, 'at_home', e.target.value)}
                              className="text-xs min-h-[60px] border-l-2"
                              style={{ borderLeftColor: '#c87800' }}
                              rows={2}
                            />
                          )}

                          <Input
                            placeholder="Resources"
                            value={cell.resources}
                            onChange={(e) => updateCell(subject, day, 'resources', e.target.value)}
                            className="h-8 text-xs border-l-2"
                            style={{ borderLeftColor: '#6644bb' }}
                          />

                          {!hideAssign && (
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={cell.create_assign}
                                onCheckedChange={(v) =>
                                  updateCell(subject, day, 'create_assign', !!v)
                                }
                                id={`assign-${subject}-${day}`}
                              />
                              <label
                                htmlFor={`assign-${subject}-${day}`}
                                className="text-[10px] text-muted-foreground"
                              >
                                Create Assign
                              </label>
                            </div>
                          )}

                          {/* Smart badges */}
                          <div className="flex flex-wrap gap-1">
                            {subject === 'Math' && isEven !== null && (
                              <Badge variant="outline" className="text-[9px]">
                                {isEven ? 'Evens' : 'Odds'}
                              </Badge>
                            )}
                            {subject === 'Math' && cell.type === 'Test' && (
                              <Badge variant="outline" className="text-[9px]">
                                3 assignments
                              </Badge>
                            )}
                            {subject === 'Reading' && cell.type === 'Test' && (
                              <Badge variant="outline" className="text-[9px]">
                                tracking+tapping
                              </Badge>
                            )}
                            {hideAssign && cell.type && cell.type !== '-' && cell.type !== 'No Class' && (
                              <Badge variant="secondary" className="text-[9px]">
                                No Assignment
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
