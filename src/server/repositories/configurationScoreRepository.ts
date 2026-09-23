import { getSupabaseClient } from '../external/supabase.ts';
import { ConfigurationScore, ConfigurationScoreDetail, ScoringDiagnostics } from '../../shared/types/index.ts';

export async function getConfigurationScores(
  configurationId: string
): Promise<ConfigurationScore[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('configuration_scores')
    .select(`
      *,
      profile:scoring_profiles(
        id,
        profile_key,
        name,
        version
      ),
      details:configuration_score_details(
        *,
        metric:scoring_metric_definitions(
          id,
          name,
          domain,
          unit,
          source_type
        )
      )
    `)
    .eq('configuration_id', configurationId)
    .order('score', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to get configuration scores: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    configuration_id: row.configuration_id,
    profile_id: row.profile_id,
    profile_key: row.profile?.profile_key,
    profile_name: row.profile?.name,
    profile_version: row.profile?.version,
    score: row.score,
    coverage_percent: row.coverage_percent,
    metrics_used: row.metrics_used,
    metrics_available: row.metrics_available,
    status: row.status,
    calculated_at: row.calculated_at,
    calculation_version: row.calculation_version,
    error_message: row.error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
    details: (row.details || []).map((d: any) => ({
      id: d.id,
      configuration_score_id: d.configuration_score_id,
      metric_id: d.metric_id,
      metric_name: d.metric?.name,
      metric_domain: d.metric?.domain,
      raw_value: d.raw_value,
      normalized_score: d.normalized_score,
      weight: d.weight,
      weighted_contribution: d.weighted_contribution,
      unit: d.unit || d.metric?.unit,
      source_type: d.source_type || d.metric?.source_type,
      source_id: d.source_id,
      review_source_id: d.review_source_id,
      comparability_key: d.comparability_key,
      eligibility_status: d.eligibility_status,
      exclusion_reason: d.exclusion_reason,
      created_at: d.created_at,
    })),
  }));
}

export async function saveConfigurationScore(
  scoreData: {
    configuration_id: string;
    profile_id: string;
    score: number | null;
    coverage_percent: number;
    metrics_used: number;
    metrics_available: number;
    status: string;
    calculated_at: string;
    calculation_version: number;
    error_message?: string | null;
  },
  details: ConfigurationScoreDetail[]
): Promise<string> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  // 1. Upsert Configuration Score
  const { data: scoreRow, error: scoreErr } = await client
    .from('configuration_scores')
    .upsert({
      configuration_id: scoreData.configuration_id,
      profile_id: scoreData.profile_id,
      score: scoreData.score,
      coverage_percent: scoreData.coverage_percent,
      metrics_used: scoreData.metrics_used,
      metrics_available: scoreData.metrics_available,
      status: scoreData.status,
      calculated_at: scoreData.calculated_at,
      calculation_version: scoreData.calculation_version,
      error_message: scoreData.error_message || null,
      updated_at: now,
    }, {
      onConflict: 'configuration_id,profile_id',
    })
    .select('id')
    .single();

  if (scoreErr || !scoreRow) {
    throw new Error(`Failed to save configuration score: ${scoreErr?.message}`);
  }

  const scoreId = scoreRow.id;

  // 2. Clear old details for this score
  await client
    .from('configuration_score_details')
    .delete()
    .eq('configuration_score_id', scoreId);

  // 3. Insert new details
  if (details.length > 0) {
    const detailRows = details.map((d) => ({
      configuration_score_id: scoreId,
      metric_id: d.metric_id,
      raw_value: d.raw_value,
      normalized_score: d.normalized_score,
      weight: d.weight,
      weighted_contribution: d.weighted_contribution,
      unit: d.unit,
      source_type: d.source_type,
      source_id: d.source_id || null,
      review_source_id: d.review_source_id || null,
      comparability_key: d.comparability_key,
      eligibility_status: d.eligibility_status,
      exclusion_reason: d.exclusion_reason,
      created_at: now,
    }));

    const { error: detailErr } = await client
      .from('configuration_score_details')
      .insert(detailRows);

    if (detailErr) {
      console.error('[ConfigScoreRepo] Error inserting score details:', detailErr);
    }
  }

  return scoreId;
}

export async function markConfigurationScoresStale(configurationId: string): Promise<void> {
  const client = getSupabaseClient();
  await client
    .from('configuration_scores')
    .update({ status: 'stale', updated_at: new Date().toISOString() })
    .eq('configuration_id', configurationId);
}

export async function getScoringDiagnostics(): Promise<ScoringDiagnostics> {
  const client = getSupabaseClient();
  try {
    const [metricsRes, profilesRes, staleRes] = await Promise.all([
      client.from('scoring_metric_definitions').select('id, is_active', { count: 'exact' }),
      client.from('scoring_profiles').select('id, is_active', { count: 'exact' }),
      client.from('configuration_scores').select('id', { count: 'exact' }).eq('status', 'stale'),
    ]);

    const metricsCount = metricsRes.count || 0;
    const profiles = profilesRes.data || [];
    const profilesCount = profiles.length;
    const activeProfilesCount = profiles.filter((p) => p.is_active).length;
    const staleScoresCount = staleRes.count || 0;

    return {
      status: metricsCount > 0 && activeProfilesCount > 0 ? 'READY' : 'NOT_CONFIGURED',
      metricsCount,
      profilesCount,
      activeProfilesCount,
      staleScoresCount,
      lastRecalculationAt: new Date().toISOString(),
      lastError: null,
    };
  } catch (err: any) {
    return {
      status: 'ERROR',
      metricsCount: 0,
      profilesCount: 0,
      activeProfilesCount: 0,
      staleScoresCount: 0,
      lastRecalculationAt: null,
      lastError: err.message,
    };
  }
}
