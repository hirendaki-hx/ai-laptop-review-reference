import { Router, Request, Response, NextFunction } from 'express';
import authRouter from './auth.ts';
import scoringRouter from './scoring.ts';
import { parseAndValidateYouTubeUrl } from '../services/urlValidator.ts';
import {
  createExtractionJob,
  getJobById,
  findJobByVideoId,
  findReviewSourceByVideoId,
  updateJob,
  listJobs,
  deleteJob,
  clearAllJobs,
} from '../repositories/jobsRepository.ts';
import { executeExtractionJob } from '../jobs/jobWorker.ts';
import { commitReviewedExtraction } from '../repositories/commitRepository.ts';
import {
  getAllLaptops,
  getLaptopById,
  deleteLaptop,
  getAllBrands,
} from '../repositories/laptopRepository.ts';
import {
  getConfigurationById,
  getConfigurationsForCompare,
  findMatchingConfigurations,
} from '../repositories/configurationRepository.ts';
import { testSupabaseConnection } from '../external/supabase.ts';
import { testGeminiConnection } from '../external/gemini.ts';
import { verifyDatabaseSchema } from '../external/schemaDiagnostics.ts';
import { getScoringDiagnostics } from '../repositories/configurationScoreRepository.ts';
import {
  listExtractionModels,
  testModelHealth,
  setActiveGeminiModel,
  getActiveGeminiModel,
} from '../services/geminiModelService.ts';
import { scrapeRetailUrl } from '../external/retail/index.ts';
import { requireAdminAuth, requireRole, requireAuth, isAdminConfigured, AuthenticatedRequest } from '../middleware/auth.ts';
import { CommitPayloadSchema } from '../../shared/schemas/extraction.ts';
import { APP_CONFIG, ERROR_CODES } from '../../shared/constants/index.ts';
import { SystemStatusResponse } from '../../shared/types/index.ts';

const router = Router();

// Mount Auth & Scoring sub-routers
router.use(authRouter);
router.use(scoringRouter);

// ==========================================
// 1. HEALTH & SYSTEM STATUS
// ==========================================

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    name: APP_CONFIG.name,
    version: APP_CONFIG.version,
    timestamp: new Date().toISOString(),
  });
});

router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Concurrently test Supabase connectivity, database schema contract, Gemini health, and Scoring diagnostics
    const [supabaseStatus, schemaResult, geminiStatus, scoringDiag] = await Promise.all([
      testSupabaseConnection(),
      verifyDatabaseSchema(),
      testGeminiConnection(),
      getScoringDiagnostics(),
    ]);

    const adminConfigured = isAdminConfigured();

    // Determine comprehensive Supabase status
    let finalSupabaseStatus = supabaseStatus.status;
    if (supabaseStatus.status === 'LIVE' && schemaResult.status === 'SCHEMA_MISMATCH') {
      finalSupabaseStatus = 'SCHEMA_MISMATCH';
    }

    const overallAppStatus =
      supabaseStatus.status === 'LIVE' &&
      schemaResult.status === 'HEALTHY' &&
      geminiStatus.status === 'LIVE'
        ? 'LIVE'
        : supabaseStatus.status === 'ERROR' || geminiStatus.status === 'ERROR'
        ? 'ERROR'
        : 'WARNING';

    const statusResponse: any = {
      application: {
        name: APP_CONFIG.name,
        version: APP_CONFIG.version,
        environment: process.env.NODE_ENV || 'development',
        status: overallAppStatus,
      },
      gemini: {
        status: geminiStatus.status,
        model: geminiStatus.model,
        latencyMs: geminiStatus.latencyMs,
        error: geminiStatus.error,
      },
      supabase: {
        status: finalSupabaseStatus,
        reachable: supabaseStatus.status === 'LIVE',
        connectionStatus: supabaseStatus.status,
        schemaStatus: schemaResult.status,
        latencyMs: supabaseStatus.latencyMs,
        schemaDetails: {
          missingTables: schemaResult.missingTables,
          missingColumns: schemaResult.missingColumns,
          missingFunctions: schemaResult.missingFunctions,
          remedy: schemaResult.remedyMigration,
        },
        error:
          supabaseStatus.error ||
          (schemaResult.status === 'SCHEMA_MISMATCH'
            ? `Schema mismatch: ${schemaResult.details.join('; ')}`
            : undefined),
      },
      scoring: scoringDiag,
      authentication: {
        adminKeyConfigured: adminConfigured,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(statusResponse);
  } catch (err) {
    next(err);
  }
});

