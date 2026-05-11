import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * pacing-sanitize — Apply Thales Academic OS sanitization rules at ingestion.
 * - CLT Protocol: "CLT" → "CLT Testing", marks instructional=false
 * - Brevity Mandate: strip vendor brands (Saxon, Shurley, SRA, Open Court)
 *
 * NOTE: Sanitization logic is intentionally duplicated here — Supabase Edge
 * Functions cannot import from src/. Keep in sync with src/lib/academic-sanitize.ts.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VENDOR_BRANDS = ["Saxon", "Shurley", "SRA", "Open Court"];
const NON_INSTRUCTIONAL = [
  "CLT Testing",
  "Holiday",
  "Track Out",
  "Teacher Workday",
  "Non-Instructional",
];

function sanitizeAcademicInput(input: unknown): string {
  if (!input || typeof input !== "string") return "";
  let s = input.trim();
  if (s.toUpperCase() === "CLT") return "CLT Testing";
  for (const brand of VENDOR_BRANDS) {
    s = s.replace(new RegExp(brand, "gi"), "");
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

function isInstructionalDay(status: string): boolean {
  return !NON_INSTRUCTIONAL.includes(status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const rawRows = Array.isArray(body?.rawRows) ? body.rawRows : null;
    if (!rawRows) {
      return new Response(
        JSON.stringify({ error: "rawRows must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsedRows = rawRows.map((row: Record<string, unknown>) => {
      const status = sanitizeAcademicInput(row.status ?? "Instructional") || "Instructional";
      return {
        ...row,
        status,
        instructional: isInstructionalDay(status),
        math: sanitizeAcademicInput(row.math),
        reading: sanitizeAcademicInput(row.reading),
        ela: sanitizeAcademicInput(row.ela),
        science: sanitizeAcademicInput(row.science),
        history: sanitizeAcademicInput(row.history),
      };
    });

    return new Response(JSON.stringify({ data: parsedRows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
