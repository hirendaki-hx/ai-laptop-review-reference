import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

const PLACEHOLDER_URLS = [
  'your-project',
  'https://your-project.supabase.co',
  'https://your_project_id.supabase.co',
  'your_project_id',
  'YOUR_PROJECT_ID',
];

const PLACEHOLDER_KEYS = [
  'your-service-role-key',
  'MY_SUPABASE_SERVICE_ROLE_KEY',
  'sb_secret_YOUR_SECRET_KEY',
  'YOUR_SECRET_KEY',
  'sb_secret_YOUR_KEY',
];

function isPlaceholderUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return PLACEHOLDER_URLS.some((p) => lower.includes(p.toLowerCase()));
}

function isPlaceholderKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PLACEHOLDER_KEYS.some((p) => lower === p.toLowerCase() || lower.includes('your_secret_key') || lower.includes('your-service-role-key'));
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    return false;
  }

  if (isPlaceholderUrl(url) || isPlaceholderKey(key)) {
    return false;
  }

  return true;
}

export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    return null;
  }

  if (isPlaceholderUrl(url) || isPlaceholderKey(key)) {
    return null;
  }

  if (!supabaseClient) {
    try {
      supabaseClient = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    } catch (err: any) {
      console.error('[Supabase] Failed to initialize Supabase client:', err?.message || err);
      return null;
    }
  }

  return supabaseClient;
}

export interface SupabaseDiagnosticStatus {
  configured: boolean;
  reachable: boolean;
  status: 'live' | 'configured_unreachable' | 'missing';
  hasUrl: boolean;
  hasKey: boolean;
  url?: string;
  error?: string | null;
}

export async function testSupabaseConnection(): Promise<SupabaseDiagnosticStatus> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const hasUrl = Boolean(url && !isPlaceholderUrl(url));
  const hasKey = Boolean(key && !isPlaceholderKey(key));
  const configured = isSupabaseConfigured();

  if (!configured || !hasUrl || !hasKey) {
    return {
      configured: false,
      reachable: false,
      status: 'missing',
      hasUrl,
      hasKey,
      error: null,
    };
  }

  const client = getSupabase();
  if (!client) {
    return {
      configured: true,
      reachable: false,
      status: 'configured_unreachable',
      hasUrl: true,
      hasKey: true,
      error: 'Failed to initialize Supabase client with provided credentials.',
    };
  }

  try {
    // 1. Authenticated API reachability check against Supabase REST endpoint
    const restEndpoint = `${url.replace(/\/+$/, '')}/rest/v1/`;
    const restRes = await fetch(restEndpoint, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!restRes.ok && restRes.status !== 200) {
      return {
        configured: true,
        reachable: false,
        status: 'configured_unreachable',
        hasUrl: true,
        hasKey: true,
        error: `Supabase API returned HTTP ${restRes.status}`,
      };
    }

    // 2. Lightweight table schema check
    const { error: tableError } = await client.from('laptop_brands').select('id').limit(1);

    return {
      configured: true,
      reachable: true,
      status: 'live',
      hasUrl: true,
      hasKey: true,
      url: url.replace(/\/+$/, ''),
      error: tableError ? tableError.message : null,
    };
  } catch (err: any) {
    const safeMsg = err?.message || 'Network error connecting to Supabase database';
    return {
      configured: true,
      reachable: false,
      status: 'configured_unreachable',
      hasUrl: true,
      hasKey: true,
      error: safeMsg,
    };
  }
}