// Database Schema Diagnostic Route
router.get('/database/schema', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await verifyDatabaseSchema();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// GEMINI MODEL DISCOVERY & MANAGEMENT
// ==========================================

router.get('/gemini/models', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listExtractionModels();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: 'GEMINI_MODELS_ERROR',
        message: err.message,
      },
    });
  }
});

router.post('/gemini/models/:modelId/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const modelId = req.params.modelId;
    const testResult = await testModelHealth(modelId);
    res.json(testResult);
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: 'MODEL_TEST_FAILED',
        message: err.message,
      },
    });
  }
});

router.post('/gemini/model', (req: Request, res: Response) => {
  const { model } = req.body;
  if (!model || typeof model !== 'string') {
    res.status(400).json({
      error: {
        code: ERROR_CODES.INVALID_INPUT,
        message: 'A valid string model name is required in body.',
      },
    });
    return;
  }
  try {
    const active = setActiveGeminiModel(model);
    res.json({
      success: true,
      currentModel: active,
      message: `Active extraction model set to ${active}`,
    });
  } catch (err: any) {
    res.status(400).json({
      error: {
        code: ERROR_CODES.INVALID_INPUT,
        message: err.message,
      },
    });
  }
});

// ==========================================
// 2. EXTRACTION WORKFLOW
// ==========================================

/**
 * POST /api/extract
 * Validates YouTube URL, checks duplicate, persists job, starts extraction worker
 */
router.post('/extract', requireRole(['reviewer', 'admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const reqId = req.requestId || 'req_unknown';
  try {
    const { youtube_url, model } = req.body;
    if (!youtube_url) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: 'youtube_url is required',
          requestId: reqId,
        },
      });
      return;
    }

    // Step 1: Validate URL and extract canonical Video ID
    const urlCheck = parseAndValidateYouTubeUrl(youtube_url);
    if (!urlCheck.isValid || !urlCheck.videoId || !urlCheck.canonicalUrl) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_YOUTUBE_URL,
          message: urlCheck.error || 'Invalid YouTube URL provided',
          requestId: reqId,
        },
      });
      return;
    }

    const videoId = urlCheck.videoId;
    const canonicalUrl = urlCheck.canonicalUrl;

    // Step 2: Check if this video has already been committed as a review source
    const existingReview = await findReviewSourceByVideoId(videoId);
    if (existingReview) {
      res.status(409).json({
        error: {
          code: ERROR_CODES.DUPLICATE_VIDEO,
          message: `This YouTube review has already been extracted and published: "${existingReview.title}" by ${existingReview.reviewer}.`,
          requestId: reqId,
          details: {
            review_source_id: existingReview.id,
            configuration_id: existingReview.configuration_id,
            existingReview,
          },
        },
      });
      return;
    }

    // Step 3: Check if there's already an active extraction job for this video
    const existingJob = await findJobByVideoId(videoId);
    if (existingJob && (existingJob.status === 'processing' || existingJob.status === 'ready_for_review')) {
      res.json({
        jobId: existingJob.id,
        status: existingJob.status,
        videoId,
        isExistingJob: true,
      });
      return;
    }

    // Step 4: Create new persistent extraction job in Supabase
    const job = await createExtractionJob({
      youtube_url: canonicalUrl,
      youtube_video_id: videoId,
    });

    const selectedModel = (typeof model === 'string' && model.trim()) ? model.trim() : getActiveGeminiModel();
    if (selectedModel) {
      await updateJob(job.id, { model_used: selectedModel }).catch(err => {
        console.warn('Could not record selected model on job:', err.message);
      });
    }

    // Step 5: Trigger background worker asynchronously (persistent job recovery handles restart)
    executeExtractionJob(job.id).catch(err => {
      console.error(`Background worker error on job ${job.id}:`, err);
    });

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      videoId,
      message: 'Extraction job created and queued for processing.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/extract/:jobId
 * Returns current job state
 */
