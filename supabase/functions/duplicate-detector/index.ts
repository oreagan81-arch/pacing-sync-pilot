// duplicate-detector — sweeps Canvas assignments + pages in the configured courses,
// scores each pair with Jaccard similarity, and:
//   • >=80%  → DELETE the duplicate, UNLESS Canvas reports graded submissions
//             (in that case skip and log a warning).
//   • 50-79% → PUT to unpublish the duplicate and flag it for manual review.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CanvasAssignment {
  id: number;
  name: string;
  description?: string | null;
  published?: boolean;
  submission_types?: string[];
  submissions_download_url?: string;
  has_submitted_submissions?: boolean;
}

interface CanvasPage {
  page_id?: number;
  url: string;
  title: string;
  body?: string | null;
  published?: boolean;
  front_page?: boolean;
}

function tokenize(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : Math.round((inter / union) * 100);
}

async function canvasFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function fetchAllPaginated<T>(baseUrl: string, token: string, path: string): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  while (page < 50) {
    const r = await canvasFetch(`${baseUrl}${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`, token);
    if (!r.ok) break;
    const batch = (await r.json()) as T[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return out;
}

async function hasGradedSubmissions(baseUrl: string, token: string, courseId: number, assignmentId: number): Promise<boolean> {
  const r = await canvasFetch(
    `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}?include[]=submission_summary`,
    token,
  );
  if (!r.ok) return true; // fail-safe: assume graded so we never delete blindly
  const j = await r.json();
  const sum = j?.submission_summary;
  if (sum && typeof sum.graded === "number" && sum.graded > 0) return true;
  // Canvas sometimes only sets has_submitted_submissions
  if (j?.has_submitted_submissions === true) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const baseUrl = (Deno.env.get("CANVAS_BASE_URL") || "https://thalesacademy.instructure.com").replace(/\/+$/, "");
    const token = Deno.env.get("CANVAS_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "CANVAS_API_TOKEN not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dryRun === true;

    const { data: cfg } = await supabase
      .from("system_config")
      .select("course_ids")
      .eq("id", "current")
      .maybeSingle();
    const courseIds: Record<string, number> = cfg?.course_ids ?? {};

    const summary = {
      coursesScanned: 0,
      duplicatesDeleted: 0,
      duplicatesUnpublished: 0,
      skippedGraded: 0,
      flaggedForReview: 0,
      pairs: [] as Array<{
        courseId: number;
        kind: "assignment" | "page";
        score: number;
        keptId: string | number;
        duplicateId: string | number;
        action: "deleted" | "unpublished" | "skipped_graded" | "dry_run";
        message?: string;
      }>,
    };

    for (const courseId of new Set(Object.values(courseIds))) {
      summary.coursesScanned++;

      // ── ASSIGNMENTS ──────────────────────────────────────────────────────
      const assignments = await fetchAllPaginated<CanvasAssignment>(
        baseUrl,
        token,
        `/api/v1/courses/${courseId}/assignments`,
      );
      for (let i = 0; i < assignments.length; i++) {
        for (let j = i + 1; j < assignments.length; j++) {
          const a = assignments[i];
          const b = assignments[j];
          const score = jaccard(
            tokenize(`${a.name} ${a.description ?? ""}`),
            tokenize(`${b.name} ${b.description ?? ""}`),
          );
          if (score < 50) continue;

          // Keep the older / lower-id item, mark the newer one as duplicate
          const keep = a.id < b.id ? a : b;
          const dup = a.id < b.id ? b : a;

          if (score >= 80) {
            const graded = await hasGradedSubmissions(baseUrl, token, courseId, dup.id);
            if (graded) {
              summary.skippedGraded++;
              summary.pairs.push({
                courseId, kind: "assignment", score,
                keptId: keep.id, duplicateId: dup.id,
                action: "skipped_graded",
                message: `Duplicate has graded submissions — manual review required`,
              });
              await supabase.from("deploy_log").insert({
                action: "duplicate_sweep",
                status: "WARNING",
                subject: null,
                message: `Skipped delete (graded): assignment ${dup.id} dup of ${keep.id} @ ${score}%`,
                canvas_url: `${baseUrl}/courses/${courseId}/assignments/${dup.id}`,
              });
              continue;
            }
            if (!dryRun) {
              await canvasFetch(`${baseUrl}/api/v1/courses/${courseId}/assignments/${dup.id}`, token, { method: "DELETE" });
            }
            summary.duplicatesDeleted++;
            summary.pairs.push({
              courseId, kind: "assignment", score,
              keptId: keep.id, duplicateId: dup.id,
              action: dryRun ? "dry_run" : "deleted",
            });
            await supabase.from("deploy_log").insert({
              action: "duplicate_sweep",
              status: dryRun ? "DRY_RUN" : "DELETED",
              message: `Deleted assignment ${dup.id} (dup of ${keep.id} @ ${score}%)`,
              canvas_url: `${baseUrl}/courses/${courseId}/assignments/${dup.id}`,
            });
          } else {
            // 50-79% — unpublish + flag
            if (!dryRun) {
              await canvasFetch(`${baseUrl}/api/v1/courses/${courseId}/assignments/${dup.id}`, token, {
                method: "PUT",
                body: JSON.stringify({ assignment: { published: false } }),
              });
            }
            summary.duplicatesUnpublished++;
            summary.flaggedForReview++;
            summary.pairs.push({
              courseId, kind: "assignment", score,
              keptId: keep.id, duplicateId: dup.id,
              action: dryRun ? "dry_run" : "unpublished",
              message: "Flagged for manual review",
            });
            await supabase.from("deploy_notifications").insert({
              level: "warn",
              title: `Possible duplicate assignment (${score}%)`,
              message: `Course ${courseId}: "${dup.name}" looks similar to "${keep.name}". Unpublished pending review.`,
              entity_ref: `assignment:${dup.id}`,
            });
          }
        }
      }

      // ── PAGES ────────────────────────────────────────────────────────────
      const pages = await fetchAllPaginated<CanvasPage>(baseUrl, token, `/api/v1/courses/${courseId}/pages`);
      // Re-fetch each page body (list endpoint omits body)
      const pagesWithBody = await Promise.all(
        pages.map(async (p) => {
          if (p.front_page) return p; // never touch front pages
          const r = await canvasFetch(`${baseUrl}/api/v1/courses/${courseId}/pages/${p.url}`, token);
          if (!r.ok) return p;
          return (await r.json()) as CanvasPage;
        }),
      );

      for (let i = 0; i < pagesWithBody.length; i++) {
        for (let j = i + 1; j < pagesWithBody.length; j++) {
          const a = pagesWithBody[i];
          const b = pagesWithBody[j];
          if (a.front_page || b.front_page) continue; // never delete a homepage
          const score = jaccard(
            tokenize(`${a.title} ${a.body ?? ""}`),
            tokenize(`${b.title} ${b.body ?? ""}`),
          );
          if (score < 50) continue;

          const dup = b; // keep the first encountered
          if (score >= 80) {
            if (!dryRun) {
              await canvasFetch(`${baseUrl}/api/v1/courses/${courseId}/pages/${dup.url}`, token, { method: "DELETE" });
            }
            summary.duplicatesDeleted++;
            summary.pairs.push({
              courseId, kind: "page", score,
              keptId: a.url, duplicateId: dup.url,
              action: dryRun ? "dry_run" : "deleted",
            });
            await supabase.from("deploy_log").insert({
              action: "duplicate_sweep",
              status: dryRun ? "DRY_RUN" : "DELETED",
              message: `Deleted page ${dup.url} (dup of ${a.url} @ ${score}%)`,
              canvas_url: `${baseUrl}/courses/${courseId}/pages/${dup.url}`,
            });
          } else {
            if (!dryRun) {
              await canvasFetch(`${baseUrl}/api/v1/courses/${courseId}/pages/${dup.url}`, token, {
                method: "PUT",
                body: JSON.stringify({ wiki_page: { published: false } }),
              });
            }
            summary.duplicatesUnpublished++;
            summary.flaggedForReview++;
            summary.pairs.push({
              courseId, kind: "page", score,
              keptId: a.url, duplicateId: dup.url,
              action: dryRun ? "dry_run" : "unpublished",
              message: "Flagged for manual review",
            });
            await supabase.from("deploy_notifications").insert({
              level: "warn",
              title: `Possible duplicate page (${score}%)`,
              message: `Course ${courseId}: "${dup.title}" looks similar to "${a.title}". Unpublished pending review.`,
              entity_ref: `page:${dup.url}`,
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, dryRun, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("duplicate-detector error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
