-- 1. Per-subject reminders
ALTER TABLE public.weeks
  ADD COLUMN IF NOT EXISTS subject_reminders jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Per-subject resources
ALTER TABLE public.weeks
  ADD COLUMN IF NOT EXISTS subject_resources jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. CLT testing window fix
ALTER TABLE public.school_calendar
  ADD COLUMN IF NOT EXISTS cancels_instruction boolean NOT NULL DEFAULT true;

UPDATE public.school_calendar
  SET cancels_instruction = false
  WHERE event_type = 'testing_window';

-- 4. school_calendar event_type constraint — add teacher_workday
ALTER TABLE public.school_calendar
  DROP CONSTRAINT IF EXISTS school_calendar_event_type_check;

ALTER TABLE public.school_calendar
  ADD CONSTRAINT school_calendar_event_type_check
  CHECK (event_type IN (
    'holiday', 'no_school', 'half_day', 'track_out',
    'testing_window', 'early_release', 'teacher_workday'
  ));

-- 5. Announcement idempotency: canvas_url
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS canvas_url text;

-- 6. Newsletter missing sections
ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS school_news text,
  ADD COLUMN IF NOT EXISTS points_of_contact jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quick_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS footer_line text DEFAULT 'Thales Academy Grade 4A — Mr. Reagan';

-- 7. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_weeks_quarter_week
  ON public.weeks (quarter, week_num);