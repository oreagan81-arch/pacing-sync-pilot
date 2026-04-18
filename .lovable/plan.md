
Audit:
- ✅ `friday-publish` edge fn exists (posts scheduled draft announcements)
- ✅ `automation_jobs` table exists (job_name, schedule, status, last_run, next_run, last_result, retry_count, enabled)
- ✅ `canvas-deploy-page`, `canvas-deploy-assignment`, `canvas-files-sync` all exist + idempotent
- ✅ `system_health_snapshots` table exists
- ✅ `deploy_notifications` table exists (realtime toasts via `useRealtimeDeploy`)
- ✅ Memory layer: `teacher-memory.ts` `learnFromEdit`
- ⚠️ No orchestrator — each job needs its own runner edge fn + cron
- ⚠️ No retry-with-backoff wrapper
- ⚠️ No "next week deploy" function (only single-page/single-assignment exist)
- ⚠️ No Automation page to view/toggle jobs
- ⚠️ No daily teacher summary

## Plan: Zero-Touch Automation

### 1. New shared util — `supabase/functions/_shared/retry.ts`
`runWithRetry(fn, { jobName, maxRetries: 3, backoffMs: [2s, 8s, 30s] })`:
- Try → on error wait backoff → retry
- After 3 fails: insert `deploy_notifications` (level=error) + `deploy_log` (status=ERROR) + update `automation_jobs.last_result`
- On success: update `automation_jobs.status='idle'`, `last_run`, clear `retry_count`

### 2. New edge fn — `automation-friday-deploy` (Friday 4 PM ET)
Identifies "next week" = current week_id + 1 (by `quarter`+`week_num`).
For each subject in next week:
- Build & deploy page via `canvas-deploy-page` (idempotent — NO_CHANGE skip)
- Build & deploy each assignment via `canvas-deploy-assignment`
- Generate announcements via existing `handleAutoGenerate` logic ported server-side → insert `announcements` rows with `scheduled_post` per template (Friday 4PM, Wed 4PM, etc.)
Wraps each subject in `runWithRetry`.

### 3. New edge fn — `automation-nightly` (daily 2 AM ET)
Sequential:
1. `canvas-files-sync` (existing)
2. **Repair mappings**: scan `content_map` rows where `auto_linked=true` but Canvas file 404s → mark `auto_linked=false`, log
3. **Train memory**: aggregate last 24h `teacher_feedback_log` rows → call `learnFromEdit` server-side → bump `teacher_memory.confidence`
4. **Health check**: count orphans, failed deploys, pending assignments → insert `system_health_snapshots` row with score 0–100; if score <70 → `deploy_notifications` warning

### 4. New edge fn — `automation-daily-summary` (daily 6:30 AM ET)
Reads:
- Today's pacing rows (subjects, lesson nums, tests)
- Pending deploys from `pacing_rows.deploy_status='PENDING'`
- Last night's health snapshot
- New `teacher_memory` patterns learned in last 24h
- Risk score from `risk-engine`
Inserts a `deploy_notifications` row (level='info', title='Good morning — today's plan'):
- Today's tests/quizzes count
- Pending deploys count
- Health score + delta
- Risk level (High/Medium/Low)
- 1-line memory insight ("Learned new opener for Reading announcements")

### 5. Cron schedules (one SQL migration)
Use `pg_cron` + `pg_net.http_post` pattern with anon key:
```sql
-- Friday 4 PM ET = 21:00 UTC (EDT) / 20:00 UTC (EST) — use 21:00 UTC, accept 1hr drift, OR add 2 jobs
select cron.schedule('automation-friday-deploy', '0 21 * * 5', $$ ... net.http_post(.../automation-friday-deploy) $$);
select cron.schedule('automation-nightly',        '0 7 * * *',  $$ ... /automation-nightly $$);   -- 2 AM ET
select cron.schedule('automation-daily-summary',  '30 11 * * *',$$ ... /automation-daily-summary $$); -- 6:30 AM ET
-- Existing friday-publish cron stays as-is
```
Each cron job upserts a row into `automation_jobs` (job_name, schedule, enabled).

### 6. New page — `src/pages/AutomationPage.tsx` + route `/automation`
Three sections:
- **Active Jobs** table from `automation_jobs`: Job | Schedule (human-readable) | Status badge | Last Run | Next Run | Last Result | Toggle Enabled
- **Run Now** button per job → `supabase.functions.invoke(jobName)`
- **Recent Failures** table from `deploy_log` where status='ERROR' last 7 days, with "Retry" button
- **Activity Timeline** of last 50 cron runs from `automation_jobs.last_result` history (use `deploy_log` action filter)

### 7. Sidebar + route + memory
- `App.tsx`: `/automation` route
- `AppSidebar.tsx`: `Zap` icon entry
- `mem://features/zero-touch-automation.md`: cron schedule + retry policy + job list

### Files
1. `supabase/functions/_shared/retry.ts` (new)
2. `supabase/functions/automation-friday-deploy/index.ts` (new)
3. `supabase/functions/automation-nightly/index.ts` (new)
4. `supabase/functions/automation-daily-summary/index.ts` (new)
5. SQL migration: 3 cron jobs + seed `automation_jobs` rows
6. `src/pages/AutomationPage.tsx` (new)
7. `src/App.tsx` + `src/components/AppSidebar.tsx` (route + nav)
8. `mem://features/zero-touch-automation.md` (new)

### Verify
Open `/automation` → see 4 jobs (friday-publish, friday-deploy, nightly, daily-summary), all enabled, idle. Click "Run Now" on `automation-daily-summary` → toast appears in 2s with today's summary, row updates `last_run`. Click "Run Now" on `automation-friday-deploy` for a test week → next week's pages + assignments deploy idempotently, announcements appear as DRAFTs with correct schedules. Force a failure (revoke Canvas token), click "Run Now" → after 3 retries with backoff, error notification fires, row shows status='error' with last_result error message.
