/**
 * Academic input sanitization for Thales pacing data.
 * - Normalizes "CLT" → "CLT Testing" (CLT Protocol).
 * - Strips curriculum vendor brands (Brevity Mandate).
 * - Determines whether a day status is instructional.
 * - Formats subject labels for consistent UI display.
 */

const VENDOR_BRANDS = ['Saxon', 'Shurley', 'SRA', 'Open Court'] as const;

const NON_INSTRUCTIONAL_STATUSES = [
  'CLT Testing',
  'Holiday',
  'Track Out',
  'Teacher Workday',
  'Non-Instructional',
] as const;

const SUBJECT_LABEL_MAP: Record<string, string> = {
  math: 'Math',
  reading: 'Reading',
  ela: 'ELA',
  'language arts': 'ELA',
  science: 'Science',
  history: 'History',
  spelling: 'Spelling',
};

/** Normalize input strings per Thales Academic OS standards. */
export function sanitizeAcademicInput(input: string): string {
  if (!input) return '';
  let sanitized = input.trim();

  // CLT Protocol
  if (sanitized.toUpperCase() === 'CLT') {
    return 'CLT Testing';
  }

  // Brevity Mandate — strip vendor brand names only
  for (const brand of VENDOR_BRANDS) {
    const regex = new RegExp(brand, 'gi');
    sanitized = sanitized.replace(regex, '');
  }
  return sanitized.replace(/\s{2,}/g, ' ').trim();
}

/** True if the day status permits assignment/homework generation. */
export function isInstructionalDay(status: string): boolean {
  return !NON_INSTRUCTIONAL_STATUSES.includes(
    status as typeof NON_INSTRUCTIONAL_STATUSES[number],
  );
}

/** Format subject labels for UI display. */
export function formatSubjectLabel(subject: string): string {
  if (!subject) return '';
  return SUBJECT_LABEL_MAP[subject.toLowerCase()] || subject;
}
