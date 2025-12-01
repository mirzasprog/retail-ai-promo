import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getDocument } from 'https://esm.sh/pdfjs-dist@3.11.174/legacy/build/pdf.js';
import Tesseract from 'https://esm.sh/tesseract.js@5.1.0';
import { load as loadHtml } from 'https://esm.sh/cheerio@1.0.0-rc.12';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SourceType = 'api' | 'html' | 'csv' | 'json' | 'pdf' | 'image';

interface Competitor {
  id: string;
  name: string;
  base_url: string;
  source_type: SourceType;
  config_json?: unknown;
  scraper_config?: unknown;
  config?: unknown;
}

interface ScrapedProduct {
  name: string;
  category?: string | null;
  brand?: string | null;
  regularPrice?: number | null;
  promoPrice?: number | null;
  ean?: string | null;
  promoStartDate?: string | null;
  promoEndDate?: string | null;
  currency?: string | null;
}

interface ScraperConfig {
  selectors?: {
    productCard?: string;
    name?: string;
    price?: string;
    regularPrice?: string;
    ean?: string;
    brand?: string;
    category?: string;
    currency?: string;
  };
  jsonMap?: Partial<Record<'name' | 'price' | 'regularPrice' | 'ean' | 'brand' | 'category' | 'promoStartDate' | 'promoEndDate' | 'currency', string>>;
  csvMap?: Partial<Record<'name' | 'price' | 'regularPrice' | 'ean' | 'brand' | 'category' | 'promoStartDate' | 'promoEndDate' | 'currency', string>>;
  aiEnabled?: boolean;
}

type ParsedCandidate = { product: ScrapedProduct; rawBlock?: string };

const COMPETITOR_CONFIGS: Record<string, ScraperConfig> = {};

