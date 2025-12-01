-- The competitors.source_type column uses the public.source_type enum which currently lacks the 'pdf' label.
-- Add the missing value so PDF sources can be saved without violating the enum constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'source_type' AND e.enumlabel = 'pdf'
  ) THEN
    ALTER TYPE public.source_type ADD VALUE 'pdf';
  END IF;
END $$;
