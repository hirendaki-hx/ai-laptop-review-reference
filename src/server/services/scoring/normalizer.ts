import { ScoringMetricDefinition } from '../../../shared/types/index.ts';

export interface NormalizationResult {
  normalizedScore: number | null;
  isValid: boolean;
  exclusionReason?: string;
}

/**
 * Normalizes a raw measurement to a 0-100 score according to the metric definition.
 */
export function normalizeValue(
  rawValue: number | boolean | null | undefined,
  metric: ScoringMetricDefinition
): NormalizationResult {
  if (rawValue === null || rawValue === undefined) {
    return {
      normalizedScore: null,
      isValid: false,
      exclusionReason: 'Missing raw value',
    };
  }

  // Handle Binary Metrics
  if (metric.normalization_method === 'binary' || metric.direction === 'binary') {
    const boolVal = typeof rawValue === 'boolean' ? rawValue : Boolean(rawValue);
    return {
      normalizedScore: boolVal ? 100 : 0,
      isValid: true,
    };
  }

  const numVal = Number(rawValue);
  if (isNaN(numVal)) {
    return {
      normalizedScore: null,
      isValid: false,
      exclusionReason: 'Value is not a valid number',
    };
  }

  // Handle Fixed Range Normalization
  if (metric.normalization_method === 'fixed_range') {
    const min = metric.fixed_min ?? 0;
    const max = metric.fixed_max ?? 100;

    if (max <= min) {
      return {
        normalizedScore: null,
        isValid: false,
        exclusionReason: 'Invalid metric fixed range (max <= min)',
      };
    }

    let score: number;
    if (metric.direction === 'higher_is_better') {
      score = ((numVal - min) / (max - min)) * 100;
    } else if (metric.direction === 'lower_is_better') {
      score = ((max - numVal) / (max - min)) * 100;
    } else {
      score = ((numVal - min) / (max - min)) * 100;
    }

    // Strict clamp 0 to 100
    const clamped = Math.max(0, Math.min(100, score));
    return {
      normalizedScore: Math.round(clamped * 10) / 10,
      isValid: true,
    };
  }

  // Handle Target Normalization
  if (metric.normalization_method === 'target') {
    const target = metric.target_value ?? 100;
    if (target === 0) {
      return { normalizedScore: 100, isValid: true };
    }
    const diff = Math.abs(numVal - target);
    const score = Math.max(0, 100 - (diff / target) * 100);
    return {
      normalizedScore: Math.round(score * 10) / 10,
      isValid: true,
    };
  }

  // Default fallback: direct clamp if between 0 and 100
  const clamped = Math.max(0, Math.min(100, numVal));
  return {
    normalizedScore: Math.round(clamped * 10) / 10,
    isValid: true,
  };
}
