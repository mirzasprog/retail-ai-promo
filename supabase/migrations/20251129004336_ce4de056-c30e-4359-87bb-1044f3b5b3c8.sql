-- Allow edge functions to insert competitor prices
ALTER POLICY "Svi autentifikovani mogu čitati cijene" ON public.competitor_prices TO authenticated;

CREATE POLICY "Edge functions mogu insertovati cijene" 
ON public.competitor_prices
FOR INSERT 
TO service_role
WITH CHECK (true);