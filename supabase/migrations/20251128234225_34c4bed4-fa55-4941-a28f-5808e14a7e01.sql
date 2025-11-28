-- Check if source_type enum exists and add missing values
DO $$
BEGIN
  -- Check if enum type exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type') THEN
    CREATE TYPE public.source_type AS ENUM ('html', 'api', 'csv', 'json');
  ELSE
    -- Add new values if they don't exist
    BEGIN
      ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'html';
      ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'api';
      ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'csv';
      ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'json';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$$;