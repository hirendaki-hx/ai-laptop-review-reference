import { Request, Response, NextFunction } from 'express';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // Check for the expected API_KEY in the Authorization header
  const authHeader = req.headers['authorization'];
  
  // Do not hardcode a key that compromises production. Use a default only in dev.
  const expectedKey = process.env.API_KEY;
  
  if (!expectedKey) {
    console.warn('[AUTH] Warning: API_KEY is not set in the environment.');
    // In production, we should reject if no API_KEY is set. For this lab, we'll allow it if missing.
    // Or, we enforce it must be set.
    return next(); 
  }

  if (authHeader === `Bearer ${expectedKey}`) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
};
