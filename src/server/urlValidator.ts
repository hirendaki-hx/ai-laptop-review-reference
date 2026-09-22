import { z } from 'zod';

export function validateYouTubeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const validHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
    
    if (!validHosts.includes(url.hostname)) {
      throw new Error(`Invalid host: ${url.hostname}`);
    }

    let videoId: string | null = null;
    if (url.hostname === 'youtu.be') {
      videoId = url.pathname.slice(1);
    } else {
      videoId = url.searchParams.get('v');
      if (!videoId && url.pathname.startsWith('/embed/')) {
        videoId = url.pathname.split('/')[2];
      }
      if (!videoId && url.pathname.startsWith('/shorts/')) {
        videoId = url.pathname.split('/')[2];
      }
    }

    if (!videoId || videoId.length !== 11) {
      throw new Error('Invalid or missing 11-character YouTube video ID');
    }

    return videoId;
  } catch (e: any) {
    throw new Error(`Invalid YouTube URL: ${e.message}`);
  }
}

export function validateRetailerUrl(urlStr: string, retailer: 'amazon' | 'flipkart'): void {
  try {
    const url = new URL(urlStr);
    
    if (url.protocol !== 'https:') {
      throw new Error('Only HTTPS is allowed');
    }
    
    if (url.username || url.password) {
      throw new Error('Credentials in URL are not allowed');
    }

    // SSRF basic protection
    const forbiddenHostnames = ['localhost', '127.0.0.1', '::1'];
    if (forbiddenHostnames.includes(url.hostname)) {
      throw new Error('Forbidden host');
    }
    
    if (url.hostname.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.)/)) {
      throw new Error('Private IP ranges are not allowed');
    }

    // Retailer specific
    if (retailer === 'amazon') {
      const validAmazonHosts = ['amazon.in', 'www.amazon.in', 'amzn.in', 'amzn.to'];
      if (!validAmazonHosts.includes(url.hostname) && !url.hostname.endsWith('.amazon.in')) {
        throw new Error('Must be a valid Amazon India URL');
      }
    } else if (retailer === 'flipkart') {
      const validFlipkartHosts = ['flipkart.com', 'www.flipkart.com', 'dl.flipkart.com'];
      if (!validFlipkartHosts.includes(url.hostname) && !url.hostname.endsWith('.flipkart.com')) {
        throw new Error('Must be a valid Flipkart URL');
      }
    }
  } catch (e: any) {
    throw new Error(`Invalid retail URL: ${e.message}`);
  }
}
