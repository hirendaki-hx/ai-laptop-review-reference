import { getSupabaseClient } from '../external/supabase.ts';
import { ScoringMetricDefinition } from '../../shared/types/index.ts';

export async function listScoringMetrics(activeOnly = true): Promise<ScoringMetricDefinition[]> {
  const client = getSupabaseClient();
  let query = client
    .from('scoring_metric_definitions')
    .select('*')
    .order('domain', { ascending: true })
    .order('name', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list scoring metrics: ${error.message}`);
  }

  return (data || []) as ScoringMetricDefinition[];
}

export async function getScoringMetricById(id: string): Promise<ScoringMetricDefinition | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('scoring_metric_definitions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as ScoringMetricDefinition;
}

export async function upsertScoringMetric(
  metric: Partial<ScoringMetricDefinition>
): Promise<ScoringMetricDefinition> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  const payload = {
    ...metric,
    updated_at: now,
  };

  const { data, error } = await client
    .from('scoring_metric_definitions')
    .upsert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to save scoring metric: ${error.message}`);
  }

  return data as ScoringMetricDefinition;
}
