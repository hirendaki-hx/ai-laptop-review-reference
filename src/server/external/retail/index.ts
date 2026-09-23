import * as cheerio from 'cheerio';
import { RetailerType } from '../../../shared/types/index.ts';

export interface ScrapedRetailData {
  retailer: RetailerType;
  price: number | null;
  imageUrl: string | null;
  inStock: boolean | null;
  title: string | null;
  rawJsonLd?: any;
}

export interface RetailerAdapter {
  canHandle(url: string): boolean;
  scrape(url: string): Promise<ScrapedRetailData>;
}

/**
 * Universal JSON-LD Schema.org extractor for product data
 * Follows strict V2 rule: Extracts price and image via Schema.org Product data first,
 * falling back to og:image meta tag for images only. Never guesses at price via brittle CSS selectors.
 */
export async function scrapeProductFromHtml(html: string, retailer: RetailerType): Promise<ScrapedRetailData> {
  const $ = cheerio.load(html);

  let price: number | null = null;
  let imageUrl: string | null = null;
  let inStock: boolean | null = null;
  let title: string | null = null;
  let productJsonLd: any = null;

  // 1. Locate and parse application/ld+json tags
  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const rawText = $(elem).html();
      if (!rawText) return;
      const parsed = JSON.parse(rawText.trim());

      // Could be a single object, an array, or a graph
      const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);

      for (const item of candidates) {
        const itemType = item['@type'];
        if (itemType === 'Product' || (Array.isArray(itemType) && itemType.includes('Product'))) {
          productJsonLd = item;
          if (item.name) title = String(item.name).trim();

          // Image from JSON-LD
          if (item.image) {
            if (typeof item.image === 'string') {
              imageUrl = item.image;
            } else if (Array.isArray(item.image) && item.image.length > 0) {
              imageUrl = typeof item.image[0] === 'string' ? item.image[0] : item.image[0]?.url;
            } else if (item.image.url) {
              imageUrl = item.image.url;
            }
          }

          // Price and stock from offers
          const offers = item.offers;
          if (offers) {
            const offerObj = Array.isArray(offers) ? offers[0] : offers;
            if (offerObj) {
              const rawPrice = offerObj.price ?? offerObj.lowPrice ?? offerObj.priceSpecification?.price;
              if (rawPrice != null) {
                const numericPrice = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
                if (!isNaN(numericPrice) && numericPrice > 0) {
                  price = numericPrice;
                }
              }

              // Availability
              if (offerObj.availability) {
                const availStr = String(offerObj.availability).toLowerCase();
                inStock = availStr.includes('instock');
              }
            }
          }
          break;
        }
      }
    } catch {
      // Ignore JSON parse errors in individual ld+json scripts
    }
  });

  // 2. Image Fallback: og:image meta tag (for images ONLY, never for price)
  if (!imageUrl) {
    const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');
    if (ogImage && ogImage.startsWith('http')) {
      imageUrl = ogImage.trim();
    }
  }

  // Fallback title from og:title if JSON-LD didn't have it
  if (!title) {
    title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || null;
  }

  return {
    retailer,
    price,
    imageUrl,
    inStock,
    title,
    rawJsonLd: productJsonLd,
  };
}

export class AmazonAdapter implements RetailerAdapter {
  canHandle(url: string): boolean {
    return /amazon\.(in|com|co\.uk|de|ca|co\.jp)/i.test(url);
  }

  async scrape(url: string): Promise<ScrapedRetailData> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        return {
          retailer: 'amazon',
          price: null,
          imageUrl: null,
          inStock: null,
          title: null,
        };
      }

      const html = await response.text();
      return await scrapeProductFromHtml(html, 'amazon');
    } catch (err) {
      console.warn('Amazon scrape error:', err);
      return {
        retailer: 'amazon',
        price: null,
        imageUrl: null,
        inStock: null,
        title: null,
      };
    }
  }
}

export class FlipkartAdapter implements RetailerAdapter {
  canHandle(url: string): boolean {
    return /flipkart\.com/i.test(url);
  }

  async scrape(url: string): Promise<ScrapedRetailData> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        return {
          retailer: 'flipkart',
          price: null,
          imageUrl: null,
          inStock: null,
          title: null,
        };
      }

      const html = await response.text();
      return await scrapeProductFromHtml(html, 'flipkart');
    } catch (err) {
      console.warn('Flipkart scrape error:', err);
      return {
        retailer: 'flipkart',
        price: null,
        imageUrl: null,
        inStock: null,
        title: null,
      };
    }
  }
}

const adapters: RetailerAdapter[] = [new AmazonAdapter(), new FlipkartAdapter()];

export async function scrapeRetailUrl(url: string): Promise<ScrapedRetailData | null> {
  const adapter = adapters.find(a => a.canHandle(url));
  if (!adapter) return null;
  return await adapter.scrape(url);
}
