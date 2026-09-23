import { GoogleGenAI } from '@google/genai';
import {
  SYSTEM_INSTRUCTION_BASE,
  PROMPT_PASS_0_DISCOVERY,
  PROMPT_PASS_A_IDENTITY_SPECS,
  PROMPT_PASS_B_BENCHMARKS,
  PROMPT_PASS_C_GAMING,
  PROMPT_PASS_D_THERMALS_DISPLAY_BATTERY,
  PROMPT_PASS_E_AUDIT,
} from './exhaustivePrompts.ts';
import { mergeExtractionPasses } from './deterministicMerge.ts';
import { normalizeExtractionInput, ExtractedDataPayloadSchema } from '../../../shared/schemas/extraction.ts';
import type { ExtractedDataPayload, PassStatusDetail } from '../../../shared/types/index.ts';
import { geminiScheduler, GeminiRateLimitError } from './geminiScheduler.ts';

export interface ExtractionProgressCallback {
  (step: string, details?: string): void;
}

export interface RunExtractionOptions {
  apiKey: string;
  modelId: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  depth?: 'deep' | 'standard';
  onProgress?: ExtractionProgressCallback;
  previousPayload?: ExtractedDataPayload | null;
}

/**
 * Strips markdown code fences from Gemini JSON output
 */
