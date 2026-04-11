import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const APPS_SCRIPT_URL = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
    if (!APPS_SCRIPT_URL)
      throw new Error("GOOGLE_APPS_SCRIPT_URL not configured");

    const { sheetName } = await req.json();

    // Build URL with optional sheet name parameter
    const url = new URL(APPS_SCRIPT_URL);
    if (sheetName) url.searchParams.set("sheet", sheetName);

    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow", // Apps Script redirects on deploy
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Apps Script error [${response.status}]: ${errText}`);
    }

    const rawData = await response.json();

    // rawData is a 2D array from the sheet
    // We'll pass it through to the pacing-parse AI for structured extraction
    // Or return raw for the client to handle
    return new Response(JSON.stringify({ raw: rawData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sheets-import error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
