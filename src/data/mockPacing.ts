import type { PacingRow, RiskAssessment } from "@/types/pacing";

export const MOCK_PACING_DATA: PacingRow[] = [
  {
    id: "1",
    week: 18,
    date: "2025-01-13",
    day: "Monday",
    subject: "Math",
    lesson_num: 78,
    lesson_title: "Lesson 78",
    type: "Lesson",
    create_assign: true,
    create_announce: false,
    sync_cal: true,
    resource_pdf: "math_lesson_78.pdf",
    assignment_title: "Math Lesson 78 Odds",
    assignment_group: "Homework/Class Work",
    points: 100,
    grading_type: "points",
    due_date_time: "2025-01-14T08:00:00Z",
    flags: null,
    risk_tag: "low",
    object_id: null,
    hash: "a1b2c3",
    last_modified: "2025-01-10T10:00:00Z",
    source: "PacingGuide",
    deployed_status: "pending",
  },
  {
    id: "2",
    week: 18,
    date: "2025-01-13",
    day: "Monday",
    subject: "Reading",
    lesson_num: 36,
    lesson_title: "Lesson 36",
    type: "Lesson",
    create_assign: true,
    create_announce: false,
    sync_cal: true,
    resource_pdf: "reading_36.pdf",
    assignment_title: "Reading Lesson 36",
    assignment_group: "Homework/Class Work",
    points: 100,
    grading_type: "points",
    due_date_time: "2025-01-14T08:00:00Z",
    flags: "together",
    risk_tag: "low",
    object_id: null,
    hash: "d4e5f6",
    last_modified: "2025-01-10T10:00:00Z",
    source: "PacingGuide",
    deployed_status: "deployed",
  },
  {
    id: "3",
    week: 18,
    date: "2025-01-15",
    day: "Wednesday",
    subject: "Math",
    lesson_num: 80,
    lesson_title: "Lesson 80",
    type: "Test",
    create_assign: true,
    create_announce: true,
    sync_cal: true,
    resource_pdf: "math_test_80.pdf",
    assignment_title: "Math Test 80",
    assignment_group: "Assessments",
    points: 100,
    grading_type: "points",
    due_date_time: "2025-01-15T14:00:00Z",
    flags: "test_reminder",
    risk_tag: "medium",
    object_id: "canvas_12345",
    hash: "g7h8i9",
    last_modified: "2025-01-10T10:00:00Z",
    source: "PacingGuide",
    deployed_status: "pending",
  },
  {
    id: "4",
    week: 18,
    date: "2025-01-14",
    day: "Tuesday",
    subject: "History",
    lesson_num: 18,
    lesson_title: "Lesson 18",
    type: "Lesson",
    create_assign: true,
    create_announce: false,
    sync_cal: false,
    resource_pdf: null,
    assignment_title: "History Ch 18 Questions",
    assignment_group: "Homework/Class Work",
    points: 100,
    grading_type: "points",
    due_date_time: "2025-01-15T08:00:00Z",
    flags: null,
    risk_tag: null,
    object_id: null,
    hash: "j0k1l2",
    last_modified: "2025-01-10T10:00:00Z",
    source: "PacingGuide",
    deployed_status: "failed",
  },
  {
    id: "5",
    week: 18,
    date: "2025-01-17",
    day: "Friday",
    subject: "Spelling",
    lesson_num: 18,
    lesson_title: "Lesson 18",
    type: "Test",
    create_assign: true,
    create_announce: true,
    sync_cal: true,
    resource_pdf: "spelling_test_18.pdf",
    assignment_title: "Spelling Test 18",
    assignment_group: "Assessments",
    points: 100,
    grading_type: "points",
    due_date_time: "2025-01-17T14:00:00Z",
    flags: "together,words_21_25",
    risk_tag: "high",
    object_id: null,
    hash: "m3n4o5",
    last_modified: "2025-01-10T10:00:00Z",
    source: "PacingGuide",
    deployed_status: "skipped",
  },
];

export function evaluateRisk(rows: PacingRow[]): RiskAssessment {
  const issues: string[] = [];
  let score = 0;

  const tests = rows.filter((r) => r.type === "Test");
  if (tests.length > 3) {
    score += 30;
    issues.push(`${tests.length} tests this week (max recommended: 3)`);
  }

  const totalPoints = rows.reduce((sum, r) => sum + (r.points || 0), 0);
  if (totalPoints > 400) {
    score += 25;
    issues.push(`${totalPoints} total grading points (max recommended: 400)`);
  }

  const undeployed = rows.filter((r) => r.deployed_status === "pending").length;
  if (undeployed > 5) {
    score += 15;
    issues.push(`${undeployed} items pending deployment`);
  }

  const failed = rows.filter((r) => r.deployed_status === "failed").length;
  if (failed > 0) {
    score += 20;
    issues.push(`${failed} items have failed deployment`);
  }

  return {
    score,
    issues,
    level: score >= 40 ? "high" : score >= 20 ? "medium" : "low",
  };
}
