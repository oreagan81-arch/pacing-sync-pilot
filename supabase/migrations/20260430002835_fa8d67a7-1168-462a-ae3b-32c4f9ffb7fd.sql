CREATE TABLE public.learning_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_name TEXT NOT NULL,
  name_pattern TEXT,
  corrected_subject TEXT,
  corrected_type TEXT,
  corrected_lesson TEXT,
  applied_count INTEGER NOT NULL DEFAULT 0,
  last_applied TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX learning_rules_original_name_key
  ON public.learning_rules (lower(original_name));

CREATE INDEX learning_rules_pattern_idx
  ON public.learning_rules (name_pattern)
  WHERE name_pattern IS NOT NULL;

ALTER TABLE public.learning_rules ENABLE ROW LEVEL SECURITY;

-- Single-teacher app; mirror existing tables (deploy_log, files) which use allow_all.
CREATE POLICY "allow_all" ON public.learning_rules
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_learning_rules_updated_at
  BEFORE UPDATE ON public.learning_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();