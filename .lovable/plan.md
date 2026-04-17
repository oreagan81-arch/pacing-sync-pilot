
The user wants 6 new tables for the autonomy/memory/health engines, plus indexes/timestamps/constraints on existing tables. Single-user app, so RLS stays permissive (matches existing pattern). Keeping schema lean and production-safe.

## Plan: Schema Upgrade — Memory, Automation & Health Tables

### New Tables

**1. `teacher_memory`** — Long-term key/value memory store
- `id uuid pk`, `category text` (naming, tone, formatting, preference), `key text`, `value jsonb`, `confidence numeric default 1.0`, `usage_count int default 0`, `last_used timestamptz`, `created_at`, `updated_at`
- Unique index on `(category, key)`

**2. `teacher_feedback_log`** — Raw edit/correction events feeding the memory engine
- `id uuid pk`, `entity_type text` (page, assignment, announcement, newsletter), `entity_id text`, `action text` (edit, reject, approve, override), `before jsonb`, `after jsonb`, `diff_summary text`, `created_at`
- Index on `(entity_type, created_at desc)`

**3. `teacher_patterns`** — Distilled patterns learned from feedback (e.g., "always uses Lesson XX not Lesson #XX")
- `id uuid pk`, `pattern_type text`, `subject text nullable`, `description text`, `rule jsonb`, `confidence numeric`, `applied_count int default 0`, `created_at`, `updated_at`

**4. `deploy_notifications`** — User-facing notification queue (success/failure/alerts)
- `id uuid pk`, `level text` (info, warn, error, success), `title text`, `message text`, `entity_ref text nullable`, `read boolean default false`, `created_at`
- Index on `(read, created_at desc)`

**5. `automation_jobs`** — Cron/scheduled job registry & run history
- `id uuid pk`, `job_name text`, `schedule text` (cron expr), `status text` (idle, running, success, failed), `last_run timestamptz`, `next_run timestamptz`, `last_result jsonb`, `enabled boolean default true`, `retry_count int default 0`, `created_at`, `updated_at`
- Unique index on `job_name`

**6. `system_health_snapshots`** — Daily health score history
- `id uuid pk`, `score int` (0-100), `canvas_status text`, `failed_deploys int`, `orphan_files int`, `pending_assignments int`, `details jsonb`, `created_at`
- Index on `created_at desc`

### Improvements to Existing Tables

- **Add `updated_at timestamptz` + auto-update trigger** to: `weeks`, `pacing_rows`, `announcements`, `newsletters`, `files`, `content_map` (system_config already has it)
- **Indexes**:
  - `pacing_rows(week_id, subject, day)` — composite for fast week lookups
  - `pacing_rows(deploy_status)` — for retry/queue scans
  - `deploy_log(created_at desc)` — already heavily queried
  - `deploy_log(week_id, subject)`
  - `announcements(status, scheduled_post)` — for friday-publish cron
  - `content_map(lesson_ref, subject)` — composite for orphan lookups
  - `files(subject, lesson_num)`
  - `weeks(quarter, week_num)` unique constraint (prevent duplicate weeks)
- **Constraints**:
  - `weeks`: UNIQUE `(quarter, week_num)`
  - `content_map`: UNIQUE `(subject, lesson_ref)` (prevent dup mappings)
  - `pacing_rows.deploy_status` CHECK in (PENDING, DEPLOYED, ERROR, SKIPPED)
  - `announcements.status` CHECK in (DRAFT, SCHEDULED, POSTED, ERROR)
  - `newsletters.status` CHECK in (DRAFT, POSTED, ARCHIVED)

### RLS

All new tables: `enable rls` + permissive `allow_all` policy (matches existing single-user app pattern). No auth = no per-user filtering needed.

### Trigger

Single shared `set_updated_at()` function applied via `BEFORE UPDATE` triggers on all tables with `updated_at`.

### Migration Strategy

- One migration file with all schema changes
- Use `IF NOT EXISTS` everywhere for re-run safety
- No data migration needed (all additive)
- Types regenerate automatically post-migration

### Out of scope (next prompts)
- Edge functions that USE these tables (memory writes, health snapshot cron, notification creation)
- UI for notifications/health dashboard
- Pattern-learning logic