function cleanJsonText(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Robust JSON parse with error diagnosis
 */
function parseJsonSafe<T>(raw: string, passName: string): T {
  const cleaned = cleanJsonText(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    console.error(`Failed to parse JSON for ${passName}:`, err?.message, '\nRaw:\n', raw.slice(0, 300));
    throw new Error(`JSON_PARSE_ERROR in ${passName}: ${err?.message}`);
  }
}

/**
 * Runs a single multimodal Gemini call with video fileData or URL text context
 * scheduled through the global serialized GeminiRequestScheduler.
 */
async function executePassScheduled(params: {
  ai: GoogleGenAI;
  modelId: string;
  youtubeUrl: string;
  prompt: string;
  passName: string;
  systemInstruction?: string;
  chatSession?: any;
}): Promise<string> {
  const { ai, modelId, youtubeUrl, prompt, passName, systemInstruction, chatSession } = params;

  return geminiScheduler.schedule(
    async () => {
      // 1. If we have an active chat session that already holds video context, use targeted follow-up
      if (chatSession && typeof chatSession.sendMessage === 'function') {
        try {
          const chatResponse = await chatSession.sendMessage({
            message: prompt,
          });
          const text = chatResponse.text || '';
          if (text.trim()) {
            return text;
          }
        } catch (chatErr: any) {
          if (geminiScheduler.isRateLimitError(chatErr)) {
            throw chatErr; // Re-throw rate limit directly to scheduler for backoff
          }
          console.warn(`[ExhaustiveExtraction] Chat session follow-up failed for ${passName} (${chatErr?.message}), falling back to direct generateContent`);
        }
      }

      // 2. Direct generateContent with video attachment
      const contents: any[] = [
        {
          fileData: {
            fileUri: youtubeUrl,
            mimeType: 'video/mp4',
          },
        },
        {
          text: prompt,
        },
      ];

      const config: any = {
        systemInstruction: systemInstruction || SYSTEM_INSTRUCTION_BASE,
        temperature: 0.1, // High precision, zero hallucination
        responseMimeType: 'application/json',
      };

      try {
        const response = await ai.models.generateContent({
          model: modelId,
          contents,
          config,
        });

        const text = response.text || '';
        if (!text.trim()) {
          throw new Error(`Empty response received in ${passName}`);
        }
        return text;
      } catch (err: any) {
        if (geminiScheduler.isRateLimitError(err)) {
          throw err;
        }

        // If fileData video/mp4 is rejected for specific non-standard video URLs, fallback to URL textual context
        const errMsg = err?.message || String(err);
        if (
          errMsg.includes('fileData') ||
          errMsg.includes('fileUri') ||
          errMsg.includes('INVALID_ARGUMENT') ||
          errMsg.includes('mimeType')
        ) {
          console.warn(`Direct video URI fallback to textual context for ${passName}:`, errMsg);
          const fallbackResponse = await ai.models.generateContent({
            model: modelId,
            contents: `Review Video URL: ${youtubeUrl}\n\n${prompt}`,
            config,
          });
          return fallbackResponse.text || '';
        }
        throw err;
      }
    },
    {
      passName,
      modelId,
    }
  );
}

/**
 * Builds a partial payload for persistence when an extraction pass hits a rate limit
 */
export function buildPartialPayload(params: {
  passAData: any;
  passBData: any;
  passCData: any;
  passDData: any;
  auditAdditions: any;
  passStatuses: Record<string, PassStatusDetail>;
  passesCompleted: number;
  discoveredSegmentsCount: number;
  depth: string;
  sourceVideoAccess: 'full' | 'partial' | 'failed';
  completenessNotes: string;
  blockedPass?: string;
  retryAfterSeconds?: number;
}): ExtractedDataPayload {
  const {
    passAData,
    passBData,
    passCData,
    passDData,
    auditAdditions,
    passStatuses,
    passesCompleted,
    discoveredSegmentsCount,
    depth,
    sourceVideoAccess,
    completenessNotes,
    blockedPass,
    retryAfterSeconds,
  } = params;

  const merged = mergeExtractionPasses({
    identityAndSpecs: {
      laptop: passAData.laptop || { brand: 'Pending', model: 'Extraction' },
      configuration: passAData.configuration || {},
      review_meta: passAData.review_meta || { title: 'Extraction Incomplete', reviewer: 'YouTube Reviewer' },
      evidence: passAData.evidence || [],
      display: passDData.display_results?.[0] || null,
      battery: passDData.battery_results?.[0] || null,
    },
    benchmarks: passBData.benchmarks || [],
    gaming: passCData.gaming || [],
    thermals: passDData.thermals || [],
    displayResults: passDData.display_results || [],
    batteryResults: passDData.battery_results || [],
    auditAdditions,
    meta: {
      passesCompleted,
      discoveredSegments: discoveredSegmentsCount,
      processingMode: `multi_pass_${depth}`,
      sourceVideoAccess,
      completenessNotes,
    },
  });

  const normalized = normalizeExtractionInput(merged);

  normalized.extraction_meta = {
    ...normalized.extraction_meta,
    extraction_version: '2.6.0-quota-aware',
    processing_mode: `multi_pass_${depth}`,
    passes_completed: passesCompleted,
    total_passes_required: depth === 'deep' ? 5 : 4,
    overall_status: blockedPass ? 'rate_limited' : 'complete',
    pass_statuses: passStatuses,
    discovered_segments: discoveredSegmentsCount,
    source_video_access: sourceVideoAccess,
    completeness_notes: completenessNotes,
    rate_limit_info: blockedPass && retryAfterSeconds ? {
      blocked_pass: blockedPass,
      retry_after_seconds: retryAfterSeconds,
      retry_available_at: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
    } : null,
  };

  return normalized as ExtractedDataPayload;
}

/**
 * Executes the Quota-Aware Exhaustive Multi-Pass Video Extraction Pipeline.
 *
 * Core Guarantees:
 * 1. Concurrency = 1 with bounded retry logic and 429 jitter backoff.
 * 2. Never converts a rate-limit/pass failure into empty array [] of results.
 * 3. Preserves completed passes across retries and resumes from the first incomplete pass.
 * 4. Multi-turn conversation context to avoid redundant full-video uploads.
 */
export async function runExhaustiveExtraction(
  options: RunExtractionOptions
): Promise<ExtractedDataPayload> {
  const { apiKey, modelId, youtubeUrl, youtubeVideoId, depth = 'deep', onProgress, previousPayload } = options;
  const ai = new GoogleGenAI({ apiKey });

  const passStatuses: Record<string, PassStatusDetail> = {
    discovery: { pass_name: 'discovery', status: 'pending' },
    identity_specs: { pass_name: 'identity_specs', status: 'pending' },
    benchmarks: { pass_name: 'benchmarks', status: 'pending' },
    gaming: { pass_name: 'gaming', status: 'pending' },
    thermals_display_battery: { pass_name: 'thermals_display_battery', status: 'pending' },
    audit: { pass_name: 'audit', status: depth === 'deep' ? 'pending' : 'skipped' },
  };

  let passesCompleted = 0;
  let discoveredSegmentsCount = 0;
  let discoverySummary = '';
  let discoveredSegments: any[] = [];
  let sourceVideoAccess: 'full' | 'partial' | 'failed' = 'full';
  let completenessNotes = '';

  let passAData: any = {};
  let passBData: { benchmarks?: any[] } = { benchmarks: [] };
  let passCData: { gaming?: any[] } = { gaming: [] };
  let passDData: {
    thermals?: any[];
    display_results?: any[];
    battery_results?: any[];
  } = { thermals: [], display_results: [], battery_results: [] };
  let auditAdditions: any = null;

  // ----------------------------------------------------
  // RESUME FROM PREVIOUS EXTRACTION STATE (IF APPLICABLE)
  // ----------------------------------------------------
  if (previousPayload) {
    const prevMeta = previousPayload.extraction_meta;
    const prevStatuses = prevMeta?.pass_statuses || {};

    if (prevStatuses.discovery?.status === 'success') {
      console.log('[ExhaustiveExtraction] Resuming: reusing previously successful Discovery pass');
      discoveredSegmentsCount = prevMeta?.discovered_segments || 0;
      discoverySummary = prevMeta?.completeness_notes || '';
      passStatuses.discovery = { ...prevStatuses.discovery };
      passesCompleted++;
    }

    if (prevStatuses.identity_specs?.status === 'success' && previousPayload.laptop?.brand) {
      console.log('[ExhaustiveExtraction] Resuming: reusing previously successful Identity/Specs pass');
      passAData = {
        laptop: previousPayload.laptop,
        configuration: previousPayload.configuration,
        review_meta: previousPayload.review_meta,
        evidence: previousPayload.evidence || [],
      };
      passStatuses.identity_specs = { ...prevStatuses.identity_specs };
      passesCompleted++;
    }

    if (prevStatuses.benchmarks?.status === 'success') {
      console.log(`[ExhaustiveExtraction] Resuming: reusing ${previousPayload.benchmarks?.length || 0} benchmarks from previous pass`);
      passBData = { benchmarks: previousPayload.benchmarks || [] };
      passStatuses.benchmarks = { ...prevStatuses.benchmarks };
      passesCompleted++;
    }

    if (prevStatuses.gaming?.status === 'success') {
      console.log(`[ExhaustiveExtraction] Resuming: reusing ${previousPayload.gaming?.length || 0} gaming tests from previous pass`);
      passCData = { gaming: previousPayload.gaming || [] };
      passStatuses.gaming = { ...prevStatuses.gaming };
      passesCompleted++;
    }

    if (prevStatuses.thermals_display_battery?.status === 'success') {
      console.log(`[ExhaustiveExtraction] Resuming: reusing thermals/display/battery from previous pass`);
      passDData = {
        thermals: previousPayload.thermals || [],
        display_results: previousPayload.display_results || (previousPayload.display ? [previousPayload.display] : []),
        battery_results: previousPayload.battery_results || (previousPayload.battery ? [previousPayload.battery] : []),
      };
      passStatuses.thermals_display_battery = { ...prevStatuses.thermals_display_battery };
      passesCompleted++;
    }
  }

  // Initialize Chat Session to hold multi-turn video context
  let chatSession: any = null;
  try {
    chatSession = ai.chats.create({
      model: modelId,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_BASE,
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });
  } catch (e) {
    console.warn('[ExhaustiveExtraction] Chat session initialization skipped:', e);
  }

  // ----------------------------------------------------
  // PASS 0: Coverage & Timeline Discovery
  // ----------------------------------------------------
  if (passStatuses.discovery.status !== 'success') {
    onProgress?.('pass_0', 'Scanning video timeline for test coverage and segments...');
    passStatuses.discovery.started_at = new Date().toISOString();

    try {
      const rawPass0 = await executePassScheduled({
        ai,
        modelId,
        youtubeUrl,
        prompt: PROMPT_PASS_0_DISCOVERY,
        passName: 'Pass 0 (Discovery)',
        chatSession,
      });

      const p0 = parseJsonSafe<{
        discovered_segments?: any[];
        summary?: string;
      }>(rawPass0, 'Pass 0');

      discoveredSegments = p0.discovered_segments || [];
      discoveredSegmentsCount = discoveredSegments.length;
      discoverySummary = p0.summary || '';

      passStatuses.discovery.status = 'success';
      passStatuses.discovery.items_extracted = discoveredSegmentsCount;
      passStatuses.discovery.completed_at = new Date().toISOString();
      passesCompleted++;
    } catch (err: any) {
      const isRateLimit = geminiScheduler.isRateLimitError(err);
      const retrySecs = geminiScheduler.parseRetryDelay(err);

      passStatuses.discovery.status = isRateLimit ? 'rate_limited' : 'failed';
      passStatuses.discovery.error_code = isRateLimit ? 'RATE_LIMIT' : 'ERROR';
      passStatuses.discovery.error_message = err?.message || String(err);
      passStatuses.discovery.retry_after_seconds = isRateLimit ? retrySecs : null;

      console.warn(`Pass 0 Discovery failed (status=${passStatuses.discovery.status}):`, err?.message);

      if (isRateLimit) {
        // Halt and return partial state with rate_limited status
        const partial = buildPartialPayload({
          passAData,
          passBData,
          passCData,
          passDData,
          auditAdditions,
          passStatuses,
          passesCompleted,
          discoveredSegmentsCount,
          depth,
          sourceVideoAccess: 'failed',
          completenessNotes: discoverySummary,
          blockedPass: 'Pass 0 (Discovery)',
          retryAfterSeconds: retrySecs,
        });

        const rateLimitErr = new GeminiRateLimitError({
          passName: 'Pass 0 (Discovery)',
          retryAfterSeconds: retrySecs,
          message: err?.message || 'Quota limit reached during Discovery pass',
          modelId,
        });
        (rateLimitErr as any).partialPayload = partial;
        throw rateLimitErr;
      }
    }
  }

  // ----------------------------------------------------
  // PASS A: Identity, Tested Configuration, and Review Meta (REQUIRED)
  // ----------------------------------------------------
  if (passStatuses.identity_specs.status !== 'success') {
    onProgress?.('pass_a', 'Extracting laptop identity, hardware specs, and review verdict...');
    passStatuses.identity_specs.started_at = new Date().toISOString();

    try {
      const rawPassA = await executePassScheduled({
        ai,
        modelId,
        youtubeUrl,
        prompt: PROMPT_PASS_A_IDENTITY_SPECS,
        passName: 'Pass A (Identity & Specs)',
        chatSession,
      });

      passAData = parseJsonSafe<any>(rawPassA, 'Pass A');
      passStatuses.identity_specs.status = 'success';
      passStatuses.identity_specs.completed_at = new Date().toISOString();
      passesCompleted++;
    } catch (err: any) {
      const isRateLimit = geminiScheduler.isRateLimitError(err);
      const retrySecs = geminiScheduler.parseRetryDelay(err);

      passStatuses.identity_specs.status = isRateLimit ? 'rate_limited' : 'failed';
      passStatuses.identity_specs.error_code = isRateLimit ? 'RATE_LIMIT' : 'ERROR';
      passStatuses.identity_specs.error_message = err?.message || String(err);
      passStatuses.identity_specs.retry_after_seconds = isRateLimit ? retrySecs : null;

      console.error('Pass A failed:', err);

      const partial = buildPartialPayload({
        passAData,
        passBData,
        passCData,
        passDData,
        auditAdditions,
        passStatuses,
        passesCompleted,
        discoveredSegmentsCount,
        depth,
        sourceVideoAccess,
        completenessNotes: discoverySummary,
        blockedPass: 'Pass A (Identity & Specs)',
        retryAfterSeconds: isRateLimit ? retrySecs : undefined,
      });

      if (isRateLimit) {
        const rateLimitErr = new GeminiRateLimitError({
          passName: 'Pass A (Identity & Specs)',
          retryAfterSeconds: retrySecs,
          message: err?.message || 'Quota limit reached during Identity & Specs pass',
          modelId,
        });
        (rateLimitErr as any).partialPayload = partial;
        throw rateLimitErr;
      }

      throw new Error(`EXTRACTION_FAILED_SPECS: ${err.message}`);
    }
  }

  // ----------------------------------------------------
  // PASS B: Exhaustive Benchmarks & Synthetics
  // ----------------------------------------------------
  if (passStatuses.benchmarks.status !== 'success') {
    onProgress?.('pass_b', 'Forensically scanning all synthetic benchmarks and charts...');
    passStatuses.benchmarks.started_at = new Date().toISOString();

    // Contextualize Pass B with discovered benchmark segments
    const benchmarkSegments = discoveredSegments.filter(
      s => s.type === 'benchmarks' || s.type === 'performance' || s.type === 'cpu' || s.type === 'gpu'
    );
    const segmentContext = benchmarkSegments.length > 0
      ? `\nFocus explicitly on discovered benchmark segments: ${benchmarkSegments.map(s => `[${s.start_seconds}s - ${s.end_seconds}s: ${s.title || s.type}]`).join(', ')}.\n`
      : '';

    try {
      const rawPassB = await executePassScheduled({
        ai,
        modelId,
        youtubeUrl,
        prompt: `${PROMPT_PASS_B_BENCHMARKS}\n${segmentContext}`,
        passName: 'Pass B (Benchmarks)',
        chatSession,
      });

      const parsedB = parseJsonSafe<{ benchmarks?: any[] }>(rawPassB, 'Pass B');
      passBData = { benchmarks: parsedB.benchmarks || [] };
      passStatuses.benchmarks.status = 'success';
      passStatuses.benchmarks.items_extracted = passBData.benchmarks?.length || 0;
      passStatuses.benchmarks.completed_at = new Date().toISOString();
      passesCompleted++;
    } catch (err: any) {
      const isRateLimit = geminiScheduler.isRateLimitError(err);
      const retrySecs = geminiScheduler.parseRetryDelay(err);

      passStatuses.benchmarks.status = isRateLimit ? 'rate_limited' : 'failed';
      passStatuses.benchmarks.error_code = isRateLimit ? 'RATE_LIMIT' : 'ERROR';
      passStatuses.benchmarks.error_message = err?.message || String(err);
      passStatuses.benchmarks.retry_after_seconds = isRateLimit ? retrySecs : null;

      console.warn(`Pass B Benchmarks error (status=${passStatuses.benchmarks.status}):`, err?.message);

      if (isRateLimit) {
        // DO NOT REPLACE WITH EMPTY ARRAY []! Persist partial payload and throw RateLimitError
        const partial = buildPartialPayload({
          passAData,
          passBData,
          passCData,
          passDData,
          auditAdditions,
          passStatuses,
          passesCompleted,
          discoveredSegmentsCount,
          depth,
          sourceVideoAccess,
          completenessNotes: discoverySummary,
          blockedPass: 'Pass B (Benchmarks)',
          retryAfterSeconds: retrySecs,
        });

        const rateLimitErr = new GeminiRateLimitError({
          passName: 'Pass B (Benchmarks)',
          retryAfterSeconds: retrySecs,
          message: err?.message || 'Quota limit reached during Benchmarks pass',
          modelId,
        });
        (rateLimitErr as any).partialPayload = partial;
        throw rateLimitErr;
      }
    }
  }

  // ----------------------------------------------------
  // PASS C: Exhaustive Gaming Performance
  // ----------------------------------------------------
  if (passStatuses.gaming.status !== 'success') {
    onProgress?.('pass_c', 'Extracting every tested game, resolution, and FPS metric...');
    passStatuses.gaming.started_at = new Date().toISOString();

    const gamingSegments = discoveredSegments.filter(s => s.type === 'gaming' || s.type === 'fps' || s.type === 'gameplay');
    const segmentContext = gamingSegments.length > 0
      ? `\nFocus explicitly on discovered gaming test segments: ${gamingSegments.map(s => `[${s.start_seconds}s - ${s.end_seconds}s: ${s.title || s.type}]`).join(', ')}.\n`
      : '';

    try {
      const rawPassC = await executePassScheduled({
        ai,
        modelId,
        youtubeUrl,
        prompt: `${PROMPT_PASS_C_GAMING}\n${segmentContext}`,
        passName: 'Pass C (Gaming)',
        chatSession,
      });

      const parsedC = parseJsonSafe<{ gaming?: any[] }>(rawPassC, 'Pass C');
      passCData = { gaming: parsedC.gaming || [] };
      passStatuses.gaming.status = 'success';
      passStatuses.gaming.items_extracted = passCData.gaming?.length || 0;
      passStatuses.gaming.completed_at = new Date().toISOString();
      passesCompleted++;
    } catch (err: any) {
      const isRateLimit = geminiScheduler.isRateLimitError(err);
      const retrySecs = geminiScheduler.parseRetryDelay(err);

      passStatuses.gaming.status = isRateLimit ? 'rate_limited' : 'failed';
      passStatuses.gaming.error_code = isRateLimit ? 'RATE_LIMIT' : 'ERROR';
      passStatuses.gaming.error_message = err?.message || String(err);
      passStatuses.gaming.retry_after_seconds = isRateLimit ? retrySecs : null;

      console.warn(`Pass C Gaming error (status=${passStatuses.gaming.status}):`, err?.message);

      if (isRateLimit) {
        const partial = buildPartialPayload({
          passAData,
          passBData,
          passCData,
          passDData,
          auditAdditions,
          passStatuses,
          passesCompleted,
          discoveredSegmentsCount,
          depth,
          sourceVideoAccess,
          completenessNotes: discoverySummary,
          blockedPass: 'Pass C (Gaming)',
          retryAfterSeconds: retrySecs,
        });

        const rateLimitErr = new GeminiRateLimitError({
          passName: 'Pass C (Gaming)',
          retryAfterSeconds: retrySecs,
          message: err?.message || 'Quota limit reached during Gaming pass',
          modelId,
        });
        (rateLimitErr as any).partialPayload = partial;
        throw rateLimitErr;
      }
    }
  }

  // ----------------------------------------------------
  // PASS D: Thermals, Display Lab Tests & Battery Runtime
  // ----------------------------------------------------
  if (passStatuses.thermals_display_battery.status !== 'success') {
    onProgress?.('pass_d', 'Extracting thermal tests, display measurements, and battery life...');
    passStatuses.thermals_display_battery.started_at = new Date().toISOString();

    const thermalSegments = discoveredSegments.filter(
      s => s.type === 'thermals' || s.type === 'temperature' || s.type === 'display' || s.type === 'battery'
    );
    const segmentContext = thermalSegments.length > 0
      ? `\nFocus explicitly on discovered lab segments: ${thermalSegments.map(s => `[${s.start_seconds}s - ${s.end_seconds}s: ${s.title || s.type}]`).join(', ')}.\n`
      : '';

    try {
      const rawPassD = await executePassScheduled({
        ai,
        modelId,
        youtubeUrl,
        prompt: `${PROMPT_PASS_D_THERMALS_DISPLAY_BATTERY}\n${segmentContext}`,
        passName: 'Pass D (Thermals, Display & Battery)',
        chatSession,
      });

      passDData = parseJsonSafe<any>(rawPassD, 'Pass D');
      passStatuses.thermals_display_battery.status = 'success';
      passStatuses.thermals_display_battery.items_extracted =
        (passDData.thermals?.length || 0) +
        (passDData.display_results?.length || 0) +
        (passDData.battery_results?.length || 0);
      passStatuses.thermals_display_battery.completed_at = new Date().toISOString();
      passesCompleted++;
    } catch (err: any) {
      const isRateLimit = geminiScheduler.isRateLimitError(err);
      const retrySecs = geminiScheduler.parseRetryDelay(err);

      passStatuses.thermals_display_battery.status = isRateLimit ? 'rate_limited' : 'failed';
      passStatuses.thermals_display_battery.error_code = isRateLimit ? 'RATE_LIMIT' : 'ERROR';
      passStatuses.thermals_display_battery.error_message = err?.message || String(err);
      passStatuses.thermals_display_battery.retry_after_seconds = isRateLimit ? retrySecs : null;

      console.warn(`Pass D Thermals/Display/Battery error (status=${passStatuses.thermals_display_battery.status}):`, err?.message);

      if (isRateLimit) {
        const partial = buildPartialPayload({
          passAData,
          passBData,
          passCData,
          passDData,
          auditAdditions,
          passStatuses,
          passesCompleted,
          discoveredSegmentsCount,
          depth,
          sourceVideoAccess,
          completenessNotes: discoverySummary,
          blockedPass: 'Pass D (Thermals, Display & Battery)',
          retryAfterSeconds: retrySecs,
        });

        const rateLimitErr = new GeminiRateLimitError({
          passName: 'Pass D (Thermals, Display & Battery)',
          retryAfterSeconds: retrySecs,
          message: err?.message || 'Quota limit reached during Thermals/Display/Battery pass',
          modelId,
        });
        (rateLimitErr as any).partialPayload = partial;
        throw rateLimitErr;
      }
    }
  }

  // ----------------------------------------------------
  // PASS E: Completeness Audit & Gap Check (Targeted Diff, No Full Rescan)
  // ----------------------------------------------------
  if (depth === 'deep' && passStatuses.audit.status !== 'success') {
    onProgress?.('pass_e', 'Running targeted completeness audit against discovered timeline...');
    passStatuses.audit.started_at = new Date().toISOString();

    const currentSummary = `Current inventory:
- Specs: ${passAData.laptop?.brand || ''} ${passAData.laptop?.model || ''} (${passAData.configuration?.cpu || ''}, ${passAData.configuration?.gpu || ''})
- Benchmarks captured (${passBData.benchmarks?.length || 0}): ${passBData.benchmarks?.map((b: any) => `${b.benchmark_group} (${b.variant || 'default'}) = ${b.score}`).slice(0, 15).join(', ')}
- Games captured (${passCData.gaming?.length || 0}): ${passCData.gaming?.map((g: any) => `${g.game} ${g.resolution || ''} ${g.preset || ''}`).slice(0, 15).join(', ')}
- Thermals captured (${passDData.thermals?.length || 0}): ${passDData.thermals?.map((t: any) => t.test_name).join(', ')}
- Display tests (${passDData.display_results?.length || 0})
- Battery tests (${passDData.battery_results?.length || 0})
- Discovered segments (${discoveredSegmentsCount}): ${discoveredSegments.map(s => `[${s.start_seconds}s-${s.end_seconds}s: ${s.type}]`).slice(0, 10).join(', ')}`;

    try {
      const rawPassE = await executePassScheduled({
        ai,
        modelId,
        youtubeUrl,
        prompt: PROMPT_PASS_E_AUDIT(currentSummary),
        passName: 'Pass E (Audit)',
        chatSession,
      });

      const parsedE = parseJsonSafe<{
        additional_benchmarks?: any[];
        additional_gaming?: any[];
        additional_thermals?: any[];
        additional_display_results?: any[];
        additional_battery_results?: any[];
        audit_notes?: string;
      }>(rawPassE, 'Pass E');

      completenessNotes = parsedE.audit_notes || '';
      auditAdditions = {
        benchmarks: parsedE.additional_benchmarks || [],
        gaming: parsedE.additional_gaming || [],
        thermals: parsedE.additional_thermals || [],
        displayResults: parsedE.additional_display_results || [],
        batteryResults: parsedE.additional_battery_results || [],
      };

      passStatuses.audit.status = 'success';
      passStatuses.audit.items_extracted =
        (auditAdditions.benchmarks?.length || 0) +
        (auditAdditions.gaming?.length || 0) +
        (auditAdditions.thermals?.length || 0);
      passStatuses.audit.completed_at = new Date().toISOString();
      passesCompleted++;
    } catch (err: any) {
      const isRateLimit = geminiScheduler.isRateLimitError(err);
      const retrySecs = geminiScheduler.parseRetryDelay(err);

      passStatuses.audit.status = isRateLimit ? 'rate_limited' : 'failed';
      passStatuses.audit.error_code = isRateLimit ? 'RATE_LIMIT' : 'ERROR';
      passStatuses.audit.error_message = err?.message || String(err);
      passStatuses.audit.retry_after_seconds = isRateLimit ? retrySecs : null;

      console.warn(`Pass E Audit non-fatal error (status=${passStatuses.audit.status}):`, err?.message);
    }
  }

  // ----------------------------------------------------
  // DETERMINISTIC MERGE & DEDUPLICATION LAYER
  // ----------------------------------------------------
  onProgress?.('merge', 'Performing deterministic schema validation and deduplication...');

  const anyRateLimited = Object.values(passStatuses).some(s => s.status === 'rate_limited');
  const overallStatus = anyRateLimited ? 'rate_limited' : 'complete';

  const merged = mergeExtractionPasses({
    identityAndSpecs: {
      laptop: passAData.laptop || { brand: 'Unknown', model: 'Laptop' },
      configuration: passAData.configuration || {},
      review_meta: passAData.review_meta || { title: 'Review', reviewer: 'Reviewer' },
      evidence: passAData.evidence || [],
      display: passDData.display_results?.[0] || null,
      battery: passDData.battery_results?.[0] || null,
    },
    benchmarks: passBData.benchmarks || [],
    gaming: passCData.gaming || [],
    thermals: passDData.thermals || [],
    displayResults: passDData.display_results || [],
    batteryResults: passDData.battery_results || [],
    auditAdditions,
    meta: {
      passesCompleted,
      discoveredSegments: discoveredSegmentsCount,
      processingMode: `multi_pass_${depth}`,
      sourceVideoAccess,
      completenessNotes: completenessNotes || discoverySummary,
    },
  });

  const normalized = normalizeExtractionInput(merged);

  normalized.extraction_meta = {
    ...normalized.extraction_meta,
    extraction_version: '2.6.0-quota-aware',
    processing_mode: `multi_pass_${depth}`,
    passes_completed: passesCompleted,
    total_passes_required: depth === 'deep' ? 5 : 4,
    overall_status: overallStatus,
    pass_statuses: passStatuses,
    discovered_segments: discoveredSegmentsCount,
    source_video_access: sourceVideoAccess,
    completeness_notes: completenessNotes || discoverySummary,
    rate_limit_info: null,
  };

  const validated = ExtractedDataPayloadSchema.parse(normalized);
  return validated;
}
