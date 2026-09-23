import { GoogleGenAI, Type } from '@google/genai';
import type { ExtractedDataPayload, ServiceState } from '../../shared/types/index.ts';
import { ExtractedDataPayloadSchema, normalizeExtractionInput } from '../../shared/schemas/extraction.ts';
import { APP_CONFIG, ERROR_CODES } from '../../shared/constants/index.ts';
import { getActiveGeminiModel } from '../services/geminiModelService.ts';
import { runExhaustiveExtraction } from '../services/extraction/exhaustiveExtractor.ts';

let geminiClientInstance: GoogleGenAI | null = null;

export function getGeminiModelName(): string {
  try {
    return getActiveGeminiModel();
  } catch {
    return process.env.GEMINI_MODEL?.trim() || APP_CONFIG.defaultGeminiModel;
  }
}

export function getGeminiClient(): GoogleGenAI {
  if (geminiClientInstance) {
    return geminiClientInstance;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_NOT_CONFIGURED: GEMINI_API_KEY environment variable is not set.');
  }

  geminiClientInstance = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  return geminiClientInstance;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export interface GeminiHealthResult {
  status: ServiceState;
  model: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Real Gemini Health Check:
 * Issues a real prompt: "Reply with exactly OK."
 * Never marks LIVE without a successful response.
 */
export async function testGeminiConnection(): Promise<GeminiHealthResult> {
  const modelName = getGeminiModelName();

  if (!isGeminiConfigured()) {
    return {
      status: 'NOT_CONFIGURED',
      model: modelName,
      error: 'GEMINI_API_KEY is not configured in the server environment.',
    };
  }

  const start = Date.now();
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Reply with exactly OK.',
    });

    const latencyMs = Date.now() - start;
    const text = response.text?.trim();

    if (text && text.toUpperCase().includes('OK')) {
      return {
        status: 'LIVE',
        model: modelName,
        latencyMs,
      };
    }

    return {
      status: 'WARNING',
      model: modelName,
      latencyMs,
      error: `Unexpected test response: ${text?.slice(0, 50)}`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const rawMsg = err?.message || String(err);
    // Sanitize any key leakage from error message
    const sanitizedMsg = rawMsg.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_KEY]');

    let status: ServiceState = 'ERROR';
    if (sanitizedMsg.includes('API_KEY_INVALID') || sanitizedMsg.includes('401') || sanitizedMsg.includes('403')) {
      return {
        status: 'AUTH_ERROR',
        model: modelName,
        latencyMs,
        error: `GEMINI_AUTH_FAILED: Invalid or unauthorized API key (${sanitizedMsg.slice(0, 100)})`,
      };
    }

    if (
      err?.status === 429 ||
      sanitizedMsg.includes('429') ||
      sanitizedMsg.includes('RESOURCE_EXHAUSTED') ||
      sanitizedMsg.toLowerCase().includes('quota') ||
      sanitizedMsg.toLowerCase().includes('rate limit')
    ) {
      return {
        status: 'QUOTA_LIMITED',
        model: modelName,
        latencyMs,
        error: 'GEMINI_QUOTA_EXCEEDED: Quota exceeded for this model. Switch to another model or wait for quota reset.',
      };
    }

    return {
      status,
      model: modelName,
      latencyMs,
      error: sanitizedMsg.slice(0, 200),
    };
  }
}

/**
 * Gemini Response Schema for Structured Extraction
 */
