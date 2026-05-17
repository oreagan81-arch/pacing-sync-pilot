import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, RefreshCw, FileText, CheckCircle2, ExternalLink, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface OrphanFile {
  canvas_file_id: string;
  course_id: string | null;
  original_name: string | null;
  canvas_url: string | null;
  ai_suggested_name: string | null;
  ai_suggested_folder: string | null;
  ai_lesson_ref: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function FileOrganizerPage() {
  const [files, setFiles] = useState<OrphanFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [approving, setApproving] = useState(false);

  // Local editable fields for the selected file
  const [editName, setEditName] = useState('');
  const [editLessonRef, setEditLessonRef] = useState('');

  const selected = files.find((f) => f.canvas_file_id === selectedId) ?? null;

  const loadFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('canvas_orphan_files')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load files', { description: error.message });
    } else {
      setFiles((data ?? []) as OrphanFile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Sync editable fields when selection changes
  useEffect(() => {
    if (selected) {
      setEditName(selected.ai_suggested_name ?? '');
      setEditLessonRef(selected.ai_lesson_ref ?? '');
    } else {
      setEditName('');
      setEditLessonRef('');
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnalyze = async () => {
    if (!selected) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('file-vision-classify', {
        body: { canvasFileId: selected.canvas_file_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const suggested = (data as any)?.suggested_name ?? '';
      const lessonRef = (data as any)?.ai_lesson_ref ?? '';
      setEditName(suggested);
      setEditLessonRef(lessonRef);
      // Update local cache so list reflects new AI fields
      setFiles((prev) =>
        prev.map((f) =>
          f.canvas_file_id === selected.canvas_file_id
            ? { ...f, ai_suggested_name: suggested, ai_lesson_ref: lessonRef }
            : f,
        ),
      );
      toast.success('AI analysis complete');
    } catch (e: any) {
      toast.error('Analyze failed', { description: e?.message ?? String(e) });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApprove = async () => {
    if (!selected) return;
    if (!editName.trim()) {
      toast.error('Suggested name is required');
      return;
    }
    setApproving(true);
    try {
      // Persist any teacher edits to the orphan row before rename
      const { error: updErr } = await supabase
        .from('canvas_orphan_files')
        .update({
          ai_suggested_name: editName.trim(),
          ai_lesson_ref: editLessonRef.trim() || null,
        })
        .eq('canvas_file_id', selected.canvas_file_id);
      if (updErr) throw updErr;

      const { data, error } = await supabase.functions.invoke('canvas-file-rename', {
        body: { fileId: selected.canvas_file_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      // Remove from local state
      setFiles((prev) => prev.filter((f) => f.canvas_file_id !== selected.canvas_file_id));
      setSelectedId(null);
      toast.success('Approved & renamed', { description: editName });
    } catch (e: any) {
      toast.error('Approve failed', { description: e?.message ?? String(e) });
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">File Organizer</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Triage inbox for unclassified Canvas files
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <Inbox className="h-3 w-3" />
            {files.length} pending
          </Badge>
          <Button variant="outline" size="sm" onClick={loadFiles} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Left: list */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-220px)] min-h-[420px]">
              {loading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : files.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground space-y-2">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
                  <p className="text-sm font-medium">Inbox zero</p>
                  <p className="text-xs">No pending files to triage.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1.5">
                  {files.map((f) => {
                    const isActive = f.canvas_file_id === selectedId;
                    return (
                      <button
                        key={f.canvas_file_id}
                        onClick={() => setSelectedId(f.canvas_file_id)}
                        className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                          isActive
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:bg-muted/60'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">
                              {f.original_name || f.canvas_file_id}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              {f.ai_suggested_name ? (
                                <Badge className="text-[9px] bg-primary/20 text-primary border-primary/30">
                                  AI ready
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px]">
                                  pending
                                </Badge>
                              )}
                              {f.course_id && (
                                <span className="text-[10px] text-muted-foreground">
                                  course {f.course_id}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: detail */}
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            {!selected ? (
              <div className="h-full min-h-[420px] flex flex-col items-center justify-center text-center text-muted-foreground">
                <Inbox className="h-10 w-10 mb-3 opacity-50" />
                <p className="text-sm font-medium">Select a file to triage</p>
                <p className="text-xs mt-1">
                  Pick a file from the inbox on the left to analyze and approve it.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Original name
                    </div>
                    <div className="font-mono text-sm break-all">
                      {selected.original_name ?? '—'}
                    </div>
                  </div>
                  {selected.canvas_url && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={selected.canvas_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Open in Canvas
                      </a>
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    File ID: {selected.canvas_file_id}
                  </Badge>
                  {selected.course_id && (
                    <Badge variant="outline" className="text-[10px]">
                      Course: {selected.course_id}
                    </Badge>
                  )}
                  {selected.ai_suggested_folder && (
                    <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">
                      {selected.ai_suggested_folder}
                    </Badge>
                  )}
                </div>

                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Analysis
                    </div>
                    <Button
                      size="sm"
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="gap-1.5"
                    >
                      {analyzing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {analyzing ? 'Analyzing…' : 'Analyze with AI'}
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Suggested name</Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g. SM5_L078.pdf"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Lesson reference</Label>
                      <Input
                        value={editLessonRef}
                        onChange={(e) => setEditLessonRef(e.target.value)}
                        placeholder="e.g. Math_Lesson_078_L"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedId(null)}
                    disabled={approving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={approving || !editName.trim()}
                    className="gap-1.5"
                  >
                    {approving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {approving ? 'Approving…' : 'Approve & Move'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
