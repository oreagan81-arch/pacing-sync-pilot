CREATE OR REPLACE FUNCTION public.enforce_friday_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.day = 'Friday' AND COALESCE(NEW.type, '') <> 'Test' THEN
    NEW.create_assign := false;
    NEW.at_home := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_friday_rules ON public.pacing_rows;
CREATE TRIGGER trg_enforce_friday_rules
BEFORE INSERT OR UPDATE ON public.pacing_rows
FOR EACH ROW
EXECUTE FUNCTION public.enforce_friday_rules();