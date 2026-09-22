import * as cheerio from 'cheerio';
import { validateRetailerUrl } from './urlValidator.ts';

export type Retailer = 'amazon' | 'flipkart';

export interface ExtractedListingData {
  price: number | null;
  currency: string | null;
  image: string | null;
  inStock: boolean | null;
  error?: string | null;
}

/**
 * Pure function for scraping structured product data from retailer URLs.
 * Keeps scraping logic isolated from UI and routing components.
 *
 * Rules:
 * - 'amazon' uses static fetch + cheerio + JSON-LD
 * - 'flipkart' uses Playwright headless browser to render client-side pricing
 */
export async function extractListingData(
  url: string,
  retailer: Retailer
): Promise<ExtractedListingData> {
  const result: ExtractedListingData = {
    price: null,
    currency: null,
    image: null,
    inStock: null,
  };

  try {
    validateRetailerUrl(url, retailer);
  } catch (err: any) {
    result.error = err.message;
    return result;
  }

  if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
    result.error = 'Invalid URL';
    return result;
  }

  // Branch by retailer: Amazon uses static fetch, Flipkart uses Playwright headless browser
  if (retailer === 'flipkart') {
    return extractFlipkartListing(url.trim());
  }

  return extractAmazonListing(url.trim());
}

/**
 * Amazon listing extraction via fetch + cheerio + JSON-LD (untouched standard path).
 */
