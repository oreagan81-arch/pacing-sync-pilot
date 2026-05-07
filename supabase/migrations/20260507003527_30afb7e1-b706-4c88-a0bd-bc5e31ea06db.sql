CREATE TABLE IF NOT EXISTS public.annual_pacing_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_year text NOT NULL DEFAULT '2025-2026',
  quarter text NOT NULL,
  week_num integer NOT NULL,
  subject text NOT NULL,
  day text NOT NULL,
  type text,
  lesson_num text,
  in_class text,
  at_home text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_year, quarter, week_num, subject, day)
);

CREATE INDEX IF NOT EXISTS apm_year_quarter_week_idx 
  ON public.annual_pacing_master (school_year, quarter, week_num);
CREATE INDEX IF NOT EXISTS apm_subject_idx 
  ON public.annual_pacing_master (subject);

ALTER TABLE public.annual_pacing_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON public.annual_pacing_master FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_apm_updated_at BEFORE UPDATE ON public.annual_pacing_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();