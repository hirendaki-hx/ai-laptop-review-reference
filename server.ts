import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import apiRoutes from './src/server/routes/index.ts';
import { requestIdMiddleware, apiErrorHandler } from './src/server/middleware/observability.ts';
import { recoverStaleJobs } from './src/server/repositories/jobsRepository.ts';
import { isSupabaseConfigured } from './src/server/external/supabase.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Trust reverse proxy (Cloud Run / Nginx) for accurate client IP resolution
  app.set('trust proxy', 1);

  // Request ID and structured request logger
  app.use(requestIdMiddleware);

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite dev needs inline scripts/styles
      crossOriginEmbedderPolicy: false,
    })
  );

  // Global Rate Limiter: 600 requests per 15 min per IP
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: false,
      forwardedHeader: false,
      default: false,
    },
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests from this IP, please try again shortly.',
      },
    },
  });
  app.use('/api', globalLimiter);

  // JSON request body parser with strict 3MB limit
  app.use(express.json({ limit: '3mb' }));

  // API Routes
  app.use('/api', apiRoutes);

  // Global API error handler
  app.use(apiErrorHandler);

  // Recover any stale extraction jobs on startup if Supabase is connected
  if (isSupabaseConfigured()) {
    recoverStaleJobs()
      .then(count => {
        if (count > 0) {
          console.log(`[JobRecovery] Successfully recovered ${count} interrupted jobs.`);
        }
      })
      .catch(err => {
        console.warn('[JobRecovery] Notice: Job recovery check encountered error (database may not be seeded yet):', err.message);
      });
  }

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[V2 Server] AI Laptop Review platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[V2 Server] Fatal startup error:', err);
  process.exit(1);
});
