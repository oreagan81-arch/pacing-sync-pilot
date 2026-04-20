
## Phase 2.3 — Editable hint badges + button audit

### Issue 1: Even/Odd badge not editable
Currently in `DaySubjectCard.tsx`, the Even/Odd badge auto-derives from `cell.lesson_num % 2` and is read-only. Same for "Triple (Test+Fact+SG)" and "Investigation — no HW" hints. User wants to override or clear these.

**Fix**: Add a new optional cell field `hint_override: 'evens' | 'odds' | 'none' | null` (null = auto). Render the badge as a small dropdown/popover trigger:
- Click badge → popover with: `Auto (Evens)`, `Evens`, `Odds`, `None (hide)`.
- When `hint_override='none'`, badge hidden and assignment title generator skips the parity suffix.
- Wire into `assignment-logic.ts` `generateAssignmentTitle` so override drives the title.

Storage: `pacing_rows` already has a flexible JSON area or we add a `hint_override` text column. Will use the existing `notes` field if available, else add column via migration.

### Issue 2: "+ Add resource" button dead
Looking at `ResourceListEditor` in `DaySubjectCard.tsx`:
```tsx
<Button type="button" variant="outline" size="sm" onClick={add} ...>
```
The button itself looks correct. Likely culprit: the `Card` ancestor or a parent `<form>` is intercepting the click, OR `commit()` writes a serialized empty array `[]` which `parseResources` then drops back to `[]` and React doesn't re-render because the serialized string is unchanged.

**Likely root cause**: `serializeResources([{ label: '' }])` may be returning `null`/empty when label is blank, so `onChange` fires with `''` and nothing renders. Need to verify `serializeResources` in `src/types/thales.ts` doesn't filter empty rows.

**Fix**:
1. Read `src/types/thales.ts` to confirm `serializeResources` behavior.
2. Either (a) change `serializeResources` to keep empty-label rows during editing, or (b) seed new rows with placeholder label `'New resource'` so they survive serialization.
3. Add a `console.log` during dev only? No — just fix and verify in preview.

### Issue 3: Button audit across pages
User asked to "check all buttons on all pages to make sure they work". Scope:
- `PacingEntryPage` — Save, Smart Paste, Add resource, Brain chip, type select.
- `AnnouncementCenterPage`, `AssignmentsPage`, `CanvasBrainPage`, `FileOrganizerPage`, `NewsletterPage`, `ContentRegistryPage`, `HealthMonitorPage`, `MemoryPage`, `AutomationPage`, `PageBuilderPage`, `PacingViewerPage`, `SettingsPage`, `DashboardPage`.

Approach: grep for `<Button` with no `onClick` and no `type="submit"` / no `asChild` wrapping a `Link`. Flag dead ones. Fix obvious cases; list rest for follow-up so we don't blow out scope.

### Files to modify
1. `src/types/thales.ts` — fix `serializeResources` to preserve empty-label rows during editing.
2. `src/components/pacing/DaySubjectCard.tsx` — replace Even/Odd badge with editable popover; same for Triple/Investigation hints (toggleable show/hide).
3. `src/lib/assignment-logic.ts` — accept `hintOverride` param in `generateAssignmentTitle` to drive parity.
4. `src/pages/PacingEntryPage.tsx` — pass `hint_override` through cell data + persist on save.
5. `supabase/migrations/` — add `hint_override text` column to `pacing_rows` (nullable).
6. **Audit pass**: open every page file under `src/pages/` and grep for dead buttons; fix or report.

### Verify
- Click "+ Add resource" on a Math card → new empty row appears, can type label, persists on save.
- Click Evens badge on Math Lesson 13 → popover; pick "None" → badge hides, deployed title becomes `SM5: HW — Lesson 13` (no Evens/Odds).
- Audit report listed in chat with status per page; dead buttons fixed in same patch where trivial.