async function extractAmazonListing(url: string): Promise<ExtractedListingData> {
  const result: ExtractedListingData = {
    price: null,
    currency: 'INR',
    image: null,
    inStock: null,
    error: null,
  };

  try {
    const response = await fetch(url.trim(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status} ${response.statusText}`;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 1. Search for JSON-LD structured data Product schema
    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const rawJson = $(elem).html();
        if (!rawJson) return;

        const parsed = JSON.parse(rawJson);
        const productObj = findProductInJsonLd(parsed);

        if (productObj) {
          if (!result.image) {
            const foundImage = extractImageFromJsonLd(productObj.image);
            if (foundImage) result.image = foundImage;
          }

          if (result.price === null && productObj.offers) {
            const offerData = extractOfferDetails(productObj.offers);
            if (offerData.price !== null) {
              result.price = offerData.price;
            }
            if (offerData.currency) {
              result.currency = offerData.currency;
            }
            if (offerData.inStock !== null) {
              result.inStock = offerData.inStock;
            }
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    });

    // 2. Fall back to og:image meta tag if image is still not found
    if (!result.image) {
      const ogImage =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="og:image"]').attr('content') ||
        $('meta[property="twitter:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        null;

      if (ogImage && typeof ogImage === 'string' && ogImage.trim().startsWith('http')) {
        result.image = ogImage.trim();
      }
    }

    return result;
  } catch (err: any) {
    console.warn(`[ListingScraper] Failed to scrape amazon URL (${url}):`, err.message || err);
    result.error = err.message || 'Scrape request failed';
    return result;
  }
}

/**
 * Flipkart listing extraction using Playwright headless browser.
 * Renders client-side dynamic DOM before inspecting JSON-LD and visible price.
 */
async function extractFlipkartListing(url: string): Promise<ExtractedListingData> {
  const result: ExtractedListingData = {
    price: null,
    currency: 'INR',
    image: null,
    inStock: null,
    error: null,
  };

  let playwrightModule: typeof import('playwright');
  try {
    playwrightModule = await import('playwright');
  } catch (err: any) {
    console.warn('[FlipkartScraper] Playwright module import failed:', err?.message || err);
    result.error = 'Flipkart scraping unavailable in this environment (Playwright not available)';
    return result;
  }

  let browser: import('playwright').Browser | null = null;

  try {
    // Attempt launching chromium headless
    try {
      browser = await playwrightModule.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    } catch (launchErr: any) {
      console.warn('[FlipkartScraper] Chromium launch failed (sandbox/dependency limitation):', launchErr?.message || launchErr);
      result.error = 'Flipkart scraping unavailable in this environment';
      return result;
    }

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    // Navigate with a maximum 20s timeout
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    } catch {
      // If networkidle times out, attempt to proceed with current DOM state if content loaded
    }

    // 1. Try JSON-LD first
    const jsonLd = await page.evaluate(() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]')
      );
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || '');
          if (data['@type'] === 'Product') return data;
          if (Array.isArray(data)) {
            const found = data.find((item: any) => item?.['@type'] === 'Product');
            if (found) return found;
          }
        } catch {}
      }
      return null;
    });

    if (jsonLd?.offers?.price) {
      const rawPrice = jsonLd.offers.price;
      const parsedPrice =
        typeof rawPrice === 'number'
          ? rawPrice
          : Number(String(rawPrice).replace(/[₹,\s]/g, ''));

      let image: string | null = null;
      if (typeof jsonLd.image === 'string') {
        image = jsonLd.image;
      } else if (Array.isArray(jsonLd.image) && jsonLd.image.length > 0) {
        image = typeof jsonLd.image[0] === 'string' ? jsonLd.image[0] : jsonLd.image[0]?.url || null;
      }

      return {
        price: !isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
        currency: 'INR',
        image,
        inStock: jsonLd.offers?.availability?.includes('InStock') ?? null,
        error: null,
      };
    }

    // 2. Fallback: scan rendered text for a ₹-prefixed number near the top of the page
    const priceText = await page.evaluate(() => {
      const match = document.body.innerText.match(/₹\s?[\d,]+/);
      return match ? match[0] : null;
    });

    const price = priceText ? Number(priceText.replace(/[₹,\s]/g, '')) : null;

    const outOfStock = await page.evaluate(() =>
      /out of stock|sold out|currently unavailable/i.test(document.body.innerText)
    );

    const image = await page
      .evaluate(() =>
        document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
        document.querySelector('meta[name="og:image"]')?.getAttribute('content')
      )
      .catch(() => null);

    return {
      price: price && !isNaN(price) && price > 0 ? price : null,
      currency: 'INR',
      image: image || null,
      inStock: outOfStock ? false : null,
      error: null,
    };
  } catch (err: any) {
    console.warn(`[FlipkartScraper] Extraction failed for ${url}:`, err.message || err);
    result.error = err.message || 'Flipkart extraction failed';
    return result;
  } finally {
    if (browser) {
      try {
        await browser.close(); // always close — don't leak browser processes
      } catch (closeErr) {
        console.warn('[FlipkartScraper] Error closing browser instance:', closeErr);
      }
    }
  }
}

/**
 * Traverses JSON-LD structures to find a schema.org Product object.
 */
function findProductInJsonLd(obj: any): any {
  if (!obj || typeof obj !== 'object') return null;

  // Direct Product type match
  const type = obj['@type'];
  if (
    type === 'Product' ||
    (Array.isArray(type) && type.includes('Product')) ||
    (typeof type === 'string' && (type === 'https://schema.org/Product' || type.endsWith(':Product')))
  ) {
    return obj;
  }

  // @graph container
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const match = findProductInJsonLd(item);
      if (match) return match;
    }
  }

  // Array of items
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const match = findProductInJsonLd(item);
      if (match) return match;
    }
  }

  // Recursive search in child keys
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const match = findProductInJsonLd(obj[key]);
      if (match) return match;
    }
  }

  return null;
}

/**
 * Extracts a valid image URL string from JSON-LD image property.
 */
function extractImageFromJsonLd(imageProp: any): string | null {
  if (!imageProp) return null;

  if (typeof imageProp === 'string' && imageProp.trim().startsWith('http')) {
    return imageProp.trim();
  }

  if (Array.isArray(imageProp) && imageProp.length > 0) {
    for (const item of imageProp) {
      const img = extractImageFromJsonLd(item);
      if (img) return img;
    }
  }

  if (typeof imageProp === 'object') {
    if (typeof imageProp.url === 'string' && imageProp.url.trim().startsWith('http')) {
      return imageProp.url.trim();
    }
    if (typeof imageProp.contentUrl === 'string' && imageProp.contentUrl.trim().startsWith('http')) {
      return imageProp.contentUrl.trim();
    }
  }

  return null;
}

/**
 * Extracts price, currency, and stock status from JSON-LD offers structure.
 */
function extractOfferDetails(offers: any): {
  price: number | null;
  currency: string | null;
  inStock: boolean | null;
} {
  const result = {
    price: null as number | null,
    currency: null as string | null,
    inStock: null as boolean | null,
  };

  const offerList: any[] = Array.isArray(offers)
    ? offers
    : typeof offers === 'object' && offers !== null
    ? [offers]
    : [];

  for (const offer of offerList) {
    if (!offer || typeof offer !== 'object') continue;

    // Price extraction
    const rawPrice = offer.price ?? offer.lowPrice ?? offer.highPrice;
    if (rawPrice !== undefined && rawPrice !== null && result.price === null) {
      const cleaned = String(rawPrice).replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && parsed > 0) {
        result.price = parsed;
      }
    }

    // Currency
    if (offer.priceCurrency && typeof offer.priceCurrency === 'string' && !result.currency) {
      result.currency = offer.priceCurrency.trim().toUpperCase();
    }

    // Stock availability
    if (offer.availability && typeof offer.availability === 'string' && result.inStock === null) {
      const avail = offer.availability.toLowerCase();
      if (avail.includes('instock')) {
        result.inStock = true;
      } else if (avail.includes('outofstock') || avail.includes('soldout')) {
        result.inStock = false;
      }
    }

    if (result.price !== null) break;
  }

  return result;
}
