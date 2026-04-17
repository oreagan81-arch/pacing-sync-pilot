-- Update LA prefix to ELA4A
UPDATE public.system_config
SET assignment_prefixes = jsonb_set(assignment_prefixes, '{Language Arts}', '"ELA4A"'::jsonb),
    updated_at = now()
WHERE id = 'current';

-- Extend Friday rules trigger to also enforce LA CP/Test-only rule
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

  -- Friday rule: no homework assignments, no At Home (Tests OK)
  IF NEW.day = 'Friday' AND COALESCE(NEW.type, '') <> 'Test' THEN
    NEW.create_assign := false;
    NEW.at_home := NULL;
  END IF;

  -- Language Arts rule: only CP / Classroom Practice / Test create assignments
  IF NEW.subject = 'Language Arts'
     AND COALESCE(NEW.type, '') NOT IN ('CP', 'Classroom Practice', 'Test') THEN
    NEW.create_assign := false;
  END IF;

  RETURN NEW;
END;
$$;