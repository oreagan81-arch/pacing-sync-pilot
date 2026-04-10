import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardPaste, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface DayData {
  type: string;
  lesson_num: string;
  in_class: string;
  at_home: string;
  resources: string;
  create_assign: boolean;
}

type WeekData = Record<string, Record<string, DayData>>;

interface ParsedRow {
  subject: string;
  day: string;
  type: string;
  lesson_num?: string;
  in_class?: string;
  at_home?: string;
}

interface PasteImportDialogProps {
  onImport: (data: WeekData) => void;
}

const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function emptyDay(): DayData {
  return { type: '', lesson_num: '', in_class: '', at_home: '', resources: '', create_assign: true };
}

export default function PasteImportDialog({ onImport }: PasteImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);

  const handleParse = async () => {
    if (!pastedText.trim()) {
      toast.error('Paste your pacing chart data first');
      return;
    }

    setParsing(true);
    setPreview(null);

    try {
      const { data, error } = await supabase.functions.invoke('pacing-parse', {
        body: { pastedText: pastedText.trim() },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const rows: ParsedRow[] = data.rows || [];
      setPreview(rows);
      toast.success(`Parsed ${rows.length} cells`);
    } catch (e: any) {
      toast.error('Parse failed', { description: e.message });
    }

    setParsing(false);
  };

  const handleApply = () => {
    if (!preview) return;

    const weekData: WeekData = {};
    for (const subj of SUBJECTS) {
      weekData[subj] = {};
      for (const day of DAYS) {
        weekData[subj][day] = emptyDay();
      }
    }

    for (const row of preview) {
      if (weekData[row.subject]?.[row.day]) {
        weekData[row.subject][row.day] = {
          type: row.type || '',
          lesson_num: row.lesson_num || '',
          in_class: row.in_class || '',
          at_home: row.at_home || '',
          resources: '',
          create_assign: row.type !== '-' && row.type !== 'No Class',
        };
      }
    }

    onImport(weekData);
    setOpen(false);
    setPastedText('');
    setPreview(null);
    toast.success('Data imported — review the fields below');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ClipboardPaste className="h-3.5 w-3.5" />
          Smart Paste
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Smart Paste — Import from Pacing Guide
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Copy a week's data from your Google Sheets pacing guide and paste it below.
            The AI will parse shorthand (L, CP, CH, CO, AP, etc.) into structured fields.
          </p>

          <Textarea
            value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value);
              setPreview(null);
            }}
            placeholder={`Paste your week's data here...\n\nExample:\nSaxon Math: 91  92  93  94  95\nReading Mastery: 109  110  111  Test 11  112\nSpelling: 97  98  99  review  Test 100\nShurley English: 12.1 p438-441  12.1 finish-p444  12.2 p445-447  12.2 p448-450  CP 44\nHistory: -  -  -  -  -\nScience: CH 1  CH 2  CH 2  CH 3  CH 3`}
            rows={8}
            className="font-mono text-xs"
          />

          <Button onClick={handleParse} disabled={parsing || !pastedText.trim()} className="gap-1.5">
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {parsing ? 'Parsing...' : 'Parse with AI'}
          </Button>

          {preview && preview.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Preview ({preview.length} cells parsed)</h4>
              <div className="border rounded-md overflow-auto max-h-60">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-1.5 text-left">Subject</th>
                      <th className="p-1.5 text-left">Day</th>
                      <th className="p-1.5 text-left">Type</th>
                      <th className="p-1.5 text-left">Lesson #</th>
                      <th className="p-1.5 text-left">In Class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-1.5 font-medium">{row.subject}</td>
                        <td className="p-1.5">{row.day}</td>
                        <td className="p-1.5">
                          <Badge variant={row.type === 'Test' ? 'destructive' : 'outline'} className="text-[9px]">
                            {row.type}
                          </Badge>
                        </td>
                        <td className="p-1.5 font-mono">{row.lesson_num || '—'}</td>
                        <td className="p-1.5 truncate max-w-[200px]">{row.in_class || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleApply} disabled={!preview || preview.length === 0}>
            Apply to Week
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
