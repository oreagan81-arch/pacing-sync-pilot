CREATE TABLE public.content_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_ref text NOT NULL,
  subject text NOT NULL,
  type text,
  canonical_name text,
  canvas_file_id text,
  canvas_url text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_content_map_subject ON public.content_map(subject);
CREATE INDEX idx_content_map_lesson_ref ON public.content_map(lesson_ref);

ALTER TABLE public.content_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON public.content_map FOR ALL USING (true) WITH CHECK (true);