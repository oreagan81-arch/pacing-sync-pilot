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
    description: "Classify an educational file by subject, type, and lesson number based on its visual content.",
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
          description: "Numeric lesson/test number found in the document (digits only)",
        },
        suggested_name: {
          type: "string",
          description: "A friendly filename like SM5_L078_worksheet.pdf",
        },
      },
      required: ["subject", "type", "lesson_num", "suggested_name"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image_base64, filename, mime_type } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "Missing image_base64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect mime type from filename or explicit param
    let detectedMime = mime_type || "image/png";
    if (!mime_type && filename) {
      const ext = filename.split(".").pop()?.toLowerCase();
      if (ext === "pdf") detectedMime = "application/pdf";
      else if (ext === "jpg" || ext === "jpeg") detectedMime = "image/jpeg";
      else if (ext === "webp") detectedMime = "image/webp";
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Look at this educational worksheet/document image from a 4th/5th grade school. Identify the subject, type, and lesson number from the visual content.

Common naming patterns for suggested_name:
- Math = SM5, Reading = RM4, Spelling = RM4, Language Arts = ELA4, History = HIS4, Science = SCI4
- worksheet = _L, test = _T, study_guide = _SG, answer_key = _AK
- Format: PREFIX_TYPE + lesson num padded to 3 digits + .pdf
  Example: SM5_L078.pdf, RM4_T012.pdf

${filename ? `Original filename: "${filename}"` : ""}

Use the classify_file tool to return your answer.`;

    const response = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${detectedMime};base64,${image_base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        tools: [classifyTool],
        tool_choice: { type: "function", function: { name: "classify_file" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `AI request failed: ${errText}` }), {
        status: response.status === 429 ? 429 : response.status === 402 ? 402 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    let parsed;
    if (toolCall?.function?.arguments) {
      parsed = JSON.parse(toolCall.function.arguments);
    } else {
      const content = aiResult.choices?.[0]?.message?.content || "";
      try {
        parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      } catch {
        parsed = { subject: "Unknown", type: "resource", lesson_num: "", suggested_name: filename || "unknown.pdf" };
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