function getScraperConfig(competitor: Competitor): ScraperConfig | null {
  const inline = (competitor as unknown as { scraper_config?: unknown; config?: unknown }).scraper_config ??
    (competitor as unknown as { scraper_config?: unknown; config?: unknown }).config ??
    competitor.config_json;

  if (inline) {
    try {
      if (typeof inline === 'string') {
        return JSON.parse(inline) as ScraperConfig;
      }
      return inline as ScraperConfig;
    } catch (error) {
      console.warn('[SCRAPER] Failed to parse inline scraper_config for', competitor.name, error);
    }
  }

  const predefined = COMPETITOR_CONFIGS[competitor.id] || COMPETITOR_CONFIGS[competitor.name];
  return predefined || null;
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

    for (const competitor of competitors as Competitor[]) {
  console.log(`[SCRAPER] ===== Processing competitor: ${competitor.name} =====`);
  console.log(`[SCRAPER] URL: ${competitor.base_url}`);
  console.log(`[SCRAPER] Source type: ${competitor.source_type}`);
      const config = getScraperConfig(competitor);
      if (config) {
        console.log(`[SCRAPER] Loaded custom scraper config for ${competitor.name}`);
      }

      try {
        const products = await scrapeCompetitor(competitor, config);
        console.log(`[SCRAPER] Found ${products.length} products for ${competitor.name}`);

        if (products.length > 0) {
          const scrapedAt = new Date().toISOString();
          const priceData = products.map((product) => ({
            competitor_id: competitor.id,
            product_name: product.name,
            category: product.category ?? null,
            brand: product.brand ?? null,
            regular_price: product.regularPrice ?? null,
            promo_price: product.promoPrice ?? null,
            product_ean: product.ean ?? null,
            promo_start_date: product.promoStartDate ?? null,
            promo_end_date: product.promoEndDate ?? null,
            currency: product.currency ?? null,
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

      console.log(`[SCRAPER] Waiting 3 seconds before next competitor...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
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

async function scrapeCompetitor(competitor: Competitor, config: ScraperConfig | null): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Starting scrape for ${competitor.name} at ${competitor.base_url}`);
  const sourceType = (competitor.source_type?.toLowerCase() as SourceType) || 'html';

  if (sourceType === 'html' || sourceType === 'api') {
    const apiProducts = await scrapeWooCommerceStore(competitor.base_url, config);
    if (apiProducts.length > 0) {
      console.log(`[SCRAPER] Using WooCommerce Store API results for ${competitor.name}`);
      return dedupeProducts(apiProducts);
    }
  }

  const routers: Record<SourceType, (competitor: Competitor, config: ScraperConfig | null) => Promise<ScrapedProduct[]>> = {
    html: scrapeHtmlSite,
    pdf: scrapePdfSource,
    json: scrapeJsonSource,
    csv: scrapeCsvSource,
    image: scrapeImageSource,
    api: scrapeJsonSource,
  };

  const preferredOrder: SourceType[] = [];
  const addStrategy = (type: SourceType) => {
    if (!preferredOrder.includes(type)) preferredOrder.push(type);
  };

  addStrategy(sourceType);
  if (sourceType !== 'html') addStrategy('html');
  if (sourceType !== 'json') addStrategy('json');
  if (sourceType !== 'csv') addStrategy('csv');
  if (sourceType !== 'pdf') addStrategy('pdf');
  if (sourceType !== 'image') addStrategy('image');

  const aggregated: ScrapedProduct[] = [];

  for (const strategy of preferredOrder) {
    const scraper = routers[strategy] || scrapeHtmlSite;
    console.log(`[SCRAPER] Executing ${strategy} strategy for ${competitor.name}`);
    const products = await scraper(competitor, config);
    console.log(`[SCRAPER] ${strategy.toUpperCase()} scraper returned ${products.length} products for ${competitor.name}`);
    aggregated.push(...products);
  }

  const deduped = dedupeProducts(aggregated);
  console.log(`[SCRAPER] After merging strategies, ${competitor.name} has ${deduped.length} unique products`);
  return deduped;
}

async function scrapeHtmlSite(competitor: Competitor, config: ScraperConfig | null): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Using HTML scraper for ${competitor.name}`);
  const origin = normalizeOrigin(competitor.base_url);
  if (!origin) return [];

  const toVisit = new Set<string>([competitor.base_url]);
  const visited = new Set<string>();
  const collected: ParsedCandidate[] = [];

  while (toVisit.size > 0 && visited.size < 8) {
    const [nextUrl] = Array.from(toVisit);
    toVisit.delete(nextUrl);
    if (visited.has(nextUrl)) continue;
    visited.add(nextUrl);

    try {
      const html = await fetchText(nextUrl);
      if (!html) continue;

      const domProducts = extractProductsFromDom(html, nextUrl, config);
      const jsonProducts = extractProductsFromJsonLd(html, nextUrl).map((product) => ({ product, rawBlock: undefined }));
      const cardProducts = extractProductsFromProductCards(html, nextUrl, config);
      collected.push(...domProducts, ...jsonProducts, ...cardProducts);

      for (const link of extractLinks(html, origin)) {
        if (!visited.has(link) && toVisit.size < 15) {
          toVisit.add(link);
        }
      }
    } catch (error) {
      console.warn(`[SCRAPER] Failed to fetch ${nextUrl}:`, error);
    }
  }

  console.log(`[SCRAPER] HTML scraper visited ${visited.size} pages for ${competitor.name}`);
  return await finalizeCandidates(collected, config, 'html');
}

async function scrapePdfSource(competitor: Competitor, config: ScraperConfig | null): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Using PDF scraper for ${competitor.name}`);
  try {
    const pdfBuffer = await fetchArrayBuffer(competitor.base_url);
    if (!pdfBuffer) return [];

    const pdf = await getDocument({ data: pdfBuffer }).promise;
    const pageBlocks: ParsedCandidate[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const textItems = content.items as Array<{ str?: string }>;
      const pageText = textItems.map((item) => item.str ?? '').join(' ');
      pageBlocks.push(...parseProductsFromTextContent(pageText, competitor.base_url));
    }

    console.log(`[SCRAPER] Extracted text from ${pdf.numPages} PDF pages for ${competitor.name}`);
    return await finalizeCandidates(pageBlocks, config, 'pdf');
  } catch (error) {
    console.error(`[SCRAPER] PDF extraction failed for ${competitor.name}:`, error);
    return [];
  }
}

async function scrapeJsonSource(competitor: Competitor, config: ScraperConfig | null): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Using JSON/API scraper for ${competitor.name}`);
  try {
    const response = await fetch(competitor.base_url, {
      headers: {
        'User-Agent': 'retail-ai-promo-scraper/1.0',
        Accept: 'application/json, text/plain;q=0.9',
      },
    });

    if (!response.ok) {
      console.warn(`[SCRAPER] JSON source returned status ${response.status} for ${competitor.base_url}`);
      return [];
    }

    const payload = await response.json();
    const products = parseProductsFromJsonStructure(payload, config);
    console.log(`[SCRAPER] Parsed ${products.length} products from JSON for ${competitor.name}`);
    const candidates = products.map((product) => ({ product, rawBlock: JSON.stringify(product) }));
    return await finalizeCandidates(candidates, config, 'json');
  } catch (error) {
    console.error(`[SCRAPER] JSON scraping failed for ${competitor.name}:`, error);
    return [];
  }
}

async function scrapeCsvSource(competitor: Competitor, config: ScraperConfig | null): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Using CSV scraper for ${competitor.name}`);
  try {
    const text = await fetchText(competitor.base_url);
    if (!text) return [];

    const delimiter = text.includes(';') ? ';' : ',';
    const lines = text.split(/\r?\n/).filter(Boolean);
    const [headerLine, ...rows] = lines;
    const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase());

    const products: ParsedCandidate[] = [];
    for (const row of rows) {
      const cols = row.split(delimiter).map((c) => c.trim());
      const record: Record<string, string> = {};
      headers.forEach((header, idx) => {
        record[header] = cols[idx];
      });

      const parsed = mapCsvRecordToProduct(record, config);
      if (parsed) {
        products.push({ product: parsed, rawBlock: JSON.stringify(record) });
      }
    }

    console.log(`[SCRAPER] Parsed ${products.length} products from CSV for ${competitor.name}`);
    return await finalizeCandidates(products, config, 'csv');
  } catch (error) {
    console.error(`[SCRAPER] CSV scraping failed for ${competitor.name}:`, error);
    return [];
  }
}

async function scrapeImageSource(competitor: Competitor, config: ScraperConfig | null): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Using image scraper with OCR for ${competitor.name}`);
  try {
    const buffer = await fetchArrayBuffer(competitor.base_url);
    if (!buffer) return [];

    const { data } = await Tesseract.recognize(new Uint8Array(buffer), 'eng', {
      logger: (message: { status?: string; progress?: number }) =>
        console.log(`[OCR] ${message.status || 'progress'}: ${message.progress || ''}`),
    });

    if (!data?.text) {
      console.warn(`[SCRAPER] OCR returned empty text for ${competitor.name}`);
      return [];
    }

    console.log(`[SCRAPER] OCR extracted text length ${data.text.length} for ${competitor.name}`);
    return await finalizeCandidates(parseProductsFromTextContent(data.text, competitor.base_url), config, 'image');
  } catch (error) {
    console.error(`[SCRAPER] Image OCR scraping failed for ${competitor.name}:`, error);
    return [];
  }
}

async function scrapeWooCommerceStore(baseUrl: string, config: ScraperConfig | null): Promise<ScrapedProduct[]> {
  try {
    const origin = normalizeOrigin(baseUrl);
    const perPage = 100;
    const maxPages = 10;
    const collected: ScrapedProduct[] = [];

    if (!origin) return collected;

    for (let page = 1; page <= maxPages; page++) {
      const apiUrl = `${origin}/wp-json/wc/store/products?page=${page}&per_page=${perPage}`;
      console.log(`[SCRAPER] Fetching WooCommerce products from ${apiUrl}`);

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'retail-ai-promo-scraper/1.0',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[SCRAPER] WooCommerce API returned status ${response.status} for ${apiUrl}`);
        break;
      }

      const products = await response.json();
      if (!Array.isArray(products) || products.length === 0) {
        console.log(`[SCRAPER] No more WooCommerce products after page ${page}`);
        break;
      }

      for (const product of products) {
        const prices = product?.prices || {};
        const rawPrice = prices?.sale_price || prices?.price || prices?.regular_price;
        const numericPrice = normalizePrice(String(rawPrice ?? ''));

        if (!product?.name || isNaN(numericPrice)) continue;

        collected.push({
          name: String(product.name).trim().slice(0, 250),
          promoPrice: numericPrice,
          regularPrice: prices?.regular_price ? normalizePrice(String(prices.regular_price)) : null,
          brand: product?.brands?.[0]?.name || null,
          category: product?.categories?.[0]?.name || null,
          ean: product?.gtin || product?.sku || null,
          currency: prices?.currency_code || extractCurrency(String(rawPrice)) || null,
        });
      }

      if (products.length < perPage) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const deduped = dedupeProducts(await finalizeCandidates(collected.map((p) => ({ product: p })), config, 'api'));
    console.log(`[SCRAPER] WooCommerce API yielded ${deduped.length} products`);
    return deduped;
  } catch (error) {
    console.warn('[SCRAPER] WooCommerce API scrape failed, falling back to other scraper:', error);
    return [];
  }
}

