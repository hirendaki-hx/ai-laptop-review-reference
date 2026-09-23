export interface ParsedYouTubeUrl {
  isValid: boolean;
  videoId: string | null;
  canonicalUrl: string | null;
  normalizedOriginalUrl: string;
  error?: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function parseAndValidateYouTubeUrl(inputUrl: string): ParsedYouTubeUrl {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: null,
      normalizedOriginalUrl: '',
      error: 'URL is required',
    };
  }

  const trimmed = inputUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: null,
      normalizedOriginalUrl: trimmed,
      error: 'Malformed URL format',
    };
  }

  // Enforce HTTPS or HTTP (reject file://, gopher://, javascript://, etc.)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: null,
      normalizedOriginalUrl: trimmed,
      error: 'Only HTTP and HTTPS protocols are permitted',
    };
  }

  // SSRF Protection: strictly match YouTube hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(hostname)) {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: null,
      normalizedOriginalUrl: trimmed,
      error: 'Invalid hostname. Only official YouTube URLs are accepted.',
    };
  }

  let videoId: string | null = null;

  if (hostname === 'youtu.be') {
    // youtu.be/<id>
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      videoId = pathParts[0];
    }
  } else {
    // Standard youtube.com URLs
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else if (parsed.pathname.startsWith('/shorts/')) {
      const parts = parsed.pathname.split('/shorts/')[1]?.split('/');
      videoId = parts?.[0] || null;
    } else if (parsed.pathname.startsWith('/embed/')) {
      const parts = parsed.pathname.split('/embed/')[1]?.split('/');
      videoId = parts?.[0] || null;
    } else if (parsed.pathname.startsWith('/v/')) {
      const parts = parsed.pathname.split('/v/')[1]?.split('/');
      videoId = parts?.[0] || null;
    }
  }

  if (!videoId || !VIDEO_ID_REGEX.test(videoId)) {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: null,
      normalizedOriginalUrl: trimmed,
      error: 'Could not extract valid 11-character YouTube video ID',
    };
  }

  return {
    isValid: true,
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    normalizedOriginalUrl: trimmed,
  };
}
