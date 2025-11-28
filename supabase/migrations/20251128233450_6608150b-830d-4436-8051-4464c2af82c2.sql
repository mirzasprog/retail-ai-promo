-- Create system_api_keys table for storing API keys securely
CREATE TABLE IF NOT EXISTS public.system_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_name TEXT NOT NULL UNIQUE,
  key_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on system_api_keys
ALTER TABLE public.system_api_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can manage API keys
CREATE POLICY "Admini upravljaju API ključevima"
ON public.system_api_keys
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add unique constraint on system_settings if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'system_settings_setting_key_key'
  ) THEN
    ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);
  END IF;
END $$;

-- Add unique constraint on holidays (date, name) if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'holidays_date_name_key'
  ) THEN
    ALTER TABLE public.holidays ADD CONSTRAINT holidays_date_name_key UNIQUE (date, name);
  END IF;
END $$;

-- Insert default system settings if they don't exist
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES 
  ('default_city', 'Sarajevo'),
  ('default_country', 'BiH'),
  ('competitor_refresh_interval_minutes', '60'),
  ('weather_refresh_interval_minutes', '30')
ON CONFLICT (setting_key) DO NOTHING;

-- Seed holidays for BiH
INSERT INTO public.holidays (name, date, is_recurring)
VALUES
  ('Nova godina', '2025-01-01', true),
  ('Nova godina (drugi dan)', '2025-01-02', true),
  ('Dan nezavisnosti BiH', '2025-03-01', true),
  ('Prvi maj', '2025-05-01', true),
  ('Prvi maj (drugi dan)', '2025-05-02', true),
  ('Dan državnosti BiH', '2025-11-25', true),
  ('Ramazanski Bajram (prvi dan)', '2025-03-31', false),
  ('Ramazanski Bajram (drugi dan)', '2025-04-01', false),
  ('Ramazanski Bajram (treći dan)', '2025-04-02', false),
  ('Kurban Bajram (prvi dan)', '2025-06-07', false),
  ('Kurban Bajram (drugi dan)', '2025-06-08', false),
  ('Kurban Bajram (treći dan)', '2025-06-09', false),
  ('Kurban Bajram (četvrti dan)', '2025-06-10', false),
  ('Božić (pravoslavni)', '2025-01-07', true),
  ('Božić (katolički)', '2025-12-25', true)
ON CONFLICT (date, name) DO NOTHING;

-- Update competitors table to add config_json column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'competitors' AND column_name = 'config_json'
  ) THEN
    ALTER TABLE public.competitors ADD COLUMN config_json JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_competitor_prices_product_name ON public.competitor_prices(product_name);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_fetched_at ON public.competitor_prices(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_competitor_id ON public.competitor_prices(competitor_id);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_recorded_at ON public.weather_snapshots(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_location ON public.weather_snapshots(location);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(date);

-- Create trigger for system_api_keys updated_at
DROP TRIGGER IF EXISTS update_system_api_keys_updated_at ON public.system_api_keys;
CREATE TRIGGER update_system_api_keys_updated_at
  BEFORE UPDATE ON public.system_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();