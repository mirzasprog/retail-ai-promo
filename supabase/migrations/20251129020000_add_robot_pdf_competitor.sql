-- Add Robot PDF competitor entry for robot.ba promotional catalog
INSERT INTO public.competitors (name, source_type, base_url, refresh_interval, is_active, config_json)
SELECT 'Robot2 (PDF)', 'html', 'https://robot.ba/wp-content/uploads/2024/07/277-FED.pdf', 86400, true, '{"format":"pdf"}'
WHERE NOT EXISTS (
  SELECT 1 FROM public.competitors WHERE base_url = 'https://robot.ba/wp-content/uploads/2024/07/277-FED.pdf'
);