router.get('/extract/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req as any).requestId;
  try {
    const job = await getJobById(req.params.jobId);
    if (!job) {
      res.status(404).json({
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: `Job ${req.params.jobId} not found`,
          requestId: reqId,
        },
      });
      return;
    }

    res.json(job);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/extract/:jobId/matches
 * Computes configuration matching between job's raw extraction and database configurations
 */
router.get('/extract/:jobId/matches', async (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req as any).requestId;
  try {
    const job = await getJobById(req.params.jobId);
    if (!job || !job.raw_extraction) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: 'Job extraction data is not yet available for matching.',
          requestId: reqId,
        },
      });
      return;
    }

    const payload = job.raw_extraction;
    const matches = await findMatchingConfigurations({
      brand: payload.laptop.brand,
      model: payload.laptop.model,
      series: payload.laptop.series,
      generation: payload.laptop.generation,
      cpu: payload.configuration.cpu,
      gpu: payload.configuration.gpu,
      gpu_tgp_w: payload.configuration.gpu_tgp_w,
      ram_gb: payload.configuration.ram_gb,
      ram_speed_mt_s: payload.configuration.ram_speed_mt_s,
      storage_gb: payload.configuration.storage_gb,
      display_size_inch: payload.configuration.display_size_inch,
      display_resolution: payload.configuration.display_resolution,
      refresh_rate_hz: payload.configuration.refresh_rate_hz,
      battery_wh: payload.configuration.battery_wh,
    });

    res.json({
      jobId: job.id,
      matches,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/extract/:jobId/commit
 * Atomically commits human-reviewed extraction to Supabase
 */
router.post('/extract/:jobId/commit', requireRole(['reviewer', 'admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const reqId = req.requestId || 'req_unknown';
  try {
    const validation = CommitPayloadSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: 'Invalid commit payload structure',
          requestId: reqId,
          details: validation.error.issues,
        },
      });
      return;
    }

    const reviewerIdentity = req.user?.displayName || validation.data.reviewerIdentity || 'reviewer';

    const result = await commitReviewedExtraction({
      jobId: req.params.jobId,
      data: validation.data.data,
      useExistingConfigId: validation.data.useExistingConfigId,
      reviewerIdentity,
      retailListings: validation.data.retailListings,
    });

    res.json({
      status: 'committed',
      review_source_id: result.review_source_id,
      configuration_id: result.configuration_id,
      laptop_id: result.laptop_id,
      brand_id: result.brand_id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/extract/:jobId/discard
 */
router.post('/extract/:jobId/discard', requireRole(['reviewer', 'admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await updateJob(req.params.jobId, { status: 'rejected' });
    res.json({ status: 'rejected', jobId: req.params.jobId });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. JOBS AUDIT & MANAGEMENT
// ==========================================

router.get('/jobs', requireAuth, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const jobs = await listJobs(50);
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

router.post('/jobs/:id/retry', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) {
      res.status(404).json({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Job not found' } });
      return;
    }

    await updateJob(job.id, { status: 'pending', attempt_count: 0, error_message: null });
    executeExtractionJob(job.id).catch(e => console.error('Retry execution error:', e));

    res.json({ status: 'retry_initiated', jobId: job.id });
  } catch (err) {
    next(err);
  }
});

router.delete('/jobs/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await deleteJob(req.params.id);
    res.json({ success: true, status: 'deleted', id: req.params.id });
  } catch (err) {
    next(err);
  }
});

router.delete('/jobs', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await clearAllJobs();
    res.json({ success: true, status: 'cleared' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. LAPTOPS & BRANDS (PUBLIC)
// ==========================================

router.get('/brands', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const brands = await getAllBrands();
    res.json({ brands });
  } catch (err) {
    next(err);
  }
});

router.get('/laptops', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, brand, page, limit } = req.query;
    const result = await getAllLaptops({
      search: typeof search === 'string' ? search : undefined,
      brand: typeof brand === 'string' ? brand : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/laptops/:id', async (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req as any).requestId;
  try {
    const laptop = await getLaptopById(req.params.id);
    if (!laptop) {
      res.status(404).json({
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Laptop not found', requestId: reqId },
      });
      return;
    }
    res.json(laptop);
  } catch (err) {
    next(err);
  }
});

router.delete('/laptops/:id', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await deleteLaptop(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. CONFIGURATIONS & COMPARE (PUBLIC)
// ==========================================

router.get('/configurations/:id', async (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req as any).requestId;
  try {
    const config = await getConfigurationById(req.params.id);
    if (!config) {
      res.status(404).json({
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Configuration not found', requestId: reqId },
      });
      return;
    }
    res.json(config);
  } catch (err) {
    next(err);
  }
});

router.get('/compare', async (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req as any).requestId;
  try {
    const { ids } = req.query;
    if (!ids || typeof ids !== 'string') {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: 'ids query parameter is required (comma-separated, max 3)',
          requestId: reqId,
        },
      });
      return;
    }

    const idList = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
    const configs = await getConfigurationsForCompare(idList);
    res.json({ configurations: configs });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 6. RETAIL LISTINGS
// ==========================================

router.post('/listings/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: { code: ERROR_CODES.INVALID_INPUT, message: 'URL is required' } });
      return;
    }

    const scraped = await scrapeRetailUrl(url.trim());
    res.json({ result: scraped });
  } catch (err) {
    next(err);
  }
});

export default router;
