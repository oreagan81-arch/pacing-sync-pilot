CREATE TABLE public.canvas_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id bigint NOT NULL,
  content_type text NOT NULL,
  canvas_id text NOT NULL,
  title text,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_snapshots_unique UNIQUE (course_id, content_type, canvas_id)
);

CREATE INDEX idx_canvas_snapshots_course ON public.canvas_snapshots(course_id);
CREATE INDEX idx_canvas_snapshots_type ON public.canvas_snapshots(content_type);

ALTER TABLE public.canvas_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON public.canvas_snapshots FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER canvas_snapshots_set_updated_at
BEFORE UPDATE ON public.canvas_snapshots
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.canvas_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL,
  pattern_key text NOT NULL,
  pattern_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence integer NOT NULL DEFAULT 100,
  occurrence_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_patterns_unique UNIQUE (pattern_type, pattern_key)
);

CREATE INDEX idx_canvas_patterns_type ON public.canvas_patterns(pattern_type);

ALTER TABLE public.canvas_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON public.canvas_patterns FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER canvas_patterns_set_updated_at
BEFORE UPDATE ON public.canvas_patterns
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();