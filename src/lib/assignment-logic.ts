/**
 * Pure functions for assignment title generation, group resolution, and content hashing.
 * Used in both table display and deploy payload — must produce identical output.
 */

export function generateAssignmentTitle(
  subject: string,
  type: string,
  lessonNum: string | null,
  prefix: string
): string {
  const num = lessonNum || '';

  switch (subject) {
    case 'Math':
      if (type === 'Test') return `${prefix} Test \u2014 Lesson ${num}`;
      if (type === 'Fact Test') return `${prefix} Fact Test ${num}`;
      if (type === 'Study Guide') return `${prefix} Study Guide \u2014 Lesson ${num}`;
      // Even/Odd
      if (num && parseInt(num) % 2 === 0) return `${prefix} Evens HW \u2014 Lesson ${num}`;
      return `${prefix} Odds HW \u2014 Lesson ${num}`;

    case 'Reading':
      if (type === 'Test') return `${prefix} Mastery Test ${num}`;
      if (type === 'Checkout') return `${prefix} Reading Checkout ${num}`;
      return `${prefix} Reading HW ${num}`;

    case 'Spelling':
      if (type === 'Test') return `${prefix} Spelling Test ${num}`;
      return `${prefix} Spelling ${num}`;

    case 'Language Arts':
      if (type === 'Test') return `${prefix} Shurley Test`;
      return `${prefix} Classroom Practice ${num}`;

    default:
      return `${subject} ${type} ${num}`.trim();
  }
}

export interface AssignmentGroupInfo {
  groupName: string;
  points: number;
  gradingType: string;
  omitFromFinal?: boolean;
}

export function resolveAssignmentGroup(subject: string, type: string): AssignmentGroupInfo {
  switch (subject) {
    case 'Math':
      if (type === 'Test' || type === 'Fact Test')
        return { groupName: 'Written Assessments', points: 100, gradingType: 'points' };
      if (type === 'Study Guide')
        return { groupName: 'Homework/Class Work', points: 0, gradingType: 'pass_fail', omitFromFinal: true };
      return { groupName: 'Homework/Class Work', points: 100, gradingType: 'points' };

    case 'Reading':
      if (type === 'Test')
        return { groupName: 'Assessments', points: 100, gradingType: 'points' };
      if (type === 'Checkout')
        return { groupName: 'Check Out', points: 100, gradingType: 'points' };
      return { groupName: 'Homework', points: 100, gradingType: 'points' };

    case 'Spelling':
      if (type === 'Test')
        return { groupName: 'Assessments', points: 100, gradingType: 'points' };
      return { groupName: 'Homework', points: 100, gradingType: 'points' };

    case 'Language Arts':
      if (type === 'Test')
        return { groupName: 'Assessments', points: 100, gradingType: 'points' };
      return { groupName: 'Classwork/Homework', points: 100, gradingType: 'points' };

    default:
      return { groupName: 'Homework/Class Work', points: 100, gradingType: 'points' };
  }
}

export async function computeContentHash(
  subject: string,
  day: string,
  type: string,
  lessonNum: string,
  inClass: string,
  atHome: string
): Promise<string> {
  const raw = `${subject}|${day}|${type}|${lessonNum}|${inClass}|${atHome}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function applyBrevity(subject: string, lessonNum: string | null, inClass: string): string {
  const FORBIDDEN = ['Saxon Math', 'Reading Mastery', 'Shurley English'];

  switch (subject) {
    case 'Math':
      return `Lesson ${lessonNum || ''}`.trim();
    case 'Reading':
      return `Reading Lesson ${lessonNum || ''}`.trim();
    case 'Language Arts': {
      // Parse for Chapter/Lesson
      const chMatch = inClass?.match(/Chapter\s*(\d+)/i);
      const lesMatch = inClass?.match(/Lesson\s*(\d+)/i);
      if (chMatch && lesMatch) return `Chapter ${chMatch[1]}, Lesson ${lesMatch[1]}`;
      if (lesMatch) return `Lesson ${lesMatch[1]}`;
      let result = inClass || '';
      FORBIDDEN.forEach((f) => (result = result.replace(new RegExp(f, 'gi'), '').trim()));
      return result;
    }
    default: {
      let result = inClass || '';
      FORBIDDEN.forEach((f) => (result = result.replace(new RegExp(f, 'gi'), '').trim()));
      return result;
    }
  }
}

export function getDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export function getDrivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
