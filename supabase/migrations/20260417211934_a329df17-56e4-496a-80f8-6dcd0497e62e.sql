ALTER TABLE public.pacing_rows
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_row_id uuid NULL REFERENCES public.pacing_rows(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pacing_rows_parent_row_id ON public.pacing_rows(parent_row_id);

CREATE OR REPLACE FUNCTION public.enforce_friday_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Leave synthetic rows alone (Triple Logic siblings)
  IF NEW.is_synthetic THEN
    RETURN NEW;
  END IF;
  IF NEW.day = 'Friday' AND COALESCE(NEW.type, '') <> 'Test' THEN
    NEW.create_assign := false;
    NEW.at_home := NULL;
  END IF;
  RETURN NEW;
END;
$$;