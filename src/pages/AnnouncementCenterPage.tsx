import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Megaphone, Clock, Send, Plus, Trash2, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useConfig } from '@/lib/config';
import { callEdge } from '@/lib/edge';
import { useRealtimeDeploy } from '@/hooks/use-realtime-deploy';
import {
  renderReadingTestBody,
  renderSpellingTestBody,
  renderCombinedReadingSpellingBody,
  buildCombinedTitle,
} from '@/lib/announcement-templates';
import { TOGETHER_LOGIC_COURSE_ID, getCourseId } from '@/lib/course-ids';

interface Announcement {
  id: string;
  title: string | null;
  content: string | null;
  subject: string | null;
  type: string | null;
  status: string | null;
  scheduled_post: string | null;
  posted_at: string | null;
  week_id: string | null;
  course_id: number | null;
  created_at: string | null;
}

interface WeekOption {
  id: string;
  quarter: string;
  week_num: number;
}

const SUBJECTS = ['Math', 'Reading', 'Spelling', 'Language Arts', 'History', 'Science'] as const;

export default function AnnouncementCenterPage() {
  const config = useConfig();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState<Record<string, boolean>>({});
  const [postingAll, setPostingAll] = useState(false);

  // New announcement form
  const [showForm, setShowForm] = useState(false);
  const [formSubject, setFormSubject] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState('test_reminder');

  // Realtime: refresh announcements when deploy log shows announcement_post
  const handleRealtimeEvent = useCallback(() => {
    loadAnnouncements(selectedWeekId || undefined);
  }, [selectedWeekId]);
  useRealtimeDeploy(handleRealtimeEvent);

  useEffect(() => {
    supabase.from('weeks').select('id, quarter, week_num').order('quarter').order('week_num')
      .then(({ data }) => { if (data) setWeeks(data); });
  }, []);

  const loadAnnouncements = async (weekId?: string) => {
    setLoading(true);
    let query = supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (weekId) query = query.eq('week_id', weekId);
    const { data } = await query.limit(50);
    if (data) setAnnouncements(data);
    setLoading(false);
  };

  useEffect(() => {
    loadAnnouncements(selectedWeekId || undefined);
  }, [selectedWeekId]);

  const handleAutoGenerate = async () => {
    if (!selectedWeekId || !config) {
      toast.error('Select a week first');
      return;
    }
    const { data: rows } = await supabase.from('pacing_rows').select('*').eq('week_id', selectedWeekId);
    if (!rows || rows.length === 0) { toast.info('No pacing data for this week'); return; }

    const testRows = rows.filter(r => r.type?.toLowerCase().includes('test'));
    if (testRows.length === 0) { toast.info('No tests found this week'); return; }

    let created = 0;
    for (const row of testRows) {
      const courseId = config.courseIds[row.subject];
      if (!courseId) continue;

      let body = `${row.subject} ${row.type} ${row.lesson_num || ''} is coming up. Study and prepare!`;
      if (row.subject === 'Reading') body = 'Remember: tracking and tapping, 100 words per minute. Practice daily.';
      if (row.subject === 'Spelling') body = `Study words 21\u201325 from your cumulative word bank. Quiz on Friday.`;

      const title = `${row.subject} ${row.type} ${row.lesson_num || ''} \u2014 Reminder`.trim();

      await supabase.from('announcements').insert({
        week_id: selectedWeekId,
        subject: row.subject,
        title,
        content: body,
        type: 'test_reminder',
        status: 'DRAFT',
        course_id: courseId,
        scheduled_post: getNextFriday4PM(),
      });
      created++;
    }
    toast.success(`Auto-generated ${created} announcement(s)`);
    loadAnnouncements(selectedWeekId);
  };

  const handleCreate = async () => {
    if (!formTitle || !formSubject) { toast.error('Title and subject required'); return; }
    const courseId = config?.courseIds[formSubject];
    await supabase.from('announcements').insert({
      week_id: selectedWeekId || null,
      subject: formSubject,
      title: formTitle,
      content: formContent,
      type: formType,
      status: 'DRAFT',
      course_id: courseId || null,
      scheduled_post: getNextFriday4PM(),
    });
    toast.success('Announcement created');
    setShowForm(false);
    setFormTitle(''); setFormContent(''); setFormSubject('');
    loadAnnouncements(selectedWeekId || undefined);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id);
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    toast.success('Deleted');
  };

  const handlePost = async (ann: Announcement) => {
    if (!ann.course_id || !ann.title) { toast.error('Missing course ID or title'); return; }
    setPosting(p => ({ ...p, [ann.id]: true }));
    try {
      await callEdge('canvas-post-announcement', {
        courseId: ann.course_id,
        title: ann.title,
        message: ann.content || '',
        delayedPostAt: ann.scheduled_post || undefined,
        weekId: ann.week_id,
        subject: ann.subject,
      });
      await supabase.from('announcements').update({ status: 'POSTED', posted_at: new Date().toISOString() }).eq('id', ann.id);
      toast.success(`Posted: ${ann.title}`);
      loadAnnouncements(selectedWeekId || undefined);
    } catch (e: any) {
      toast.error('Post failed', { description: e.message });
    }
    setPosting(p => ({ ...p, [ann.id]: false }));
  };

  const handlePostAll = async () => {
    const drafts = announcements.filter(a => a.status === 'DRAFT');
    if (drafts.length === 0) { toast.info('No drafts to post'); return; }
    setPostingAll(true);
    const toastId = toast.loading(`Posting 0/${drafts.length} announcements\u2026`);
    let done = 0;
    let errors = 0;

    for (const ann of drafts) {
      toast.loading(`Posting "${ann.title}" (${done + 1}/${drafts.length})\u2026`, { id: toastId });
      try {
        await handlePost(ann);
      } catch {
        errors++;
      }
      done++;
    }

    if (errors > 0) {
      toast.warning(`Posted ${done - errors}/${drafts.length} (${errors} failed)`, { id: toastId });
    } else {
      toast.success(`All ${drafts.length} announcements posted! \u2705`, { id: toastId });
    }
    setPostingAll(false);
  };

  const draftCount = announcements.filter(a => a.status === 'DRAFT').length;
  const postedCount = announcements.filter(a => a.status === 'POSTED').length;

  const statusColor = (s: string | null) => {
    if (s === 'POSTED') return 'bg-success text-success-foreground';
    if (s === 'ERROR') return 'bg-destructive text-destructive-foreground';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Announcement Center</h1>
          <p className="text-muted-foreground mt-1">Create, auto-generate, and post announcements to Canvas</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {draftCount > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <Clock className="h-3 w-3" /> {draftCount} draft{draftCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {postedCount > 0 && (
            <Badge className="text-xs bg-success/10 text-success border-success/20 gap-1">
              <CheckCircle2 className="h-3 w-3" /> {postedCount} posted
            </Badge>
          )}
          <Select value={selectedWeekId || '__all__'} onValueChange={v => setSelectedWeekId(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All weeks" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All weeks</SelectItem>
              {weeks.map(w => <SelectItem key={w.id} value={w.id}>{w.quarter} Wk {w.week_num}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleAutoGenerate} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Auto-Generate
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
          <Button size="sm" onClick={handlePostAll} disabled={postingAll || draftCount === 0} className="gap-1.5">
            {postingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {postingAll ? 'Posting\u2026' : 'Post All Drafts'}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-primary/20 shadow-md">
          <CardContent className="pt-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select value={formSubject} onValueChange={setFormSubject}>
                <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test_reminder">Test Reminder</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="homework">Homework</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Title" value={formTitle} onChange={e => setFormTitle(e.target.value)} />
            <Textarea placeholder="Message body..." value={formContent} onChange={e => setFormContent(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {loading ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading announcements...
          </CardContent></Card>
        ) : announcements.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No announcements yet. Auto-generate from test data or create manually.</p>
          </CardContent></Card>
        ) : announcements.map(ann => (
          <Card key={ann.id} className={`transition-all ${ann.status === 'POSTED' ? 'opacity-70' : ''}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" />
                  {ann.title}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{ann.subject}</Badge>
                  <Badge className={`text-xs ${statusColor(ann.status)}`}>{ann.status}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{ann.content}</p>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {ann.scheduled_post ? new Date(ann.scheduled_post).toLocaleString() : 'Not scheduled'}
                  </span>
                  {ann.posted_at && <span className="text-success">Posted {new Date(ann.posted_at).toLocaleString()}</span>}
                </div>
                <div className="flex gap-2">
                  {ann.status === 'DRAFT' && (
                    <Button size="sm" variant="outline" onClick={() => handlePost(ann)} disabled={posting[ann.id]} className="gap-1 text-xs">
                      {posting[ann.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Post
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(ann.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function getNextFriday4PM(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  friday.setHours(16, 0, 0, 0);
  return friday.toISOString();
}
