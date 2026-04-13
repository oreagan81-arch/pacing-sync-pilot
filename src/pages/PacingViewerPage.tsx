import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Table2 } from 'lucide-react';
import { useSystemStore } from '@/store/useSystemStore';

const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function PacingViewerPage() {
  const {
    selectedMonth, selectedWeek, pacingData, isLoading,
    setSelectedMonth, setSelectedWeek, fetchPacingData,
  } = useSystemStore();

  useEffect(() => {
    fetchPacingData(selectedMonth, selectedWeek);
  }, [selectedMonth, selectedWeek, fetchPacingData]);

  const dateLabels = pacingData?.dates || DAYS;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(selectedWeek)} onValueChange={(v) => setSelectedWeek(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>Week {i + 1}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => fetchPacingData(selectedMonth, selectedWeek)} disabled={isLoading} className="gap-1.5">
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : !pacingData ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Table2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No pacing data available. Select a week and refresh.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Table2 className="h-4 w-4 text-primary" />
              Pacing Grid — {selectedMonth} Week {selectedWeek}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider w-36">Subject</th>
                    {dateLabels.map((label, i) => (
                      <th key={i} className="p-3 text-center text-xs font-semibold uppercase tracking-wider">
                        <div>{DAYS[i]}</div>
                        {pacingData.dates[i] && (
                          <div className="text-[10px] text-muted-foreground font-normal">{pacingData.dates[i]}</div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SUBJECTS.map((subject) => {
                    const cells = pacingData.subjects[subject];
                    if (!cells) return (
                      <tr key={subject} className="border-t border-border/50">
                        <td className="p-3 font-medium text-muted-foreground">{subject}</td>
                        {DAYS.map((_, i) => (
                          <td key={i} className="p-3 text-center text-muted-foreground/30">—</td>
                        ))}
                      </tr>
                    );

                    return (
                      <tr key={subject} className="border-t border-border/50">
                        <td className="p-3 font-semibold">{subject}</td>
                        {cells.map((cell, i) => {
                          let bgClass = '';
                          let textClass = '';
                          if (cell.isTest) {
                            bgClass = 'bg-[hsl(48_96%_65%)]';
                            textClass = 'text-destructive font-bold';
                          } else if (cell.isReview) {
                            bgClass = 'bg-muted';
                          }
                          return (
                            <td key={i} className={`p-3 text-center ${bgClass}`}>
                              <span className={textClass}>{cell.value || '—'}</span>
                              {cell.lessonNum && !cell.isTest && (
                                <Badge variant="outline" className="ml-1 text-[9px]">L{cell.lessonNum}</Badge>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
