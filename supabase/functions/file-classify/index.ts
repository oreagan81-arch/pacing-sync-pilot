const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const classifyTool = {
  type: "function" as const,
  function: {
    name: "classify_file",
    description: "Classify an educational file by subject, type, and lesson number.",
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          enum: ["Math", "Reading", "Spelling", "Language Arts", "History", "Science"],
        },
        type: {
          type: "string",
          enum: ["worksheet", "test", "study_guide", "answer_key", "resource"],
        },
        lesson_num: {
          type: "string",
          description: "Numeric lesson/test number extracted from the filename (digits only)",
        },
      },
      required: ["subject", "type", "lesson_num"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { filename } = await req.json();
    if (!filename || typeof filename !== "string") {
      return new Response(JSON.stringify({ error: "Missing filename" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Classify this educational file based on its filename. The file is from a 4th/5th grade school.

Filename: "${filename}"

Common naming patterns:
- SM5 = Saxon Math 5th grade
- RM4 = Reading Mastery 4th grade  
- ELA4 = English Language Arts 4th grade
- L = Lesson, T = Test, SG = Study Guide

Use the classify_file tool to return your answer.`;

    // Hard per-request timeout: prevents a stuck upstream call from
    // burning the entire 150s edge IDLE_TIMEOUT budget. 20s is plenty
    // for flash-lite + a single tool call.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20_000);
    let response: Response;
    try {
      response = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableApiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          tools: [classifyTool],
          tool_choice: { type: "function", function: { name: "classify_file" } },
        }),
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof Error && err.name === "AbortError";
      return new Response(
        JSON.stringify({ error: aborted ? "AI upstream timed out after 20s" : "AI upstream failed" }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `AI request failed: ${errText}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    let parsed;
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        parsed = { subject: "Unknown", type: "resource", lesson_num: "" };
      }
    } else {
      // Fallback to content parsing
      const content = aiResult.choices?.[0]?.message?.content || "";
      try {
        parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      } catch {
        parsed = { subject: "Unknown", type: "resource", lesson_num: "" };
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
