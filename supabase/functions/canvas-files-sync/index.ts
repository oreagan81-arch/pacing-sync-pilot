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

/**
 * Build a fuzzy pattern key for a filename — strips lesson digits and the extension
 * so that "SM5_L_004.pdf" and "SM5_L_005.pdf" share a pattern. This is what we
 * match against `learning_rules.name_pattern` when the exact original_name miss.
 */
function patternKey(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\d+/g, "#")
    .replace(/[\s_\-]+/g, "_");
}

interface LearningRuleHit {
  subject: string | null;
  type: string | null;
  lessonNum: string | null;
  ruleId: string;
  matchKind: "exact" | "pattern";
}

async function lookupLearningRule(
  supabase: ReturnType<typeof createClient>,
  filename: string,
): Promise<LearningRuleHit | null> {
  // 1. Exact original_name match (case-insensitive via lower() unique index)
  const { data: exact } = await supabase
    .from("learning_rules")
    .select("id, corrected_subject, corrected_type, corrected_lesson")
    .ilike("original_name", filename)
    .maybeSingle();
  if (exact) {
    return {
      subject: exact.corrected_subject,
      type: exact.corrected_type,
      lessonNum: exact.corrected_lesson,
      ruleId: exact.id,
      matchKind: "exact",
    };
  }
  // 2. Fuzzy pattern match
  const key = patternKey(filename);
  const { data: byPattern } = await supabase
    .from("learning_rules")
    .select("id, corrected_subject, corrected_type, corrected_lesson")
    .eq("name_pattern", key)
    .order("applied_count", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byPattern) {
    return {
      subject: byPattern.corrected_subject,
      type: byPattern.corrected_type,
      lessonNum: byPattern.corrected_lesson,
      ruleId: byPattern.id,
      matchKind: "pattern",
    };
  }
  return null;
}

/**
 * Ask Lovable AI Gateway (Gemini) to guess subject/type/lesson from a filename.
 * Returns null on any failure — caller falls back to regex / unclassified.
 */
async function classifyWithGemini(
  filename: string,
  defaultSubject: string | null,
): Promise<{ subject: string | null; type: string | null; lessonNum: string | null } | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Classify a 4th-grade course file by its filename. Subjects: Math, Reading, Spelling, Language Arts, History, Science. Types: worksheet, test, study_guide, answer_key, resource. Return null fields when unsure.",
          },
          { role: "user", content: `Filename: ${filename}\nCourse hint: ${defaultSubject ?? "unknown"}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_file",
              description: "Return the parsed subject, type, and lesson number.",
              parameters: {
                type: "object",
                properties: {
                  subject: { type: ["string", "null"] },
                  type: { type: ["string", "null"] },
                  lesson_num: { type: ["string", "null"] },
                },
                required: ["subject", "type", "lesson_num"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_file" } },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args);
    return {
      subject: parsed.subject || null,
      type: parsed.type || null,
      lessonNum: parsed.lesson_num ? String(parsed.lesson_num) : null,
    };
  } catch (e) {
    console.warn("[gemini classify] failed:", e);
    return null;
  }
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

        // Process files in this page concurrently.
        // NOTE: Gemini AI fallback is intentionally skipped here to stay within the
        // 150s edge-function timeout. Unclassified files are picked up by the
        // nightly classifier job.
        await Promise.all(pageFiles.map(async (f) => {
          const displayName = f.display_name || f.filename || `file-${f.id}`;
          const ext = (displayName.split(".").pop() || "pdf").toLowerCase();
          const cls = classifyByRegex(displayName);

          let friendly: string | null = null;
          let confidence = "unclassified";
          let subject: string | null = subjectByCourse.get(courseId as number) || null;
          let type: string | null = null;
          let lessonNum: string | null = null;
          let slug: string | null = null;

          // 1) Learning-rules first
          const rule = await lookupLearningRule(supabase, displayName);
          if (rule && (rule.subject || rule.type || rule.lessonNum)) {
            subject = rule.subject ?? subject;
            type = rule.type ?? null;
            lessonNum = rule.lessonNum ?? null;
            confidence = `learned_${rule.matchKind}`;
            if (subject && type) {
              friendly = generateFriendlyName(subject, type, lessonNum ?? "", ext);
              slug = generateSlug(subject, type, lessonNum ?? "");
            }
            stats.classified++;
            // Bump usage count (fire and forget, single round-trip)
            supabase
              .from("learning_rules")
              .update({ last_applied: now })
              .eq("id", rule.ruleId)
              .then(() => {});
          } else if (cls) {
            // 2) Regex match
            subject = cls.subject;
            type = cls.type;
            lessonNum = cls.lessonNum || null;
            confidence = "regex";
            friendly = generateFriendlyName(cls.subject, cls.type, cls.lessonNum, ext);
            slug = generateSlug(cls.subject, cls.type, cls.lessonNum);
            stats.classified++;
          }
          // 3) Gemini fallback removed from sync hot path — nightly job handles it.

          const needsRename = !!friendly && friendly !== displayName;

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
        }));

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
