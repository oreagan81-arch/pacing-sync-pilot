/**
 * Vercel Serverless Function: Canvas LMS API proxy
 *
 * Proxies all /api/canvas/* requests to the Canvas LMS REST API,
 * injecting the bearer token and applying exponential backoff on
 * 429 / 5xx responses.
 *
 * Env vars:
 *   CANVAS_API_TOKEN  — Canvas access token (required)
 *   CANVAS_BASE_URL   — Override for Canvas host (optional)
 *                       Default: https://thalesacademy.instructure.com
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_BASE = 'https://thalesacademy.instructure.com';
const RETRY_DELAYS_MS = [1000, 2000, 4000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildTargetUrl(req: VercelRequest): string {
  const baseRaw = process.env.CANVAS_BASE_URL || DEFAULT_BASE;
  const base = baseRaw.replace(/\/+$/, '');

  // req.query.path is the rest segments captured by [...path].ts
  const pathParam = req.query.path;
  const segments = Array.isArray(pathParam)
    ? pathParam
    : typeof pathParam === 'string'
      ? [pathParam]
      : [];
  const path = segments.map(encodeURIComponent).join('/');

  // Forward all query params except the path catch-all
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, String(v)));
    } else if (value !== undefined) {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return `${base}/api/v1/${path}${qs ? `?${qs}` : ''}`;
}

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.CANVAS_API_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: 'configuration_error',
      message: 'CANVAS_API_TOKEN is not configured',
    });
  }

  const url = buildTargetUrl(req);
  const method = (req.method || 'GET').toUpperCase();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(method) && req.body !== undefined && req.body !== null) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  let lastStatus = 0;
  let lastText = '';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const upstream = await fetch(url, { method, headers, body });
      lastStatus = upstream.status;
      const text = await upstream.text();
      lastText = text;

      if (upstream.ok) {
        res.status(upstream.status);
        try {
          return res.json(text ? JSON.parse(text) : {});
        } catch {
          res.setHeader('Content-Type', 'text/plain');
          return res.send(text);
        }
      }

      if (shouldRetry(upstream.status) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* keep raw text */
      }
      return res.status(upstream.status).json({
        error: 'canvas_error',
        status: upstream.status,
        url,
        body: parsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return res.status(502).json({
        error: 'upstream_unreachable',
        message,
        url,
        lastStatus,
        lastText,
      });
    }
  }

  return res.status(502).json({
    error: 'canvas_retry_exhausted',
    status: lastStatus,
    url,
    body: lastText,
  });
}
