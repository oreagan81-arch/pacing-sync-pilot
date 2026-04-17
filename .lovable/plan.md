
Audit:
- `pacing_rows` already separates Reading + Spelling subjects (good — DB layer already correct)
- `canvas-html.ts` `generateCanvasPageHtml` already accepts merged `rows` and groups by `day`, with extra-row handling for "Reading tab merges Reading + Spelling" — partial support exists
- `PageBuilderPage` likely deploys per-subject; needs Together Logic to merge Reading+Spelling rows into ONE page deployed to course 21919
- `canvas-post-announcement` exists; needs Reading-test phrase injection + Spelling test rules
- `assignment-build.ts` already routes Spelling → 21919 via `getCourseId('Spelling')` — assignments stay separate ✅
- `system_config.spelling_word_bank` JSONB exists — source of truth for Spelling word lists
- No current logic for "Spelling Test N covers 1..N×5, focus 21–25"

## Plan: Reading+Spelling Together Logic

### 1. Together Logic helper — `src/lib/together-logic.ts` (new)
- `TOGETHER_SUBJECTS = ['Reading', 'Spelling']`
- `mergePacingRowsForPage(rows)` → groups Reading + Spelling rows by day, returns combined array tagged with both `subject` values; `generateCanvasPageHtml` already handles `extraRows` per day, so this is just the grouping pass
- `isTogetherSubject(subject)` and `getTogetherPageSubject()` → returns `'Reading'` (the canonical page owner)
- `expandSpellingTest(testNum, wordBank)` → returns `{ coveredRange: '1–N×5', focusWords: bank[21..25], allWords: bank[1..N×5] }`

### 2. PageBuilder rebuild for Together Logic
- In `PageBuilderPage.tsx` (and any deploy loop), when iterating subjects:
  - Skip `Spelling` as a standalone page
  - When building `Reading` page, fetch `Spelling` rows for the same week and merge via `mergePacingRowsForPage`
  - Page title stays `"Reading"` but daily blocks render Reading lesson + Spelling practice on the same day
- Course id resolved via `getCourseId('Reading')` → 21919 (already correct)
- `canvas-html.ts` daily block already supports extra rows; verify the Spelling row appears as a second `<p>` under "In Class" with its own auto-linked content

### 3. Announcement engine — Reading test phrases + Spelling rules
- `supabase/functions/canvas-post-announcement/index.ts`:
  - When `subject === 'Reading'` AND `type === 'Test'` → auto-inject required phrases:
    > "Students will be assessed on **tracking and tapping** and reading at **100 words per minute**."
  - When `subject === 'Spelling'` AND `type === 'Test'`:
    - Compute `coveredRange = 1..N×5`
    - Pull word list from `system_config.spelling_word_bank[testNum]`
    - Render: "Spelling Test N covers Lessons 1–{N×5}. Focus words: {21–25 list}. Full word list: {all words}."
  - Together Logic: a single weekly announcement covers both — emit ONE post to course 21919 combining Reading + Spelling test info when both present
- New helper `src/lib/announcement-templates.ts` to keep template strings versioned + testable

### 4. Assignments stay separate (no change needed)
- `assignment-build.ts` already creates separate Reading + Spelling assignments, both routed to course 21919 — confirmed working ✅
- Add a doc comment near `resolveCourseId()` reaffirming: separate assignments, shared course

### 5. Memory updates
- Update `mem://integrations/canvas/routing-logic` with the explicit Together Logic rules
- Add `mem://business-rules/together-logic` (new) — the merge contract: shared page + announcement, separate assignments, course 21919
- Update `mem://business-rules/subject-logic` Spelling section with Test N = 1..N×5, focus 21–25 formula

### Technical details (devs only)
- Spelling Test N word range: `Math.min(testNum * 5, totalLessons)`; bank is `Record<string, string[]>` keyed by lesson number
- Reading test phrases live in `system_config.auto_logic.readingTestPhrases` already — read from there, don't hardcode strings
- Page deploy guard: in PageBuilder loop, `if (subject === 'Spelling') continue;`
- Announcement merge: query weekly tests for Reading + Spelling together; if both `Test` rows present, render combined body in one POST

### Out of scope
- Multi-grade Together Logic (Owen is single-user, Grade 4 only)
- Editing the underlying merged storage (Reading + Spelling stay as separate pacing_rows)

### Order
1. `together-logic.ts` helper + Spelling test expander
2. `announcement-templates.ts` + edge function upgrade
3. `PageBuilderPage` rewire to skip Spelling and merge with Reading
4. Memory updates

After build: verify by opening Page Builder, picking a current week, and confirming only one "Reading" page appears (with Spelling lessons merged into daily blocks), and the Reading announcement includes both phrases + Spelling word list when applicable.
