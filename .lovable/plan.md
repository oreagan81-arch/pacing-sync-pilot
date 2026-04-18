
The user is asking for a consolidated summary deliverable of everything built across this session: Content Registry, Teacher Memory Layer, Zero-Touch Automation, and the Front-Page Publish Guard. This is a documentation/inventory request, not new code.

I'll present a concise inventory grouped by their requested categories, referencing the actual files that exist in the project.

## Deliverable: Production Inventory

### 1. Updated Files
- `src/App.tsx` — routes for `/content-registry`, `/memory`, `/automation`
- `src/components/AppSidebar.tsx` — nav entries (Library, Brain, Zap icons)
- `src/lib/assignment-build.ts` — memory resolver wired into title build
- `src/pages/AnnouncementCenterPage.tsx` — `logEdit` on draft save
- `src/pages/AssignmentsPage.tsx` — `logEdit` on title change + deploy timestamp
- `src/pages/PageBuilderPage.tsx` — `logEdit` on HTML edit + deploy timestamp
- `src/pages/FileOrganizerPage.tsx` — `logEdit` on rename, resolver on suggestion
- `supabase/functions/canvas-deploy-page/index.ts` — front-page publish guard, hash-skip GET, `assertFrontPagePublished` helper, REPAIRED logging
- `.lovable/memory/index.md` — registry for new memory files

### 2. New Files
**Libraries**
- `src/lib/teacher-memory.ts` — `logEdit`, `learnFromEdit`, `logDeployHabit`
- `src/lib/memory-resolver.ts` — Memory > Templates > AI precedence

**Pages**
- `src/pages/ContentRegistryPage.tsx` — 5-tab registry (Sync, Map, Missing, Rename, Health)
- `src/pages/MemoryPage.tsx` — 5-tab memory dashboard
- `src/pages/AutomationPage.tsx` — jobs, failures, run-now controls

**Memory docs**
- `.lovable/memory/features/teacher-memory-layer.md`
- `.lovable/memory/features/zero-touch-automation.md`
- `.lovable/memory/db/content-map-registry.md`

### 3. SQL Migrations (already applied)
- `pg_cron` schedules:
  - `automation-friday-deploy` — `0 21 * * 5` (Fri 4 PM ET)
  - `automation-nightly` — `0 7 * * *` (2 AM ET)
  - `automation-daily-summary` — `30 11 * * *` (6:30 AM ET)
  - `friday-publish` — existing
- Seeded `automation_jobs` rows for the four jobs (job_name, schedule, enabled=true)
- Tables relied on (pre-existing): `content_map`, `files`, `teacher_memory`, `teacher_feedback_log`, `teacher_patterns`, `automation_jobs`, `system_health_snapshots`, `deploy_notifications`, `deploy_log`

### 4. Edge Functions
**New**
- `supabase/functions/_shared/retry.ts` — `runWithRetry` (3 attempts, backoff `[2s, 8s, 30s]`, error logging + notification)
- `supabase/functions/automation-friday-deploy/index.ts` — next-week deploy orchestrator
- `supabase/functions/automation-nightly/index.ts` — files sync + mapping repair + memory train + health snapshot
- `supabase/functions/automation-daily-summary/index.ts` — 6:30 AM teacher briefing

**Hardened**
- `supabase/functions/canvas-deploy-page/index.ts` — front-page guard on hash-skip and body-compare branches

**Pre-existing, untouched**
- `canvas-deploy-assignment`, `canvas-files-sync`, `canvas-file-rename`, `canvas-post-announcement`, `canvas-deployer`, `file-classify`, `file-vision-classify`, `friday-publish`, `gas-dispatch`, `newsletter-extract`, `pacing-parse`, `sheets-import`

### 5. React Components / Pages
- `ContentRegistryPage` — Sync | Content Map | Missing Files | Rename Queue | Registry Health
- `MemoryPage` — Learned Patterns | Edit History | Suggested Patterns | Deploy Habits | Stats
- `AutomationPage` — Active Jobs | Run Now | Recent Failures | Activity Timeline

### 6. Integration Notes
- **Memory precedence**: every builder calls `resolve(category, key, fallback)` from `memory-resolver.ts`. Memory wins at confidence ≥ 0.6, otherwise fallback to template, then AI.
- **Confidence math**: `new = old + (1 - old) * 0.3` per repeated edit; usage_count incremented; reverts decay.
- **Retry contract**: every cron-invoked edge function wraps its body in `runWithRetry({ jobName })`. On final failure: `automation_jobs.status='error'` + `deploy_notifications` (level=error) + `deploy_log` (status=ERROR).
- **Front-page guard**: every code path touching a Canvas page must `GET` first; if `front_page === true` and `published === false`, fire repair `PUT { wiki_page: { front_page: true, published: true } }` and log `REPAIRED`.
- **Cron timing**: ET conversions assume EDT (UTC−4). EST (UTC−5) shifts each job 1h later in local time; acceptable.
- **Realtime**: `useRealtimeDeploy` subscribes to `deploy_notifications` so cron-driven toasts appear without page reload.
- **Friday rules**: `enforce_friday_rules` DB trigger remains the source of truth; `automation-friday-deploy` honors it because it goes through the same `canvas-deploy-assignment` path.
- **Idempotency**: page deploys use SHA-256 content hash skip; assignment deploys compare body fields; both safe to re-run.
- **Secrets in use**: `CANVAS_API_TOKEN`, `CANVAS_BASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `LOVABLE_API_KEY`. All present.

No further build work in this turn — this is the inventory of what is already in production.