function extractProductsFromJsonLd(html: string, sourceUrl: string): ScrapedProduct[] {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const products: ScrapedProduct[] = [];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];

      for (const node of nodes) {
        if (!node) continue;

        const graph = Array.isArray(node['@graph']) ? node['@graph'] : [node];
        for (const graphNode of graph) {
          const type = Array.isArray(graphNode['@type']) ? graphNode['@type'] : [graphNode['@type']];
          if (!type.includes('Product')) continue;

        const offers = Array.isArray(graphNode.offers)
          ? graphNode.offers
          : graphNode.offers
          ? [graphNode.offers]
          : [];
        type Offer = {
          price?: unknown;
          priceSpecification?: { price?: number };
          priceCurrency?: string;
          priceValidFrom?: string;
          priceValidUntil?: string;
        };
        const normalizedOffers = offers as Offer[];
        const promo = normalizedOffers.find((offer) => offer.price !== undefined);

          if (graphNode.name && promo?.price) {
            const priceValue = normalizePrice(promo.price);
            if (!isNaN(priceValue)) {
              products.push({
                name: String(graphNode.name).trim().slice(0, 250),
                promoPrice: priceValue,
                regularPrice: promo.priceSpecification?.price || null,
                brand: graphNode.brand?.name || null,
                ean: graphNode.gtin13 || graphNode.gtin || null,
                category: graphNode.category || null,
                promoStartDate: promo.priceValidFrom || null,
                promoEndDate: promo.priceValidUntil || null,
                currency: promo.priceCurrency || extractCurrency(String(promo.price)) || null,
              });
            }
          }
        }
      }
    } catch (parseError) {
      console.log('[EXTRACTOR] Unable to parse JSON-LD block:', parseError);
    }
  }

  console.log(`[EXTRACTOR] Found ${products.length} JSON-LD products in ${sourceUrl}`);
  return products;
}

