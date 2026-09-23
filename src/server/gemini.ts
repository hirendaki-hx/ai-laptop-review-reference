import { GoogleGenAI } from '@google/genai';
import { ExtractionData, ExtractionJob } from '../types.ts';
import { checkDuplicateReview, saveExtractionJob } from './db.ts';
import { normalizeExtractionInput } from './schema.ts';

// Extract YouTube video ID from various URL formats
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const cleaned = url.trim();

  // youtube.com/watch?v=ID
  const watchMatch = cleaned.match(/[?&]v=([^&#]+)/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/ID
  const shortMatch = cleaned.match(/youtu\.be\/([^?&#]+)/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/embed/ID or shorts/ID
  const embedMatch = cleaned.match(/youtube\.com\/(?:embed|shorts)\/([^?&#]+)/);
  if (embedMatch) return embedMatch[1];

  // Raw 11 char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

// Robust JSON repair function
export function repairJsonString(input: string): string {
  let cleaned = input.trim();

  // 1. Strip markdown code fences: ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');

  // 2. Locate first '{' and last '}'
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('No JSON object found in response');
  }

  // Slice from first brace
  cleaned = cleaned.slice(firstBrace);

  // 3. Drop trailing commas before '}' or ']'
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // 4. Try parsing directly
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (initialErr) {
    // Attempt balancing braces & brackets
    let balanced = cleaned;

    // Remove any trailing truncated key or incomplete string
    // e.g. "some_key": or "some_key": "unfin...
    balanced = balanced.replace(/,\s*"[^"]*":\s*$/g, '');
    balanced = balanced.replace(/,\s*$/g, '');

    let openCurly = 0;
    let openSquare = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < balanced.length; i++) {
      const char = balanced[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') openCurly++;
        else if (char === '}') openCurly--;
        else if (char === '[') openSquare++;
        else if (char === ']') openSquare--;
      }
    }

    if (inString) {
      balanced += '"';
    }

    // Drop trailing comma before closing
    balanced = balanced.replace(/,\s*$/g, '');

    while (openSquare > 0) {
      balanced += ']';
      openSquare--;
    }
    while (openCurly > 0) {
      balanced += '}';
      openCurly--;
    }

    // Clean any comma right before added braces
    balanced = balanced.replace(/,\s*([}\]])/g, '$1');

    return balanced;
  }
}

// Valid Gemini multimodal models supporting video understanding
const MODELS_CASCADE = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

const EXTRACTION_PROMPT = `
You are a precision laptop review data extraction assistant.
Your task is to analyze this YouTube laptop review video and extract all structured data into a single JSON object.

CRITICAL SOURCE RULES:
1. The attached YouTube video is the primary source.
2. Identify the exact laptop shown/reviewed in THIS video before extracting any other data.
3. Never substitute another laptop based on similar CPU, GPU, product family, or general knowledge.
4. Never use a different laptop from memory or from another review.
5. Every specification, benchmark, gaming FPS result, thermal result, display result, battery result, and verdict must come from THIS video.
6. If a value is not visible, spoken, or otherwise supported by the video, return null.
7. Do not guess.
8. Do not fill missing fields with plausible values.
9. The laptop identity must be explicitly supported by evidence from the video.
10. If the exact laptop identity cannot be verified from the video, return a verification failure instead of inventing a laptop.

Hard rules (CRITICAL - FOLLOW STRICTLY):
"DO NOT GUESS. Extract only what is explicitly shown or stated in the video. If a value is not present, return null — never invent a plausible number. Numbers must be plain numbers with no units inside the string (ram_gb: 32, not "32GB"). benchmark_group must be the test's stable family name only (e.g. "Geekbench 6"); put "Single-Core"/"Multi-Core"/etc. in variant instead, never appended to benchmark_group or benchmark score."

Ensure output conforms EXACTLY to this JSON contract:
{
  "laptop": {
    "brand": string,
    "model": string,
    "series": string | null,
    "generation": string | null
  },
  "configuration": {
    "cpu": string | null,
    "gpu": string | null,
    "gpu_tgp_w": number | null,
    "ram_gb": number | null,
    "ram_speed_mt_s": number | null,
    "storage_gb": number | null,
    "storage_type": string | null,
    "display_size_inch": number | null,
    "display_resolution": string | null,
    "refresh_rate_hz": number | null,
    "panel_type": string | null,
    "battery_wh": number | null,
    "weight_kg": number | null,
    "thickness_mm": number | null
  },
  "review_meta": {
    "title": string,
    "reviewer": string,
    "published_date": string | null,
    "verdict_summary": string | null,
    "verdict_score": number | null,
    "verdict_pros": string[],
    "verdict_cons": string[]
  },
  "benchmarks": [
    {
      "benchmark_group": string,
      "variant": string | null,
      "category": "cpu" | "gpu" | "rendering" | "ai" | "storage" | "system" | "productivity",
      "score": number,
      "unit": string | null,
      "power_mode": string | null,
      "confidence": "high" | "medium" | "low",
      "notes": string | null
    }
  ],
  "gaming": [
    {
      "game": string,
      "resolution": string | null,
      "preset": string | null,
      "ray_tracing": boolean | null,
      "upscaling": boolean | null,
      "upscaling_mode": string | null,
      "avg_fps": number | null,
      "one_percent_low_fps": number | null,
      "notes": string | null
    }
  ],
  "thermals": [
    {
      "test_name": string,
      "duration_minutes": number | null,
      "cpu_peak_c": number | null,
      "cpu_avg_c": number | null,
      "cpu_peak_power_w": number | null,
      "cpu_avg_power_w": number | null,
      "gpu_peak_c": number | null,
      "gpu_avg_c": number | null,
      "keyboard_min_c": number | null,
      "keyboard_max_c": number | null,
      "notes": string | null
    }
  ],
  "display": {
    "brightness_sdr_nits": number | null,
    "brightness_hdr_nits": number | null,
    "srgb_percent": number | null,
    "dci_p3_percent": number | null,
    "adobe_rgb_percent": number | null,
    "response_time_ms": number | null,
    "g_sync": boolean | null,
    "vrr": boolean | null,
    "notes": string | null
  },
  "battery": {
    "battery_life_hours": number | null,
    "test_method": string | null,
    "brightness_percent": number | null,
    "gpu_mode": string | null,
    "charging_adapter_w": number | null,
    "zero_to_fifty_min": number | null,
    "full_charge_min": number | null,
    "usb_c_charging_w": number | null,
    "notes": string | null
  }
}

Respond ONLY with valid JSON.
`;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Background extraction worker using Quota-Aware Exhaustive Multi-Pass Pipeline
export async function runExtractionBackground(job: ExtractionJob, language?: string): Promise<void> {
  console.log(`[ExtractJob] Starting background extraction for ${job.id} (${job.youtube_url})`);

  // Step 1: Check duplicate BEFORE calling Gemini
  const duplicateCheck = await checkDuplicateReview(job.youtube_video_id);
  if (duplicateCheck.exists) {
    console.log(`[ExtractJob] Video ${job.youtube_video_id} already exists in review_sources`);
    job.status = 'duplicate';
    job.existingReviewId = duplicateCheck.existingReviewId;
    job.existingLaptopName = duplicateCheck.existingLaptopName;
    await saveExtractionJob(job);
    return;
  }

  // Update status to processing
  job.status = 'processing';
  await saveExtractionJob(job);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    job.status = 'failed';
    job.error_message = 'GEMINI_API_KEY is not configured in the server environment.';
    await saveExtractionJob(job);
    return;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
  const canonicalUrl = job.youtube_video_id ? `https://www.youtube.com/watch?v=${job.youtube_video_id}` : job.youtube_url;

  try {
    const { extractLaptopDataWithGemini } = await import('./external/gemini.ts');
    
    // Pass existing raw_extraction if present to resume completed passes
    const result = await extractLaptopDataWithGemini(
      canonicalUrl,
      job.youtube_video_id,
      model,
      job.raw_extraction as any
    );

    job.raw_extraction = result.payload as any;
    job.status = 'ready_for_review';
    job.error_message = null;
    await saveExtractionJob(job);
    console.log(`[ExtractJob] Successfully completed extraction for job ${job.id}. Ready for human review.`);
  } catch (err: any) {
    const rawError = err?.message || String(err);
    console.error(`[ExtractJob] Extraction error for job ${job.id}:`, rawError);

    // If partial extraction payload exists on error, preserve it!
    if (err?.partialPayload) {
      job.raw_extraction = err.partialPayload;
    }

    job.status = 'failed';
    job.error_message = rawError.slice(0, 300);
    await saveExtractionJob(job);
  }
}

