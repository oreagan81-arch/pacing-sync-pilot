import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUBJECTS = ["Math", "Reading", "Spelling", "Language Arts", "History", "Science"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { pastedText, imageBase64, mimeType } = await req.json();
    if (!pastedText && !imageBase64) throw new Error("No pasted text or image provided");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a pacing guide data extractor for a school teacher's weekly planner.

You will receive raw text pasted from a Google Sheets pacing chart. The data is organized as a grid with subjects as rows and days (Monday–Friday) as columns.

SUBJECTS (in order): Saxon Math, Reading Mastery, Spelling, Shurley English, History, Science
Map them to: Math, Reading, Spelling, Language Arts, History, Science

SHORTHAND KEY:
- L or Lesson = Lesson type
- AP = Activity Page  
- CP = Classroom Practice (type for Language Arts)
- x.x format (e.g. 12.2) = Chapter.Lesson for Language Arts (in_class = "Chapter 12, Lesson 2")
- p. or P = page reference (goes in resources or in_class)
- CH = Chapter (for Science/History)
- CO = Check Out (type for Reading)
- Test / test = Test type
- Fact Test = Fact Test type (Math only)
- Study Guide = Study Guide type (Math only)
- MT = Mastery Test (Reading test)
- FA = Fact Assessment (Math test alias)
- CA = Checkout Assessment (Reading checkout alias)
- inv = Investigation (Math lesson with investigation)
- review = review lesson
- "-" or empty = skip / no class
- "Shake Table", "Gas Pressure Eruption", "Skittles" etc. = Science activity (in_class content)
- Numbers alone for Math (e.g. "91", "92") = lesson numbers

For each subject+day cell, extract:
- type: one of [Lesson, Test, Fact Test, Study Guide, Checkout, No Class, -]
- lesson_num: the lesson/chapter number as a string
- in_class: description of in-class work
- at_home: homework description (usually blank from paste, leave empty)

Return structured data for all 6 subjects × 5 days.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Parse this pasted pacing chart data into structured format:\n\n${pastedText}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "set_pacing_data",
                description:
                  "Set the parsed pacing data for all subjects and days in a week",
                parameters: {
                  type: "object",
                  properties: {
                    rows: {
                      type: "array",
                      description: "Array of parsed pacing rows",
                      items: {
                        type: "object",
                        properties: {
                          subject: {
                            type: "string",
                            enum: SUBJECTS,
                          },
                          day: {
                            type: "string",
                            enum: DAYS,
                          },
                          type: {
                            type: "string",
                            enum: [
                              "Lesson",
                              "Test",
                              "Fact Test",
                              "Study Guide",
                              "Checkout",
                              "No Class",
                              "-",
                            ],
                          },
                          lesson_num: { type: "string" },
                          in_class: { type: "string" },
                          at_home: { type: "string" },
                        },
                        required: ["subject", "day", "type"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["rows"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "set_pacing_data" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429)
        return new Response(
          JSON.stringify({ error: "Rate limited, try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      if (response.status === 402)
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured response from AI");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pacing-parse error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
