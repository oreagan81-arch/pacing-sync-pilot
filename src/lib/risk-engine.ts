/**
 * Live risk engine — recalculates on every pacing data change.
 */

export interface RiskResult {
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  issues: string[];
}

export interface RiskRow {
  type: string | null;
  day: string;
  create_assign: boolean;
}

export function evaluateWeekRisk(rows: RiskRow[]): RiskResult {
  const issues: string[] = [];

  const testCount = rows.filter((r) => r.type && r.type.toLowerCase().includes('test')).length;
  const totalPoints = rows.filter((r) => r.create_assign).length * 100;
  const mondayFridayTest = rows.some(
    (r) =>
      r.type &&
      r.type.toLowerCase().includes('test') &&
      (r.day === 'Monday' || r.day === 'Friday')
  );

  let score = 100;

  score -= testCount * 15;
  if (testCount > 3) issues.push(`${testCount} tests this week (max 3)`);

  if (totalPoints > 500) {
    score -= 10;
    issues.push(`${totalPoints} total points (high)`);
  }
  if (totalPoints > 400) {
    score -= 5;
    issues.push(`${totalPoints} total assignment points`);
  }

  if (mondayFridayTest) {
    score -= 20;
    issues.push('Test scheduled on Monday or Friday');
  }

  score = Math.max(0, score);

  let level: RiskResult['level'] = 'LOW';
  if (score < 70 || mondayFridayTest) level = 'HIGH';
  else if (score < 85) level = 'MEDIUM';

  return { score, level, issues };
}
