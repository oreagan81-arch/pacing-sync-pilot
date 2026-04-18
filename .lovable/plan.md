
Audit:
- ✅ `teacher_memory` table exists: category, key, value (jsonb), confidence, usage_count, last_used
- ✅ `teacher_feedback_log` table exists: entity_type, entity_id, action, before/after (jsonb), diff_summary
- ✅ `teacher_patterns` table exists: pattern_type, subject, rule (jsonb), confidence, applied_count
- ⚠️ Nothing writes to these tables yet
- ⚠️ No `/memory` route or page
- ⚠️ No memory-first lookup in any builder (page/assignment/announcement/file)

## Plan: Teacher Memory Layer

### 1. Capture layer — `src/lib/teacher-memory.ts` (new)
Single utility module with:
- `logEdit(entityType, entityId, before, after, action)` — writes to `teacher_feedback_log` with field-level `diff_summary`
- `learnFromEdit(entityType, before, after)` — extracts patterns into `teacher_memory`:
  - **page_title**: `{ category: 'page_title', key: '<subject>:<Q#W#>', value: { template } }`
  - **assignment_name**: `{ category: 'assignment_name', key: '<subject>:<type>', value: { titlePattern } }` — e.g. learns user prefers `SM5 Lesson 78 Test` over `SM5 Test — Lesson 78`
  - **announcement_wording**: `{ category: 'announcement_phrase', key: '<subject>:<type>', value: { opener, closer, signoff } }` — extracts opener/closer text deltas
  - **file_name**: `{ category: 'file_naming', key: '<subject>:<type>', value: { pattern } }`
  - **page_layout**: `{ category: 'page_section_order', key: '<subject>', value: { order: ['banner','reminders','resources','days'] } }`
  - **deploy_habit**: `{ category: 'deploy_timing', key: '<subject>:<dayOfWeek>', value: { hourET } }` — tracks when teacher actually clicks deploy
- Confidence math: increment `usage_count`, raise `confidence` toward 1.0 with each repeat (`new = old + (1-old)*0.3`), decay if reverted

### 2. Lookup layer — `src/lib/memory-resolver.ts` (new)
Universal `resolve(category, key, fallback)`:
1. **Memory first**: query `teacher_memory` by category+key, return if `confidence >= 0.6`
2. **Templates next**: existing builders (e.g. `buildAssignmentTitle`, `buildMathEarlyHtml`)
3. **AI fallback**: only when neither matches

Wire into existing builders (minimal touch, just prepend a resolver call):
- `assignment-build.ts` → `buildAssignmentTitle()` checks memory first
- `canvas-html.ts` → page title + section order check memory
- `AnnouncementCenterPage.tsx` → opener/closer phrases check memory
- `FileOrganizerPage.tsx` → friendly_name suggestion checks memory

### 3. Capture hooks (instrumentation)
Add `logEdit` calls at the actual edit points:
- `AssignmentsPage.tsx` — when row title is manually edited before deploy
- `PageBuilderPage.tsx` — when generated HTML is edited before deploy
- `AnnouncementCenterPage.tsx` — when draft content is edited before post
- `FileOrganizerPage.tsx` — when friendly_name is renamed
- All deploy buttons — log timestamp to derive `deploy_habit`

After `logEdit`, fire-and-forget `learnFromEdit` (no UI block).

### 4. New page — `src/pages/MemoryPage.tsx` + route `/memory`
Five tabs (shadcn `Tabs`):

**Learned Patterns**
- Group `teacher_memory` by category, sortable table: Category | Key | Value preview | Confidence bar | Usage Count | Last Used | [Edit] [Forget]
- Inline edit `value` JSON; "Forget" deletes the row

**Edit History**
- `teacher_feedback_log` table newest first: Date | Entity | Action | Diff Summary | [View Before/After] expandable

**Suggested Patterns**
- Auto-derived from `teacher_patterns` where `confidence >= 0.5` but not yet promoted
- "Promote to Memory" button → copies to `teacher_memory`, "Reject" → deletes

**Deploy Habits**
- Heatmap (day × hour ET) of when teacher actually deploys, learned from `deploy_habit` memories
- Suggested cron schedule

**Stats**
- Total memories | Total edits logged | Top corrected entities | Memory hit rate (resolved-from-memory / total builds — tracked via lightweight counter in localStorage or new `memory_hits` log)

### 5. Sidebar + route
- `App.tsx` add `/memory` route
- `AppSidebar.tsx` add nav entry with `Brain` icon

### 6. Memory file
Create `mem://features/teacher-memory-layer.md` describing capture → resolve flow, table roles, and `Memory > Templates > AI` precedence.

### Files
1. `src/lib/teacher-memory.ts` (new) — capture + learning
2. `src/lib/memory-resolver.ts` (new) — lookup with precedence
3. `src/pages/MemoryPage.tsx` (new) — 5 tabs
4. `src/App.tsx` — route
5. `src/components/AppSidebar.tsx` — nav entry
6. `src/lib/assignment-build.ts` — wire resolver into title build
7. `src/lib/canvas-html.ts` — wire resolver into page title
8. `src/pages/AnnouncementCenterPage.tsx` — wire resolver + logEdit on save
9. `src/pages/AssignmentsPage.tsx` — logEdit on title change + deploy timestamp
10. `src/pages/PageBuilderPage.tsx` — logEdit on HTML edit + deploy timestamp
11. `src/pages/FileOrganizerPage.tsx` — logEdit on rename, resolver on suggestion
12. `mem://features/teacher-memory-layer.md` (new)

### Verify
Open Assignments, edit a Math Test title from `SM5 Test — Lesson 78` to `SM5 L78 Mastery Test`, deploy. Open `/memory` → Edit History shows the diff; Learned Patterns shows new `assignment_name:Math:Test` row at confidence ~0.3. Edit a second Math Test the same way → confidence rises to ~0.5. On the third Math Test, the auto-built title should now use the learned pattern (confidence ≥ 0.6). Same flow for announcement opener changes and file renames.
