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

    const { weekNum, sheetName } = await req.json();

    // Build URL — prefer ?week= param for the new API format
    const url = new URL(APPS_SCRIPT_URL);
    if (weekNum) url.searchParams.set("week", String(weekNum));
    if (sheetName) url.searchParams.set("sheet", sheetName);

    console.log("Fetching from:", url.toString());

    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Apps Script error [${response.status}]: ${errText}`);
    }

    const rawData = await response.json();
    console.log("Raw data keys:", Object.keys(rawData));

    // Return the data as-is — the client will handle mapping
    return new Response(JSON.stringify({ data: rawData }), {
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