function extractProductsFromDom(html: string, sourceUrl: string, config: ScraperConfig | null): ParsedCandidate[] {
  const $ = loadHtml(html);
  const selectors = config?.selectors || {};
  const productSelector = selectors.productCard || 'article, .product, .product-card, .item';
  const products: ParsedCandidate[] = [];

  $(productSelector).each((_, element) => {
    const rawBlock = $(element).html() || '';
    const name = selectors.name
      ? $(element).find(selectors.name).text()
      : $(element).find('h1,h2,h3,h4,h5,h6,.product-name,.title,[itemprop="name"]').text();
    const promoPriceText = selectors.price
      ? $(element).find(selectors.price).text()
      : $(element).find('.price,.promo-price,[itemprop="price"]').first().text();
    const regularPriceText = selectors.regularPrice
      ? $(element).find(selectors.regularPrice).text()
      : $(element).find('.regular-price,.old-price,.compare-at-price').first().text();
    const ean = selectors.ean
      ? $(element).find(selectors.ean).text() || $(element).attr('data-ean')
      : $(element).attr('data-ean') || $(element).find('[itemprop="gtin13"],[itemprop="sku"]').text();
    const brand = selectors.brand
      ? $(element).find(selectors.brand).text()
      : $(element).find('[itemprop="brand"],.brand').text();
    const category = selectors.category
      ? $(element).find(selectors.category).text()
      : $(element).closest('[data-category],.category,[itemprop="category"]').first().text();
    const currency = selectors.currency
      ? $(element).find(selectors.currency).text()
      : $(element).find('[itemprop="priceCurrency"]').attr('content') || extractCurrency(promoPriceText || regularPriceText);

    const promoPrice = normalizePrice(promoPriceText || '');
    const regularPrice = normalizePrice(regularPriceText || '');

    if (name && !isNaN(promoPrice)) {
      products.push({
        product: {
          name: name.trim().slice(0, 250),
          promoPrice,
          regularPrice: !isNaN(regularPrice) ? regularPrice : null,
          ean: ean?.trim() || null,
          brand: brand?.trim() || null,
          category: category?.trim() || null,
          currency: currency || null,
        },
        rawBlock,
      });
    }
  });

  if (products.length === 0) {
    console.log(`[EXTRACTOR] DOM selectors returned no products for ${sourceUrl}, falling back to regex card parsing`);
    return extractProductsFromProductCards(html, sourceUrl, config);
  }

  console.log(`[EXTRACTOR] Found ${products.length} DOM products in HTML from ${sourceUrl}`);
  return products;
}

