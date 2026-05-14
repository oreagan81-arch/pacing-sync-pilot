CREATE OR REPLACE FUNCTION public.enforce_friday_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_synthetic THEN RETURN NEW; END IF;

  IF COALESCE(NEW.type, '') = 'CLT Testing' THEN
    NEW.create_assign := false;
    NEW.at_home := NULL;
    RETURN NEW;
  END IF;

  IF NEW.day = 'Friday' AND COALESCE(NEW.type, '') <> 'Test' THEN
    NEW.create_assign := false;
    NEW.at_home := NULL;
  END IF;

  IF NEW.subject = 'Language Arts'
     AND COALESCE(NEW.type, '') NOT IN ('CP', 'Classroom Practice', 'Test') THEN
    NEW.create_assign := false;
  END IF;

  IF NEW.subject IN ('History', 'Science') THEN
    NEW.create_assign := false;
  END IF;

  RETURN NEW;
END;
$$;