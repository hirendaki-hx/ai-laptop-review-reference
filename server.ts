import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import apiRoutes from './src/server/routes.ts';
import { testSupabaseConnection } from './src/server/supabase.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Trust reverse proxy (Cloud Run / Nginx) for accurate client IP resolution
  app.set('trust proxy', 1);

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Vite Dev needs script eval/inline styles
  }));

  // Global Rate Limiting
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // limit each IP to 500 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: false,
      forwardedHeader: false,
      default: false,
    },
    message: { error: 'Too many requests, please try again later.' }
  });
  app.use(globalLimiter);

  // JSON request body parser with strict limits
  app.use(express.json({ limit: '2mb' })); // Strict 2MB limit for reviewed JSON

  // API Routes
  app.use('/api', apiRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[AI Laptop Review] Server running on http://0.0.0.0:${PORT}`);
    const hasUrl = Boolean(process.env.SUPABASE_URL?.trim());
    const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
    console.log(`[Supabase] Environment check: URL=${hasUrl ? 'present' : 'missing'}, KEY=${hasKey ? 'present' : 'missing'}`);
    try {
      const diag = await testSupabaseConnection();
      console.log(`[Supabase] Connection test: ${diag.reachable ? 'reachable (LIVE)' : diag.status === 'configured_unreachable' ? `UNREACHABLE: ${diag.error}` : 'NOT CONFIGURED (memory fallback)'}`);
    } catch (e: any) {
      console.warn(`[Supabase] Diagnostic error: ${e?.message || e}`);
    }
  });
}

startServer().catch((err) => {
  console.error('[AI Laptop Review] Fatal startup error:', err);
});
