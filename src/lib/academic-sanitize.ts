/**
 * Academic input sanitization for Thales pacing data.
 * - Normalizes "CLT" → "CLT Testing" (see pacing-rules canonical memory).
 * - Strips vendor names from subject strings (e.g., "Saxon Math" → "Math").
 * - Determines whether a day status is instructional.
 */

const VENDOR_NAMES = ['Saxon', 'Shurley', 'SRA', 'Open Court'] as const;

const NON_INSTRUCTIONAL_STATUSES = [
  'Holiday',
  'Track Out',
  'Teacher Workday',
  'CLT Testing',
] as const;

export function sanitizeAcademicInput(input: string): string {
  if (!input) return '';
  let sanitized = input.trim();

  // CLT → CLT Testing
  if (sanitized.toUpperCase() === 'CLT') {
    return 'CLT Testing';
  }

  // Strip vendor names
  for (const vendor of VENDOR_NAMES) {
    const regex = new RegExp(vendor, 'gi');
    sanitized = sanitized.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
  }

  return sanitized;
}

export function isInstructionalDay(status: string): boolean {
  return !NON_INSTRUCTIONAL_STATUSES.includes(status as typeof NON_INSTRUCTIONAL_STATUSES[number]);
}
