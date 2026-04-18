// Canvas Files Sync — pulls files from each Canvas course and upserts into `files` + `content_map`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  url: string;
  "content-type": string;
  size: number;
  updated_at: string;
}

const REGEX_PATTERNS: { pattern: RegExp; subject: string; type: string; lessonExtract: RegExp | null }[] = [
  { pattern: /SM5.*SG[_\s-]*(\d+)/i, subject: "Math", type: "study_guide", lessonExtract: /SG[_\s-]*(\d+)/i },
  { pattern: /SM5.*T[_\s-]*(\d+)/i, subject: "Math", type: "test", lessonExtract: /T[_\s-]*(\d+)/i },
  { pattern: /SM5.*L[_\s-]*(\d+)/i, subject: "Math", type: "worksheet", lessonExtract: /L[_\s-]*(\d+)/i },
  { pattern: /RM4.*(\d+)/i, subject: "Reading", type: "worksheet", lessonExtract: /(\d+)/ },
  { pattern: /ELA4.*(\d+)/i, subject: "Language Arts", type: "worksheet", lessonExtract: /(\d+)/ },
  { pattern: /spell.*(\d+)/i, subject: "Spelling", type: "test", lessonExtract: /(\d+)/ },
];

function classifyByRegex(filename: string) {
  for (const rule of REGEX_PATTERNS) {
    if (rule.pattern.test(filename)) {
      let lessonNum = "";
      if (rule.lessonExtract) {
        const m = filename.match(rule.lessonExtract);
        if (m) lessonNum = m[1];
      }
      return { subject: rule.subject, type: rule.type, lessonNum };
    }
  }
  return null;
}

function generateFriendlyName(subject: string, type: string, lessonNum: string, ext: string): string {
  const prefixes: Record<string, string> = {
    Math: "SM5", Reading: "RM4", Spelling: "RM4", "Language Arts": "ELA4",
    History: "HIS4", Science: "SCI4",
  };
  const typeSuffix: Record<string, string> = {
    worksheet: "_L", test: "_T", study_guide: "_SG", answer_key: "_AK", resource: "_R",
  };
  return `${prefixes[subject] || subject.slice(0, 3).toUpperCase()}${typeSuffix[type] || "_"}${lessonNum.padStart(3, "0")}.${ext}`;
}

function generateSlug(subject: string, type: string, lessonNum: string): string {
  const sub = (subject || "x").toLowerCase().replace(/\s+/g, "-").slice(0, 4);
  const tp = (type || "x").toLowerCase().replace("_", "");
  return `${sub}-${tp}-${lessonNum.padStart(3, "0")}`;
}

function lessonRef(type: string, lessonNum: string): string {
  if (!lessonNum) return "";
  const map: Record<string, string> = { study_guide: "SG", test: "T", worksheet: "L", answer_key: "AK", resource: "R" };
  return `${map[type] || "L"}${lessonNum}`;
}

async function fetchCanvasFilesPage(baseUrl: string, token: string, courseId: number, page: number): Promise<CanvasFile[]> {
  const url = `${baseUrl}/api/v1/courses/${courseId}/files?per_page=100&page=${page}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Canvas ${r.status}: ${txt.slice(0, 200)}`);
  }
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const baseUrl = (Deno.env.get("CANVAS_BASE_URL") || "").replace(/\/$/, "");
    const token = Deno.env.get("CANVAS_API_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!baseUrl || !token) throw new Error("Canvas credentials missing");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Read course IDs from system_config
    const { data: cfg } = await supabase.from("system_config").select("course_ids").eq("id", "current").maybeSingle();
    const courseIds: Record<string, number> = cfg?.course_ids ?? {};
    const subjectByCourse = new Map<number, string>();
    for (const [subject, id] of Object.entries(courseIds)) subjectByCourse.set(id, subject);

    const stats = { synced: 0, classified: 0, mapped: 0, needsReview: 0, perCourse: {} as Record<string, number> };
    const now = new Date().toISOString();

    for (const [subjectName, courseId] of Object.entries(courseIds)) {
      // Skip duplicate Reading/Spelling course
      if (subjectName === "Spelling") continue;

      let page = 1;
      let total = 0;
      while (true) {
        let pageFiles: CanvasFile[] = [];
        try {
          pageFiles = await fetchCanvasFilesPage(baseUrl, token, courseId as number, page);
        } catch (e) {
          console.error(`[course ${courseId}] page ${page} failed:`, e);
          break;
        }
        if (!pageFiles.length) break;

        for (const f of pageFiles) {
          const displayName = f.display_name || f.filename || `file-${f.id}`;
          const ext = (displayName.split(".").pop() || "pdf").toLowerCase();
          const cls = classifyByRegex(displayName);

          let friendly: string | null = null;
          let confidence = "unclassified";
          let subject: string | null = subjectByCourse.get(courseId as number) || null;
          let type: string | null = null;
          let lessonNum: string | null = null;
          let slug: string | null = null;

          if (cls) {
            subject = cls.subject;
            type = cls.type;
            lessonNum = cls.lessonNum || null;
            confidence = "regex";
            friendly = generateFriendlyName(cls.subject, cls.type, cls.lessonNum, ext);
            slug = generateSlug(cls.subject, cls.type, cls.lessonNum);
            stats.classified++;
          }

          const needsRename = !!friendly && friendly !== displayName;

          // Upsert file row keyed on drive_file_id (Canvas file id)
          await supabase.from("files").upsert(
            {
              drive_file_id: String(f.id),
              original_name: displayName,
              friendly_name: friendly,
              subject,
              type,
              lesson_num: lessonNum,
              confidence,
              slug,
              canvas_url: f.url,
              needs_rename: needsRename,
              updated_at: now,
            },
            { onConflict: "drive_file_id" },
          );

          // High-confidence → upsert content_map
          if (cls && lessonNum) {
            const ref = lessonRef(cls.type, lessonNum);
            await supabase.from("content_map").upsert(
              {
                subject: cls.subject,
                lesson_ref: ref,
                type: cls.type,
                slug,
                canonical_name: friendly,
                canvas_file_id: String(f.id),
                canvas_url: f.url,
                confidence: "regex",
                auto_linked: true,
                last_synced: now,
                updated_at: now,
              },
              { onConflict: "subject,lesson_ref,type" },
            );
            stats.mapped++;
          } else {
            stats.needsReview++;
          }

          stats.synced++;
          total++;
        }

        if (pageFiles.length < 100) break;
        page++;
        if (page > 20) break; // safety
      }
      stats.perCourse[subjectName] = total;
    }

    await supabase.from("deploy_log").insert({
      action: "canvas-files-sync",
      status: "ok",
      message: `Synced ${stats.synced} files`,
      payload: stats,
    });

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("canvas-files-sync error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
