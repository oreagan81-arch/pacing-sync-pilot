CREATE TABLE IF NOT EXISTS public.school_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_year text NOT NULL DEFAULT '2025-2026',
  date date NOT NULL,
  event_type text NOT NULL
    CHECK (event_type IN ('holiday','no_school','half_day','track_out','testing_window','early_release')),
  label text NOT NULL,
  affects_all boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_year, date)
);

ALTER TABLE public.school_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON public.school_calendar FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.school_calendar (school_year, date, event_type, label) VALUES
  ('2025-2026', '2025-09-01', 'holiday', 'Labor Day'),
  ('2025-2026', '2025-10-20', 'track_out', 'Track Out Begin'),
  ('2025-2026', '2025-10-21', 'track_out', 'Track Out'),
  ('2025-2026', '2025-10-22', 'track_out', 'Track Out'),
  ('2025-2026', '2025-10-23', 'track_out', 'Track Out'),
  ('2025-2026', '2025-10-24', 'track_out', 'Track Out'),
  ('2025-2026', '2025-11-26', 'holiday', 'Thanksgiving Break'),
  ('2025-2026', '2025-11-27', 'holiday', 'Thanksgiving Break'),
  ('2025-2026', '2025-11-28', 'holiday', 'Thanksgiving Break'),
  ('2025-2026', '2025-12-22', 'track_out', 'Winter Track Out'),
  ('2025-2026', '2025-12-23', 'track_out', 'Winter Track Out'),
  ('2025-2026', '2025-12-24', 'track_out', 'Winter Track Out'),
  ('2025-2026', '2025-12-25', 'holiday', 'Christmas'),
  ('2025-2026', '2025-12-26', 'track_out', 'Winter Track Out'),
  ('2025-2026', '2026-01-01', 'holiday', 'New Year''s Day'),
  ('2025-2026', '2026-01-02', 'track_out', 'Winter Track Out'),
  ('2025-2026', '2026-01-19', 'holiday', 'MLK Day'),
  ('2025-2026', '2026-03-16', 'track_out', 'Spring Track Out'),
  ('2025-2026', '2026-03-17', 'track_out', 'Spring Track Out'),
  ('2025-2026', '2026-03-18', 'track_out', 'Spring Track Out'),
  ('2025-2026', '2026-03-19', 'track_out', 'Spring Track Out'),
  ('2025-2026', '2026-03-20', 'track_out', 'Spring Track Out'),
  ('2025-2026', '2026-05-25', 'holiday', 'Memorial Day'),
  ('2025-2026', '2026-05-11', 'testing_window', 'CLT Testing'),
  ('2025-2026', '2026-05-12', 'testing_window', 'CLT Testing'),
  ('2025-2026', '2026-05-13', 'testing_window', 'CLT Testing'),
  ('2025-2026', '2026-05-14', 'testing_window', 'CLT Testing'),
  ('2025-2026', '2026-05-15', 'testing_window', 'CLT Testing'),
  ('2025-2026', '2026-06-15', 'track_out', 'Summer Track Out'),
  ('2025-2026', '2026-06-16', 'track_out', 'Summer Track Out')
ON CONFLICT DO NOTHING;