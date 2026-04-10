-- System config (single row — all logic lives here)
CREATE TABLE public.system_config (
  id text PRIMARY KEY DEFAULT 'current',
  course_ids jsonb NOT NULL DEFAULT '{"Math": 21957, "Reading": 21919, "Language Arts": 21944, "History": 21934, "Science": 21970, "Homeroom": 22254}',
  assignment_prefixes jsonb NOT NULL DEFAULT '{"Math": "SM5:", "Reading": "RM4:", "Spelling": "RM4:", "Language Arts": "ELA4:"}',
  quarter_colors jsonb NOT NULL DEFAULT '{"Q1": "#00c0a5", "Q2": "#0065a7", "Q3": "#6644bb", "Q4": "#c87800"}',
  power_up_map jsonb NOT NULL DEFAULT '{"1":"A","2":"A","3":"A","4":"A","5":"A","6":"A","7":"A","8":"A","9":"B","10":"B","11":"B","12":"B","13":"B","14":"B","15":"B","16":"C","17":"C","18":"C","19":"C","20":"D","21":"D","22":"F","23":"E","24":"F","25":"D","26":"F","27":"F","28":"E","29":"F","30":"D","31":"F","32":"E","33":"F","34":"D","35":"F","36":"E","37":"F","38":"D","39":"F","40":"E","41":"F","42":"D","43":"E","44":"F","45":"D","46":"F","47":"F","48":"G","49":"G","50":"F","51":"G","52":"F","53":"F","54":"G","55":"F","56":"G","57":"F","58":"G","59":"F","60":"G","61":"F","62":"G","63":"F","64":"F","65":"C","66":"F","67":"G","68":"E","69":"F","70":"G","71":"C","72":"D","73":"F","74":"G","75":"C","76":"H","77":"H","78":"H","79":"H","80":"H","81":"H","82":"H","83":"H","84":"H","85":"H","86":"H","87":"H","88":"H","89":"F","90":"F","91":"I","92":"I","93":"I","94":"I","95":"I","96":"I","97":"I","98":"I","99":"I","100":"I","101":"J","102":"J","103":"J","104":"J","105":"J","106":"J","107":"J","108":"J","109":"J","110":"J","111":"K","112":"K","113":"K","114":"K","115":"K","116":"K","117":"K","118":"K","119":"K","120":"K"}',
  spelling_word_bank jsonb NOT NULL DEFAULT '{}',
  auto_logic jsonb NOT NULL DEFAULT '{"mathEvenOdd": true, "mathTestTriple": true, "readingTestPhrases": ["tracking and tapping", "100 words per minute"], "fridayNoHomework": true, "historyScienceNoAssign": true, "frontPageProtection": true, "pagePublishDefault": false, "togetherLogicCourseId": 21919}',
  canvas_base_url text DEFAULT 'https://thalesacademy.instructure.com',
  updated_at timestamptz DEFAULT now()
);

-- Weeks
CREATE TABLE public.weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter text NOT NULL,
  week_num integer NOT NULL,
  date_range text,
  reminders text,
  resources text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(quarter, week_num)
);

-- Pacing rows
CREATE TABLE public.pacing_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid REFERENCES public.weeks(id) ON DELETE CASCADE,
  subject text NOT NULL,
  day text NOT NULL,
  type text,
  lesson_num text,
  in_class text,
  at_home text,
  resources text,
  create_assign boolean DEFAULT true,
  object_id text,
  content_hash text,
  canvas_assignment_id text,
  canvas_url text,
  deploy_status text DEFAULT 'PENDING',
  last_deployed timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(week_id, subject, day)
);

-- Deploy log
CREATE TABLE public.deploy_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid REFERENCES public.weeks(id),
  subject text,
  action text,
  status text,
  canvas_url text,
  payload jsonb,
  message text,
  created_at timestamptz DEFAULT now()
);

-- Files
CREATE TABLE public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text UNIQUE,
  original_name text,
  friendly_name text,
  subject text,
  type text,
  lesson_num text,
  confidence text,
  created_at timestamptz DEFAULT now()
);

-- Announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid REFERENCES public.weeks(id),
  subject text,
  type text,
  title text,
  content text,
  course_id integer,
  status text DEFAULT 'DRAFT',
  scheduled_post timestamptz,
  posted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Newsletters
CREATE TABLE public.newsletters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_range text,
  homeroom_notes text,
  birthdays text,
  extra_sections jsonb DEFAULT '[]',
  html_content text,
  status text DEFAULT 'DRAFT',
  posted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- RLS (single-user app — allow all)
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacing_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deploy_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON public.system_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.weeks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.pacing_rows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.deploy_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.announcements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public.newsletters FOR ALL USING (true) WITH CHECK (true);

-- Seed system_config
INSERT INTO public.system_config (id) VALUES ('current') ON CONFLICT (id) DO NOTHING;