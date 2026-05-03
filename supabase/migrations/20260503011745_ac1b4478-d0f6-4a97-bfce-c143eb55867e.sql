ALTER TABLE public.weeks ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS weeks_only_one_active ON public.weeks (is_active) WHERE is_active = true;