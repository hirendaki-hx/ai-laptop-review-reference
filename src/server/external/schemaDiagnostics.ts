import { getSupabaseClient, isSupabaseConfigured } from './supabase.ts';

export interface SchemaVerificationResult {
  status: 'HEALTHY' | 'SCHEMA_MISMATCH' | 'ERROR' | 'NOT_CONFIGURED';
  checkedAt: string;
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
  missingFunctions: string[];
  details: string[];
  remedyMigration: string;
}

const REQUIRED_TABLES = [
  'laptop_brands',
  'laptops',
  'configurations',
  'review_sources',
  'benchmark_results',
  'gaming_results',
  'thermal_results',
  'display_results',
  'battery_results',
  'evidence_records',
  'extraction_jobs',
  'product_listings',
  'price_history',
];

const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'laptops', column: 'created_at' },
  { table: 'extraction_jobs', column: 'updated_at' },
  { table: 'extraction_jobs', column: 'attempt_count' },
  { table: 'extraction_jobs', column: 'last_started_at' },
  { table: 'extraction_jobs', column: 'completed_at' },
  { table: 'extraction_jobs', column: 'model_used' },
  { table: 'extraction_jobs', column: 'processing_duration_ms' },
];

/**
 * Validates Supabase PostgreSQL schema contract against V2 expectations.
 * Accurately detects missing tables, columns, and RPC functions.
 */
export async function verifyDatabaseSchema(): Promise<SchemaVerificationResult> {
  const checkedAt = new Date().toISOString();
  const remedyMigration = 'supabase/migrations/20260922000002_v2_schema_contract.sql';

  if (!isSupabaseConfigured()) {
    return {
      status: 'NOT_CONFIGURED',
      checkedAt,
      missingTables: [],
      missingColumns: [],
      missingFunctions: [],
      details: ['Supabase credentials not configured in server environment.'],
      remedyMigration,
    };
  }

  const client = getSupabaseClient();
  const missingTables: string[] = [];
  const missingColumns: Array<{ table: string; column: string }> = [];
  const missingFunctions: string[] = [];
  const details: string[] = [];

  try {
    // 1. Check all required tables
    for (const table of REQUIRED_TABLES) {
      try {
        const { error, status } = await client.from(table).select('*').limit(0);
        if (error) {
          // If table not found in schema cache
          if (status === 404 || error.message?.includes('schema cache') || error.code === '42P01') {
            missingTables.push(table);
            details.push(`Missing table: ${table}`);
          }
        }
      } catch (err: any) {
        details.push(`Error querying table ${table}: ${err.message}`);
      }
    }

    // 2. Check critical columns for tables that DO exist
    for (const { table, column } of REQUIRED_COLUMNS) {
      if (missingTables.includes(table)) {
        continue; // table already reported as missing
      }
      try {
        const { error, status } = await client.from(table).select(column).limit(0);
        if (error) {
          const isColumnMissing =
            status === 400 ||
            error.code === 'PGRST204' ||
            error.code === '42703' ||
            error.message?.toLowerCase().includes('does not exist') ||
            error.message?.toLowerCase().includes('could not find the');
          
          if (isColumnMissing) {
            missingColumns.push({ table, column });
            details.push(`Missing column: ${table}.${column}`);
          }
        }
      } catch (err: any) {
        details.push(`Error testing column ${table}.${column}: ${err.message}`);
      }
    }

    // 3. Check RPC function commit_reviewed_extraction_v2
    try {
      const { error } = await client.rpc('commit_reviewed_extraction_v2', {
        p_job_id: '00000000-0000-0000-0000-000000000000',
        p_brand_name: 'test',
        p_laptop_model: 'test',
        p_laptop_series: null,
        p_laptop_generation: null,
        p_config_json: {},
        p_review_json: { youtube_video_id: 'test' },
        p_benchmarks_json: [],
        p_gaming_json: [],
        p_thermals_json: [],
        p_display_json: null,
        p_battery_json: null,
        p_evidence_json: [],
      });

      if (error) {
        // PGRST202: Could not find the function in schema cache
        if (error.code === 'PGRST202' || error.message?.includes('schema cache') || error.message?.includes('Could not find the function')) {
          missingFunctions.push('commit_reviewed_extraction_v2');
          details.push('Missing RPC function: commit_reviewed_extraction_v2');
        }
        // Other errors (e.g. Job 00000000-0000-0000-0000-000000000000 not found) confirm function EXISTS and executed!
      }
    } catch (err: any) {
      if (err.message?.includes('schema cache') || err.message?.includes('not found')) {
        missingFunctions.push('commit_reviewed_extraction_v2');
        details.push('Missing RPC function: commit_reviewed_extraction_v2');
      }
    }

    const hasMismatch =
      missingTables.length > 0 || missingColumns.length > 0 || missingFunctions.length > 0;

    return {
      status: hasMismatch ? 'SCHEMA_MISMATCH' : 'HEALTHY',
      checkedAt,
      missingTables,
      missingColumns,
      missingFunctions,
      details,
      remedyMigration,
    };
  } catch (err: any) {
    return {
      status: 'ERROR',
      checkedAt,
      missingTables,
      missingColumns,
      missingFunctions,
      details: [`Schema verification failed: ${err.message}`],
      remedyMigration,
    };
  }
}
