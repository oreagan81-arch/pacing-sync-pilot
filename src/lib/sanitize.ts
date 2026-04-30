import DOMPurify from 'dompurify';

/**
 * Sanitize HTML for Canvas output.
 * Whitelists target="_blank" and rel="noopener" on <a> tags so
 * external Canvas links open correctly in a new tab.
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof window === 'undefined') {
    // SSR / Edge fallback: pass through (Canvas API will sanitize server-side)
    return forceSafeAnchors(dirty);
  }

  const clean = DOMPurify.sanitize(dirty, {
    ADD_ATTR: ['target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });

  return forceSafeAnchors(clean);
}

/**
 * Ensure every <a> has target="_blank" rel="noopener".
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
