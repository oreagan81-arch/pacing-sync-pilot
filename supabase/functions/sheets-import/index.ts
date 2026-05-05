// Edge function: sheets-import
// Fetches the Thales pacing Google Sheet as CSV and returns raw rows.
// The sheet is "Anyone with link can view" so no auth is required.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SPREADSHEET_ID = "1RpMrcQqqrDl2Gaqo2LaGTDQWvrsYwBntbYOXlIrM7LA";
const DEFAULT_GID = "287822418";

/**
 * Minimal CSV parser that handles quoted fields, escaped quotes ("") and
 * embedded newlines inside quotes. Returns string[][].
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Handle CRLF: skip the \n after \r
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  // Flush last field/row if non-empty
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let gid: string = DEFAULT_GID;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.gid === "string" && body.gid.trim()) {
          gid = body.gid.trim();
        } else if (body && typeof body.gid === "number") {
          gid = String(body.gid);
        }
      } catch {
        // Empty body is fine — use default gid
      }
    }

    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
    const upstream = await fetch(url, { redirect: "follow" });

    if (!upstream.ok) {
      const body = await upstream.text();
      return new Response(
        JSON.stringify({
          error: "sheets_fetch_failed",
          status: upstream.status,
          url,
          body: body.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const csv = await upstream.text();
    const rows = parseCsv(csv);

    return new Response(
      JSON.stringify({ rows, gid, rowCount: rows.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "internal_error", message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
