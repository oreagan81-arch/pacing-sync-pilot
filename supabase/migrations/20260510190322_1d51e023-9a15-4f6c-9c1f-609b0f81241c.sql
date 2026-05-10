UPDATE system_config
SET assignment_prefixes = jsonb_set(
  assignment_prefixes,
  '{Language Arts}',
  '"ELA4:"'::jsonb
)
WHERE id = 'current';