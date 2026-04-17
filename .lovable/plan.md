
Audit:
- ✅ `canvas-deploy-assignment` already: resolves group by name, computes DST-aware ET 11:59 due_at, content_hash skip (NO_CHANGE), update vs create via stored `canvas_assignment_id`, retries 5xx/429, full deploy_log + notifications
- ✅ `assignment-build.ts` builds payload with course routing (Together Logic), group, points, hash, skipReason
- ✅ `AssignmentsPage.tsx` exists with preview table
- ⚠️ `system_config.assignment_prefixes` currently: `{Math: "SM5:", Reading: "RM4:", Spelling: "RM4:", Language Arts: "ELA4:"}` — has trailing colons. User wants `SM5`, `RM4`, `ELA4` (no colons). Title generator already inserts a space after prefix, so colons render as `"SM5: Test — Lesson 12"`. User spec says `SM5` → output should be `"SM5 Test — Lesson 12"`.
- ⚠️ Need to verify `AssignmentsPage` has working preview-then-deploy flow with batch progress

## Plan: Assignment Deploy Engine Hardening

### 1. Prefix normalization (DB migration)
Update `system_config.assignment_prefixes`:
```
{ Math: "SM5", Reading: "RM4", Spelling: "RM4", "Language Arts": "ELA4" }
```
Strip trailing colons. Title strings will become `"SM5 Test — Lesson 12"`, `"RM4 Spelling Test 8"`, `"ELA4 Classroom Practice 5"`.

### 2. Assignments page review — `src/pages/AssignmentsPage.tsx`
Read file to confirm and tighten:
- **Preview table** shows: Subject, Day, Type, Title, Group, Points, Due (formatted ET via `formatDueET`), Course, Skip Reason, Status badge (PENDING/DEPLOYED/NO_CHANGE/ERROR/SKIP)
- **Filter chips**: only show deployable (skipReason === null), or show all with greyed-out skipped rows
- **Deploy button**: triggers `expandMathRow` + `buildAssignmentForCell` for all subjects/cells in selected week, then sequentially POSTs to `canvas-deploy-assignment` with progress bar
- **Idempotency**: each call passes `rowId` + `contentHash` → edge function skips when unchanged, updates when `canvas_assignment_id` exists, creates otherwise
- **Result toast**: summary like "12 deployed, 4 unchanged, 1 error — see Deploy Log"

### 3. Deploy engine — already correct, verify only
`canvas-deploy-assignment/index.ts`:
- ✅ `toDueAt(dateStr)` produces 23:59 America/New_York with DST-aware offset
- ✅ Group resolved by name to ID
- ✅ Update path: PUT `/assignments/{id}` when `canvas_assignment_id` present
- ✅ Create path: POST `/assignments`
- ✅ Hash skip returns `NO_CHANGE` early
- ✅ Stores `canvas_assignment_id`, `canvas_url`, `content_hash`, `deploy_status`, `last_deployed`

### 4. Math Triple wiring confirmation
Confirm `expandMathRow` is called for every Math row from the build orchestrator (not just `buildAssignmentForCell`). If AssignmentsPage iterates cells directly with `buildAssignmentForCell`, Math Tests won't expand to 3. Route Math through `expandMathRow`, all others through `buildAssignmentForCell`.

### 5. Memory
Update `mem://business-rules/assignment-logic`: prefixes now bare (`SM5`, `RM4`, `ELA4`), no colons.

### Files
1. Migration: update `system_config.assignment_prefixes` (strip colons)
2. `src/pages/AssignmentsPage.tsx` — verify/tighten preview + batch deploy flow, ensure `expandMathRow` for Math
3. `mem://business-rules/assignment-logic` — prefix update note

### Verify
Open Assignments page on a week with: a Math Test row, a Reading Lesson, a Spelling Test, an LA CP, an LA Lesson (should be filtered out). Preview shows 6 deployable rows (Math Test → 3, Reading, Spelling, LA CP) with titles `SM5 Test — Lesson N`, `SM5 Fact Test N`, `SM5 Study Guide — Lesson N`, `RM4 Reading HW N`, `RM4 Spelling Test N`, `ELA4 Classroom Practice N`. Click Deploy → all create on Canvas with due 11:59 PM ET, correct groups, correct courses. Click Deploy again → all report NO_CHANGE. Edit one row's `in_class`, redeploy → that row updates (PUT), others NO_CHANGE.
