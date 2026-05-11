---
name: Thales Pacing Rules (Canonical)
description: Instructional Week numbering, CLT rule, Friday rule, and subject sanitization
type: feature
---

## 1. Instructional Week Logic
- NEVER use standard calendar weeks (e.g., "Week 40").
- ALWAYS use the Instructional Week (`activeWeekNumber`).
- Q4W6 ≡ Instructional Week 33.
- Source of truth: `calculatePacingWeek` in `src/lib/date-utils.ts`.

## 2. CLT Rule
- Detected string: `CLT` → normalized to `CLT Testing`.
- UI: render centered, bold, color `#c51062`.
- Automation: `instructional: false`. Do NOT generate homework/assignments on CLT days for any subject.

## 3. Friday Rule
- Fridays = Assessments + Review only.
- No new instructional material via Zero-Touch deploy on Fridays.
- (See also: friday-rules.ts and three-layer-enforcement.md.)

## 4. Subject Sanitization
- Strip vendor names from subject output: `Saxon Math` → `Math`, etc.
