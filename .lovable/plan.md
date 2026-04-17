
Audit:
- `auto_logic.historyScienceNoAssign: true` already set in DB
- `assignment-build.ts` already skips History/Science via this flag — already enforced ✅
- No "active subject" tracking exists; need to add per-week toggle
- `canvas-html.ts` has no redirect-page variant
- Page Builder deploys both H+S separately today

## Plan: History/Science Mutual Redirect

### 1. DB — track active subject per week
Migration: add `active_hs_subject text` to `weeks` (values: `'History'` | `'Science'` | null). Single column on `weeks` (already per-week scoped).

### 2. New HTML generator — `src/lib/canvas-html.ts`
Add `generateRedirectPageHtml({ thisSubject, activeSubject, weekNum, quarter, dateRange, quarterColor })`:
- Banner: "{thisSubject} — Weekly Agenda"
- Single block with the exact text:
  > We are currently in {activeSubject}.
  > Please visit the {activeSubject} Canvas course for this week's agenda.
- Linkify "{activeSubject} Canvas course" → `https://thalesacademy.instructure.com/courses/{COURSE_IDS[activeSubject]}`

### 3. Assignment build — confirm
`buildAssignmentForCell` already returns `skipReason='${subject} — no assignments'` for both. No change needed; rule is now mandatory (not gated by flag) — harden by removing dependency on `auto.historyScienceNoAssign` flag and always skip H+S.

### 4. Page Builder — `src/pages/PageBuilderPage.tsx`
When deploying History or Science page:
- Read `weeks.active_hs_subject` for the selected week
- If active subject is the OTHER one → call `generateRedirectPageHtml` instead of `generateCanvasPageHtml`
- If `active_hs_subject` is null → deploy normally (both get full pages, current behavior)

### 5. Pacing Entry UI — `src/pages/PacingEntryPage.tsx`
Add a small "Active H/S Subject" toggle near the week header: `History` | `Science` | `Both` (null). Persists to `weeks.active_hs_subject`. Show inline note: "The other subject's Canvas page will show a redirect."

### 6. Memory
- Update `mem://business-rules/subject-logic` H+S section with redirect contract + exact redirect copy
- Add Core line: "History/Science: never create assignments. Per-week active subject toggle; inactive subject's page deploys a redirect to the active one."

### Order
1. DB migration: `weeks.active_hs_subject`
2. `generateRedirectPageHtml` in `canvas-html.ts`
3. `assignment-build.ts` harden (remove flag dependency)
4. `PageBuilderPage.tsx` redirect routing
5. `PacingEntryPage.tsx` toggle UI
6. Memory updates

After build: verify by setting active subject = Science on a week, deploying both H + S pages, and confirming History Canvas page shows the redirect text linking to course 21970, while Science page renders normally.
