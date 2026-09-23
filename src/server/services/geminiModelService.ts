import { getGeminiClient, isGeminiConfigured } from '../external/gemini.ts';
import { APP_CONFIG } from '../../shared/constants/index.ts';

export type ModelHealthStatus =
  | 'available'
  | 'quota_limited'
  | 'auth_error'
  | 'unavailable'
  | 'checking'
  | 'unsupported';

export interface GeminiModelInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportsGenerateContent: boolean;
  videoCapability: 'VERIFIED' | 'CAPABILITY_UNVERIFIED' | 'UNSUPPORTED';
  supportsStructuredJson: boolean;
  releaseClass: 'stable' | 'preview' | 'experimental';
  status?: ModelHealthStatus;
  latencyMs?: number;
  lastTestedAt?: string;
  error?: string;
}

// Current runtime active model (server-level configuration)
let activeModelId: string =
  process.env.GEMINI_MODEL?.trim() || APP_CONFIG.defaultGeminiModel || 'gemini-3.8-flash';

// Cache for recent health check results per model ID to avoid duplicate rate-limit pressure
const modelHealthCache = new Map<
  string,
  {
    status: ModelHealthStatus;
    latencyMs?: number;
    error?: string;
    testedAt: number;
  }
>();

export function getActiveGeminiModel(): string {
  return activeModelId;
}

