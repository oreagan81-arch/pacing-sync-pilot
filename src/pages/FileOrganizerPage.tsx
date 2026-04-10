import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderSearch, Wand2, Check, AlertTriangle, FileText, RefreshCw, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { callEdge } from '@/lib/edge';

interface FileRecord {
  id: string;
  original_name: string | null;
  friendly_name: string | null;
  subject: string | null;
  type: string | null;
  lesson_num: string | null;
  confidence: string | null;
  drive_file_id: string | null;
  created_at: string | null;
}

const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'] as const;
const FILE_TYPES = ['worksheet', 'test', 'study_guide', 'answer_key', 'resource'] as const;

// Regex classification patterns
const REGEX_PATTERNS: { pattern: RegExp; subject: string; type: string; lessonExtract: RegExp | null }[] = [
  { pattern: /SM5.*L(\d+)/i, subject: 'Math', type: 'worksheet', lessonExtract: /L(\d+)/i },
  { pattern: /SM5.*T(\d+)/i, subject: 'Math', type: 'test', lessonExtract: /T(\d+)/i },
  { pattern: /SM5.*SG(\d+)/i, subject: 'Math', type: 'study_guide', lessonExtract: /SG(\d+)/i },
  { pattern: /RM4/i, subject: 'Reading', type: 'worksheet', lessonExtract: /(\d+)/ },
  { pattern: /ELA4/i, subject: 'Language Arts', type: 'worksheet', lessonExtract: /(\d+)/ },
  { pattern: /spell/i, subject: 'Spelling', type: 'test', lessonExtract: /(\d+)/ },
];

function classifyByRegex(filename: string): { subject: string; type: string; lessonNum: string; confidence: string } | null {
  for (const rule of REGEX_PATTERNS) {
    if (rule.pattern.test(filename)) {
      let lessonNum = '';
      if (rule.lessonExtract) {
        const m = filename.match(rule.lessonExtract);
        if (m) lessonNum = m[1];
      }
      return { subject: rule.subject, type: rule.type, lessonNum, confidence: 'regex' };
    }
  }
  return null;
}

