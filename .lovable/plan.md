
## Phase 2.2 — Math "Investigation" lesson type

### Current state
- Math `availableTypes` (in `PacingEntryPage.tsx`) likely: `Lesson`, `Test`, `Fact Test`, `Study Guide`, `Review`, `-/No Class`.
- Even/odd HW logic in `assignment-logic.ts`: any non-Test/non-Fact-Test/non-Study-Guide Math row → `Evens HW` or `Odds HW` based on `lessonNum % 2`.
- Resource auto-fill: matches `L{n}`, `Lesson {n}`, `SG{n}`, `Test {n}`.

### What changes

**1. Add "Investigation" to Math type dropdown**
- File: `src/pages/PacingEntryPage.tsx` (Math `availableTypes` array). Insert `'Investigation'`.

**2. Suppress assignment creation for Investigations**
- File: `src/components/pacing/DaySubjectCard.tsx` — extend `assignDisabled` to include `subject === 'Math' && type === 'Investigation'`. Hide even/odd badge and "Will deploy" preview for Investigations.
- File: `src/lib/assignment-logic.ts` — add early return in `generateAssignmentTitle` / skip in deploy path so Investigations never produce an HW assignment. Also drop the Even/Odd hint badge in the card.

**3. Auto-attach default resources**
On type change to `Investigation` with a lesson_num, auto-populate `cell.resources` (only if currently empty) with three rows:
```
[Investigation {n} Student Book] [url? from content_map: lesson_ref="INV{n}" or "Investigation {n}"]
[Study Guide {n} (Blank)]        [url? from content_map: lesson_ref="SG{n}-blank" fallback "SG{n}"]
[Study Guide {n} (Completed)]    [url? from content_map: lesson_ref="SG{n}-completed" fallback "SG{n}"]
```
Implementation: in `DaySubjectCard.tsx` `onChange` handler, when `field === 'type'` becomes `Investigation` (or `lesson_num` changes while type is Investigation) and resources is empty, seed defaults via `serializeResources`. Use `contentMap` lookup to fill URLs where possible.

**4. Study Guide assignment IF Investigation = day before Test**
- New helper in `src/lib/assignment-logic.ts`: `isInvestigationBeforeTest(week, day, subject, rows)` — scans the same week's Math rows; returns true when the next school day is a Math `Test`.
- In the card, when conditions met, show a small "Pre-Test SG will deploy" hint and allow `create_assign` (defaulted ON for Study Guide only, not for the Investigation row itself).
- Actual deployment: the existing Math Triple Logic already creates a Study Guide for every Test (due day-1, omit_from_final). Verify in `assignment-build.ts` / friday-deploy that this still fires when the day-1 row is now an Investigation rather than a regular Lesson — no code change should be needed since the Triple is keyed off the Test row, not the day-before row. Add a comment confirming this.

**5. Resource auto-link patterns**
Extend the lesson-ref match list in `DaySubjectCard.tsx` (resources useMemo) to include `INV{n}` and `Investigation {n}` so any `content_map` rows with those refs surface as badges.

### Files to modify
1. `src/pages/PacingEntryPage.tsx` — add `'Investigation'` to Math types.
2. `src/components/pacing/DaySubjectCard.tsx` — disable assignment for Investigation, seed default resources on type select, extend resource matching, drop even/odd badge for Investigation.
3. `src/lib/assignment-logic.ts` — short-circuit Investigation in title/group resolvers; add `isInvestigationBeforeTest` helper (used for UI hint only).
4. `.lovable/memory/business-rules/subject-logic.md` — document Investigation rule (no HW, default 3 resources, SG ride-along on day-before-Test via existing Triple).

### Out of scope
- Changing `assignment-build.ts` Triple Logic — already handles SG via the Test row, so day-before-Investigation is automatically covered.
- Adding new `content_map` entries for INV student books — user can add manually; auto-link will pick them up once present.

### Verify
- Open /pacing → Math row → type dropdown shows "Investigation".
- Pick `Investigation`, lesson `10` → 3 resource rows auto-fill, "Will deploy" panel disappears, Even/Odd badge hidden, Create Assignment hidden/disabled.
- Set Tuesday Math = Investigation 10, Wednesday Math = Test 10 → deploy still produces SM5 Test/Fact Test/Study Guide for Wednesday (Triple intact); no Tuesday HW.
- `content_map` entry with `lesson_ref="INV10"` shows as auto-detected badge on the Investigation card.
