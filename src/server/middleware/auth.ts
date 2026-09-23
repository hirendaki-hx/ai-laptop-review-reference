import { Request, Response, NextFunction } from 'express';
import { ERROR_CODES } from '../../shared/constants/index.ts';
import { UserRole } from '../../shared/types/index.ts';
import { verifyAuthToken, VerifiedAuthContext } from '../services/authService.ts';

export interface AuthenticatedRequest extends Request {
  user?: VerifiedAuthContext;
  isAdmin?: boolean;
  requestId?: string;
}

export function getAdminApiKey(): string {
  if (process.env.ADMIN_API_KEY?.trim()) {
    return process.env.ADMIN_API_KEY.trim();
  }
  if (process.env.NODE_ENV !== 'production') {
    return 'v2-dev-admin-key';
  }
  return '';
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_API_KEY?.trim() || process.env.NODE_ENV !== 'production');
}

/**
 * Extracts Bearer token from Authorization header.
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Middleware: Requires any authenticated user (viewer, reviewer, admin).
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const requestId = req.requestId || 'req_unknown';
  const token = extractBearerToken(req);

  // Check legacy admin header or Bearer admin key first for dev/scripts if provided
  const headerKey = req.headers['x-admin-key'];
  const configuredAdminKey = getAdminApiKey();
  const isHeaderAdmin = typeof headerKey === 'string' && configuredAdminKey && headerKey.trim() === configuredAdminKey;
  const isBearerAdmin = Boolean(token && ((configuredAdminKey && token === configuredAdminKey) || (process.env.API_KEY && token === process.env.API_KEY)));

  if (isHeaderAdmin || isBearerAdmin) {
    req.user = {
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'admin@system.local',
      role: 'admin',
      displayName: 'System Admin',
      isActive: true,
    };
    req.isAdmin = true;
    next();
    return;
  }

  if (!token) {
    res.status(401).json({
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authentication required. Please provide a valid Bearer token.',
        requestId,
      },
    });
    return;
  }

  const verified = await verifyAuthToken(token);
  if (!verified) {
    res.status(401).json({
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid or expired session. Please log in again.',
        requestId,
      },
    });
    return;
  }

  if (!verified.isActive) {
    res.status(403).json({
      error: {
        code: 'ACCOUNT_DISABLED',
        message: 'Your account has been deactivated. Please contact an administrator.',
        requestId,
      },
    });
    return;
  }

  req.user = verified;
  req.isAdmin = verified.role === 'admin';
  next();
}

/**
 * Middleware: Requires specific user role(s).
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const requestId = req.requestId || 'req_unknown';

    // Verify authentication first if not already verified
    if (!req.user) {
      await requireAuth(req, res, () => {});
      if (res.headersSent) return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Authentication required.',
          requestId,
        },
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: `Forbidden: This action requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: '${user.role}'.`,
          requestId,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Backward-compatible Admin Auth middleware.
 */
export function requireAdminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Allow if Bearer token is valid admin or x-admin-key matches
  const token = extractBearerToken(req);
  const headerKey = req.headers['x-admin-key'];
  const configuredKey = getAdminApiKey();

  if (typeof headerKey === 'string' && configuredKey && headerKey.trim() === configuredKey) {
    req.user = {
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'admin@system.local',
      role: 'admin',
      displayName: 'System Admin',
      isActive: true,
    };
    req.isAdmin = true;
    next();
    return;
  }

  if (token) {
    verifyAuthToken(token).then((verified) => {
      if (verified && verified.isActive && verified.role === 'admin') {
        req.user = verified;
        req.isAdmin = true;
        next();
      } else {
        const requestId = req.requestId || 'req_unknown';
        res.status(403).json({
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Admin authorization required.',
            requestId,
          },
        });
      }
    }).catch(() => {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Authentication verification failed.',
          requestId: req.requestId || 'req_unknown',
        },
      });
    });
    return;
  }

  // If no auth provided
  res.status(401).json({
    error: {
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Valid admin credentials or active admin session required.',
      requestId: req.requestId || 'req_unknown',
    },
  });
}
