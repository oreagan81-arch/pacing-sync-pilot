const AI_GATEWAY_URL = "https://ai-gateway.lovable.dev/v1/chat/completions";

export async function callAI<T>(prompt: string, opts?: {
  model?: string;
  temperature?: number;
}): Promise<T> {
  // Fetch the API key from the edge function environment via a thin proxy,
  // OR use the LOVABLE_API_KEY that's injected client-side.
  // The AI gateway is accessible from browsers but not from edge functions.
  const apiKey = import.meta.env.VITE_LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_LOVABLE_API_KEY not configured");
  }

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts?.model || "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: opts?.temperature ?? 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI request failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || "";

  // Parse JSON from response (handle potential markdown wrapping)
  const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${content.slice(0, 200)}`);
  }
}
