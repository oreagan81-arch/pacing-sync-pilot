CREATE TABLE public.canvas_orphan_files (
  canvas_file_id text PRIMARY KEY,
  course_id text,
  original_name text,
  canvas_url text,
  ai_suggested_name text,
  ai_suggested_folder text,
  ai_lesson_ref text,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.canvas_orphan_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON public.canvas_orphan_files
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER canvas_orphan_files_set_updated_at
  BEFORE UPDATE ON public.canvas_orphan_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_canvas_orphan_files_status ON public.canvas_orphan_files(status);
CREATE INDEX idx_canvas_orphan_files_course ON public.canvas_orphan_files(course_id);