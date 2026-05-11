import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { calculatePacingWeek, pacingWeekFromQW } from '@/lib/pacing-week';

const QUARTER_HEX: Record<number, string> = {
  1: '#00c0a5', 2: '#0065a7', 3: '#6644bb', 4: '#c87800',
};

const QUARTERS = [1, 2, 3, 4];
const WEEKS_BY_QUARTER: Record<number, number> = { 1: 9, 2: 9, 3: 9, 4: 9 };

export default function WeekVerifierPage() {
  const [quarter, setQuarter] = useState<number>(4);
  const [weekInQuarter, setWeekInQuarter] = useState<number>(6);

  const info = useMemo(() => pacingWeekFromQW(quarter, weekInQuarter), [quarter, weekInQuarter]);
  const today = useMemo(() => calculatePacingWeek(new Date()), []);

  const accent = QUARTER_HEX[quarter] ?? '#64748b';

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Week Verifier</h1>
        <p className="text-sm text-muted-foreground">
          Confirm absolute calendar week ↔ instructional week ↔ date range.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Selection</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Quarter</Label>
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUARTERS.map((q) => (
                  <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Week in Quarter</Label>
            <Select value={String(weekInQuarter)} onValueChange={(v) => setWeekInQuarter(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: WEEKS_BY_QUARTER[quarter] ?? 9 }, (_, i) => i + 1).map((w) => (
                  <SelectItem key={w} value={String(w)}>W{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card style={{ borderColor: accent }} className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge style={{ backgroundColor: accent, color: 'white' }}>{info.weekId}</Badge>
            <span className="text-base font-semibold">{info.dates}</span>
            {info.isBreak && <Badge variant="destructive">Break Week</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Stat label="Instructional Week" value={info.activeWeekNumber} accent={accent} />
          <Stat label="Absolute Calendar Week" value={info.absoluteWeekNum} accent={accent} />
          <Stat label="Quarter" value={`Q${info.quarter}`} accent={accent} />
          <Stat label="Week in Quarter" value={`W${info.weekInQuarter}`} accent={accent} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Today</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">weekId:</span> <span className="font-mono">{today.weekId}</span></div>
          <div><span className="text-muted-foreground">dates:</span> {today.dates}</div>
          <div><span className="text-muted-foreground">instructional week:</span> {today.activeWeekNumber} (absolute {today.absoluteWeekNum})</div>
          {today.isBreak && <Badge variant="destructive">Today is in a break week</Badge>}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-md border p-3 bg-card">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: accent }}>{value}</div>
    </div>
  );
}
