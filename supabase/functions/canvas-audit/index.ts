// Canvas Audit Engine - fetches live Canvas data for a given week slug
// across all canonical courses and returns a structured raw audit object.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CANVAS_BASE = 'https://thalesacademy.instructure.com';
const TOKEN = Deno.env.get('CANVAS_API_TOKEN') ?? '';

const COURSES: Record<string, number> = {
  Math: 21957,
  Reading: 21919,
  'Language Arts': 21944,
  History: 21934,
  Science: 21970,
  Homeroom: 22254,
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

async function cf(path: string) {
  const res = await fetch(`${CANVAS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Canvas ${res.status} ${path}: ${await res.text()}`);
  }
  return res.json();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSectionByHeading(html: string, headingTag: string, label: string): string | null {
  const re = new RegExp(
    `<${headingTag}[^>]*>\\s*${label}[\\s\\S]*?</${headingTag}>([\\s\\S]*?)(?=<${headingTag}[^>]*>|$)`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractDayBlock(html: string, day: string): string | null {
  // A day block typically begins with an <h3> containing the day name
  const re = new RegExp(
    `<h3[^>]*>[\\s\\S]*?${day}[\\s\\S]*?</h3>([\\s\\S]*?)(?=<h3[^>]*>|$)`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractSubsection(dayHtml: string, label: 'In Class' | 'At Home'): string | null {
  const re = new RegExp(
    `<h4[^>]*>\\s*${label}\\s*</h4>([\\s\\S]*?)(?=<h4[^>]*>|<h3[^>]*>|$)`,
    'i',
  );
  const m = dayHtml.match(re);
  return m ? m[1] : null;
}

function analyzePage(page: any) {
  if (!page) return null;
  const body: string = page.body || '';
  const text = stripHtml(body);

  const at_home_per_day: Record<string, string> = {};
  const in_class_per_day: Record<string, string> = {};
  const day_blocks_found: string[] = [];

  for (const day of DAYS) {
    const block = extractDayBlock(body, day);
    if (block) {
      day_blocks_found.push(day);
      const ah = extractSubsection(block, 'At Home');
      const ic = extractSubsection(block, 'In Class');
      if (ah) at_home_per_day[day] = stripHtml(ah);
      if (ic) in_class_per_day[day] = stripHtml(ic);
    }
  }

  const remindersRaw = extractSectionByHeading(body, 'h2', 'Reminders');
  const resourcesRaw = extractSectionByHeading(body, 'h2', 'Resources');

  const resourceLinks = resourcesRaw
    ? Array.from(resourcesRaw.matchAll(/href="([^"]+)"/gi)).map((m) => m[1])
    : [];

  const assignmentLinks = Array.from(
    body.matchAll(/\/courses\/\d+\/assignments\/\d+/g),
  ).map((m) => m[0]);

  let prefix = 'none';
  if (body.includes('SM5:')) prefix = 'SM5:';
  else if (body.includes('RM4:')) prefix = 'RM4:';
  else if (body.includes('ELA4:')) prefix = 'ELA4:';

  return {
    title: page.title,
    url: page.url,
    published: page.published,
    updated_at: page.updated_at,
    editing_roles: page.editing_roles,
    body,
    body_text: text,
    has_reminders_section: !!remindersRaw,
    has_resources_section: !!resourcesRaw,
    has_at_home_sections: (body.match(/<h4[^>]*>\s*At Home\s*<\/h4>/gi) || []).length,
    has_in_class_sections: (body.match(/<h4[^>]*>\s*In Class\s*<\/h4>/gi) || []).length,
    day_blocks_found,
    missing_days: DAYS.filter((d) => !day_blocks_found.includes(d)),
    resource_links: resourceLinks,
    reminder_text: remindersRaw ? stripHtml(remindersRaw) : '',
    at_home_text_per_day: at_home_per_day,
    in_class_text_per_day: in_class_per_day,
    assignment_links_found: Array.from(new Set(assignmentLinks)),
    prefix_found: prefix,
    word_count: text.split(/\s+/).filter(Boolean).length,
  };
}

async function auditCourse(
  courseName: string,
  courseId: number,
  weekSlug: string,
  weekStartDate: string,
) {
  const errors: string[] = [];
  let course_info: any = null;
  let page: any = null;
  let assignments: any[] = [];
  let assignment_groups: any[] = [];

  try {
    course_info = await cf(`/api/v1/courses/${courseId}`);
  } catch (e: any) {
    errors.push(`course: ${e.message}`);
  }

  try {
    page = await cf(`/api/v1/courses/${courseId}/pages/${weekSlug}`);
  } catch (e: any) {
    errors.push(`page: ${e.message}`);
  }

  try {
    assignment_groups = await cf(
      `/api/v1/courses/${courseId}/assignment_groups`,
    );
  } catch (e: any) {
    errors.push(`groups: ${e.message}`);
  }

  try {
    const all = await cf(
      `/api/v1/courses/${courseId}/assignments?per_page=100`,
    );
    // Filter by week range (Mon..Sat exclusive, 6 days span)
    const start = new Date(`${weekStartDate}T00:00:00-05:00`);
    const end = new Date(start.getTime() + 6 * 86400000);
    assignments = (all as any[]).filter((a) => {
      if (!a.due_at) return false;
      const d = new Date(a.due_at);
      return d >= start && d <= end;
    });
  } catch (e: any) {
    errors.push(`assignments: ${e.message}`);
  }

  const groupMap = new Map<number, string>(
    (assignment_groups || []).map((g: any) => [g.id, g.name]),
  );

  return {
    course_id: courseId,
    course_info: course_info
      ? {
          name: course_info.name,
          course_code: course_info.course_code,
          workflow_state: course_info.workflow_state,
          default_view: course_info.default_view,
          syllabus_body: course_info.syllabus_body,
          total_students: course_info.total_students,
        }
      : null,
    page: analyzePage(page),
    assignments: (assignments || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      points_possible: a.points_possible,
      grading_type: a.grading_type,
      submission_types: a.submission_types,
      assignment_group_id: a.assignment_group_id,
      assignment_group_name: groupMap.get(a.assignment_group_id) || null,
      due_at: a.due_at,
      lock_at: a.lock_at,
      unlock_at: a.unlock_at,
      published: a.published,
      omit_from_final_grade: a.omit_from_final_grade,
      html_url: a.html_url,
      description: a.description,
    })),
    assignment_groups: (assignment_groups || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      group_weight: g.group_weight,
    })),
    fetch_errors: errors,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    if (!TOKEN) throw new Error('CANVAS_API_TOKEN missing');
    const body = await req.json();
    const weekSlug: string = body.weekSlug;
    const weekStartDate: string = body.weekStartDate;
    const courseIds: Record<string, number> | undefined = body.courseIds;
    if (!weekSlug || !weekStartDate) {
      throw new Error('weekSlug and weekStartDate are required');
    }

    const targetCourses = courseIds && Object.keys(courseIds).length
      ? courseIds
      : COURSES;

    const entries = await Promise.all(
      Object.entries(targetCourses).map(async ([name, id]) => [
        name,
        await auditCourse(name, id, weekSlug, weekStartDate),
      ]),
    );

    const result = {
      generated_at: new Date().toISOString(),
      week_slug: weekSlug,
      week_start_date: weekStartDate,
      courses: Object.fromEntries(entries),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
