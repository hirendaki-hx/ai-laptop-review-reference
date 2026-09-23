import { getSupabaseClient } from '../external/supabase.ts';
import type { ExtractionJob, JobStatus } from '../../shared/types/index.ts';

export async function createExtractionJob(params: {
  youtube_url: string;
  youtube_video_id: string;
}): Promise<ExtractionJob> {
  const client = getSupabaseClient();
  
  // Try inserting with V2 attempt_count first
  let { data, error } = await client
    .from('extraction_jobs')
    .insert({
      youtube_url: params.youtube_url,
      youtube_video_id: params.youtube_video_id,
      status: 'pending',
      attempt_count: 0,
    })
    .select('*')
    .single();

  // If attempt_count doesn't exist yet, insert without it
  if (error && (error.code === 'PGRST204' || error.message?.includes('attempt_count'))) {
    const fallback = await client
      .from('extraction_jobs')
      .insert({
        youtube_url: params.youtube_url,
        youtube_video_id: params.youtube_video_id,
        status: 'pending',
      })
      .select('*')
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(`Failed to create extraction job: ${error.message}`);
  }
  return data as ExtractionJob;
}

export async function getJobById(id: string): Promise<ExtractionJob | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('extraction_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch job ${id}: ${error.message}`);
  }
  return data as ExtractionJob;
}

export async function findJobByVideoId(videoId: string): Promise<ExtractionJob | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('extraction_jobs')
    .select('*')
    .eq('youtube_video_id', videoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check existing job for video ${videoId}: ${error.message}`);
  }
  return data as ExtractionJob | null;
}

export async function findReviewSourceByVideoId(videoId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('review_sources')
    .select(`
      id,
      title,
      reviewer,
      configuration_id,
      configurations(
        id,
        laptops(
          id,
          model,
          laptop_brands(name)
        )
      )
    `)
    .eq('youtube_video_id', videoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check review duplicate for video ${videoId}: ${error.message}`);
  }
  return data;
}

export async function updateJob(
  id: string,
  updates: {
    status?: JobStatus;
    raw_extraction?: any;
    error_message?: string | null;
    review_source_id?: string;
    attempt_count?: number;
    last_started_at?: string;
    completed_at?: string;
    model_used?: string;
    processing_duration_ms?: number;
  }
): Promise<ExtractionJob> {
  const client = getSupabaseClient();
  const payload: any = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  let { data, error } = await client
    .from('extraction_jobs')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  // If new V2 column(s) are missing from database schema cache (e.g. updated_at, model_used)
  if (error && (error.code === 'PGRST204' || error.message?.includes('could not find the') || error.message?.includes('does not exist'))) {
    console.warn(`[jobsRepository] Schema column mismatch on job update (${error.message}). Retrying with core fields.`);
    // Fallback: only update fields guaranteed in V1 schema
    const corePayload: any = {};
    if (updates.status !== undefined) corePayload.status = updates.status;
    if (updates.raw_extraction !== undefined) corePayload.raw_extraction = updates.raw_extraction;
    if (updates.error_message !== undefined) corePayload.error_message = updates.error_message;
    if (updates.review_source_id !== undefined) corePayload.review_source_id = updates.review_source_id;

    const fallback = await client
      .from('extraction_jobs')
      .update(corePayload)
      .eq('id', id)
      .select('*')
      .single();

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(`Failed to update job ${id}: ${error.message}`);
  }
  return data as ExtractionJob;
}

export async function listJobs(limit: number = 50): Promise<ExtractionJob[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('extraction_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list extraction jobs: ${error.message}`);
  }
  return (data || []) as ExtractionJob[];
}

export async function deleteJob(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('extraction_jobs')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete job ${id}: ${error.message}`);
  }
  return true;
}

export async function clearAllJobs(): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('extraction_jobs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    throw new Error(`Failed to clear all extraction jobs: ${error.message}`);
  }
  return true;
}

export async function recoverStaleJobs(): Promise<number> {
  // Find jobs stuck in 'processing' for more than 5 minutes and reset them to 'pending'
  const client = getSupabaseClient();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  try {
    const { data, error } = await client
      .from('extraction_jobs')
      .update({
        status: 'pending',
        error_message: 'Recovered from interrupted server process',
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'processing')
      .lt('last_started_at', fiveMinutesAgo)
      .select('id');

    if (error) {
      if (error.code === 'PGRST204' || error.message?.includes('updated_at') || error.message?.includes('last_started_at')) {
        console.warn('[JobRecovery] Notice: extraction_jobs missing updated_at or last_started_at column in database. Run migration 20260922000002_v2_schema_contract.sql in Supabase SQL editor to enable automatic stale job recovery.');
        return 0;
      }
      console.error('Failed to recover stale jobs:', error);
      return 0;
    }
    return data?.length || 0;
  } catch (err: any) {
    console.warn('[JobRecovery] Could not check stale jobs:', err.message);
    return 0;
  }
}