const GEMINI_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    laptop: {
      type: Type.OBJECT,
      properties: {
        brand: { type: Type.STRING, description: 'Brand manufacturer name, e.g. Lenovo, Asus, Apple, Dell, HP' },
        model: { type: Type.STRING, description: 'Specific model name, e.g. Legion Pro 7i, Zephyrus G16, MacBook Pro 16' },
        series: { type: Type.STRING, description: 'Series name, e.g. Legion, ROG, XPS, ThinkPad or null if none' },
        generation: { type: Type.STRING, description: 'Generation or release year if mentioned, e.g. Gen 9, 2024 or null' },
      },
      required: ['brand', 'model'],
    },
    configuration: {
      type: Type.OBJECT,
      properties: {
        cpu: { type: Type.STRING, description: 'Exact processor tested, e.g. Intel Core i9-14900HX, AMD Ryzen 9 8945HS, Apple M3 Max' },
        gpu: { type: Type.STRING, description: 'Exact graphics card tested, e.g. NVIDIA GeForce RTX 4080 Laptop GPU or null' },
        gpu_tgp_w: { type: Type.INTEGER, description: 'GPU Total Graphics Power in watts, or null if not stated' },
        ram_gb: { type: Type.INTEGER, description: 'RAM capacity in gigabytes as tested, e.g. 16, 32, 64' },
        ram_speed_mt_s: { type: Type.INTEGER, description: 'RAM speed in MT/s or MHz if explicitly given, or null' },
        storage_gb: { type: Type.INTEGER, description: 'Storage capacity in gigabytes as tested, e.g. 1024 for 1TB, 2048 for 2TB' },
        storage_type: { type: Type.STRING, description: 'Storage type, e.g. NVMe PCIe 4.0 SSD or null' },
        display_size_inch: { type: Type.NUMBER, description: 'Screen diagonal in inches, e.g. 16.0, 14.5, 15.6' },
        display_resolution: { type: Type.STRING, description: 'Native resolution, e.g. 2560x1600, 1920x1080' },
        refresh_rate_hz: { type: Type.INTEGER, description: 'Display refresh rate in Hz, e.g. 165, 240, 120' },
        panel_type: { type: Type.STRING, description: 'Panel technology, e.g. IPS, OLED, Mini-LED' },
        battery_wh: { type: Type.NUMBER, description: 'Battery capacity in Watt-hours (Wh), e.g. 99.9, 80' },
        weight_kg: { type: Type.NUMBER, description: 'Measured or stated weight in kilograms' },
        thickness_mm: { type: Type.NUMBER, description: 'Measured or stated thickness in millimeters' },
      },
    },
    review_meta: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Video title or review headline' },
        reviewer: { type: Type.STRING, description: 'Reviewer name or YouTube channel name' },
        published_date: { type: Type.STRING, description: 'Publication date if found, or null' },
        verdict_summary: { type: Type.STRING, description: 'Concise summary of reviewer verdict and conclusion' },
        verdict_score: { type: Type.NUMBER, description: 'Overall rating out of 10 if given, or null' },
        verdict_pros: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Key positive points noted by reviewer' },
        verdict_cons: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Key negative points or drawbacks noted' },
      },
      required: ['title', 'reviewer'],
    },
    benchmarks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          benchmark_group: { type: Type.STRING, description: 'Benchmark name, e.g. Cinebench R23, Cinebench 2024, Geekbench 6, 3DMark Time Spy, PCMark 10' },
          variant: { type: Type.STRING, description: 'Variant/test, e.g. Multi-Core, Single-Core, Graphics Score, Overall' },
          category: { type: Type.STRING, description: 'One of: cpu, gpu, rendering, ai, storage, system, productivity' },
          score: { type: Type.NUMBER, description: 'Exact measured numeric score. NEVER zero if missing, only include if explicitly measured.' },
          unit: { type: Type.STRING, description: 'Score unit, e.g. points, MB/s or null' },
          power_mode: { type: Type.STRING, description: 'Performance profile tested, e.g. Turbo, Balanced, Performance, Silent or null' },
          confidence: { type: Type.STRING, description: 'high, medium, or low' },
          notes: { type: Type.STRING, description: 'Any notes regarding test settings' },
        },
        required: ['benchmark_group', 'category', 'score'],
      },
    },
    gaming: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          game: { type: Type.STRING, description: 'Game title, e.g. Cyberpunk 2077, Shadow of the Tomb Raider, Black Myth: Wukong' },
          resolution: { type: Type.STRING, description: 'Resolution tested, e.g. 1920x1080, 2560x1440, 2560x1600' },
          preset: { type: Type.STRING, description: 'Graphics preset, e.g. Ultra, High, Medium' },
          ray_tracing: { type: Type.BOOLEAN, description: 'Whether ray tracing was turned on' },
          upscaling: { type: Type.BOOLEAN, description: 'Whether DLSS/FSR/XeSS upscaling was active' },
          upscaling_mode: { type: Type.STRING, description: 'Upscaling quality level, e.g. Quality, Balanced, Performance, Frame Gen' },
          avg_fps: { type: Type.NUMBER, description: 'Average frames per second' },
          one_percent_low_fps: { type: Type.NUMBER, description: '1% low FPS if recorded' },
          notes: { type: Type.STRING, description: 'Test condition notes' },
        },
        required: ['game'],
      },
    },
    thermals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          test_name: { type: Type.STRING, description: 'Stress test or workload, e.g. Combined CPU+GPU Stress, Cinebench Loop, Cyberpunk 30min' },
          duration_minutes: { type: Type.NUMBER, description: 'Duration of test in minutes' },
          cpu_peak_c: { type: Type.NUMBER, description: 'CPU maximum recorded temperature in Celsius' },
          cpu_avg_c: { type: Type.NUMBER, description: 'CPU average temperature in Celsius (NEVER infer from peak)' },
          cpu_peak_power_w: { type: Type.NUMBER, description: 'CPU peak package wattage' },
          cpu_avg_power_w: { type: Type.NUMBER, description: 'CPU sustained wattage' },
          gpu_peak_c: { type: Type.NUMBER, description: 'GPU maximum recorded temperature in Celsius' },
          gpu_avg_c: { type: Type.NUMBER, description: 'GPU average temperature in Celsius' },
          keyboard_min_c: { type: Type.NUMBER, description: 'Keyboard surface lowest temperature in Celsius' },
          keyboard_max_c: { type: Type.NUMBER, description: 'Keyboard surface hotspot temperature in Celsius' },
          notes: { type: Type.STRING, description: 'Ambient room temp or fan noise notes' },
        },
        required: ['test_name'],
      },
    },
    display: {
      type: Type.OBJECT,
      properties: {
        brightness_sdr_nits: { type: Type.NUMBER, description: 'Calibrated SDR peak brightness in nits/cd/m²' },
        brightness_hdr_nits: { type: Type.NUMBER, description: 'HDR peak brightness in nits' },
        srgb_percent: { type: Type.NUMBER, description: 'sRGB color gamut coverage percentage, e.g. 99.5' },
        dci_p3_percent: { type: Type.NUMBER, description: 'DCI-P3 color gamut coverage percentage' },
        adobe_rgb_percent: { type: Type.NUMBER, description: 'Adobe RGB color gamut coverage percentage' },
        response_time_ms: { type: Type.NUMBER, description: 'Black-to-white or GtG response time in ms' },
        g_sync: { type: Type.BOOLEAN, description: 'G-SYNC support' },
        vrr: { type: Type.BOOLEAN, description: 'Variable Refresh Rate support' },
        notes: { type: Type.STRING, description: 'Colorimeter or panel notes' },
      },
    },
    battery: {
      type: Type.OBJECT,
      properties: {
        battery_life_hours: { type: Type.NUMBER, description: 'Battery runtime in hours, e.g. 7.5' },
        test_method: { type: Type.STRING, description: 'Test workload, e.g. PCMark 10 Modern Office, YouTube 1080p Wi-Fi loop, Web browsing loop' },
        brightness_percent: { type: Type.NUMBER, description: 'Display brightness level during test, e.g. 50% or 150 nits' },
        gpu_mode: { type: Type.STRING, description: 'GPU mode during test, e.g. Optimus, Hybrid, iGPU only, dGPU only' },
        charging_adapter_w: { type: Type.NUMBER, description: 'Power supply wattage in Watts, e.g. 230, 140' },
        zero_to_fifty_min: { type: Type.NUMBER, description: 'Time in minutes to reach 50% charge' },
        full_charge_min: { type: Type.NUMBER, description: 'Time in minutes to reach 100% full charge' },
        usb_c_charging_w: { type: Type.NUMBER, description: 'Supported USB-C Power Delivery wattage' },
        notes: { type: Type.STRING, description: 'Battery testing methodology notes' },
      },
    },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          field_path: { type: Type.STRING, description: 'JSON path of the data field, e.g. configuration.cpu, benchmarks[0].score, display.brightness_sdr_nits' },
          timestamp_seconds: { type: Type.INTEGER, description: 'Exact time in seconds where this fact is shown or stated in the video, or null if unknown' },
          timestamp_display: { type: Type.STRING, description: 'Display timestamp, e.g. "04:15" or null' },
          evidence_description: { type: Type.STRING, description: 'What is shown or stated on screen' },
          evidence_text: { type: Type.STRING, description: 'Exact quote or on-screen text if readable' },
          confidence: { type: Type.STRING, description: 'high, medium, or low' },
        },
        required: ['field_path', 'evidence_description'],
      },
    },
  },
  required: ['laptop', 'configuration', 'review_meta'],
};

