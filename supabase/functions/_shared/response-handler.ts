/**
 * THALES OS — Never Crash Contract
 *
 * Shared response helpers used by every edge function.
 *
 * Rule: a Canvas deployment failure must NEVER surface as an HTTP 500 to
 * the client. The client polls and chains many calls — a 5xx breaks the
 * UI loop. Instead, every error is caught, logged, and returned as
 * HTTP 200 with `{ success: false, error: "<human readable>" }`.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

export function handleSuccess<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, ...(data as object) }),
    { status, headers: corsHeaders },
  );
}

/**
 * Catch-all error handler. Always returns HTTP 200 with a structured
 * error payload so the client never sees a 5xx from our edge functions.
 */
export function handleError(err: unknown, context?: string): Response {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";

  // Log full error server-side for debugging
  console.error(
    `[response-handler]${context ? ` [${context}]` : ""} ${message}`,
    err,
  );

  return new Response(
    JSON.stringify({
      success: false,
      error: message || "An unexpected error occurred",
    }),
    { status: 200, headers: corsHeaders },
  );
}

/**
 * Wrap a handler so any thrown exception is converted into the
 * standard 200-with-error envelope. Use as:
 *
 *   serve((req) => withNeverCrash(req, async (r) => { ... }))
 */
export async function withNeverCrash(
  req: Request,
  fn: (req: Request) => Promise<Response>,
  context?: string,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    return await fn(req);
  } catch (err) {
    return handleError(err, context);
  }
}

export { corsHeaders };
