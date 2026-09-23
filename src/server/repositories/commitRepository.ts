import { getSupabaseClient } from '../external/supabase.ts';
import type { ExtractedDataPayload, RetailerType } from '../../shared/types/index.ts';
import { triggerScoreRecalculationForConfig } from '../services/scoring/scoreInvalidation.ts';

export interface CommitExtractionParams {
  jobId: string;
  data: ExtractedDataPayload;
  useExistingConfigId?: string | null;
  reviewerIdentity?: string;
  retailListings?: {
    amazonUrl?: string | null;
    flipkartUrl?: string | null;
    manualImageUrl?: string | null;
    amazonManualPrice?: number | null;
    flipkartManualPrice?: number | null;
  };
}

export interface CommitResult {
  status: string;
  review_source_id: string;
  configuration_id: string;
  laptop_id?: string;
  brand_id?: string;
}

export async function commitReviewedExtraction(params: CommitExtractionParams): Promise<CommitResult> {
  const client = getSupabaseClient();
  const { data, jobId, useExistingConfigId, reviewerIdentity = 'admin_reviewer' } = params;

  // Verify that the job exists
  const { data: job, error: jobErr } = await client
    .from('extraction_jobs')
    .select('id, status, youtube_video_id, youtube_url')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Idempotency check: if job is already marked completed, check if review source exists
  if (job.status === 'completed') {
    const { data: existingReview } = await client
      .from('review_sources')
      .select('id, configuration_id')
      .eq('youtube_video_id', job.youtube_video_id)
      .maybeSingle();

    if (existingReview) {
      return {
        status: 'idempotent_success',
        review_source_id: existingReview.id,
        configuration_id: existingReview.configuration_id,
      };
    }
  }

  // Prepare payload for PostgreSQL atomic RPC commit_reviewed_extraction_v2
  const rpcArgs = {
    p_job_id: jobId,
    p_brand_name: data.laptop.brand.trim(),
    p_laptop_model: data.laptop.model.trim(),
    p_laptop_series: data.laptop.series ? data.laptop.series.trim() : null,
    p_laptop_generation: data.laptop.generation ? data.laptop.generation.trim() : null,
    p_config_json: data.configuration,
    p_review_json: {
      youtube_url: job.youtube_url,
      youtube_video_id: job.youtube_video_id,
      title: data.review_meta.title,
      reviewer: data.review_meta.reviewer,
      published_date: data.review_meta.published_date,
      verdict_summary: data.review_meta.verdict_summary,
      verdict_score: data.review_meta.verdict_score,
      verdict_pros: data.review_meta.verdict_pros,
      verdict_cons: data.review_meta.verdict_cons,
      raw_data: data,
    },
    p_benchmarks_json: data.benchmarks || [],
    p_gaming_json: data.gaming || [],
    p_thermals_json: data.thermals || [],
    p_display_json: data.display_results && data.display_results.length > 0 ? data.display_results : (data.display || null),
    p_battery_json: data.battery_results && data.battery_results.length > 0 ? data.battery_results : (data.battery || null),
    p_evidence_json: data.evidence || [],
    p_use_existing_config_id: useExistingConfigId || null,
    p_reviewer_identity: reviewerIdentity,
  };

  const { data: rpcResult, error: rpcError } = await client.rpc('commit_reviewed_extraction_v2', rpcArgs);

  if (rpcError) {
    console.error('RPC commit_reviewed_extraction_v2 failed:', rpcError);
    throw new Error(`TRANSACTION_FAILED: ${rpcError.message}`);
  }

  const result = rpcResult as CommitResult;

  // Handle optional retail listings asynchronously/non-blocking
  if (params.retailListings && result.configuration_id) {
    try {
      await handleRetailListingsCommit(result.configuration_id, params.retailListings);
    } catch (retailErr) {
      console.warn('Non-blocking retail listings save error:', retailErr);
      // As per non-negotiable rule: never block extraction save on retail failure
    }
  }

  // Trigger non-blocking score recalculation for the affected configuration
  if (result.configuration_id) {
    triggerScoreRecalculationForConfig(result.configuration_id);
  }

  return result;
}

async function handleRetailListingsCommit(
  configurationId: string,
  retailListings: {
    amazonUrl?: string | null;
    flipkartUrl?: string | null;
    manualImageUrl?: string | null;
    amazonManualPrice?: number | null;
    flipkartManualPrice?: number | null;
  }
) {
  const client = getSupabaseClient();

  const handleRetailer = async (
    retailer: RetailerType,
    url?: string | null,
    manualPrice?: number | null
  ) => {
    if (!url) return;

    const priceSource = manualPrice ? 'manual' : 'auto';
    const imageSource = retailListings.manualImageUrl ? 'manual' : 'auto';

    // Upsert product_listing for (configuration_id, retailer)
    const { data: existing } = await client
      .from('product_listings')
      .select('id, current_price')
      .eq('configuration_id', configurationId)
      .eq('retailer', retailer)
      .maybeSingle();

    let listingId = existing?.id;
    const priceToSet = manualPrice ?? existing?.current_price ?? null;

    if (existing) {
      await client
        .from('product_listings')
        .update({
          product_url: url,
          image_url: retailListings.manualImageUrl || undefined,
          image_source: imageSource,
          price_source: priceSource,
          current_price: priceToSet,
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      const { data: inserted } = await client
        .from('product_listings')
        .insert({
          configuration_id: configurationId,
          retailer,
          product_url: url,
          image_url: retailListings.manualImageUrl || null,
          image_source: imageSource,
          price_source: priceSource,
          current_price: priceToSet,
          currency: 'INR',
          in_stock: true,
          last_checked_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      listingId = inserted?.id;
    }

    // Append to price_history if price is set and different from previous
    if (listingId && priceToSet != null && (!existing || existing.current_price !== priceToSet)) {
      await client.from('price_history').insert({
        listing_id: listingId,
        price: priceToSet,
        checked_at: new Date().toISOString(),
      });
    }
  };

  await Promise.allSettled([
    handleRetailer('amazon', retailListings.amazonUrl, retailListings.amazonManualPrice),
    handleRetailer('flipkart', retailListings.flipkartUrl, retailListings.flipkartManualPrice),
  ]);
}
