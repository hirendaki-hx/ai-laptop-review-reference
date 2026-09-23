import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { getSupabaseClient } from '../external/supabase.ts';
import {
  ensureUserProfile,
  listAllUserProfiles,
  updateUserRole,
  updateUserStatus,
} from '../services/authService.ts';
import { LoginSchema, UpdateUserRoleSchema, UpdateUserStatusSchema } from '../../shared/schemas/auth.ts';
import { ERROR_CODES } from '../../shared/constants/index.ts';

const router = Router();

/**
 * GET /api/me - Returns current authenticated user and profile
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Not authenticated',
          requestId: req.requestId || 'req_unknown',
        },
      });
      return;
    }

    res.json({
      authenticated: true,
      user: {
        id: user.userId,
        email: user.email,
      },
      profile: {
        displayName: user.displayName,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login - Signs in with email and password via Supabase Auth
 */
router.post('/auth/login', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = req.requestId || 'req_unknown';
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: parseResult.error.issues[0]?.message || 'Invalid login payload',
          requestId,
        },
      });
      return;
    }

    const { email, password } = parseResult.data;
    const client = getSupabaseClient();

    const { data: authData, error: authErr } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (authErr || !authData?.user || !authData.session) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: authErr?.message || 'Invalid email or password',
          requestId,
        },
      });
      return;
    }

    const profile = await ensureUserProfile(
      authData.user.id,
      authData.user.email,
      authData.user.user_metadata?.display_name
    );

    if (!profile.is_active) {
      res.status(403).json({
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'This account has been deactivated.',
          requestId,
        },
      });
      return;
    }

    res.json({
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
      },
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
      profile: {
        displayName: profile.display_name,
        role: profile.role,
        isActive: profile.is_active,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/register - Registers a new viewer account
 */
router.post('/auth/register', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = req.requestId || 'req_unknown';
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: parseResult.error.issues[0]?.message || 'Invalid registration payload',
          requestId,
        },
      });
      return;
    }

    const { email, password } = parseResult.data;
    const client = getSupabaseClient();

    const { data: authData, error: authErr } = await client.auth.signUp({
      email,
      password,
    });

    if (authErr || !authData?.user) {
      res.status(400).json({
        error: {
          code: 'REGISTRATION_FAILED',
          message: authErr?.message || 'Failed to create user account.',
          requestId,
        },
      });
      return;
    }

    const profile = await ensureUserProfile(
      authData.user.id,
      authData.user.email,
      authData.user.user_metadata?.display_name
    );

    res.status(201).json({
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
      profile: {
        displayName: profile.display_name,
        role: profile.role,
        isActive: profile.is_active,
      },
      session: authData.session ? {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      } : null,
      message: 'Account registered successfully.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout - Signs out session
 */
router.post('/auth/logout', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ==========================================
// ADMIN USER MANAGEMENT
// ==========================================

router.get('/admin/users', requireRole(['admin']), async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const users = await listAllUserProfiles();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/users/:id/role', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = req.requestId || 'req_unknown';
  try {
    const userId = req.params.id;
    const parseResult = UpdateUserRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: parseResult.error.issues[0]?.message || 'Invalid role',
          requestId,
        },
      });
      return;
    }

    const updated = await updateUserRole(userId, parseResult.data.role);
    res.json({ profile: updated });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/users/:id/status', requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = req.requestId || 'req_unknown';
  try {
    const userId = req.params.id;
    const parseResult = UpdateUserStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: parseResult.error.issues[0]?.message || 'Invalid status',
          requestId,
        },
      });
      return;
    }

    const updated = await updateUserStatus(userId, parseResult.data.is_active);
    res.json({ profile: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
