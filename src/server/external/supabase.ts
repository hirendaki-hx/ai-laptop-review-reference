import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  // V2 rule: accept SUPABASE_SECRET_KEY, with backward compatibility for SUPABASE_SERVICE_ROLE_KEY
  const supabaseKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('DATABASE_NOT_CONFIGURED: SUPABASE_URL and SUPABASE_SECRET_KEY must be set.');
  }

  supabaseClientInstance = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'x-application-name': 'ai-laptop-review-v2',
      },
    },
  });

  return supabaseClientInstance;
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  return Boolean(url && key);
}

export type SupabaseStatusState =
  | 'LIVE'
  | 'NOT_CONFIGURED'
  | 'UNREACHABLE'
  | 'AUTH_ERROR'
  | 'DATABASE_ERROR'
  | 'SCHEMA_MISMATCH'
  | 'ERROR';

export interface SupabaseHealthResult {
  status: SupabaseStatusState;
  latencyMs?: number;
  error?: string;
  code?: string;
  hint?: string;
  details?: string;
}

export async function testSupabaseConnection(): Promise<SupabaseHealthResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: 'NOT_CONFIGURED',
      error: 'SUPABASE_URL and/or SUPABASE_SECRET_KEY are not configured in the server environment.',
    };
  }

  const rawUrl = process.env.SUPABASE_URL?.trim();
  try {
    const parsed = new URL(rawUrl || '');
    if (parsed.hostname === 'your-project.supabase.co' || parsed.hostname.includes('placeholder')) {
      return {
        status: 'UNREACHABLE',
        error: `DNS lookup failed for hostname '${parsed.hostname}' (ENOTFOUND). The current SUPABASE_URL is an unconfigured template placeholder.`,
        code: 'ENOTFOUND',
        hint: 'Please update SUPABASE_URL in your environment to your live Supabase project URL (e.g. https://[project-id].supabase.co).',
      };
    }
  } catch {
    return {
      status: 'NOT_CONFIGURED',
      error: 'SUPABASE_URL is malformed or invalid.',
    };
  }

  const startTime = Date.now();
  try {
    const client = getSupabaseClient();
    // Real query against laptop_brands table to test connectivity
    const { data: _data, error, status } = await client
      .from('laptop_brands')
      .select('id')
      .limit(1);

    const latencyMs = Date.now() - startTime;

    if (error) {
      const msg = error.message || '';
      const details = error.details || '';
      const isDnsOrSocket =
        msg.includes('fetch failed') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ETIMEDOUT') ||
        details.includes('ENOTFOUND');

      if (isDnsOrSocket) {
        return {
          status: 'UNREACHABLE',
          latencyMs,
          error: details ? `Network/DNS unreachable: ${details}` : `Network unreachable: ${msg}`,
          code: error.code || 'ENOTFOUND',
        };
      }

      if (
        status === 401 ||
        status === 403 ||
        error.code === 'PGRST301' ||
        msg.toLowerCase().includes('jwt') ||
        msg.toLowerCase().includes('apikey')
      ) {
        return {
          status: 'AUTH_ERROR',
          latencyMs,
          error: `Authentication failed (HTTP ${status}): ${msg}`,
          code: error.code || String(status),
          hint: error.hint || 'Verify SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.',
        };
      }

      if (
        status === 404 ||
        error.code === '42P01' ||
        msg.includes('does not exist') ||
        msg.includes('not found')
      ) {
        return {
          status: 'DATABASE_ERROR',
          latencyMs,
          error: `Database schema table not found (HTTP ${status}): ${msg}`,
          code: error.code || '42P01',
          hint: 'Run migrations/20260922000000_v2_schema_and_rpc.sql in Supabase SQL Editor.',
        };
      }

      return {
        status: 'ERROR',
        latencyMs,
        error: msg,
        code: error.code,
        details: error.details,
      };
    }

    return {
      status: 'LIVE',
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const msg = err.message || 'Supabase connection check failed';
    const causeCode = err.cause?.code || err.code;
    const isNetwork =
      msg.includes('fetch failed') ||
      causeCode === 'ENOTFOUND' ||
      causeCode === 'ECONNREFUSED' ||
      causeCode === 'ETIMEDOUT';

    return {
      status: isNetwork ? 'UNREACHABLE' : 'ERROR',
      latencyMs,
      error: err.cause?.message ? `${msg} (${err.cause.message})` : msg,
      code: causeCode,
    };
  }
}