function generateFriendlyName(subject: string, type: string, lessonNum: string): string {
  const prefixes: Record<string, string> = {
    Math: 'SM5', Reading: 'RM4', Spelling: 'RM4', 'Language Arts': 'ELA4',
    History: 'HIS4', Science: 'SCI4',
  };
  const typeSuffix: Record<string, string> = {
    worksheet: '_L', test: '_T', study_guide: '_SG', answer_key: '_AK', resource: '_R',
  };
  const prefix = prefixes[subject] || subject.slice(0, 3).toUpperCase();
  const suffix = typeSuffix[type] || '_';
  return `${prefix}${suffix}${lessonNum.padStart(3, '0')}.pdf`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix to get raw base64
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function FileOrganizerPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => { loadFiles(); }, []);

  const loadFiles = async () => {
    setLoading(true);
    const { data } = await supabase.from('files').select('*').order('created_at', { ascending: false }).limit(100);
    if (data) setFiles(data);
    setLoading(false);
  };

  const handleAddFile = async () => {
    if (!newFilename.trim()) return;
    const regexResult = classifyByRegex(newFilename);
    const record: any = {
      original_name: newFilename,
      subject: regexResult?.subject || null,
      type: regexResult?.type || null,
      lesson_num: regexResult?.lessonNum || null,
      confidence: regexResult?.confidence || 'unclassified',
      friendly_name: regexResult
        ? generateFriendlyName(regexResult.subject, regexResult.type, regexResult.lessonNum)
        : null,
    };
    await supabase.from('files').insert(record);
    setNewFilename('');
    toast.success(regexResult ? `Classified by regex: ${regexResult.subject}` : 'Added — needs AI classification');
    loadFiles();
  };

  const handleAIClassify = async (file: FileRecord) => {
    setClassifying(true);
    try {
      const result = await callEdge<{ subject: string; type: string; lesson_num: string }>('file-classify', {
        filename: file.original_name,
      });
      const friendly = generateFriendlyName(result.subject, result.type, result.lesson_num);
      await supabase.from('files').update({
        subject: result.subject,
        type: result.type,
        lesson_num: result.lesson_num,
        confidence: 'ai',
        friendly_name: friendly,
      }).eq('id', file.id);
      toast.success(`AI classified: ${result.subject} ${result.type}`);
      loadFiles();
    } catch (e: any) {
      toast.error('AI classification failed', { description: e.message });
    }
    setClassifying(false);
  };

  const handleManualUpdate = async (id: string, field: string, value: string) => {
    const update: any = { [field]: value, confidence: 'manual' };
    // Regenerate friendly name if subject/type/lesson changed
    const file = files.find(f => f.id === id);
    if (file) {
      const subj = field === 'subject' ? value : (file.subject || '');
      const typ = field === 'type' ? value : (file.type || '');
      const les = field === 'lesson_num' ? value : (file.lesson_num || '');
      if (subj && typ && les) update.friendly_name = generateFriendlyName(subj, typ, les);
    }
    await supabase.from('files').update(update).eq('id', id);
    loadFiles();
  };

  const handleClassifyAll = async () => {
    const unclassified = files.filter(f => !f.subject || f.confidence === 'unclassified');
    if (unclassified.length === 0) { toast.info('All files classified'); return; }
    
    // First try regex
    let regexCount = 0;
    for (const file of unclassified) {
      const r = classifyByRegex(file.original_name || '');
      if (r) {
        await supabase.from('files').update({
          subject: r.subject, type: r.type, lesson_num: r.lessonNum,
          confidence: 'regex', friendly_name: generateFriendlyName(r.subject, r.type, r.lessonNum),
        }).eq('id', file.id);
        regexCount++;
      }
    }

    // Then AI for remaining
    const remaining = unclassified.filter(f => !classifyByRegex(f.original_name || ''));
    for (const file of remaining) {
      await handleAIClassify(file);
    }

    toast.success(`Classified: ${regexCount} regex, ${remaining.length} AI`);
    loadFiles();
  };

  const confidenceBadge = (c: string | null) => {
    if (c === 'regex') return <Badge className="text-[9px] bg-success text-success-foreground">regex</Badge>;
    if (c === 'ai') return <Badge className="text-[9px] bg-primary text-primary-foreground">AI</Badge>;
    if (c === 'ai-vision') return <Badge className="text-[9px] bg-primary text-primary-foreground">AI Vision</Badge>;
    if (c === 'manual') return <Badge variant="outline" className="text-[9px]">manual</Badge>;
    return <Badge variant="destructive" className="text-[9px]">unclassified</Badge>;
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">File Organizer</h1>
          <p className="text-muted-foreground mt-1">AI-powered Drive file classifier and renamer</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadFiles} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={handleClassifyAll} disabled={classifying} className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> Classify All
          </Button>
        </div>
      </div>

      {/* Drop zone for PDF vision classify */}
      <Card
        className={`border-2 border-dashed transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const droppedFiles = Array.from(e.dataTransfer.files).filter(f =>
            f.type === 'application/pdf' || f.type.startsWith('image/')
          );
          if (droppedFiles.length === 0) { toast.error('Drop PDF or image files'); return; }
          setUploading(true);
          for (const file of droppedFiles) {
            try {
              // Convert to image for vision — for PDFs we use the first page via canvas
              let base64: string;
              if (file.type.startsWith('image/')) {
                base64 = await fileToBase64(file);
              } else {
                // For PDFs, read as data URL for now (Gemini can handle PDF base64)
                base64 = await fileToBase64(file);
              }
              const result = await callEdge<{
                subject: string; type: string; lesson_num: string; suggested_name: string;
              }>('file-vision-classify', { image_base64: base64, filename: file.name });

              await supabase.from('files').insert({
                original_name: file.name,
                subject: result.subject,
                type: result.type,
                lesson_num: result.lesson_num,
                friendly_name: result.suggested_name || generateFriendlyName(result.subject, result.type, result.lesson_num),
                confidence: 'ai-vision',
              });
              toast.success(`Vision classified: ${file.name} → ${result.subject}`);
            } catch (err: any) {
              toast.error(`Failed: ${file.name}`, { description: err.message });
            }
          }
          setUploading(false);
          loadFiles();
        }}
      >
        <CardContent className="py-8 flex flex-col items-center gap-2 text-center">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <p className="text-sm font-medium">
            {uploading ? 'Classifying with AI Vision...' : 'Drop PDF or image files here for AI Vision classification'}
          </p>
          <p className="text-xs text-muted-foreground">Gemini analyzes the document content to identify subject, type, and lesson</p>
        </CardContent>
      </Card>

      {/* Add file by name */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input
              placeholder="Enter filename (e.g. SM5_L078_worksheet.pdf)"
              value={newFilename}
              onChange={e => setNewFilename(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddFile()}
              className="flex-1"
            />
            <Button onClick={handleAddFile} className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Add & Classify
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Files table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="p-3 text-xs font-semibold">Original Name</th>
                  <th className="p-3 text-xs font-semibold">Subject</th>
                  <th className="p-3 text-xs font-semibold">Type</th>
                  <th className="p-3 text-xs font-semibold">Lesson</th>
                  <th className="p-3 text-xs font-semibold">Friendly Name</th>
                  <th className="p-3 text-xs font-semibold">Confidence</th>
                  <th className="p-3 text-xs font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
                ) : files.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No files yet. Add filenames above to classify.</td></tr>
                ) : files.map(file => (
                  <tr key={file.id} className="border-t hover:bg-muted/50">
                    <td className="p-3 font-mono text-xs max-w-[200px] truncate">{file.original_name}</td>
                    <td className="p-3">
                      <Select value={file.subject || ''} onValueChange={v => handleManualUpdate(file.id, 'subject', v)}>
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Select value={file.type || ''} onValueChange={v => handleManualUpdate(file.id, 'type', v)}>
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {FILE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Input value={file.lesson_num || ''} onChange={e => handleManualUpdate(file.id, 'lesson_num', e.target.value)}
                        className="h-7 text-xs w-16" />
                    </td>
                    <td className="p-3 font-mono text-xs text-primary">{file.friendly_name || '—'}</td>
                    <td className="p-3">{confidenceBadge(file.confidence)}</td>
                    <td className="p-3">
                      {(!file.subject || file.confidence === 'unclassified') && (
                        <Button size="sm" variant="ghost" onClick={() => handleAIClassify(file)} disabled={classifying} className="text-xs gap-1">
                          <Wand2 className="h-3 w-3" /> AI
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
