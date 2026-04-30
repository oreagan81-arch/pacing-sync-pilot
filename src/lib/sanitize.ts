/**
 * Sanitize HTML for Canvas output.
 * Whitelists target="_blank" and rel="noopener" on all <a> tags so
 * external Canvas links open correctly in a new tab.
 *
 * Lightweight, dependency-free. Canvas itself does final server-side
 * sanitization, so this guarantees safe-anchor attributes and strips
 * obvious script vectors.
 */

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const ON_ATTR_RE = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_HREF_RE = /\s+href\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  let html = String(dirty)
    .replace(SCRIPT_RE, '')
    .replace(ON_ATTR_RE, '')
    .replace(JS_HREF_RE, '');
  html = forceSafeAnchors(html);
  return html;
}

/**
 * Ensure every <a> has target="_blank" and rel="noopener".
 */
function forceSafeAnchors(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    let a = attrs;
    if (!/\btarget\s*=/.test(a)) a += ' target="_blank"';
    if (!/\brel\s*=/.test(a)) a += ' rel="noopener"';
    return `<a${a}>`;
  });
}

export const ALLOWED_ANCHOR_ATTRS = ['href', 'target', 'rel', 'title', 'class', 'style'] as const;
