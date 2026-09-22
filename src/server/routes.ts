import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { runExtractionBackground } from './gemini.ts';
import {
  saveExtractionJob,
  getExtractionJob,
  listExtractionJobs,
  discardExtractionJob,
  deleteExtractionJob,
  clearAllExtractionJobs,
  commitExtractionToDb,
  getConfigurationReport,
  listLaptops,
  getCompareConfigurations,
  deleteLaptop,
  deleteReview,
  deleteProductListing,
  findMatchingEntities,
  refreshExistingProductListings,
} from './db.ts';
import { ExtractionJob, ExtractionData } from '../types.ts';
import { validateYouTubeUrl } from './urlValidator.ts';
import { CommitPayloadSchema } from './schema.ts';
import { requireAuth } from './auth.ts';
import { testSupabaseConnection } from './supabase.ts';

const router = Router();

// GET /api/status - Source of truth for database & API configuration diagnostics
router.get('/status', async (req: Request, res: Response) => {
  try {
    const supabaseDiag = await testSupabaseConnection();
    const hasGeminiKey = Boolean(
      process.env.GEMINI_API_KEY &&
      !process.env.GEMINI_API_KEY.includes('YOUR_GEMINI_API_KEY')
    );

    return res.json({
      supabase: supabaseDiag,
      hasGeminiKey,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
      nodeEnv: process.env.NODE_ENV || 'development',
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'Status diagnostic check failed',
      details: err?.message || String(err),
    });
  }
});

// STEP 1: POST /api/extract - Submit a URL for extraction
router.post('/extract', requireAuth, async (req: Request, res: Response) => {
  try {
    const { url, language = 'English' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required.' });
    }

    let videoId: string;
    try {
      videoId = validateYouTubeUrl(url);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    const jobId = randomUUID();
    const newJob: ExtractionJob = {
      id: jobId,
      youtube_url: url,
      youtube_video_id: videoId,
      status: 'pending',
      raw_extraction: null,
      error_message: null,
      review_source_id: null,
      created_at: new Date().toISOString(),
    };

    // Save job in extraction_jobs table
    await saveExtractionJob(newJob);

    // Trigger background extraction
    runExtractionBackground(newJob, language).catch((err) => {
      console.error(`[ExtractRoute] Background extraction failed for job ${jobId}:`, err);
    });

    // Respond immediately with 202 Accepted
    return res.status(202).json({
      jobId,
      status: 'pending',
      youtubeVideoId: videoId,
    });
  } catch (err: any) {
    console.error('[ExtractRoute] Error initiating extraction:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// GET /api/extract/:jobId - Poll job status
router.get('/extract/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await getExtractionJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Extraction job not found.' });
    }
    return res.json(job);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// STEP 2: GET /api/extract/:jobId/matches - Entity duplicate/match lookup for review screen
router.get('/extract/:jobId/matches', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await getExtractionJob(jobId);
    if (!job || !job.raw_extraction) {
      return res.status(404).json({ error: 'Job or extraction data not found.' });
    }
    const matches = await findMatchingEntities(job.raw_extraction);
    return res.json(matches);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// STEP 3: POST /api/extract/:jobId/commit - Human confirmation save to Supabase
router.post('/extract/:jobId/commit', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    // Parse and validate with Zod
    const parsedPayload = CommitPayloadSchema.safeParse({ jobId, ...req.body });
    if (!parsedPayload.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsedPayload.error.issues });
    }
    
    const { data, useExistingConfigId, retailListings } = parsedPayload.data;

    const job = await getExtractionJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Extraction job not found.' });
    }

    const result = await commitExtractionToDb(jobId, data as ExtractionData, {
      useExistingConfigId,
      retailListings,
    });

    return res.json({
      success: true,
      laptopId: result.laptopId,
      configurationId: result.configurationId,
      reviewSourceId: result.reviewSourceId,
      listingResults: result.listingResults,
    });
  } catch (err: any) {
    console.error('[CommitRoute] Error committing extraction:', err);
    return res.status(500).json({
      error: `Failed to save extraction: ${err.message || String(err)}`,
    });
  }
});

// Discard extraction
router.post('/extract/:jobId/discard', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    await discardExtractionJob(jobId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// List recent extraction jobs
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await listExtractionJobs(50);
    return res.json(jobs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Delete a single extraction job row
router.delete('/jobs/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteExtractionJob(id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[JobsRoute] Error deleting job:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete job' });
  }
});

// Clear all extraction jobs
router.delete('/jobs', requireAuth, async (req: Request, res: Response) => {
  try {
    await clearAllExtractionJobs();
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[JobsRoute] Error clearing jobs:', err);
    return res.status(500).json({ error: err.message || 'Failed to clear jobs' });
  }
});

// STEP 4: GET /api/configurations/:id - Full report for a configuration
router.get('/configurations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const report = await getConfigurationReport(id);
    if (!report) {
      return res.status(404).json({ error: 'Configuration not found.' });
    }
    return res.json(report);
  } catch (err: any) {
    console.error('[ReportRoute] Error fetching configuration report:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// STEP 5: GET /api/laptops - Browse laptops
router.get('/laptops', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string | undefined;
    const laptops = await listLaptops(query);
    return res.json(laptops);
  } catch (err: any) {
    console.error('[LaptopsRoute] Error listing laptops:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// DELETE /api/laptops/:id
router.delete('/laptops/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await deleteLaptop(id);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[LaptopsRoute] Error deleting laptop:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete laptop' });
  }
});

// DELETE /api/reviews/:id
router.delete('/reviews/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteReview(id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[ReviewsRoute] Error deleting review:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete review' });
  }
});

// DELETE /api/listings/:id
router.delete('/listings/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteProductListing(id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[ListingsRoute] Error deleting listing:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete listing' });
  }
});

// STEP 5: GET /api/compare?configIds=1,2,3 - Side-by-side comparison
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const configIdsParam = req.query.configIds as string;
    if (!configIdsParam) {
      return res.status(400).json({ error: 'configIds query param required.' });
    }
    const ids = configIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'At least one configId is required.' });
    }
    const reports = await getCompareConfigurations(ids);
    return res.json(reports);
  } catch (err: any) {
    console.error('[CompareRoute] Error fetching compare data:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// STEP 6: POST /api/listings/refresh - Scheduled or on-demand price & image refresh
router.post('/listings/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await refreshExistingProductListings();
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    console.error('[ListingsRefresh] Error during listing refresh:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

export default router;
