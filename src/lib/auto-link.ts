/**
 * THALES OS — Auto-link helper
 * Wraps lesson references and assignment titles with Canvas hyperlinks.
 */

export interface ContentMapEntry {
  lesson_ref: string;
  subject: string;
  canvas_url: string | null;
  canonical_name?: string | null;
}

/**
 * Escape regex special characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inject hyperlinks into free text by scanning for lesson references
 * (L96, SG18, Lesson 96, etc.) that exist in content_map.
 * Skips text already inside an <a> tag.
 */
export function injectFileLinks(
  text: string,
  contentMap: ContentMapEntry[],
  subject: string,
): string {
  if (!text || !contentMap || contentMap.length === 0) return text;

  // Match Reading + Spelling together when subject is "Reading"
  const subjectFilter = subject === 'Reading'
    ? ['Reading', 'Spelling']
    : [subject];

  const relevant = contentMap.filter(
    (e) => subjectFilter.includes(e.subject) && e.canvas_url,
  );
  if (relevant.length === 0) return text;

  // Sort by lesson_ref length (longest first) to avoid partial matches
  // e.g. "L100" before "L10"
  const sorted = [...relevant].sort(
    (a, b) => b.lesson_ref.length - a.lesson_ref.length,
  );

  let result = text;
  for (const entry of sorted) {
    const ref = entry.lesson_ref;
    // Word-boundary match, case-insensitive, but skip if already linked
    const pattern = new RegExp(
      `(?<!<a[^>]*>[^<]*)\\b${escapeRegex(ref)}\\b(?![^<]*</a>)`,
      'gi',
    );
    result = result.replace(
      pattern,
      `<a href="${entry.canvas_url}" target="_blank" style="color: inherit; text-decoration: underline;">${ref}</a>`,
    );
  }
  return result;
}

/**
 * Wrap the lesson title with a link to the deployed assignment.
 * If text already contains an <a> tag, return as-is.
 */
export function injectAssignmentLink(
  text: string,
  canvasUrl: string | null | undefined,
): string {
  if (!text || !canvasUrl) return text;
  if (text.includes('<a ')) return text;
  return `<a href="${canvasUrl}" target="_blank" style="color: inherit; text-decoration: underline; font-weight: 600;">${text}</a>`;
}
