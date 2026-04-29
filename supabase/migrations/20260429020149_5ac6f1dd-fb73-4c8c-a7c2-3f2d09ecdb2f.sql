CREATE TABLE IF NOT EXISTS public.content_map_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date_string TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  sheet_name TEXT,
  last_scanned TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (date_string, sheet_name)
);

ALTER TABLE public.content_map_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read content_map_registry"
ON public.content_map_registry
FOR SELECT
USING (true);

CREATE TRIGGER content_map_registry_updated_at
BEFORE UPDATE ON public.content_map_registry
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();