export function setActiveGeminiModel(modelId: string): string {
  const cleanId = modelId.replace(/^models\//, '').trim();
  if (!cleanId) {
    throw new Error('Invalid model ID provided.');
  }
  activeModelId = cleanId;
  return activeModelId;
}

/**
 * Lists available Gemini models using the official Gemini SDK Models API,
 * filters to extraction-appropriate models, and normalizes capabilities.
 */
export async function listExtractionModels(): Promise<{
  models: GeminiModelInfo[];
  currentModel: string;
}> {
  if (!isGeminiConfigured()) {
    return {
      models: [],
      currentModel: activeModelId,
    };
  }

  const ai = getGeminiClient();
  const models: GeminiModelInfo[] = [];

  try {
    const listResponse = await ai.models.list();

    for await (const m of listResponse) {
      const rawName = m.name || '';
      const id = rawName.replace(/^models\//, '');
      const actions: string[] = (m as any).supportedActions || (m as any).supportedGenerationMethods || [];

      // Only consider models that support generateContent
      if (!actions.includes('generateContent')) {
        continue;
      }

      // Only include Gemini series models
      const lowerId = id.toLowerCase();
      if (!lowerId.startsWith('gemini-')) {
        continue;
      }

      if (
        lowerId.includes('image') ||
        lowerId.includes('tts') ||
        lowerId.includes('audio') ||
        lowerId.includes('live') ||
        lowerId.includes('embedding') ||
        lowerId.includes('customtools') ||
        lowerId.includes('computer-use') ||
        lowerId.startsWith('gemma')
      ) {
        continue;
      }

      // Determine video understanding capability
      // Verified multimodal video models in Gemini family:
      let videoCapability: 'VERIFIED' | 'CAPABILITY_UNVERIFIED' | 'UNSUPPORTED' = 'CAPABILITY_UNVERIFIED';
      if (
        lowerId.startsWith('gemini-3.8-flash') ||
        lowerId.startsWith('gemini-3.1-pro') ||
        lowerId.startsWith('gemini-3.1-flash') ||
        lowerId.startsWith('gemini-2.5-pro') ||
        lowerId.startsWith('gemini-2.5-flash')
      ) {
        videoCapability = 'VERIFIED';
      }

      // Determine release class
      let releaseClass: 'stable' | 'preview' | 'experimental' = 'stable';
      if (lowerId.includes('preview')) {
        releaseClass = 'preview';
      } else if (lowerId.includes('exp')) {
        releaseClass = 'experimental';
      }

      // Check if we have recent cached health
      const cached = modelHealthCache.get(id);

      models.push({
        id,
        name: rawName,
        displayName: m.displayName || id,
        description: m.description || '',
        inputTokenLimit: m.inputTokenLimit || 0,
        outputTokenLimit: m.outputTokenLimit || 0,
        supportsGenerateContent: true,
        videoCapability,
        supportsStructuredJson: true,
        releaseClass,
        status: cached?.status,
        latencyMs: cached?.latencyMs,
        error: cached?.error,
        lastTestedAt: cached ? new Date(cached.testedAt).toISOString() : undefined,
      });
    }

    // Sort models with active model and popular stable models first
    models.sort((a, b) => {
      if (a.id === activeModelId) return -1;
      if (b.id === activeModelId) return 1;
      if (a.id.includes('3.8-flash') && !b.id.includes('3.8-flash')) return -1;
      if (!a.id.includes('3.8-flash') && b.id.includes('3.8-flash')) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return {
      models,
      currentModel: activeModelId,
    };
  } catch (err: any) {
    console.error('Failed to list Gemini models from API:', err);
    throw new Error(`GEMINI_MODELS_LIST_FAILED: ${err.message}`);
  }
}

/**
 * Real Model Health Test:
 * Performs a minimal test generation request ("Reply with exactly OK.")
 * Distinguishes AVAILABLE, QUOTA_LIMITED, AUTH_ERROR, and UNAVAILABLE.
 * Never exposes API credentials.
 */
export async function testModelHealth(modelId: string): Promise<{
  model: string;
  status: ModelHealthStatus;
  latencyMs?: number;
  code?: number;
  error?: string;
}> {
  const cleanId = modelId.replace(/^models\//, '').trim();

  if (!isGeminiConfigured()) {
    return {
      model: cleanId,
      status: 'auth_error',
      code: 401,
      error: 'GEMINI_API_KEY is not configured on the server.',
    };
  }

  const start = Date.now();
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: cleanId,
      contents: 'Reply with exactly OK.',
    });

    const latencyMs = Date.now() - start;
    const text = response.text?.trim() || '';

    if (text.toUpperCase().includes('OK')) {
      const result = {
        model: cleanId,
        status: 'available' as const,
        latencyMs,
      };
      modelHealthCache.set(cleanId, {
        status: 'available',
        latencyMs,
        testedAt: Date.now(),
      });
      return result;
    }

    const result = {
      model: cleanId,
      status: 'unavailable' as const,
      latencyMs,
      code: 200,
      error: `Unexpected test response: ${text.slice(0, 60)}`,
    };
    modelHealthCache.set(cleanId, {
      status: 'unavailable',
      latencyMs,
      error: result.error,
      testedAt: Date.now(),
    });
    return result;
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const rawError = err?.message || String(err);
    const sanitizedError = rawError
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_KEY]')
      .replace(/https:\/\/[^@\s]+@/g, 'https://[REDACTED]@');

    let status: ModelHealthStatus = 'unavailable';
    let code = err?.status || err?.code || 500;
    let userError = sanitizedError;

    // Classify 429 / Quota
    if (
      err?.status === 429 ||
      sanitizedError.includes('429') ||
      sanitizedError.includes('RESOURCE_EXHAUSTED') ||
      sanitizedError.toLowerCase().includes('quota') ||
      sanitizedError.toLowerCase().includes('rate limit')
    ) {
      status = 'quota_limited';
      code = 429;
      userError = 'Quota limit reached for this model. Try another model or wait for quota reset.';
    } else if (
      err?.status === 401 ||
      err?.status === 403 ||
      sanitizedError.includes('API_KEY_INVALID') ||
      sanitizedError.includes('401') ||
      sanitizedError.includes('403')
    ) {
      status = 'auth_error';
      code = 401;
      userError = 'Authentication failed: Invalid or unauthorized Gemini API key.';
    } else if (
      err?.status === 404 ||
      sanitizedError.includes('404') ||
      sanitizedError.toLowerCase().includes('not found') ||
      sanitizedError.toLowerCase().includes('no longer available')
    ) {
      status = 'unavailable';
      code = 404;
      userError = 'Model is deprecated or unavailable to this project.';
    }

    const result = {
      model: cleanId,
      status,
      code,
      latencyMs,
      error: userError,
    };

    modelHealthCache.set(cleanId, {
      status,
      latencyMs,
      error: userError,
      testedAt: Date.now(),
    });

    return result;
  }
}
