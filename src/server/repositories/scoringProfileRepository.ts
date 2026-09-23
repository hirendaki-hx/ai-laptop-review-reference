import { getSupabaseClient } from '../external/supabase.ts';
import { ScoringProfile, ScoringProfileMetric } from '../../shared/types/index.ts';

export async function listScoringProfiles(activeOnly = true): Promise<ScoringProfile[]> {
  const client = getSupabaseClient();
  let query = client
    .from('scoring_profiles')
    .select(`
      *,
      metrics:scoring_profile_metrics(
        id,
        profile_id,
        metric_id,
        weight,
        is_required,
        weight_override,
        metric:scoring_metric_definitions(*)
      )
    `)
    .order('name', { ascending: true })
    .order('version', { ascending: false });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list scoring profiles: ${error.message}`);
  }

  return (data || []) as ScoringProfile[];
}

export async function getScoringProfileByKey(
  profileKey: string,
  version?: number
): Promise<ScoringProfile | null> {
  const client = getSupabaseClient();
  let query = client
    .from('scoring_profiles')
    .select(`
      *,
      metrics:scoring_profile_metrics(
        id,
        profile_id,
        metric_id,
        weight,
        is_required,
        weight_override,
        metric:scoring_metric_definitions(*)
      )
    `)
    .eq('profile_key', profileKey);

  if (version !== undefined) {
    query = query.eq('version', version);
  } else {
    query = query.eq('is_active', true).order('version', { ascending: false }).limit(1);
  }

  const { data, error } = await query.single();
  if (error || !data) {
    return null;
  }

  return data as ScoringProfile;
}

export async function getScoringProfileById(id: string): Promise<ScoringProfile | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('scoring_profiles')
    .select(`
      *,
      metrics:scoring_profile_metrics(
        id,
        profile_id,
        metric_id,
        weight,
        is_required,
        weight_override,
        metric:scoring_metric_definitions(*)
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as ScoringProfile;
}

/**
 * Creates a new version of an existing profile without mutating historical version.
 */
export async function createProfileVersion(
  profileKey: string,
  updates: {
    name?: string;
    description?: string;
    minimum_coverage_percent?: number;
    metrics: Array<{ metric_id: string; weight: number; is_required?: boolean }>;
  }
): Promise<ScoringProfile> {
  const client = getSupabaseClient();

  // 1. Get latest version number
  const { data: latest } = await client
    .from('scoring_profiles')
    .select('version, name, description, minimum_coverage_percent')
    .eq('profile_key', profileKey)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version || 0) + 1;
  const now = new Date().toISOString();

  // 2. Insert new profile version row
  const { data: newProfile, error: profileErr } = await client
    .from('scoring_profiles')
    .insert({
      profile_key: profileKey,
      name: updates.name || latest?.name || profileKey,
      description: updates.description ?? latest?.description ?? null,
      version: nextVersion,
      is_active: true,
      minimum_coverage_percent: updates.minimum_coverage_percent ?? latest?.minimum_coverage_percent ?? 40,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (profileErr || !newProfile) {
    throw new Error(`Failed to create new profile version: ${profileErr?.message}`);
  }

  // 3. Insert metric weights for this version
  if (updates.metrics?.length > 0) {
    const metricRows = updates.metrics.map((m) => ({
      profile_id: newProfile.id,
      metric_id: m.metric_id,
      weight: m.weight,
      is_required: Boolean(m.is_required),
      created_at: now,
      updated_at: now,
    }));

    const { error: metricErr } = await client
      .from('scoring_profile_metrics')
      .insert(metricRows);

    if (metricErr) {
      console.error('[ScoringProfileRepository] Error inserting metric weights:', metricErr);
    }
  }

  return (await getScoringProfileById(newProfile.id))!;
}

/**
 * Toggle profile active status
 */
export async function setProfileActiveStatus(id: string, isActive: boolean): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('scoring_profiles')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update profile status: ${error.message}`);
  }
}
