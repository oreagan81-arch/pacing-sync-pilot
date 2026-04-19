import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCourseIds, subjectForCourseId } from '../_shared/canvas-courses.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Snapshot {
  course_id: number;
  content_type: string;
  canvas_id: string;
  title: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
}

const FRIDAY = 5; // JS getUTCDay: Sun=0..Sat=6

function bumpCounter(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function extractH2Sequence(html: string | null): string[] {
  if (!html) return [];
  const out: string[] = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const txt = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (txt) out.push(txt.slice(0, 60));
  }
  return out.slice(0, 8);
}

function firstSentence(html: string | null): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const m = text.match(/^[^.!?]{4,160}[.!?]/);
  return (m ? m[0] : text.slice(0, 140)).trim();
}

function lastSentence(html: string | null): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const parts = text.match(/[^.!?]+[.!?]/g);
  if (!parts || parts.length === 0) return null;
  return parts[parts.length - 1].trim().slice(0, 140);
}

function namingTemplate(title: string | null): string | null {
  if (!title) return null;
  // Replace numbers with {N}, normalize whitespace
  const t = title.trim().replace(/\b\d+\b/g, '{N}').replace(/\s+/g, ' ');
  return t.length >= 3 ? t.slice(0, 80) : null;
}

function dayOfWeek(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const courseMap = await getCourseIds();

    // Pull all snapshots (paginate to be safe)
    const all: Snapshot[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from('canvas_snapshots')
        .select('course_id,content_type,canvas_id,title,body,metadata')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as Snapshot[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Counters
    const naming = new Map<string, number>(); // key: subject||template
    const sectionOrder = new Map<string, number>(); // key: subject||h2-seq
    const opener = new Map<string, number>();
    const closer = new Map<string, number>();
    const dueDay = new Map<string, number>(); // key: subject||DAY
    const fileNaming = new Map<string, number>(); // key: subject||template

    for (const s of all) {
      const subject = subjectForCourseId(s.course_id, courseMap) ?? `course:${s.course_id}`;

      if (s.content_type === 'assignment') {
        const tmpl = namingTemplate(s.title);
        if (tmpl) bumpCounter(naming, `${subject}||${tmpl}`);
        const due = (s.metadata as { due_at?: string }).due_at;
        const dow = dayOfWeek(due ?? null);
        if (dow !== null && dow !== FRIDAY) {
          // Friday rules: don't learn homework patterns from Friday
          bumpCounter(dueDay, `${subject}||${DAY_NAMES[dow]}`);
        }
      } else if (s.content_type === 'page') {
        const seq = extractH2Sequence(s.body).join(' > ');
        if (seq) bumpCounter(sectionOrder, `${subject}||${seq}`);
      } else if (s.content_type === 'announcement') {
        const op = firstSentence(s.body);
        const cl = lastSentence(s.body);
        if (op) bumpCounter(opener, `${subject}||${op}`);
        if (cl && cl !== op) bumpCounter(closer, `${subject}||${cl}`);
      } else if (s.content_type === 'file') {
        const tmpl = namingTemplate(s.title);
        if (tmpl) bumpCounter(fileNaming, `${subject}||${tmpl}`);
      }
    }

    // Persist top-N per (pattern_type)
    const TOP = 25;
    const upserts: Array<{
      pattern_type: string;
      pattern_key: string;
      pattern_value: Record<string, unknown>;
      confidence: number;
      occurrence_count: number;
    }> = [];

    function flush(type: string, m: Map<string, number>) {
      const entries = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
      for (const [k, count] of entries) {
        const [subject, value] = k.split('||');
        upserts.push({
          pattern_type: type,
          pattern_key: k,
          pattern_value: { subject, value, count },
          confidence: Math.min(100, count * 10),
          occurrence_count: count,
        });
      }
    }

    flush('assignment_naming', naming);
    flush('page_section_order', sectionOrder);
    flush('announcement_opener', opener);
    flush('announcement_closer', closer);
    flush('due_day_pattern', dueDay);
    flush('file_naming', fileNaming);

    // Wipe old patterns of these types and reinsert (clean slate per train)
    const types = [
      'assignment_naming',
      'page_section_order',
      'announcement_opener',
      'announcement_closer',
      'due_day_pattern',
      'file_naming',
    ];
    await sb.from('canvas_patterns').delete().in('pattern_type', types);
    if (upserts.length > 0) {
      const { error } = await sb.from('canvas_patterns').insert(upserts);
      if (error) throw error;
    }

    await sb.from('deploy_log').insert({
      action: 'canvas-pattern-train',
      status: 'OK',
      message: `Trained ${upserts.length} patterns from ${all.length} snapshots`,
    });

    return new Response(
      JSON.stringify({ ok: true, snapshots: all.length, patterns: upserts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
