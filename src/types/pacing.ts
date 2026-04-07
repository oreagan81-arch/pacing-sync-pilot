export interface PacingRow {
  id: string;
  week: number;
  date: string;
  day: string;
  subject: string;
  lesson_num: number | null;
  lesson_title: string;
  type: string;
  create_assign: boolean;
  create_announce: boolean;
  sync_cal: boolean;
  resource_pdf: string | null;
  assignment_title: string | null;
  assignment_group: string | null;
  points: number | null;
  grading_type: string | null;
  due_date_time: string | null;
  flags: string | null;
  risk_tag: 'low' | 'medium' | 'high' | null;
  object_id: string | null;
  hash: string | null;
  last_modified: string;
  source: string | null;
  deployed_status: 'pending' | 'deployed' | 'failed' | 'skipped';
}

export type Subject = 'Math' | 'LA' | 'Reading' | 'Spelling' | 'History' | 'Science' | 'Homeroom';

export const COURSE_IDS: Record<string, number> = {
  Math: 21957,
  LA: 21944,
  Reading: 21919,
  Spelling: 21919,
  History: 21934,
  Science: 21970,
  Homeroom: 22254,
};

export const TOGETHER_SUBJECTS = ['Reading', 'Spelling'] as const;

export interface RiskAssessment {
  score: number;
  issues: string[];
  level: 'low' | 'medium' | 'high';
}

export interface DeployResult {
  success: boolean;
  objectId?: string;
  error?: string;
  subject: string;
  type: string;
}
