CREATE TABLE IF NOT EXISTS public.deploy_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL,
  subject text,
  status text NOT NULL,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.deploy_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read deploy_logs"
ON public.deploy_logs
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_deploy_logs_created_at ON public.deploy_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deploy_logs_type ON public.deploy_logs (type);