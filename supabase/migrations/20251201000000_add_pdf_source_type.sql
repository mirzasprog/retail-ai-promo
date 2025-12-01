-- Ensure PDF is a valid source_type for competitors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'source_type' AND e.enumlabel = 'pdf'
  ) THEN
    ALTER TYPE public.source_type ADD VALUE 'pdf';
  END IF;
END $$;

-- Update existing Robot PDF competitor to use the new enum value
UPDATE public.competitors
SET source_type = 'pdf'
WHERE base_url = 'https://robot.ba/wp-content/uploads/2024/07/277-FED.pdf';
