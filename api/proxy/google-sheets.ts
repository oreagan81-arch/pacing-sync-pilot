/**
 * Vercel Serverless Function: Google Sheets CSV proxy
 *
 * Accepts a `url` query parameter pointing at a Google Sheets edit URL
 * (or any sheets URL containing /d/{id}/), transforms it to the CSV
 * export endpoint, fetches the CSV, and returns it as text/csv.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

function toCsvExportUrl(input: string): string | null {
  try {
    const u = new URL(input);
    if (!u.hostname.includes('docs.google.com')) return null;

    // Extract spreadsheet id from /spreadsheets/d/{id}/...
    const match = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!match) return null;
    const id = match[1];

    // Preserve gid (sheet/tab id) if present in the hash or query
    let gid: string | null = u.searchParams.get('gid');
    if (!gid && u.hash) {
      const hashParams = new URLSearchParams(u.hash.replace(/^#/, ''));
      gid = hashParams.get('gid');
    }

    const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${id}/export`);
    exportUrl.searchParams.set('format', 'csv');
    if (gid) exportUrl.searchParams.set('gid', gid);
    return exportUrl.toString();
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.url;
  const url = Array.isArray(raw) ? raw[0] : raw;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      error: 'missing_url',
      message: 'A `url` query parameter is required',
    });
  }

  const exportUrl = toCsvExportUrl(url);
  if (!exportUrl) {
    return res.status(400).json({
      error: 'invalid_url',
      message: 'URL must be a docs.google.com spreadsheet URL',
    });
  }

  try {
    const upstream = await fetch(exportUrl, { redirect: 'follow' });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'sheets_export_failed',
        status: upstream.status,
        url: exportUrl,
        body: text.slice(0, 500),
      });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({
      error: 'upstream_unreachable',
      message,
      url: exportUrl,
    });
  }
}
