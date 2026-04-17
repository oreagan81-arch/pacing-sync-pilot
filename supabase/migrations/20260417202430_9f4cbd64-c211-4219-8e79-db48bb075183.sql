
-- Shared trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- 1. teacher_memory
CREATE TABLE IF NOT EXISTS public.teacher_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 1.0,
  usage_count integer NOT NULL DEFAULT 0,
  last_used timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_memory_category_key_idx ON public.teacher_memory (category, key);
ALTER TABLE public.teacher_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON public.teacher_memory;
CREATE POLICY allow_all ON public.teacher_memory FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_teacher_memory_updated_at ON public.teacher_memory;
CREATE TRIGGER set_teacher_memory_updated_at BEFORE UPDATE ON public.teacher_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. teacher_feedback_log
CREATE TABLE IF NOT EXISTS public.teacher_feedback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text,
  action text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  diff_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_feedback_log_entity_idx ON public.teacher_feedback_log (entity_type, created_at DESC);
ALTER TABLE public.teacher_feedback_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON public.teacher_feedback_log;
CREATE POLICY allow_all ON public.teacher_feedback_log FOR ALL USING (true) WITH CHECK (true);

-- 3. teacher_patterns
CREATE TABLE IF NOT EXISTS public.teacher_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL,
  subject text,
  description text,
  rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  applied_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_patterns_type_subject_idx ON public.teacher_patterns (pattern_type, subject);
ALTER TABLE public.teacher_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON public.teacher_patterns;
CREATE POLICY allow_all ON public.teacher_patterns FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_teacher_patterns_updated_at ON public.teacher_patterns;
CREATE TRIGGER set_teacher_patterns_updated_at BEFORE UPDATE ON public.teacher_patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. deploy_notifications
CREATE TABLE IF NOT EXISTS public.deploy_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  entity_ref text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deploy_notifications_level_check CHECK (level IN ('info','warn','error','success'))
);
CREATE INDEX IF NOT EXISTS deploy_notifications_unread_idx ON public.deploy_notifications (read, created_at DESC);
ALTER TABLE public.deploy_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON public.deploy_notifications;
CREATE POLICY allow_all ON public.deploy_notifications FOR ALL USING (true) WITH CHECK (true);

-- 5. automation_jobs
CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL UNIQUE,
  schedule text,
  status text NOT NULL DEFAULT 'idle',
  last_run timestamptz,
  next_run timestamptz,
  last_result jsonb,
  enabled boolean NOT NULL DEFAULT true,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_jobs_status_check CHECK (status IN ('idle','running','success','failed'))
);
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON public.automation_jobs;
CREATE POLICY allow_all ON public.automation_jobs FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS set_automation_jobs_updated_at ON public.automation_jobs;
CREATE TRIGGER set_automation_jobs_updated_at BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. system_health_snapshots
CREATE TABLE IF NOT EXISTS public.system_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score integer NOT NULL DEFAULT 100,
  canvas_status text,
  failed_deploys integer NOT NULL DEFAULT 0,
  orphan_files integer NOT NULL DEFAULT 0,
  pending_assignments integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_health_snapshots_score_check CHECK (score >= 0 AND score <= 100)
);
CREATE INDEX IF NOT EXISTS system_health_snapshots_created_idx ON public.system_health_snapshots (created_at DESC);
ALTER TABLE public.system_health_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON public.system_health_snapshots;
CREATE POLICY allow_all ON public.system_health_snapshots FOR ALL USING (true) WITH CHECK (true);

-- updated_at columns
ALTER TABLE public.weeks         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.pacing_rows   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.newsletters   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.files         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.content_map   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_weeks_updated_at ON public.weeks;
CREATE TRIGGER set_weeks_updated_at BEFORE UPDATE ON public.weeks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_pacing_rows_updated_at ON public.pacing_rows;
CREATE TRIGGER set_pacing_rows_updated_at BEFORE UPDATE ON public.pacing_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_announcements_updated_at ON public.announcements;
CREATE TRIGGER set_announcements_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_newsletters_updated_at ON public.newsletters;
CREATE TRIGGER set_newsletters_updated_at BEFORE UPDATE ON public.newsletters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_files_updated_at ON public.files;
CREATE TRIGGER set_files_updated_at BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_content_map_updated_at ON public.content_map;
CREATE TRIGGER set_content_map_updated_at BEFORE UPDATE ON public.content_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes on existing tables
CREATE INDEX IF NOT EXISTS pacing_rows_week_subject_day_idx ON public.pacing_rows (week_id, subject, day);
CREATE INDEX IF NOT EXISTS pacing_rows_deploy_status_idx ON public.pacing_rows (deploy_status);
CREATE INDEX IF NOT EXISTS deploy_log_created_idx ON public.deploy_log (created_at DESC);
CREATE INDEX IF NOT EXISTS deploy_log_week_subject_idx ON public.deploy_log (week_id, subject);
CREATE INDEX IF NOT EXISTS announcements_status_scheduled_idx ON public.announcements (status, scheduled_post);
CREATE INDEX IF NOT EXISTS files_subject_lesson_idx ON public.files (subject, lesson_num);
CREATE INDEX IF NOT EXISTS content_map_lesson_subject_idx ON public.content_map (lesson_ref, subject);

-- Dedup content_map then add unique constraint (keep oldest)
DELETE FROM public.content_map a
USING public.content_map b
WHERE a.subject = b.subject
  AND a.lesson_ref = b.lesson_ref
  AND a.created_at > b.created_at;

-- Handle ties on created_at via id
DELETE FROM public.content_map a
USING public.content_map b
WHERE a.subject = b.subject
  AND a.lesson_ref = b.lesson_ref
  AND a.created_at = b.created_at
  AND a.id > b.id;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weeks_quarter_week_num_key') THEN
    ALTER TABLE public.weeks ADD CONSTRAINT weeks_quarter_week_num_key UNIQUE (quarter, week_num);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_map_subject_lesson_ref_key') THEN
    ALTER TABLE public.content_map ADD CONSTRAINT content_map_subject_lesson_ref_key UNIQUE (subject, lesson_ref);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pacing_rows_deploy_status_check') THEN
    ALTER TABLE public.pacing_rows ADD CONSTRAINT pacing_rows_deploy_status_check
      CHECK (deploy_status IS NULL OR deploy_status IN ('PENDING','DEPLOYED','ERROR','SKIPPED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'announcements_status_check') THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_status_check
      CHECK (status IS NULL OR status IN ('DRAFT','SCHEDULED','POSTED','ERROR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletters_status_check') THEN
    ALTER TABLE public.newsletters ADD CONSTRAINT newsletters_status_check
      CHECK (status IS NULL OR status IN ('DRAFT','POSTED','ARCHIVED'));
  END IF;
END$$;
