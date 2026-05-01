/**
 * THALES OS — usePageBuilder
 *
 * Helper hook + pure utilities that the Page Builder screen uses to merge
 * pacing rows for the Reading + Spelling shared agenda page.
 *
 * MERGE CONTRACT (do NOT regress):
 *   - Reading and Spelling rows for the same day are NEVER overwritten.
 *   - Their lesson text is concatenated with a literal `<br/>` between them
 *     so specific strings like "Lesson 102" are preserved verbatim on the
 *     deployed Canvas page.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  filterTogetherPageRows,
  isTogetherSubject,
  TOGETHER_PAGE_OWNER,
} from '@/lib/together-logic';
import { callEdge } from '@/lib/edge';

export interface MergeableRow {
  day: string;
  subject: string;
  in_class: string | null;
  at_home: string | null;
  lesson_num: string | null;
  type: string | null;
  resources: string | null;
  canvas_url: string | null;
  canvas_assignment_id: string | null;
  object_id: string | null;
}

/** Concatenate two cell strings with `<br/>` — never overwrites either side. */
export function concatWithBr(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const left = (a ?? '').trim();
  const right = (b ?? '').trim();
  if (left && right) return `${left}<br/>${right}`;
  return left || right || null;
}

/**
 * Merge Reading + Spelling rows for the same day into a single row whose
 * `in_class` and `at_home` fields are concatenated with `<br/>`. Reading
 * is the canonical owner — its metadata (canvas_url, type) wins on conflict
 * so the shared page stays linked to the Reading course.
 */
export function mergeReadingSpellingRows<T extends MergeableRow>(rows: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    if (!isTogetherSubject(r.subject)) continue;
    const list = buckets.get(r.day) ?? [];
    list.push(r);
    buckets.set(r.day, list);
  }

  const merged: T[] = [];
  // Pass-through rows for any non-Together subjects.
  for (const r of rows) {
    if (!isTogetherSubject(r.subject)) merged.push(r);
  }

  for (const [, dayRows] of buckets) {
    if (dayRows.length === 0) continue;
    if (dayRows.length === 1) {
      merged.push(dayRows[0]);
      continue;
    }
    // Reading row leads; Spelling content appended via <br/>.
    const reading =
      dayRows.find((r) => r.subject === TOGETHER_PAGE_OWNER) ?? dayRows[0];
    const others = dayRows.filter((r) => r !== reading);

    const inClass = others.reduce<string | null>(
      (acc, r) => concatWithBr(acc, r.in_class),
      reading.in_class,
    );
    const atHome = others.reduce<string | null>(
      (acc, r) => concatWithBr(acc, r.at_home),
      reading.at_home,
    );
    merged.push({ ...reading, in_class: inClass, at_home: atHome });
  }
  return merged;
}

/**
 * Hook variant — memoizes the merged rows for the active subject.
 * For the Reading tab it merges Reading + Spelling using `<br/>`.
 */
export function usePageBuilder<T extends MergeableRow>(
  rows: T[],
  activeSubject: string,
) {
  return useMemo(() => {
    const filtered = filterTogetherPageRows(rows, activeSubject);
    if (activeSubject === TOGETHER_PAGE_OWNER) {
      return mergeReadingSpellingRows(filtered);
    }
    return filtered;
  }, [rows, activeSubject]);
}

/**
 * AI agenda enrichment — generates a 2-3 sentence parent-friendly preview
 * of the week's lessons using Gemini. Returns `''` while loading or on error.
 *
 * Pass the resulting `aiSummary` into `generateCanvasPageHtml(...)` so the
 * Canvas page renders the italic blue-bordered summary block under the banner.
 */
export function useAgendaSummary(
  subject: string,
  weekLabel: string | undefined,
  rows: MergeableRow[],
): { aiSummary: string; loading: boolean } {
  const [aiSummary, setAiSummary] = useState('');
  const [loading, setLoading] = useState(false);

  // Stable signature so we only refetch when meaningful content changes.
  const signature = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => (r.in_class ?? '').trim())
          .map((r) => [r.day, r.type, r.lesson_num, r.in_class]),
      ),
    [rows],
  );

  useEffect(() => {
    let cancelled = false;
    if (!subject || !rows.length) {
      setAiSummary('');
      return;
    }
    setLoading(true);
    const lite = rows.map((r) => ({
      day: r.day,
      type: r.type,
      lesson_num: r.lesson_num,
      in_class: r.in_class,
      at_home: r.at_home,
    }));
    callEdge<{ summary: string }>('page-ai-summary', {
      subject,
      weekLabel,
      rows: lite,
    })
      .then((res) => {
        if (!cancelled) setAiSummary(res?.summary ?? '');
      })
      .catch(() => {
        if (!cancelled) setAiSummary('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, weekLabel, signature]);

  return { aiSummary, loading };
}
