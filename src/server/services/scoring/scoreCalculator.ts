import {
  ConfigurationScore,
  ConfigurationScoreDetail,
  ScoringProfile,
  ScoringProfileMetric,
  ScoreStatus,
  ScoreEligibilityStatus,
} from '../../../shared/types/index.ts';
import { getConfigurationById } from '../../repositories/configurationRepository.ts';
import { listScoringProfiles } from '../../repositories/scoringProfileRepository.ts';
import { saveConfigurationScore } from '../../repositories/configurationScoreRepository.ts';
import { resolveMetricValues } from './metricResolver.ts';
import { aggregateMeasurements } from './aggregator.ts';
import { normalizeValue } from './normalizer.ts';

/**
 * Calculates deterministic use-case score for a specific configuration and profile.
 */
export async function calculateConfigurationScoreForProfile(
  configTree: any,
  profile: ScoringProfile
): Promise<ConfigurationScore> {
  const configurationId = configTree.id;
  const metrics = profile.metrics || [];

  let totalConfiguredWeight = 0;
  let totalEligibleWeight = 0;
  let weightedScoreSum = 0;
  let metricsUsed = 0;
  let metricsAvailable = 0;
  let hasMissingRequired = false;

  const details: ConfigurationScoreDetail[] = [];

  for (const pm of metrics) {
    const metricDef = pm.metric;
    if (!metricDef || !metricDef.is_active) continue;

    const weight = Number(pm.weight) || 0;
    totalConfiguredWeight += weight;

    // 1. Resolve raw measurements from configuration tree
    const records = resolveMetricValues(configTree, metricDef);

    if (records.length === 0) {
      if (pm.is_required) {
        hasMissingRequired = true;
      }
      details.push({
        metric_id: metricDef.id,
        metric_name: metricDef.name,
        metric_domain: metricDef.domain,
        raw_value: null,
        normalized_score: null,
        weight,
        weighted_contribution: null,
        unit: metricDef.unit,
        source_type: metricDef.source_type,
        comparability_key: metricDef.comparability_key,
        eligibility_status: 'missing',
        exclusion_reason: 'No measurement data recorded for this metric',
      });
      continue;
    }

    metricsAvailable++;

    // 2. Aggregate measurements across reviews
    const aggResult = aggregateMeasurements(records, metricDef.aggregation_method);
    if (!aggResult) {
      details.push({
        metric_id: metricDef.id,
        metric_name: metricDef.name,
        metric_domain: metricDef.domain,
        raw_value: null,
        normalized_score: null,
        weight,
        weighted_contribution: null,
        unit: metricDef.unit,
        source_type: metricDef.source_type,
        comparability_key: metricDef.comparability_key,
        eligibility_status: 'missing',
        exclusion_reason: 'Could not aggregate measurement values',
      });
      continue;
    }

    const { aggregatedValue, bestRecord } = aggResult;

    // 3. Normalize score (0 - 100)
    const normResult = normalizeValue(aggregatedValue, metricDef);

    if (!normResult.isValid || normResult.normalizedScore === null) {
      details.push({
        metric_id: metricDef.id,
        metric_name: metricDef.name,
        metric_domain: metricDef.domain,
        raw_value: aggregatedValue,
        normalized_score: null,
        weight,
        weighted_contribution: null,
        unit: metricDef.unit,
        source_type: metricDef.source_type,
        source_id: bestRecord?.sourceId,
        review_source_id: bestRecord?.reviewSourceId,
        reviewer_name: bestRecord?.reviewerName,
        comparability_key: metricDef.comparability_key,
        eligibility_status: 'invalid',
        exclusion_reason: normResult.exclusionReason || 'Metric normalization failed',
      });
      continue;
    }

    // 4. Calculate weighted contribution
    const normalizedScore = normResult.normalizedScore;
    const weightedContrib = (normalizedScore * weight) / 100;

    weightedScoreSum += normalizedScore * weight;
    totalEligibleWeight += weight;
    metricsUsed++;

    details.push({
      metric_id: metricDef.id,
      metric_name: metricDef.name,
      metric_domain: metricDef.domain,
      raw_value: aggregatedValue,
      normalized_score: normalizedScore,
      weight,
      weighted_contribution: Math.round(weightedContrib * 10) / 10,
      unit: metricDef.unit,
      source_type: metricDef.source_type,
      source_id: bestRecord?.sourceId,
      review_source_id: bestRecord?.reviewSourceId,
      reviewer_name: bestRecord?.reviewerName,
      comparability_key: metricDef.comparability_key,
      eligibility_status: 'used',
      exclusion_reason: null,
    });
  }

  // 5. Compute Coverage & Final Score
  const coveragePercent = totalConfiguredWeight > 0
    ? Math.round((totalEligibleWeight / totalConfiguredWeight) * 1000) / 10
    : 0;

  let finalScore: number | null = null;
  let status: ScoreStatus = 'calculated';
  let errorMessage: string | null = null;

  if (hasMissingRequired || coveragePercent < profile.minimum_coverage_percent || totalEligibleWeight === 0) {
    status = 'insufficient_data';
    if (totalEligibleWeight > 0) {
      finalScore = Math.round((weightedScoreSum / totalEligibleWeight) * 10) / 10;
    }
    errorMessage = hasMissingRequired
      ? 'Required metrics are missing for this profile.'
      : `Data coverage (${coveragePercent}%) is below minimum threshold (${profile.minimum_coverage_percent}%).`;
  } else {
    finalScore = Math.round((weightedScoreSum / totalEligibleWeight) * 10) / 10;
  }

  // Calculate effective percentage for each detail
  for (const d of details) {
    if (d.eligibility_status === 'used' && totalEligibleWeight > 0) {
      d.effective_percentage = Math.round((d.weight / totalEligibleWeight) * 1000) / 10;
    } else {
      d.effective_percentage = 0;
    }
  }

  const now = new Date().toISOString();

  // 6. Save to Supabase
  const savedScoreId = await saveConfigurationScore({
    configuration_id: configurationId,
    profile_id: profile.id,
    score: finalScore,
    coverage_percent: coveragePercent,
    metrics_used: metricsUsed,
    metrics_available: metricsAvailable,
    status,
    calculated_at: now,
    calculation_version: profile.version,
    error_message: errorMessage,
  }, details);

  return {
    id: savedScoreId,
    configuration_id: configurationId,
    profile_id: profile.id,
    profile_key: profile.profile_key,
    profile_name: profile.name,
    profile_version: profile.version,
    score: finalScore,
    coverage_percent: coveragePercent,
    metrics_used: metricsUsed,
    metrics_available: metricsAvailable,
    status,
    calculated_at: now,
    calculation_version: profile.version,
    error_message: errorMessage,
    details,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Calculates all active scoring profiles for a configuration.
 */
export async function calculateAllScoresForConfiguration(
  configurationId: string
): Promise<ConfigurationScore[]> {
  const configTree = await getConfigurationById(configurationId);
  if (!configTree) {
    throw new Error(`Configuration ${configurationId} not found`);
  }

  const profiles = await listScoringProfiles(true);
  const results: ConfigurationScore[] = [];

  for (const profile of profiles) {
    try {
      const score = await calculateConfigurationScoreForProfile(configTree, profile);
      results.push(score);
    } catch (err) {
      console.error(`[ScoreCalculator] Error calculating score for profile ${profile.profile_key}:`, err);
    }
  }

  return results;
}
