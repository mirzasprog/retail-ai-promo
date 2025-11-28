import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import FirecrawlApp from 'https://esm.sh/@mendable/firecrawl-js@1.7.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompetitorData {
  id: string;
  name: string;
  base_url: string;
  config_json: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')!;

    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey });

    console.log('Starting competitor scraping...');

    // Fetch active competitors
    const { data: competitors, error: competitorsError } = await supabase
      .from('competitors')
      .select('*')
      .eq('is_active', true);

    if (competitorsError) {
      console.error('Error fetching competitors:', competitorsError);
      throw competitorsError;
    }

    console.log(`Found ${competitors?.length || 0} active competitors`);

    const results = [];

    for (const competitor of competitors || []) {
      console.log(`Scraping ${competitor.name}...`);
      
      try {
        // Scrape the competitor's website
        const crawlResponse = await firecrawl.scrapeUrl(competitor.base_url, {
          formats: ['markdown', 'html'],
          onlyMainContent: true,
        });

        if (!crawlResponse.success) {
          console.error(`Failed to scrape ${competitor.name}:`, crawlResponse.error);
          results.push({
            competitor: competitor.name,
            success: false,
            error: crawlResponse.error,
          });
          continue;
        }

        console.log(`Successfully scraped ${competitor.name}`);
        
        // Extract promotional data from the content
        const products = extractPromotionalProducts(
          crawlResponse.markdown || '',
          competitor
        );

        console.log(`Extracted ${products.length} products from ${competitor.name}`);

        // Insert products into competitor_prices table
        if (products.length > 0) {
          const { error: insertError } = await supabase
            .from('competitor_prices')
            .insert(products);

          if (insertError) {
            console.error(`Error inserting prices for ${competitor.name}:`, insertError);
            results.push({
              competitor: competitor.name,
              success: false,
              error: insertError.message,
            });
          } else {
            results.push({
              competitor: competitor.name,
              success: true,
              productsCount: products.length,
            });
          }
        } else {
          results.push({
            competitor: competitor.name,
            success: true,
            productsCount: 0,
            message: 'No promotional products found',
          });
        }

      } catch (error) {
        console.error(`Error processing ${competitor.name}:`, error);
        results.push({
          competitor: competitor.name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Add a small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Scraping completed',
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in scrape-competitors function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function extractPromotionalProducts(
  markdown: string,
  competitor: CompetitorData
): any[] {
  const products = [];
  
  // This is a basic pattern matcher - should be customized per competitor
  // Looking for common patterns like:
  // - Product name followed by price
  // - Promotional dates
  // - Special markers like "Akcija", "Sniženo", etc.
  
  const lines = markdown.split('\n');
  let currentProduct: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for promotional keywords
    if (line.match(/akcija|sniženo|popust|promo|ponuda/i)) {
      // Try to extract product information from surrounding lines
      const context = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 5)).join(' ');
      
      // Extract price patterns (e.g., "2.99 KM", "2,99KM", etc.)
      const priceMatch = context.match(/(\d+[.,]\d+)\s*(?:KM|BAM)/i);
      
      // Extract product name (this is very basic and should be improved)
      const nameMatch = context.match(/([A-ZŠĐČĆŽ][a-zšđčćž]+(?:\s+[A-ZŠĐČĆŽa-zšđčćž]+){0,5})/);
      
      if (priceMatch && nameMatch) {
        const price = parseFloat(priceMatch[1].replace(',', '.'));
        const name = nameMatch[1].trim();
        
        if (name.length > 3 && !isNaN(price)) {
          products.push({
            competitor_id: competitor.id,
            product_name: name,
            promo_price: price,
            regular_price: null, // Could be extracted if available
            location: null,
            product_ean: null,
            promo_start_date: null, // Could be extracted if dates are found
            promo_end_date: null,
          });
        }
      }
    }
  }

  // Remove duplicates based on product name
  const uniqueProducts = products.filter((product, index, self) =>
    index === self.findIndex((p) => p.product_name === product.product_name)
  );

  return uniqueProducts;
}