/**
 * Fetch YouTube video public metadata from YouTube's official oEmbed endpoint.
 * This provides author, title, and validates the video exists without requiring YouTube Data API key.
 */
export async function fetchYouTubeOEmbed(youtubeUrl: string): Promise<{
  title: string;
  author_name: string;
  thumbnail_url: string;
} | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Main Gemini Extraction Service
 * Strictly respects USER INTENT & NON-NEGOTIABLE RULES:
 * - Source of truth = the provided review video
 * - No guessing missing values (keep null)
 * - No fake benchmark scores (never turn missing scores to 0)
 * - No fake FPS or thermals
 * - Distinguish explicit measurements
 * - Validates output with Zod
 */
export async function extractLaptopDataWithGemini(
  youtubeUrl: string,
  videoId: string,
  modelOverride?: string,
  previousPayload?: ExtractedDataPayload | null
): Promise<{
  payload: ExtractedDataPayload;
  modelUsed: string;
  durationMs: number;
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_NOT_CONFIGURED: GEMINI_API_KEY environment variable is not set.');
  }

  const model = modelOverride?.trim() || getGeminiModelName();
  const startTime = Date.now();

  // Retrieve official YouTube oEmbed metadata as reliable ground truth for author and title
  const oembed = await fetchYouTubeOEmbed(youtubeUrl);

  try {
    console.log(`[Gemini Extraction] Starting Exhaustive Multi-Pass Extraction Pipeline for video=${videoId} using model=${model}...`);
    const payload = await runExhaustiveExtraction({
      apiKey,
      modelId: model,
      youtubeUrl,
      youtubeVideoId: videoId,
      depth: 'deep',
      previousPayload,
      onProgress: (step, details) => {
        console.log(`[Gemini Multi-Pass: ${step}] ${details || ''}`);
      },
    });

    // Enrich with verified oEmbed reviewer or title if model returned empty or placeholder
    if (oembed) {
      if (!payload.review_meta.title || payload.review_meta.title.toLowerCase().includes('untitled')) {
        payload.review_meta.title = oembed.title;
      }
      if (!payload.review_meta.reviewer || payload.review_meta.reviewer.toLowerCase().includes('unknown')) {
        payload.review_meta.reviewer = oembed.author_name;
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      payload,
      modelUsed: model,
      durationMs,
    };
  } catch (multiPassErr: any) {
    const errorMsg = multiPassErr?.message || String(multiPassErr);
    const isQuota =
      multiPassErr?.status === 429 ||
      errorMsg.includes('429') ||
      errorMsg.includes('RESOURCE_EXHAUSTED') ||
      errorMsg.includes('RATE_LIMITED_PASS') ||
      errorMsg.toLowerCase().includes('quota');

    if (isQuota) {
      const err = new Error(errorMsg);
      (err as any).partialPayload = multiPassErr?.partialPayload;
      (err as any).retryAfterSeconds = multiPassErr?.retryAfterSeconds;
      throw err;
    }

    console.warn(`[Gemini Extraction] Multi-pass pipeline encountered non-quota issue: ${errorMsg}. Falling back to structured single-pass extraction...`);
  }

  const ai = getGeminiClient();
  const systemInstruction = `You are a high-precision hardware review data extractor.
Your job is to analyze the provided YouTube laptop review video and extract structured specifications, benchmark measurements, gaming framerates, thermal data, display metrics, battery life, and evidence provenance.

CRITICAL NON-NEGOTIABLE EXTRACTION RULES:
1. SOURCE OF TRUTH IS EXCLUSIVELY THE PROVIDED REVIEW VIDEO (${youtubeUrl}).
2. DO NOT use pre-trained memory or assumptions about what this laptop model might contain.
3. DO NOT substitute manufacturer specifications. Only extract what the reviewer actually has in hand and tests in this specific video.
4. DO NOT guess missing values. If a specification, benchmark, or measurement is not explicitly tested or mentioned in the video, set it to NULL.
5. NEVER turn missing scores into zero (0). Only record a benchmark or gaming score if it was explicitly tested.
6. NEVER infer averages from peaks (e.g. do not guess cpu_avg_c if only peak temperature was shown).
7. For gaming results, strictly capture test conditions (resolution, preset, ray tracing, upscaling).
8. For evidence records, whenever a timestamp is visible or identifiable, record the exact timestamp in seconds and display format (e.g. 255 seconds -> "04:15"). If no trustworthy timestamp exists, leave timestamp_seconds as NULL.
9. Return valid JSON conforming strictly to the requested schema.`;

  const userPrompt = `Analyze this YouTube laptop review:
URL: ${youtubeUrl}
Video ID: ${videoId}
${oembed ? `Verified Title: "${oembed.title}"\nVerified Reviewer/Channel: "${oembed.author_name}"` : ''}

Extract the complete laptop identity, tested configuration specifications, review metadata, benchmarks, gaming performance, thermals, display tests, battery tests, and evidence timestamps.`;

  let responseText: string | undefined;

  try {
    const parts: any[] = [{ text: userPrompt }];
    try {
      parts.unshift({
        fileData: {
          fileUri: youtubeUrl,
          mimeType: 'video/mp4',
        },
      });
    } catch (e) {
      console.warn('Could not attach fileData for YouTube URL, falling back to text prompt:', e);
    }

    const result = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_EXTRACTION_SCHEMA,
        temperature: 0.1,
      },
    });

    responseText = result.text;
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    if (
      err?.status === 429 ||
      errorMsg.includes('429') ||
      errorMsg.includes('RESOURCE_EXHAUSTED') ||
      errorMsg.toLowerCase().includes('quota')
    ) {
      throw new Error('GEMINI_QUOTA_LIMITED: Quota limit reached for this Gemini model. Please switch to an available model or try again later.');
    }

    console.warn(`Single-pass extraction with video part failed: ${errorMsg}. Retrying with URL context...`);

    try {
      const fallbackResult = await ai.models.generateContent({
        model,
        contents: `${userPrompt}\n\nPlease inspect the YouTube video at ${youtubeUrl} and extract only verified data shown or discussed in this specific review.`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_EXTRACTION_SCHEMA,
          temperature: 0.1,
        },
      });
      responseText = fallbackResult.text;
    } catch (fallbackErr: any) {
      const fallbackMsg = fallbackErr?.message || String(fallbackErr);
      if (
        fallbackErr?.status === 429 ||
        fallbackMsg.includes('429') ||
        fallbackMsg.includes('RESOURCE_EXHAUSTED') ||
        fallbackMsg.toLowerCase().includes('quota')
      ) {
        throw new Error('GEMINI_QUOTA_LIMITED: Quota limit reached for this Gemini model. Please switch to an available model or try again later.');
      }
      const cleanError = fallbackMsg.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_KEY]');
      throw new Error(`GEMINI_EXTRACTION_FAILED: ${cleanError}`);
    }
  }

  const durationMs = Date.now() - startTime;

  if (!responseText || responseText.trim().length === 0) {
    throw new Error('GEMINI_EXTRACTION_FAILED: Model returned empty response text.');
  }

  let rawJson: any;
  try {
    rawJson = JSON.parse(responseText.trim());
  } catch (parseErr: any) {
    throw new Error(`GEMINI_SCHEMA_ERROR: Failed to parse Gemini response as JSON: ${parseErr.message}`);
  }

  if (oembed) {
    if (!rawJson.review_meta) rawJson.review_meta = {};
    if (!rawJson.review_meta.title || rawJson.review_meta.title.toLowerCase().includes('untitled')) {
      rawJson.review_meta.title = oembed.title;
    }
    if (!rawJson.review_meta.reviewer || rawJson.review_meta.reviewer.toLowerCase().includes('unknown')) {
      rawJson.review_meta.reviewer = oembed.author_name;
    }
  }

  const normalizedJson = normalizeExtractionInput(rawJson);
  const parsed = ExtractedDataPayloadSchema.safeParse(normalizedJson);
  if (!parsed.success) {
    console.error('Extraction validation errors:', parsed.error.format());
    throw new Error(`GEMINI_SCHEMA_ERROR: Extracted data failed schema validation: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
  }

  return {
    payload: parsed.data as ExtractedDataPayload,
    modelUsed: model,
    durationMs,
  };
}
