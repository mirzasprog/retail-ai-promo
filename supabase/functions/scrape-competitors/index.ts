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

  if (!competitor.base_url.includes('robot.ba')) {
    console.log(`[SCRAPER] Skipping ${competitor.name} because only robot.ba scraping is supported in this version.`);
    return [];
  }

  try {
    return await scrapeRobotSite(competitor, firecrawl);
  } catch (error) {
    console.error(`[SCRAPER] Error scraping ${competitor.name}:`, error);
    if (error instanceof Error) {
      console.error(`[SCRAPER] Error details: ${error.message}`);
      console.error(`[SCRAPER] Stack trace:`, error.stack);
    }
    return [];
  }
}

async function scrapeRobotSite(competitor: Competitor, firecrawl: any): Promise<Product[]> {
  console.log(`[SCRAPER] Using robot.ba specific scraper for ${competitor.name}`);

  const crawlResult = await firecrawl.crawlUrl(competitor.base_url, {
    limit: 15,
    maxDepth: 2,
    scrapeOptions: {
      formats: ['html'],
      onlyMainContent: false,
      waitFor: 1500,
      timeout: 45000,
    },
  });

  if (!crawlResult?.success || !Array.isArray(crawlResult.data)) {
    const errorMessage = crawlResult?.error || 'Unknown Firecrawl error';
    console.error(`[SCRAPER] Firecrawl failed for ${competitor.name}: ${errorMessage}`);
    return [];
  }

  console.log(`[SCRAPER] Firecrawl returned ${crawlResult.data.length} pages for ${competitor.name}`);
  const collectedProducts: Product[] = [];

  for (const page of crawlResult.data) {
    const pageUrl = page.url || competitor.base_url;
    const html = page.html as string | undefined;

    if (!html) {
      continue;
    }

    const jsonProducts = extractProductsFromJsonLd(html, pageUrl);
    const cardProducts = extractProductsFromProductCards(html, pageUrl);

    collectedProducts.push(...jsonProducts, ...cardProducts);
  }

  const deduped = dedupeProducts(collectedProducts);
  console.log(`[SCRAPER] Parsed ${deduped.length} unique products for ${competitor.name}`);

  return deduped.slice(0, 150);
}

function extractProductsFromJsonLd(html: string, sourceUrl: string): Product[] {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const products: Product[] = [];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];

      for (const node of nodes) {
        if (!node) continue;

        if (Array.isArray(node['@graph'])) {
          for (const graphNode of node['@graph']) {
            const graphProducts = convertJsonLdNodeToProducts(graphNode, sourceUrl);
            products.push(...graphProducts);
          }
        } else {
          const nodeProducts = convertJsonLdNodeToProducts(node, sourceUrl);
          products.push(...nodeProducts);
        }
      }
    } catch (parseError) {
      console.log('[EXTRACTOR] Unable to parse JSON-LD block:', parseError);
    }
  }

  return products;
}

function convertJsonLdNodeToProducts(node: any, sourceUrl: string): Product[] {
  const products: Product[] = [];

  if (!node || typeof node !== 'object') {
    return products;
  }

  const type = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if (!type.includes('Product')) {
    return products;
  }

  const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
  const promo = offers.find((offer: any) => offer.price);

  if (node.name && promo?.price) {
    const priceValue = normalizePrice(promo.price);

    if (!isNaN(priceValue)) {
      products.push({
        name: String(node.name).trim().slice(0, 250),
        promoPrice: priceValue,
        regularPrice: promo.priceSpecification?.price || undefined,
        brand: node.brand?.name || undefined,
        ean: node.gtin13 || node.gtin || undefined,
        category: node.category || undefined,
        promoStartDate: promo.priceValidFrom || undefined,
        promoEndDate: promo.priceValidUntil || undefined,
      });
    }
  }

  return products;
}

function extractProductsFromProductCards(html: string, sourceUrl: string): Product[] {
  const products: Product[] = [];

  const productBlocks = Array.from(html.matchAll(/<article[\s\S]*?<\/article>/gi));
  const fallbackBlocks = Array.from(html.matchAll(/<div[^>]+class="[^"]*(?:product|item|card)[^"]*"[^>]*>[\s\S]*?<\/div>/gi));

  const blocks = productBlocks.length > 0 ? productBlocks : fallbackBlocks;

  for (const block of blocks) {
    const snippet = block[0];
    const nameMatch = snippet.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
      snippet.match(/class=["'][^"']*(?:title|name|product-name)[^"']*["'][^>]*>([\s\S]*?)<\//i) ||
      snippet.match(/alt=["']([^"']+)["']/i);

    const priceMatches = snippet.match(/(\d+[.,]\d{2})\s*(?:KM|BAM|€|EUR)?/gi);

    if (nameMatch && priceMatches?.length) {
      const cleanedName = nameMatch[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim();
      const prices = priceMatches.map(p => normalizePrice(p)).filter(p => !isNaN(p));

      if (cleanedName && prices.length > 0) {
        products.push({
          name: cleanedName.slice(0, 250),
          promoPrice: Math.min(...prices),
          regularPrice: prices.length > 1 ? Math.max(...prices) : undefined,
          category: extractCategory(snippet) || undefined,
          brand: extractBrand(snippet) || undefined,
        });
      }
    }
  }

  // Fallback for data attributes when markup is minimal
  const dataAttributeMatches = Array.from(html.matchAll(/data-product-name=["']([^"']+)["'][^>]*data-price=["']([^"']+)["']/gi));
  for (const match of dataAttributeMatches) {
    const name = match[1];
    const price = normalizePrice(match[2]);
    if (name && !isNaN(price)) {
      products.push({ name: name.trim().slice(0, 250), promoPrice: price });
    }
  }

  console.log(`[EXTRACTOR] Found ${products.length} products in HTML from ${sourceUrl}`);
  return products;
}

function extractCategory(html: string): string | null {
  const breadcrumbMatch = html.match(/class=["'][^"']*(?:breadcrumb|category)[^"']*["'][^>]*>([\s\S]*?)<\//i);
  if (breadcrumbMatch) {
    const text = breadcrumbMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function extractBrand(html: string): string | null {
  const brandMatch = html.match(/data-brand=["']([^"']+)["']/i) || html.match(/class=["'][^"']*brand[^"']*["'][^>]*>([\s\S]*?)<\//i);
  if (brandMatch) {
    const text = brandMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function dedupeProducts(products: Product[]): Product[] {
  const seen = new Map<string, Product>();

  for (const product of products) {
    const key = product.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, product);
    }
  }

  return Array.from(seen.values());
}

function normalizePrice(raw: string | number): number {
  if (typeof raw === 'number') {
    return raw;
  }

  return parseFloat(raw.replace(/[^\d.,-]/g, '').replace(',', '.'));
}
