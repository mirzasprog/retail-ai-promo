import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import FirecrawlApp from 'https://esm.sh/@mendable/firecrawl-js@1.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Competitor {
  id: string;
  name: string;
  base_url: string;
  source_type: string;
}

interface Product {
  name: string;
  category?: string;
  brand?: string;
  regularPrice?: number;
  promoPrice?: number;
  ean?: string;
  promoStartDate?: string;
  promoEndDate?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey });

    console.log('Fetching active competitors...');
    const { data: competitors, error: competitorsError } = await supabaseClient
      .from('competitors')
      .select('*')
      .eq('is_active', true);

    if (competitorsError) {
      throw competitorsError;
    }

    const results = [];

    for (const competitor of (competitors as Competitor[])) {
      console.log(`Processing competitor: ${competitor.name}`);
      
      try {
        // Use competitor-specific scraper
        const products = await scrapeCompetitor(competitor, firecrawl);
        
        // Store products in database
        if (products.length > 0) {
          const priceData = products.map(product => ({
            competitor_id: competitor.id,
            product_name: product.name,
            category: product.category,
            brand: product.brand,
            regular_price: product.regularPrice,
            promo_price: product.promoPrice,
            product_ean: product.ean,
            promo_start_date: product.promoStartDate || null,
            promo_end_date: product.promoEndDate || null,
            fetched_at: new Date().toISOString(),
          }));

          const { error: insertError } = await supabaseClient
            .from('competitor_prices')
            .insert(priceData);

          if (insertError) {
            console.error(`Error inserting products for ${competitor.name}:`, insertError);
          } else {
            console.log(`Successfully stored ${products.length} products for ${competitor.name}`);
          }
        }

        results.push({
          competitor: competitor.name,
          success: true,
          productsFound: products.length,
        });

      } catch (error) {
        console.error(`Error processing ${competitor.name}:`, error);
        results.push({
          competitor: competitor.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Rate limiting - wait 3 seconds between competitors
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in scrape-competitors function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Scrape products from a specific competitor using Firecrawl
 */
async function scrapeCompetitor(competitor: Competitor, firecrawl: any): Promise<Product[]> {
  console.log(`Scraping ${competitor.name} from ${competitor.base_url}`);
  
  try {
    // Use Firecrawl to extract structured data
    const scrapeResult = await firecrawl.scrapeUrl(competitor.base_url, {
      formats: ['markdown', 'html'],
      onlyMainContent: true,
    });

    if (!scrapeResult.success) {
      console.error(`Firecrawl failed for ${competitor.name}`);
      return [];
    }

    const products: Product[] = [];

    // Use competitor-specific extraction logic
    switch (competitor.name.toLowerCase()) {
      case 'bingo':
        return extractBingoProducts(scrapeResult);
      case 'mercator':
        return extractMercatorProducts(scrapeResult);
      case 'mojmarket':
        return extractMojMarketProducts(scrapeResult);
      case 'robot':
        return extractRobotProducts(scrapeResult);
      case 'emka':
        return extractEmkaProducts(scrapeResult);
      case 'spar':
        return extractSparProducts(scrapeResult);
      case 'market':
        return extractMarketProducts(scrapeResult);
      case 'crvena jabuka':
        return extractCrvenaJabukaProducts(scrapeResult);
      case 'hoše komerc':
        return extractHoseProducts(scrapeResult);
      default:
        // Generic extraction for unknown competitors
        return extractGenericProducts(scrapeResult);
    }
  } catch (error) {
    console.error(`Error scraping ${competitor.name}:`, error);
    return [];
  }
}

// Competitor-specific extractors
function extractBingoProducts(scrapeResult: any): Product[] {
  const products: Product[] = [];
  const html = scrapeResult.html || '';
  
  // Extract product data from Bingo's structure
  const productRegex = /<div[^>]*class="[^"]*product[^"]*"[^>]*>(.*?)<\/div>/gis;
  let match;
  
  while ((match = productRegex.exec(html)) !== null) {
    const productHtml = match[1];
    const nameMatch = productHtml.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    const priceMatch = productHtml.match(/(\d+[.,]\d{2})/g);
    
    if (nameMatch && priceMatch) {
      products.push({
        name: nameMatch[1].replace(/<[^>]+>/g, '').trim(),
        promoPrice: parseFloat(priceMatch[0].replace(',', '.')),
        regularPrice: priceMatch.length > 1 ? parseFloat(priceMatch[1].replace(',', '.')) : undefined,
      });
    }
  }
  
  return products;
}

function extractMercatorProducts(scrapeResult: any): Product[] {
  const products: Product[] = [];
  const markdown = scrapeResult.markdown || '';
  
  // Extract from Mercator's markdown structure
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('KM') && i > 0) {
      const priceMatch = line.match(/(\d+[.,]\d{2})/);
      if (priceMatch) {
        products.push({
          name: lines[i - 1].replace(/[#*]/g, '').trim(),
          promoPrice: parseFloat(priceMatch[1].replace(',', '.')),
        });
      }
    }
  }
  
  return products;
}

function extractMojMarketProducts(scrapeResult: any): Product[] {
  const products: Product[] = [];
  const html = scrapeResult.html || '';
  
  // Extract from MojMarket structure
  const productRegex = /<div[^>]*class="[^"]*product[^"]*"[^>]*>(.*?)<\/div>/gis;
  let match;
  
  while ((match = productRegex.exec(html)) !== null) {
    const productHtml = match[1];
    const nameMatch = productHtml.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    const priceMatch = productHtml.match(/(\d+[.,]\d{2})/g);
    
    if (nameMatch && priceMatch) {
      products.push({
        name: nameMatch[1].replace(/<[^>]+>/g, '').trim(),
        promoPrice: parseFloat(priceMatch[0].replace(',', '.')),
      });
    }
  }
  
  return products;
}

function extractRobotProducts(scrapeResult: any): Product[] {
  return extractGenericProducts(scrapeResult);
}

function extractEmkaProducts(scrapeResult: any): Product[] {
  return extractGenericProducts(scrapeResult);
}

function extractSparProducts(scrapeResult: any): Product[] {
  return extractGenericProducts(scrapeResult);
}

function extractMarketProducts(scrapeResult: any): Product[] {
  return extractGenericProducts(scrapeResult);
}

function extractCrvenaJabukaProducts(scrapeResult: any): Product[] {
  return extractGenericProducts(scrapeResult);
}

function extractHoseProducts(scrapeResult: any): Product[] {
  return extractGenericProducts(scrapeResult);
}

function extractGenericProducts(scrapeResult: any): Product[] {
  const products: Product[] = [];
  const html = scrapeResult.html || '';
  const markdown = scrapeResult.markdown || '';
  
  // Try to extract from markdown first
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const priceMatch = line.match(/(\d+[.,]\d{2})\s*(?:KM|BAM|€)/i);
    if (priceMatch && i > 0) {
      const prevLine = lines[i - 1].replace(/[#*\[\]]/g, '').trim();
      if (prevLine && prevLine.length > 3 && prevLine.length < 200) {
        products.push({
          name: prevLine,
          promoPrice: parseFloat(priceMatch[1].replace(',', '.')),
        });
      }
    }
  }
  
  // If no products found in markdown, try HTML
  if (products.length === 0) {
    const priceRegex = /(\d+[.,]\d{2})\s*(?:KM|BAM|€)/gi;
    let match;
    while ((match = priceRegex.exec(html)) !== null) {
      const price = parseFloat(match[1].replace(',', '.'));
      // Try to find product name nearby
      const beforeText = html.substring(Math.max(0, match.index - 200), match.index);
      const nameMatch = beforeText.match(/>([^<]{10,100})</);
      if (nameMatch) {
        products.push({
          name: nameMatch[1].trim(),
          promoPrice: price,
        });
      }
    }
  }
  
  // Remove duplicates
  return products.filter((product, index, self) =>
    index === self.findIndex((p) => p.name === product.name && p.promoPrice === product.promoPrice)
  ).slice(0, 50); // Limit to 50 products per competitor
}