-- Add category and brand fields to competitor_prices table
ALTER TABLE public.competitor_prices 
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS brand text;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_competitor_prices_competitor_id ON public.competitor_prices(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_dates ON public.competitor_prices(promo_start_date, promo_end_date);