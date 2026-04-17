
Audit:
- `assignment-build.ts` already supports `options.type`, `options.titleOverride`, `options.dayOffset`, `options.isSynthetic` — perfect for triple-creating Test/Fact Test/Study Guide
- `assignment-logic.ts` `generateAssignmentTitle` already produces "SM5: Test — Lesson N", "SM5: Fact Test N", "SM5: Study Guide — Lesson N", "SM5: Evens HW — Lesson N", "SM5: Odds HW — Lesson N" ✅
- The Triple Logic expansion is NOT yet implemented in `AssignmentsPage.tsx` — current code likely calls `buildAssignmentForCell` once per row
- `auto_logic.mathTestTriple` flag already true in DB
- `auto_logic.mathEvenOdd` already true; titles already correct via existing logic

## Plan: Math Triple Logic + Even/Odd Confirmation

### 1. Triple expander — `src/lib/assignment-build.ts`
Add `expandMathRow(cell, dayIndex, ctx)` → returns array of `BuiltAssignment`:
- If `subject === 'Math'` AND `cell.isTest === true` (or `cell.type === 'Test'`):
  1. **Written Test** — `type: 'Test'`, due same day
  2. **Fact Test** — `type: 'Fact Test'`, due same day, `isSynthetic: true`
  3. **Study Guide** — `type: 'Study Guide'`, `dayOffset: -1` (due previous day), `isSynthetic: true`, `omitFromFinal: true` (already handled)
- Otherwise → single Math HW assignment (Evens/Odds title already auto-derived from lesson parity)

Edge cases:
- Monday Test → Study Guide would fall on Sunday (dayOffset gives -1 from index 0). Guard: if `dayOffset` results in negative index OR weekend, push to previous Friday (cap at index 0 = Monday of same week, fall back to same day with note)
- For Grade 4 Math, tests typically Wed/Thu/Fri so this rarely triggers — log warning to deploy_log if it does

### 2. Even/Odd HW title — already working
- `generateAssignmentTitle('Math', 'Lesson', '92', 'SM5:')` → `"SM5: Evens HW — Lesson 92"` ✅
- `generateAssignmentTitle('Math', 'Lesson', '91', 'SM5:')` → `"SM5: Odds HW — Lesson 91"` ✅
- No code change needed; just verify in preview

### 3. AssignmentsPage wiring — `src/pages/AssignmentsPage.tsx`
- Where rows are built into preview, replace single `buildAssignmentForCell()` call with `expandMathRow()` for Math rows
- For non-Math subjects, keep single-build path
- Preview table already shows multiple rows per cell since each `BuiltAssignment` has unique `rowKey`

### 4. Memory update
- Update `mem://business-rules/subject-logic` Math section with explicit Triple Logic contract:
  - Test row → 3 deployed items (Written Test, Fact Test, Study Guide -1 day)
  - Lesson row → 1 item, title "Evens HW" or "Odds HW" by lesson parity
- Add Core line: "Math Test rows always deploy as Triple: Written Test + Fact Test + Study Guide (due day-1)"

### Technical details (devs only)
- `expandMathRow` signature: `(subject, dayIndex, cell, ctx) => Promise<BuiltAssignment[]>`
- `dayOffset: -1` semantics: subtracts one weekday in `weekDates[dayIndex - 1]`; if `dayIndex === 0` (Monday Test), Study Guide falls back to Monday with helper note "Study Guide for Monday Test — distribute Friday prior"
- All three items share the same `rowId` for tracking but get distinct `canvas_assignment_id` via `rowKey` suffix (`syn` flag distinguishes synthetic rows in `pacing_rows` mirror)
- DB consideration: synthetic rows (Fact Test, Study Guide) need their own `pacing_rows` entry OR be tracked in a sibling table. Simpler: store on parent row's `metadata` JSONB — but `pacing_rows` has no metadata column. Cleanest: insert synthetic siblings into `pacing_rows` with `subject='Math'`, distinct `lesson_num` suffix (`92-FT`, `92-SG`), and a new boolean `is_synthetic` column

### 5. DB migration — synthetic row tracking
- Add nullable `is_synthetic boolean default false` and `parent_row_id uuid` to `pacing_rows`
- Allows Triple Logic deployments to track all 3 Canvas IDs independently
- Update `enforce_friday_rules` trigger to leave synthetic rows alone (Tests can be Friday)

### Out of scope
- Math Quiz, Mid-chapter checkpoint (not in current row types)
- Cross-week Study Guide (Monday Test edge case handled with same-day fallback)

### Order
1. `pacing_rows` migration: `is_synthetic`, `parent_row_id`
2. `expandMathRow()` in `assignment-build.ts`
3. `AssignmentsPage.tsx` wiring + preview table label ("Synthetic" badge for Fact Test/Study Guide)
4. Memory updates

After build: verify by adding a Math Test row in Pacing Entry, opening Assignments page, and confirming 3 deployable rows appear in preview with correct titles, due dates, and groups.
