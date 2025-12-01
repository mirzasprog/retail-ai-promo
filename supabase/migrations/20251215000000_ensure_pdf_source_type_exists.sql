-- Ensure the source_type enum includes PDF for competitor entries
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

-- Normalize any existing competitor rows that should be marked as PDF sources
UPDATE public.competitors
SET source_type = 'pdf'
WHERE base_url ILIKE '%.pdf'
  AND source_type <> 'pdf';
