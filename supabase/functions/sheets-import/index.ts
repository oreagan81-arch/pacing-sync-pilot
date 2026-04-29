import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// NOTE: Legacy hardcoded MONTH_ROW_MAP has been removed. Date->row mapping is
// now scanned dynamically from Column A of the Google Sheet (one time) and
// cached in the public.content_map_registry table for subsequent imports.

async function fetchFromAppsScript(params: Record<string, string>) {
  const APPS_SCRIPT_URL = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
  if (!APPS_SCRIPT_URL) throw new Error("GOOGLE_APPS_SCRIPT_URL not configured");

  const url = new URL(APPS_SCRIPT_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Apps Script error [${res.status}]: ${errText}`);
  }
  return await res.json();
}

async function scanAndCacheDateRows(sb: ReturnType<typeof createClient>, sheetName?: string) {
  // Ask GAS for the full Column A scan (mode=scan returns [{date, row}, ...])
  const raw = await fetchFromAppsScript({ mode: "scan", sheet: sheetName ?? "" });
  const entries: Array<{ date: string; row: number }> = Array.isArray(raw?.dates)
    ? raw.dates
    : Array.isArray(raw)
      ? raw
      : [];

  if (entries.length === 0) return {};

  const upserts = entries
    .filter((e) => e?.date && Number.isFinite(e?.row))
    .map((e) => ({
      date_string: String(e.date).trim(),
      row_number: Number(e.row),
      sheet_name: sheetName ?? null,
      last_scanned: new Date().toISOString(),
    }));

  if (upserts.length > 0) {
    const { error } = await sb
      .from("content_map_registry")
      .upsert(upserts, { onConflict: "date_string,sheet_name" });
    if (error) console.error("registry upsert error:", error.message);
  }

  const map: Record<string, number> = {};
  for (const u of upserts) map[u.date_string] = u.row_number;
  return map;
}

async function getRowForDate(
  sb: ReturnType<typeof createClient>,
  dateString: string,
  sheetName?: string,
): Promise<number | null> {
  // Try cache first
  const { data } = await sb
    .from("content_map_registry")
    .select("row_number")
    .eq("date_string", dateString)
    .eq("sheet_name", sheetName ?? null)
    .maybeSingle();
  if (data?.row_number) return data.row_number as number;

  // Cache miss → scan once and re-check
  const map = await scanAndCacheDateRows(sb, sheetName);
  return map[dateString] ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const { weekNum, sheetName, dateString, mode } = body ?? {};

    // Explicit rescan mode — refreshes the registry from Column A
    if (mode === "rescan") {
      const map = await scanAndCacheDateRows(sb, sheetName);
      return new Response(JSON.stringify({ ok: true, count: Object.keys(map).length, map }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve start row dynamically from the registry when a date is given
    let startRow: number | null = null;
    if (dateString) {
      startRow = await getRowForDate(sb, dateString, sheetName);
    }

    const params: Record<string, string> = {};
    if (weekNum) params.week = String(weekNum);
    if (sheetName) params.sheet = sheetName;
    if (startRow) params.startRow = String(startRow);
    if (dateString) params.date = dateString;

    console.log("Fetching from GAS with params:", params);
    const rawData = await fetchFromAppsScript(params);

    return new Response(JSON.stringify({ data: rawData, startRow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sheets-import error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
