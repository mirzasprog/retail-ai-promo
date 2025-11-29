import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

interface Campaign {
  title: string;
  url: string;
  startDate?: string;
  endDate?: string;
}

interface Product {
  name: string;
  category?: string;
  brand?: string;
  regularPrice?: number;
  promoPrice?: number;
  ean?: string;
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
        // Step 1: Fetch campaigns for this competitor
        const campaigns = await fetchCampaigns(competitor);
        console.log(`Found ${campaigns.length} campaigns for ${competitor.name}`);

        // Step 2: For each campaign, fetch products
        for (const campaign of campaigns) {
          console.log(`Fetching products for campaign: ${campaign.title}`);
          const products = await fetchProductsForCampaign(campaign, competitor);
          
          // Step 3: Store products in database
          if (products.length > 0) {
            const priceData = products.map(product => ({
              competitor_id: competitor.id,
              product_name: product.name,
              category: product.category,
              brand: product.brand,
              regular_price: product.regularPrice,
              promo_price: product.promoPrice,
              product_ean: product.ean,
              promo_start_date: campaign.startDate || null,
              promo_end_date: campaign.endDate || null,
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
        }

        results.push({
          competitor: competitor.name,
          success: true,
          campaigns: campaigns.length,
        });

      } catch (error) {
        console.error(`Error processing ${competitor.name}:`, error);
        results.push({
          competitor: competitor.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Rate limiting - wait 2 seconds between competitors
      await new Promise(resolve => setTimeout(resolve, 2000));
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
 * Step 1: Fetch campaigns/promotional pages for a competitor
 */
async function fetchCampaigns(competitor: Competitor): Promise<Campaign[]> {
  console.log(`Fetching campaigns from: ${competitor.base_url}`);
  
  try {
    const response = await fetch(competitor.base_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const campaigns: Campaign[] = [];

    // Parse HTML to find promotional campaigns/leaflets
    // Look for common patterns: "akcija", "katalog", "letak", "ponuda"
    const campaignPatterns = [
      /akcija[^"<]*(?:od|do|\d{1,2}\.\d{1,2})/gi,
      /katalog[^"<]*(?:važi|vrijedi)/gi,
      /letak[^"<]*(?:\d{1,2}\.\d{1,2})/gi,
      /ponuda[^"<]*(?:sedmica|tjedan|month)/gi,
    ];

    // Extract links that might be campaign pages
    const linkRegex = /<a[^>]*href=["']([^"']*(?:akcij|katalog|letak|ponud)[^"']*)["'][^>]*>([^<]+)</gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1].startsWith('http') ? match[1] : new URL(match[1], competitor.base_url).href;
      const title = match[2].trim();

      // Try to extract dates from the title or surrounding text
      const dateMatch = title.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/g);
      let startDate, endDate;

      if (dateMatch && dateMatch.length >= 2) {
        startDate = parseDate(dateMatch[0]);
        endDate = parseDate(dateMatch[1]);
      }

      campaigns.push({ title, url, startDate, endDate });
    }

    // If no specific campaigns found, use the base URL as a single campaign
    if (campaigns.length === 0) {
      campaigns.push({
        title: `${competitor.name} Current Offers`,
        url: competitor.base_url,
      });
    }

    return campaigns.slice(0, 5); // Limit to 5 campaigns per competitor

  } catch (error) {
    console.error(`Error fetching campaigns for ${competitor.name}:`, error);
    // Fallback to base URL
    return [{
      title: `${competitor.name} Current Offers`,
      url: competitor.base_url,
    }];
  }
}

/**
 * Step 2: Fetch products from a specific campaign page
 */
async function fetchProductsForCampaign(campaign: Campaign, competitor: Competitor): Promise<Product[]> {
  console.log(`Scraping products from: ${campaign.url}`);
  
  try {
    const response = await fetch(campaign.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const products: Product[] = [];

    // Try to parse JSON if response is JSON
    try {
      const json = JSON.parse(html);
      if (Array.isArray(json)) {
        return parseProductsFromJSON(json);
      }
    } catch {
      // Not JSON, continue with HTML parsing
    }

    // Parse HTML for product information
    // Look for common e-commerce patterns
    const productPatterns = [
      // Product containers
      /<div[^>]*class=["'][^"']*product[^"']*["'][^>]*>(.*?)<\/div>/gis,
      /<article[^>]*class=["'][^"']*product[^"']*["'][^>]*>(.*?)<\/article>/gis,
    ];

    for (const pattern of productPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && products.length < 100) {
        const productHtml = match[1];
        const product = extractProductFromHTML(productHtml);
        
        if (product && product.name && product.promoPrice) {
          products.push(product);
        }
      }
    }

    console.log(`Extracted ${products.length} products from ${campaign.url}`);
    return products;

  } catch (error) {
    console.error(`Error fetching products from ${campaign.url}:`, error);
    return [];
  }
}

/**
 * Extract product details from HTML snippet
 */
function extractProductFromHTML(html: string): Product | null {
  try {
    // Extract product name
    const nameMatch = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i) || 
                     html.match(/title=["']([^"']+)["']/i) ||
                     html.match(/alt=["']([^"']+)["']/i);
    const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : null;

    if (!name) return null;

    // Extract prices (look for numbers with currency or price patterns)
    const priceMatches = html.match(/(\d+[.,]\d{2})/g) || [];
    const prices = priceMatches.map(p => parseFloat(p.replace(',', '.')));

    let regularPrice, promoPrice;
    if (prices.length === 2) {
      regularPrice = Math.max(...prices);
      promoPrice = Math.min(...prices);
    } else if (prices.length === 1) {
      promoPrice = prices[0];
    }

    // Extract category (look for common class names or data attributes)
    const categoryMatch = html.match(/(?:category|kategorij)[^>]*>([^<]+)</i) ||
                         html.match(/data-category=["']([^"']+)["']/i);
    const category = categoryMatch ? categoryMatch[1].trim() : undefined;

    // Extract brand
    const brandMatch = html.match(/(?:brand|brend)[^>]*>([^<]+)</i) ||
                      html.match(/data-brand=["']([^"']+)["']/i);
    const brand = brandMatch ? brandMatch[1].trim() : undefined;

    // Extract EAN
    const eanMatch = html.match(/ean[^>]*>(\d+)</i) ||
                    html.match(/data-ean=["'](\d+)["']/i);
    const ean = eanMatch ? eanMatch[1] : undefined;

    return {
      name,
      category,
      brand,
      regularPrice,
      promoPrice,
      ean,
    };
  } catch (error) {
    console.error('Error extracting product from HTML:', error);
    return null;
  }
}

/**
 * Parse products from JSON response
 */
function parseProductsFromJSON(json: any[]): Product[] {
  return json.map(item => ({
    name: item.name || item.title || item.productName,
    category: item.category || item.categoryName,
    brand: item.brand || item.brandName,
    regularPrice: item.regularPrice || item.price || item.originalPrice,
    promoPrice: item.promoPrice || item.salePrice || item.discountPrice,
    ean: item.ean || item.gtin || item.barcode,
  })).filter(p => p.name && p.promoPrice);
}

/**
 * Parse date string to ISO format
 */
function parseDate(dateStr: string): string | undefined {
  const match = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
  if (!match) return undefined;

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3] || new Date().getFullYear();

  return `${year}-${month}-${day}`;
}