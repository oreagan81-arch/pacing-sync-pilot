ALTER TABLE public.weeks
ADD COLUMN IF NOT EXISTS active_hs_subject text
CHECK (active_hs_subject IN ('History', 'Science') OR active_hs_subject IS NULL);