import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getDocument } from 'https://esm.sh/pdfjs-dist@3.11.174/legacy/build/pdf.js';
import Tesseract from 'https://esm.sh/tesseract.js@5.1.0';

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

      try {
        const products = await scrapeCompetitor(competitor);
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

async function scrapeCompetitor(competitor: Competitor): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Starting scrape for ${competitor.name} at ${competitor.base_url}`);
  const sourceType = (competitor.source_type?.toLowerCase() as SourceType) || 'html';

  if (sourceType === 'html' || sourceType === 'api') {
    const apiProducts = await scrapeWooCommerceStore(competitor.base_url);
    if (apiProducts.length > 0) {
      console.log(`[SCRAPER] Using WooCommerce Store API results for ${competitor.name}`);
      return dedupeProducts(apiProducts);
    }
  }

  const routers: Record<SourceType, (competitor: Competitor) => Promise<ScrapedProduct[]>> = {
    html: scrapeHtmlSite,
    pdf: scrapePdfSource,
    json: scrapeJsonSource,
    csv: scrapeCsvSource,
    image: scrapeImageSource,
    api: scrapeJsonSource,
  };

  const scraper = routers[sourceType] || scrapeHtmlSite;
  const products = await scraper(competitor);
  console.log(`[SCRAPER] Parsed ${products.length} products for ${competitor.name} using ${sourceType} scraper`);
  return dedupeProducts(products);
}

async function scrapeHtmlSite(competitor: Competitor): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Using HTML scraper for ${competitor.name}`);
  const origin = normalizeOrigin(competitor.base_url);
  if (!origin) return [];

  const toVisit = new Set<string>([competitor.base_url]);
  const visited = new Set<string>();
  const collected: ScrapedProduct[] = [];

  while (toVisit.size > 0 && visited.size < 5) {
    const [nextUrl] = Array.from(toVisit);
    toVisit.delete(nextUrl);
    if (visited.has(nextUrl)) continue;
    visited.add(nextUrl);

    try {
      const html = await fetchText(nextUrl);
      if (!html) continue;

      const jsonProducts = extractProductsFromJsonLd(html, nextUrl);
      const cardProducts = extractProductsFromProductCards(html, nextUrl);
      collected.push(...jsonProducts, ...cardProducts);

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
  return collected.slice(0, 300);
}

async function scrapePdfSource(competitor: Competitor): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Using PDF scraper for ${competitor.name}`);
  try {
    const pdfBuffer = await fetchArrayBuffer(competitor.base_url);
    if (!pdfBuffer) return [];

    const pdf = await getDocument({ data: pdfBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const textItems = content.items as Array<{ str?: string }>;
      const pageText = textItems.map((item) => item.str ?? '').join(' ');
      text += `\n${pageText}`;
    }

    console.log(`[SCRAPER] Extracted text from ${pdf.numPages} PDF pages for ${competitor.name}`);
    return parseProductsFromTextContent(text, competitor.base_url);
  } catch (error) {
    console.error(`[SCRAPER] PDF extraction failed for ${competitor.name}:`, error);
    return [];
  }
}

async function scrapeJsonSource(competitor: Competitor): Promise<ScrapedProduct[]> {
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
    const products = parseProductsFromJsonStructure(payload);
    console.log(`[SCRAPER] Parsed ${products.length} products from JSON for ${competitor.name}`);
    return products;
  } catch (error) {
    console.error(`[SCRAPER] JSON scraping failed for ${competitor.name}:`, error);
    return [];
  }
}

async function scrapeCsvSource(competitor: Competitor): Promise<ScrapedProduct[]> {
  console.log(`[SCRAPER] Using CSV scraper for ${competitor.name}`);
  try {
    const text = await fetchText(competitor.base_url);
    if (!text) return [];

    const delimiter = text.includes(';') ? ';' : ',';
    const lines = text.split(/\r?\n/).filter(Boolean);
    const [headerLine, ...rows] = lines;
    const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase());

    const products: ScrapedProduct[] = [];
    for (const row of rows) {
      const cols = row.split(delimiter).map((c) => c.trim());
      const record: Record<string, string> = {};
      headers.forEach((header, idx) => {
        record[header] = cols[idx];
      });

      const normalizedPrice = normalizePrice(record['promo_price'] || record['price']);
      const currency = extractCurrency(record['currency'] || record['price']);

      if (record['name'] && !isNaN(normalizedPrice)) {
        products.push({
          name: record['name'].slice(0, 250),
          promoPrice: normalizedPrice,
          regularPrice: record['regular_price'] ? normalizePrice(record['regular_price']) : null,
          ean: record['ean'] || null,
          brand: record['brand'] || null,
          category: record['category'] || null,
          promoStartDate: record['promo_start_date'] || null,
          promoEndDate: record['promo_end_date'] || null,
          currency: currency,
        });
      }
    }

    console.log(`[SCRAPER] Parsed ${products.length} products from CSV for ${competitor.name}`);
    return products;
  } catch (error) {
    console.error(`[SCRAPER] CSV scraping failed for ${competitor.name}:`, error);
    return [];
  }
}

async function scrapeImageSource(competitor: Competitor): Promise<ScrapedProduct[]> {
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
    return parseProductsFromTextContent(data.text, competitor.base_url);
  } catch (error) {
    console.error(`[SCRAPER] Image OCR scraping failed for ${competitor.name}:`, error);
    return [];
  }
}

async function scrapeWooCommerceStore(baseUrl: string): Promise<ScrapedProduct[]> {
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

    const deduped = dedupeProducts(collected);
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

function extractProductsFromProductCards(html: string, sourceUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

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
          name: cleanedName.slice(0, 250),
          promoPrice: Math.min(...validPrices.map((p) => p.price)),
          regularPrice: validPrices.length > 1 ? Math.max(...validPrices.map((p) => p.price)) : null,
          category: extractCategory(snippet) || null,
          brand: extractBrand(snippet) || null,
          currency: currencies[0] || null,
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
      products.push({ name: name.trim().slice(0, 250), promoPrice: price, currency });
    }
  }

  console.log(`[EXTRACTOR] Found ${products.length} products in HTML from ${sourceUrl}`);
  return products;
}

function extractCategory(html: string): string | null {
  const breadcrumbMatch = html.match(/class=["'][^"']*(?:breadcrumb|category)[^"']*["'][^>]*>([\s\S]*?)<\//i);
  if (breadcrumbMatch) {
    const text = breadcrumbMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return null;
}

function extractBrand(html: string): string | null {
  const brandMatch =
    html.match(/data-brand=["']([^"']+)["']/i) || html.match(/class=["'][^"']*brand[^"']*["'][^>]*>([\s\S]*?)<\//i);
  if (brandMatch) {
    const text = brandMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return null;
}

function parseProductsFromTextContent(content: string, sourceUrl: string): ScrapedProduct[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const products: ScrapedProduct[] = [];
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
        name: candidateName.slice(0, 250),
        promoPrice: Math.min(...priceMatches.map((p) => p.price)),
        regularPrice: priceMatches.length > 1 ? Math.max(...priceMatches.map((p) => p.price)) : null,
        currency: currencies[0] || null,
      });
    }
  }

  console.log(`[EXTRACTOR] Found ${products.length} products in text from ${sourceUrl}`);
  return products;
}

function parseProductsFromJsonStructure(payload: unknown): ScrapedProduct[] {
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
    const price =
      record?.promo_price ?? record?.sale_price ?? record?.price ?? record?.regular_price;
    const normalizedPrice = normalizePrice(price);
    if (!record?.name || isNaN(normalizedPrice)) continue;

    products.push({
      name: String(record.name).slice(0, 250),
      promoPrice: normalizedPrice,
      regularPrice: record?.regular_price ? normalizePrice(record.regular_price) : null,
      ean: (record?.ean as string) || (record?.gtin as string) || (record?.sku as string) || null,
      brand: (record?.brand as string) || null,
      category: (record?.category as string) || null,
      promoStartDate: (record?.promo_start_date as string) || null,
      promoEndDate: (record?.promo_end_date as string) || null,
      currency: (record?.currency as string) || extractCurrency(String(price)) || null,
    });
  }

  return products;
}

function dedupeProducts(products: ScrapedProduct[]): ScrapedProduct[] {
  const seen = new Map<string, ScrapedProduct>();

  for (const product of products) {
    const key = `${product.name.toLowerCase()}|${(product.ean || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, product);
    }
  }

  return Array.from(seen.values());
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
