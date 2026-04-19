
# Canvas Brain Module — Implementation Plan

## Scope
New module that reads existing Canvas courses (pages, assignments, announcements, files), stores raw snapshots, trains patterns, and surfaces them on `/canvas-brain`. Read-only against Canvas — no deploys, no mutations.

## 1. Database (1 migration)
Two new tables, both with permissive RLS to match existing app pattern:
- `canvas_snapshots` — raw content cache keyed on `(course_id, content_type, canvas_id)` (unique constraint for upsert)
- `canvas_patterns` — derived patterns keyed on `(pattern_type, pattern_key)` (unique constraint)
- Indexes on `course_id`, `content_type`, `pattern_type`
- `set_updated_at` trigger on `canvas_patterns`

## 2. Shared service layer
**`supabase/functions/_shared/canvas-api.ts`** — single Canvas client with:
- Base URL normalization (matches existing pattern)
- `fetchPaginated(path)` — follows Link headers, handles `?per_page=100`
- `fetchWithRetry` — exponential backoff for 429/5xx (mirrors existing `_shared/retry.ts`)
- Typed helpers: `listPages`, `listAssignments`, `listAnnouncements`, `listFiles`

## 3. Edge Functions (6)
Each accepts `{ courseId?: number }` body. If omitted → iterates all `COURSE_IDS` from system_config. All upsert into `canvas_snapshots` on `(course_id, content_type, canvas_id)`.

1. **`canvas-read-pages`** — GET `/courses/{id}/pages` then GET each page body
2. **`canvas-read-assignments`** — GET `/courses/{id}/assignments` (full body included)
3. **`canvas-read-announcements`** — GET `/courses/{id}/discussion_topics?only_announcements=true`
4. **`canvas-read-files`** — GET `/courses/{id}/files`
5. **`canvas-pattern-train`** — reads snapshots, derives:
   - `assignment_naming` per subject (regex extracted from title patterns, e.g. `SM5: L{N}`)
   - `page_section_order` per subject (DesignPLUS h2 sequences)
   - `announcement_opener` / `announcement_closer` per subject
   - `due_day_pattern` per subject+type
   - `file_naming` per subject+type
   - Confidence = `min(100, occurrence_count * 10)`
   - Special rules respected: SM5/ELA4 prefixes, Together Logic (Reading+Spelling shared course), Friday rules (no homework patterns extracted from Friday)
6. **`canvas-sync-nightly`** — invokes the 4 readers + train, in series, logs to `deploy_log`

## 4. Frontend
- **`src/lib/canvas-brain.ts`** — fetch helpers (snapshots/patterns counts, last sync from deploy_log, change detection)
- **`src/hooks/useCanvasBrain.ts`** — React Query hooks: `useSnapshotStats`, `useLearnedPatterns`, `useLastSync`, `useDetectedChanges`, `useSyncNow` (mutation that calls `canvas-sync-nightly`)
- **`src/pages/CanvasBrainPage.tsx`** — 6 dashboard sections per spec; uses existing dark theme tokens, subject color chips, semantic tokens only
- **Route + nav**: register `/canvas-brain` in `App.tsx`; add NavLink to `AppSidebar.tsx`

## 5. Deployment
Edge functions auto-deploy. Cron for nightly sync added via `supabase--insert` (separate from migration since it includes anon key).

## What this does NOT change
- No edits to existing Canvas deploy functions
- No edits to existing pages
- No new business rules — patterns are *observed*, not enforced
- No `system_config` edits — uses existing `course_ids`

## Verify
- `/canvas-brain` renders with 6 sections
- Clicking "Sync Now" triggers all 4 readers + train, then refetches stats
- `canvas_snapshots` populated; `canvas_patterns` shows learned rules with confidence scores
- Existing routes and Canvas deploys unaffected
