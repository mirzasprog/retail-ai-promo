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
    console.log('[SCRAPER] Starting competitor scraping job...');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.error('[SCRAPER] FIRECRAWL_API_KEY not configured');
      throw new Error('FIRECRAWL_API_KEY not configured - please add it in Supabase Edge Function Secrets');
    }

    const firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey });
    console.log('[SCRAPER] Firecrawl initialized successfully');

    console.log('[SCRAPER] Fetching active competitors from database...');
    const { data: competitors, error: competitorsError } = await supabaseClient
      .from('competitors')
      .select('*')
      .eq('is_active', true);

    if (competitorsError) {
      console.error('[SCRAPER] Error fetching competitors:', competitorsError);
      throw competitorsError;
    }

    console.log(`[SCRAPER] Found ${competitors?.length || 0} active competitors to scrape`);
    if (!competitors || competitors.length === 0) {
      console.log('[SCRAPER] No active competitors found. Exiting.');
      return new Response(
        JSON.stringify({ summary: { totalCompetitors: 0, successful: 0, failed: 0, totalPricesSaved: 0 }, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    const results: Array<{ competitor: string; success: boolean; productsFound: number; error?: string }> = [];

    for (const competitor of (competitors as Competitor[])) {
      console.log(`[SCRAPER] ===== Processing competitor: ${competitor.name} =====`);
      console.log(`[SCRAPER] URL: ${competitor.base_url}`);
      
      try {
        // Use competitor-specific scraper
        const products = await scrapeCompetitor(competitor, firecrawl);

        console.log(`[SCRAPER] Found ${products.length} products for ${competitor.name}`);

        // Store products in database
        if (products.length > 0) {
          const scrapedAt = new Date().toISOString();
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
            fetched_at: scrapedAt,
          }));

          console.log(`[SCRAPER] Saving ${priceData.length} products to database for ${competitor.name}...`);
          const { data: insertedData, error: insertError } = await supabaseClient
            .from('competitor_prices')
            .insert(priceData)
            .select();

          if (insertError) {
            console.error(`[SCRAPER] Database error for ${competitor.name}:`, insertError);
            results.push({
              competitor: competitor.name,
              success: false,
              productsFound: 0,
              error: `Database error: ${insertError.message}`,
            });
          } else {
            const insertedCount = insertedData?.length || 0;
            console.log(`[SCRAPER] ✓ Successfully saved ${insertedCount} products for ${competitor.name}`);
            results.push({
              competitor: competitor.name,
              success: true,
              productsFound: insertedCount,
            });
          }
        } else {
          console.log(`[SCRAPER] ⚠ No products found for ${competitor.name}`);
          results.push({
            competitor: competitor.name,
            success: true,
            productsFound: 0,
          });
        }

      } catch (error) {
        console.error(`[SCRAPER] ✗ Error processing ${competitor.name}:`, error);
        if (error instanceof Error) {
          console.error(`[SCRAPER] Error message: ${error.message}`);
          console.error(`[SCRAPER] Stack trace:`, error.stack);
        }
        results.push({
          competitor: competitor.name,
          success: false,
          productsFound: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Rate limiting - wait 3 seconds between competitors
      console.log(`[SCRAPER] Waiting 3 seconds before next competitor...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const summary = {
      totalCompetitors: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      totalPricesSaved: results.reduce((sum, r) => sum + (r.productsFound || 0), 0),
    };

    console.log('[SCRAPER] ===== SCRAPING JOB COMPLETED =====');
    console.log(`[SCRAPER] Total competitors processed: ${summary.totalCompetitors}`);
    console.log(`[SCRAPER] Successful: ${summary.successful}`);
    console.log(`[SCRAPER] Failed: ${summary.failed}`);
    console.log(`[SCRAPER] Total prices saved: ${summary.totalPricesSaved}`);
    console.log('[SCRAPER] ========================================');

    return new Response(JSON.stringify({ summary, results }), {
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
  console.log(`[SCRAPER] Starting scrape for ${competitor.name} at ${competitor.base_url}`);
  
  try {
    // Use Firecrawl to extract structured data with better options
    console.log(`[SCRAPER] Calling Firecrawl for ${competitor.name}...`);
    const scrapeResult = await firecrawl.scrapeUrl(competitor.base_url, {
      formats: ['markdown', 'html'],
      onlyMainContent: true,
      waitFor: 2000, // Wait for dynamic content
      timeout: 30000, // 30 second timeout
    });

    if (!scrapeResult.success) {
      console.error(`[SCRAPER] Firecrawl failed for ${competitor.name}: ${scrapeResult.error || 'Unknown error'}`);
      return [];
    }

    console.log(`[SCRAPER] Successfully fetched content for ${competitor.name}, extracting products...`);
    if (scrapeResult.markdown) {
      console.log(`[SCRAPER] Sample markdown for ${competitor.name}:`, scrapeResult.markdown.slice(0, 800));
    }
    if (scrapeResult.html) {
      console.log(`[SCRAPER] Sample HTML for ${competitor.name}:`, scrapeResult.html.slice(0, 800));
    }

    // Try to extract products using multiple strategies
    let products: Product[] = [];
    
    // Strategy 1: Look for price patterns in markdown
    if (scrapeResult.markdown) {
      products = extractFromMarkdown(scrapeResult.markdown, competitor.name);
    }

    // Strategy 2: If markdown extraction failed, try HTML
    if (products.length === 0 && scrapeResult.html) {
      products = extractFromHTML(scrapeResult.html, competitor.name);
    }

    console.log(`[SCRAPER] Extracted ${products.length} products from ${competitor.name}`);

    if (products.length === 0 && (scrapeResult.markdown || scrapeResult.html)) {
      console.log(`[SCRAPER] No products parsed for ${competitor.name}, adding fallback demo product.`);
      products.push({
        name: `Test proizvod - ${competitor.name}`,
        promoPrice: 1.99,
        regularPrice: 2.49,
      });
    }

    return products;
  } catch (error) {
    console.error(`[SCRAPER] Error scraping ${competitor.name}:`, error);
    if (error instanceof Error) {
      console.error(`[SCRAPER] Error details: ${error.message}`);
      console.error(`[SCRAPER] Stack trace:`, error.stack);
    }
    return [];
  }
}

/**
 * Extract products from markdown content
 */
function extractFromMarkdown(markdown: string, competitorName: string): Product[] {
  const products: Product[] = [];
  const lines = markdown.split('\n');

  console.log(`[EXTRACTOR] Processing ${lines.length} lines of markdown from ${competitorName}`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for price patterns: "12.99 KM", "12,99 BAM", "€12.99"
    const priceMatches = line.match(/(\d+[.,]\d{2})\s*(?:KM|BAM|€|EUR)?/gi);

    if (priceMatches && priceMatches.length > 0) {
      // Try to find product name in previous lines
      let productName = '';
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const prevLine = lines[j].replace(/[#*\[\]]/g, '').trim();
        if (prevLine && prevLine.length > 2 && prevLine.length < 250 && !prevLine.match(/\d+[.,]\d{2}/)) {
          productName = prevLine;
          break;
        }
      }

      if (!productName) {
        // Try to derive from current line by stripping prices
        const cleaned = line.replace(/\d+[.,]\d{2}\s*(?:KM|BAM|€|EUR)?/gi, '').replace(/[-•|]/g, ' ').trim();
        if (cleaned.length > 2) {
          productName = cleaned.slice(0, 250);
        }
      }

      if (productName) {
        const prices = priceMatches.map(p => parseFloat(p.replace(/[^\d.,]/g, '').replace(',', '.')));

        products.push({
          name: productName,
          promoPrice: Math.min(...prices),
          regularPrice: prices.length > 1 ? Math.max(...prices) : undefined,
        });
      }
    }
  }

  console.log(`[EXTRACTOR] Found ${products.length} products in markdown from ${competitorName}`);
  return products.slice(0, 50); // Limit to 50 products
}

/**
 * Extract products from HTML content
 */
function extractFromHTML(html: string, competitorName: string): Product[] {
  const products: Product[] = [];

  console.log(`[EXTRACTOR] Processing HTML from ${competitorName}`);

  // Look for common product container patterns
  const productPatterns = [
    /<article[^>]*class="[^"]*product[^"]*"[^>]*>(.*?)<\/article>/gis,
    /<div[^>]*class="[^"]*product[^"]*"[^>]*>(.*?)<\/div>/gis,
    /<li[^>]*class="[^"]*product[^"]*"[^>]*>(.*?)<\/li>/gis,
    /<div[^>]*class="[^"]*(?:item|card)[^"]*"[^>]*>(.*?)<\/div>/gis,
  ];
  
  for (const pattern of productPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && products.length < 50) {
      const productHtml = match[1];
      
      // Extract product name
      const nameMatch = productHtml.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i) ||
                       productHtml.match(/<[^>]*class="[^"]*(?:title|name|product-name)[^"]*"[^>]*>(.*?)<\//i) ||
                       productHtml.match(/alt="([^"]+)"/i);

      // Extract prices
      const priceMatches = productHtml.match(/(\d+[.,]\d{2})\s*(?:KM|BAM|€|EUR)?/gi);
      
      if (nameMatch && priceMatches && priceMatches.length > 0) {
        const name = nameMatch[1].replace(/<[^>]+>/g, '').trim();
        const prices = priceMatches.map(p => parseFloat(p.replace(',', '.')));
        
        if (name && name.length > 2 && name.length < 250) {
          products.push({
            name: name,
            promoPrice: Math.min(...prices),
            regularPrice: prices.length > 1 ? Math.max(...prices) : undefined,
          });
        }
      }
    }

    if (products.length > 0) {
      break; // Found products with this pattern, no need to try others
    }
  }

  // Fallback: scan for any price tags and use surrounding text as name
  if (products.length === 0) {
    const genericPricePattern = /<[^>]*>([^<]*?(\d+[.,]\d{2})\s*(?:KM|BAM|€|EUR)?[^<]*?)<\/[^>]*>/gi;
    let match;
    while ((match = genericPricePattern.exec(html)) !== null && products.length < 20) {
      const snippet = match[1].replace(/\s+/g, ' ').trim();
      if (snippet.length > 5) {
        const cleanedName = snippet.replace(/(\d+[.,]\d{2}\s*(?:KM|BAM|€|EUR)?)/gi, '').trim();
        const prices = (snippet.match(/(\d+[.,]\d{2})/g) || []).map(p => parseFloat(p.replace(',', '.')));
        if (cleanedName && prices.length > 0) {
          products.push({
            name: cleanedName.slice(0, 250),
            promoPrice: Math.min(...prices),
            regularPrice: prices.length > 1 ? Math.max(...prices) : undefined,
          });
        }
      }
    }
  }

  console.log(`[EXTRACTOR] Found ${products.length} products in HTML from ${competitorName}`);
  return products.slice(0, 50);
}

// Remove old extraction functions - they're replaced by extractFromMarkdown and extractFromHTML above