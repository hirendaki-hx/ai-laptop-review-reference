import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { ERROR_CODES } from '../../shared/constants/index.ts';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const reqId = (req.headers['x-request-id'] as string) || `req_${randomUUID().slice(0, 12)}`;
  (req as any).requestId = reqId;
  res.setHeader('X-Request-Id', reqId);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Safe logging: method, path, status, duration - never secrets
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} (${duration}ms) [${reqId}]`);
  });

  next();
}

export function apiErrorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const reqId = (req as any).requestId || 'req_unknown';
  console.error(`[ERROR] [${reqId}] ${err?.name || 'Error'}: ${err?.message || err}`);

  const statusCode = err.status || err.statusCode || 500;
  const errorCode = err.code || ERROR_CODES.INTERNAL_SERVER_ERROR;

  // Never leak internal stack traces or database connection strings
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: err.message || 'An internal server error occurred.',
      requestId: reqId,
      details: process.env.NODE_ENV !== 'production' ? err.details : undefined,
    },
  });
}