function extractProductsFromProductCards(html: string, sourceUrl: string, config: ScraperConfig | null): ParsedCandidate[] {
  const products: ParsedCandidate[] = [];

  const productBlocks = Array.from(html.matchAll(/<article[\s\S]*?<\/article>/gi));
  const fallbackBlocks = Array.from(html.matchAll(/<div[^>]+class="[^"]*(?:product|item|card)[^"]*"[^>]*>[\s\S]*?<\/div>/gi));
  const blocks = productBlocks.length > 0 ? productBlocks : fallbackBlocks;

  for (const block of blocks) {
    const snippet = block[0];
    const nameMatch =
      snippet.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
      snippet.match(/class=["'][^"']*(?:title|name|product-name)[^"']*["'][^>]*>([\s\S]*?)<\//i) ||
      snippet.match(/alt=["']([^"']+)["']/i);

    const priceMatches = snippet.match(/([A-Z]{3}|€|KM|BAM)?\s?(\d+[.,]\d{2})/gi);

    if (nameMatch && priceMatches?.length) {
      const cleanedName = nameMatch[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim();
      const parsedPrices = priceMatches.map((p) => {
        const currency = extractCurrency(p);
        return { price: normalizePrice(p), currency };
      });
      const validPrices = parsedPrices.filter((p) => !isNaN(p.price));

      if (cleanedName && validPrices.length > 0) {
        const currencies = validPrices.map((p) => p.currency).filter(Boolean) as string[];
        products.push({
          product: {
            name: cleanedName.slice(0, 250),
            promoPrice: Math.min(...validPrices.map((p) => p.price)),
            regularPrice: validPrices.length > 1 ? Math.max(...validPrices.map((p) => p.price)) : null,
            category: extractCategory(snippet, config) || null,
            brand: extractBrand(snippet, config) || null,
            currency: currencies[0] || null,
          },
          rawBlock: snippet,
        });
      }
    }
  }

  const dataAttributeMatches = Array.from(
    html.matchAll(/data-product-name=["']([^"']+)["'][^>]*data-price=["']([^"']+)["']/gi)
  );
  for (const match of dataAttributeMatches) {
    const name = match[1];
    const price = normalizePrice(match[2]);
    const currency = extractCurrency(match[2]);
    if (name && !isNaN(price)) {
      products.push({ product: { name: name.trim().slice(0, 250), promoPrice: price, currency }, rawBlock: match[0] });
    }
  }

  console.log(`[EXTRACTOR] Found ${products.length} products in HTML from ${sourceUrl}`);
  return products;
}

function extractCategory(html: string, config: ScraperConfig | null): string | null {
  if (config?.selectors?.category) {
    return null;
  }
  const breadcrumbMatch = html.match(/class=["'][^"']*(?:breadcrumb|category)[^"']*["'][^>]*>([\s\S]*?)<\//i);
  if (breadcrumbMatch) {
    const text = breadcrumbMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return null;
}

function extractBrand(html: string, config: ScraperConfig | null): string | null {
  if (config?.selectors?.brand) return null;
  const brandMatch =
    html.match(/data-brand=["']([^"']+)["']/i) || html.match(/class=["'][^"']*brand[^"']*["'][^>]*>([\s\S]*?)<\//i);
  if (brandMatch) {
    const text = brandMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return null;
}

function parseProductsFromTextContent(content: string, sourceUrl: string): ParsedCandidate[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const products: ParsedCandidate[] = [];
  const priceRegex = /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g;
  let pendingNameParts: string[] = [];

  for (const line of lines) {
    const priceMatches = Array.from(line.matchAll(priceRegex))
      .map((match) => ({ price: normalizePrice(match[1]), currency: extractCurrency(line) }))
      .filter((p) => !isNaN(p.price));

    if (priceMatches.length === 0) {
      if (pendingNameParts.length < 2) {
        pendingNameParts.push(line);
      } else {
        pendingNameParts = [pendingNameParts[1], line];
      }
      continue;
    }

    const candidateName = [...pendingNameParts, line]
      .join(' ')
      .replace(priceRegex, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    pendingNameParts = [];

    if (candidateName && priceMatches.length > 0) {
      const currencies = priceMatches.map((p) => p.currency).filter(Boolean) as string[];
      products.push({
        product: {
          name: candidateName.slice(0, 250),
          promoPrice: Math.min(...priceMatches.map((p) => p.price)),
          regularPrice: priceMatches.length > 1 ? Math.max(...priceMatches.map((p) => p.price)) : null,
          currency: currencies[0] || null,
        },
        rawBlock: line,
      });
    }
  }

  console.log(`[EXTRACTOR] Found ${products.length} products in text from ${sourceUrl}`);
  return products;
}

function parseProductsFromJsonStructure(payload: unknown, config: ScraperConfig | null): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const payloadObject = payload as { items?: unknown[]; products?: unknown[] };
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payloadObject?.items)
    ? payloadObject.items
    : Array.isArray(payloadObject?.products)
    ? payloadObject.products
    : [];

  for (const item of list) {
    const record = item as Record<string, unknown>;
    const mapped = mapJsonRecordToProduct(record, config);
    if (mapped) {
      products.push(mapped);
    }
  }

  return products;
}

function dedupeProducts(products: ScrapedProduct[]): ScrapedProduct[] {
  const seen = new Map<string, ScrapedProduct>();

  for (const product of products) {
    const normalizedName = (product.name || '').toLowerCase();
    const key = `${normalizedName}|${(product.ean || '').toLowerCase()}`;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, product);
    } else {
      seen.set(key, {
        ...existing,
        ...mergeProducts(existing, product),
      });
    }
  }

  return Array.from(seen.values());
}

function mergeProducts(base: ScrapedProduct, incoming: ScrapedProduct): ScrapedProduct {
  return {
    ...base,
    ...incoming,
    promoPrice: typeof incoming.promoPrice === 'number' && !isNaN(incoming.promoPrice) ? incoming.promoPrice : base.promoPrice,
    regularPrice:
      typeof incoming.regularPrice === 'number' && !isNaN(incoming.regularPrice) ? incoming.regularPrice : base.regularPrice,
    currency: incoming.currency || base.currency || null,
    ean: incoming.ean || base.ean || null,
    brand: incoming.brand || base.brand || null,
    category: incoming.category || base.category || null,
    promoStartDate: incoming.promoStartDate || base.promoStartDate || null,
    promoEndDate: incoming.promoEndDate || base.promoEndDate || null,
  };
}

function normalizePrice(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/[^\d.,-]/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

function extractCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const currencyMatch = String(raw).match(/(BAM|KM|EUR|€|USD|GBP)/i);
  if (currencyMatch) {
    const code = currencyMatch[1].toUpperCase();
    if (code === '€') return 'EUR';
    if (code === 'KM') return 'BAM';
    return code;
  }
  return null;
}

function normalizeCurrency(currency: string | null | undefined): string | null {
  if (!currency) return null;
  const normalized = currency.trim().toUpperCase();
  if (['KM', 'BAM'].includes(normalized)) return 'BAM';
  if (normalized === '€' || normalized === 'EUR') return 'EUR';
  if (['USD', 'GBP'].includes(normalized)) return normalized;
  return normalized || null;
}

function normalizeProduct(product: ScrapedProduct | null): ScrapedProduct | null {
  if (!product || !product.name || product.promoPrice === undefined) return null;
  const cleanedName = product.name.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const promoPrice = normalizePrice(product.promoPrice);
  const regularPrice = product.regularPrice !== undefined ? normalizePrice(product.regularPrice || '') : null;
  const currency = normalizeCurrency(product.currency || extractCurrency(String(product.promoPrice)));

  if (isNaN(promoPrice) || promoPrice <= 0) return null;

  return {
    ...product,
    name: cleanedName.slice(0, 250),
    promoPrice,
    regularPrice: regularPrice && regularPrice > 0 ? regularPrice : null,
    currency: currency || null,
  };
}

function mapCsvRecordToProduct(record: Record<string, string>, config: ScraperConfig | null): ScrapedProduct | null {
  const headerMap = config?.csvMap || {};
  const nameKey = headerMap.name || Object.keys(record).find((h) => /name|naziv/i.test(h));
  const priceKey = headerMap.price || Object.keys(record).find((h) => /promo|sale|price|cijena/i.test(h));
  const regularKey = headerMap.regularPrice || Object.keys(record).find((h) => /regular|old|stara/i.test(h));
  const eanKey = headerMap.ean || Object.keys(record).find((h) => /ean|gtin|sku/i.test(h));
  const brandKey = headerMap.brand || Object.keys(record).find((h) => /brand|marka/i.test(h));
  const categoryKey = headerMap.category || Object.keys(record).find((h) => /category|kategorija/i.test(h));
  const currencyKey = headerMap.currency || Object.keys(record).find((h) => /currency|valuta/i.test(h));
  const promoStartKey = headerMap.promoStartDate || Object.keys(record).find((h) => /start/i.test(h));
  const promoEndKey = headerMap.promoEndDate || Object.keys(record).find((h) => /end|until/i.test(h));

  const name = nameKey ? record[nameKey] : undefined;
  const priceValue = priceKey ? record[priceKey] : undefined;
  const promoPrice = normalizePrice(priceValue);
  const regularPriceValue = regularKey ? record[regularKey] : undefined;
  const regularPrice = normalizePrice(regularPriceValue);

  if (!name || isNaN(promoPrice)) return null;

  return {
    name: name.slice(0, 250),
    promoPrice,
    regularPrice: !isNaN(regularPrice) ? regularPrice : null,
    ean: eanKey ? record[eanKey] : null,
    brand: brandKey ? record[brandKey] : null,
    category: categoryKey ? record[categoryKey] : null,
    currency: currencyKey ? normalizeCurrency(record[currencyKey]) : extractCurrency(priceValue || ''),
    promoStartDate: promoStartKey ? record[promoStartKey] : null,
    promoEndDate: promoEndKey ? record[promoEndKey] : null,
  };
}

function mapJsonRecordToProduct(record: Record<string, unknown>, config: ScraperConfig | null): ScrapedProduct | null {
  const mapper = config?.jsonMap || {};
  const getField = (key: string, fallbackRegex: RegExp) => {
    if (mapper[key as keyof typeof mapper]) {
      return record[mapper[key as keyof typeof mapper] as string];
    }
    const foundKey = Object.keys(record).find((k) => fallbackRegex.test(k));
    return foundKey ? record[foundKey] : undefined;
  };

  const name = getField('name', /name|title/i) as string | undefined;
  const price = getField('price', /promo|sale_price|price/i);
  const regularPrice = getField('regularPrice', /regular|old|base/i);
  const ean = (getField('ean', /ean|gtin|sku/i) as string | undefined) || null;
  const brand = (getField('brand', /brand|marka/i) as string | undefined) || null;
  const category = (getField('category', /category|kategorija/i) as string | undefined) || null;
  const currency = (getField('currency', /currency|valuta/i) as string | undefined) || null;
  const promoStartDate = (getField('promoStartDate', /start/i) as string | undefined) || null;
  const promoEndDate = (getField('promoEndDate', /end|until/i) as string | undefined) || null;

  const normalizedPrice = normalizePrice(price as string | number | undefined);
  const normalizedRegular = normalizePrice(regularPrice as string | number | undefined);
  if (!name || isNaN(normalizedPrice)) return null;

  return {
    name: String(name).slice(0, 250),
    promoPrice: normalizedPrice,
    regularPrice: !isNaN(normalizedRegular) ? normalizedRegular : null,
    ean,
    brand,
    category,
    promoStartDate,
    promoEndDate,
    currency: normalizeCurrency(currency) || extractCurrency(String(price)) || null,
  };
}

async function finalizeCandidates(
  candidates: ParsedCandidate[],
  config: ScraperConfig | null,
  scraper: SourceType
): Promise<ScrapedProduct[]> {
  const normalized: ScrapedProduct[] = [];
  const aiEnabled = config?.aiEnabled ?? Deno.env.get('ENABLE_LLM_PARSER') === 'true';

  for (const candidate of candidates) {
    const baseProduct = normalizeProduct(candidate.product);
    if (!baseProduct) continue;

    let finalProduct = baseProduct;
    if (aiEnabled && needsAiEnrichment(baseProduct)) {
      const aiProduct = await invokeLLMParser(candidate.rawBlock || JSON.stringify(candidate.product));
      if (aiProduct) {
        finalProduct = mergeProducts(baseProduct, aiProduct);
      }
    }

    const normalizedProduct = normalizeProduct(finalProduct);
    if (normalizedProduct) {
      normalized.push(normalizedProduct);
    }
  }

  console.log(`[SCRAPER][${scraper}] Finalized ${normalized.length} normalized products`);
  return normalized;
}

function needsAiEnrichment(product: ScrapedProduct): boolean {
  return !product.ean || !product.brand || !product.category || !product.currency || !product.regularPrice;
}

async function invokeLLMParser(rawBlock: string): Promise<ScrapedProduct | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    console.log('[AI] OPENAI_API_KEY not set, skipping LLM parsing.');
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Extract product data and respond ONLY with JSON matching the provided schema. Clean noisy text and infer currency when possible.',
          },
          { role: 'user', content: rawBlock.slice(0, 8000) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'product_schema',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                promoPrice: { type: 'number' },
                regularPrice: { type: ['number', 'null'] },
                currency: { type: ['string', 'null'] },
                ean: { type: ['string', 'null'] },
                brand: { type: ['string', 'null'] },
                category: { type: ['string', 'null'] },
                promoStartDate: { type: ['string', 'null'] },
                promoEndDate: { type: ['string', 'null'] },
              },
              required: ['name', 'promoPrice'],
            },
          },
        },
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.warn('[AI] LLM request failed with status', response.status, await response.text());
      return null;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as ScrapedProduct;
    return normalizeProduct(parsed);
  } catch (error) {
    console.warn('[AI] Failed to parse LLM response', error);
    return null;
  }
}

function normalizeOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (error) {
    console.warn('[SCRAPER] Invalid URL provided for competitor:', url, error);
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'retail-ai-promo-scraper/1.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9, */*;q=0.8',
    },
  });

  if (!response.ok) {
    console.warn(`[SCRAPER] Request failed for ${url} with status ${response.status}`);
    return null;
  }

  return response.text();
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'retail-ai-promo-scraper/1.0',
    },
  });

  if (!response.ok) {
    console.warn(`[SCRAPER] Binary request failed for ${url} with status ${response.status}`);
    return null;
  }

  return response.arrayBuffer();
}

function extractLinks(html: string, origin: string): string[] {
  const links = new Set<string>();
  const anchorMatches = html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi);

  for (const match of anchorMatches) {
    try {
      const href = match[1];
      const url = new URL(href, origin);
      if (url.origin === origin) {
        links.add(url.toString());
      }
    } catch (_err) {
      continue;
    }
  }

  return Array.from(links);
}
