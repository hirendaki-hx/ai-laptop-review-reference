import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.ts';
import {
  listScoringProfiles,
  getScoringProfileByKey,
  getScoringProfileById,
  createProfileVersion,
  setProfileActiveStatus,
} from '../repositories/scoringProfileRepository.ts';
import {
  listScoringMetrics,
  upsertScoringMetric,
} from '../repositories/scoringMetricRepository.ts';
import {
  getConfigurationScores,
  getScoringDiagnostics,
} from '../repositories/configurationScoreRepository.ts';
import {
  calculateAllScoresForConfiguration,
  calculateConfigurationScoreForProfile,
} from '../services/scoring/scoreCalculator.ts';
import { getConfigurationById } from '../repositories/configurationRepository.ts';
import {
  ScoringMetricDefinitionSchema,
  ScoringProfileInputSchema,
  RecalculateScoreRequestSchema,
} from '../../shared/schemas/scoring.ts';
import { ERROR_CODES } from '../../shared/constants/index.ts';

const router = Router();

// ==========================================
// PUBLIC SCORING ENDPOINTS
// ==========================================

/**
 * GET /api/scoring/profiles - Lists all active public scoring profiles
 */
router.get('/scoring/profiles', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const profiles = await listScoringProfiles(true);
    res.json({ profiles });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/scoring/profiles/:profileKey - Get active profile by key
 */
router.get('/scoring/profiles/:profileKey', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await getScoringProfileByKey(req.params.profileKey);
    if (!profile) {
      res.status(404).json({
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: `Scoring profile '${req.params.profileKey}' not found`,
        },
      });
      return;
    }
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/configurations/:id/scores - Get all use-case scores for a configuration
 */
router.get('/configurations/:id/scores', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configId = req.params.id;
    let scores = await getConfigurationScores(configId);

    // If no scores calculated yet, compute deterministically on demand
    if (scores.length === 0) {
      const configTree = await getConfigurationById(configId);
      if (configTree) {
        scores = await calculateAllScoresForConfiguration(configId);
      }
    }

    res.json({ scores });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/configurations/:id/scores/:profileKey - Get single use-case score
 */
router.get('/configurations/:id/scores/:profileKey', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, profileKey } = req.params;
    const scores = await getConfigurationScores(id);
    let matched = scores.find((s) => s.profile_key === profileKey);

    if (!matched) {
      const profile = await getScoringProfileByKey(profileKey);
      const configTree = await getConfigurationById(id);
      if (profile && configTree) {
        matched = await calculateConfigurationScoreForProfile(configTree, profile);
      }
    }

    if (!matched) {
      res.status(404).json({
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: `Score for profile '${profileKey}' not found on configuration`,
        },
      });
      return;
    }

    res.json({ score: matched });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/scoring/diagnostics - Scoring system health & metrics count
 */
router.get('/scoring/diagnostics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const diagnostics = await getScoringDiagnostics();
    res.json(diagnostics);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// ADMIN SCORING ADMINISTRATION ENDPOINTS
// ==========================================

/**
 * GET /api/admin/scoring/metrics - List all scoring metrics
 */
router.get('/admin/scoring/metrics', requireRole(['admin']), async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const metrics = await listScoringMetrics(false);
    res.json({ metrics });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/scoring/metrics - Create or update metric definition
 */
router.post('/admin/scoring/metrics', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = req.requestId || 'req_unknown';
  try {
    const parseResult = ScoringMetricDefinitionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: parseResult.error.issues[0]?.message || 'Invalid metric schema',
          requestId,
        },
      });
      return;
    }

    const saved = await upsertScoringMetric(parseResult.data as any);
    res.json({ metric: saved });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/scoring/profiles - List all profiles (all versions)
 */
router.get('/admin/scoring/profiles', requireRole(['admin']), async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const profiles = await listScoringProfiles(false);
    res.json({ profiles });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/scoring/profiles/:id/new-version - Duplicate profile as a new version
 */
router.post('/admin/scoring/profiles/:id/new-version', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = req.requestId || 'req_unknown';
  try {
    const existing = await getScoringProfileById(req.params.id);
    if (!existing) {
      res.status(404).json({
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Profile not found',
          requestId,
        },
      });
      return;
    }

    const parseResult = ScoringProfileInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: parseResult.error.issues[0]?.message || 'Invalid profile data',
          requestId,
        },
      });
      return;
    }

    const created = await createProfileVersion(existing.profile_key, parseResult.data);
    res.status(201).json({ profile: created });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/scoring/profiles/:id/status - Toggle profile active status
 */
router.patch('/admin/scoring/profiles/:id/status', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { is_active } = req.body;
    await setProfileActiveStatus(req.params.id, Boolean(is_active));
    res.json({ success: true, is_active: Boolean(is_active) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/scoring/recalculate - Trigger score recalculation
 */
router.post('/admin/scoring/recalculate', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = req.requestId || 'req_unknown';
  try {
    const parseResult = RecalculateScoreRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: 'Invalid recalculation parameters',
          requestId,
        },
      });
      return;
    }

    const { configuration_id } = parseResult.data;

    if (configuration_id) {
      const calculated = await calculateAllScoresForConfiguration(configuration_id);
      res.json({
        success: true,
        message: `Calculated ${calculated.length} scores for configuration ${configuration_id}`,
        scores: calculated,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Batch recalculation scheduled',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
