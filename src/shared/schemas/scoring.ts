import { z } from 'zod';

export const MetricDirectionSchema = z.enum(['higher_is_better', 'lower_is_better', 'binary', 'custom']);
export const NormalizationMethodSchema = z.enum(['fixed_range', 'percentile', 'target', 'binary', 'custom']);
export const AggregationMethodSchema = z.enum(['mean', 'median', 'best', 'latest', 'max', 'min']);
export const MetricSourceTypeSchema = z.enum(['configuration', 'benchmark', 'gaming', 'thermal', 'display', 'battery']);

export const ScoringMetricDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  metric_key: z.string().trim().min(2, 'Metric key required'),
  name: z.string().trim().min(2, 'Metric name required'),
  description: z.string().trim().nullable().optional(),
  domain: z.string().trim().min(2, 'Domain required'),
  source_type: MetricSourceTypeSchema,
  source_key: z.string().trim().min(1, 'Source key required'),
  unit: z.string().trim().nullable().optional(),
  direction: MetricDirectionSchema,
  normalization_method: NormalizationMethodSchema,
  fixed_min: z.number().nullable().optional(),
  fixed_max: z.number().nullable().optional(),
  target_value: z.number().nullable().optional(),
  aggregation_method: AggregationMethodSchema,
  comparability_key: z.string().trim().nullable().optional(),
  version: z.number().int().min(1).default(1),
  is_active: z.boolean().default(true),
});

export const ScoringProfileMetricInputSchema = z.object({
  metric_id: z.string().uuid('Valid metric UUID required'),
  weight: z.number().min(0, 'Weight must be non-negative'),
  is_required: z.boolean().default(false),
  weight_override: z.number().nullable().optional(),
});

export const ScoringProfileInputSchema = z.object({
  profile_key: z.string().trim().min(2, 'Profile key required'),
  name: z.string().trim().min(2, 'Profile name required'),
  description: z.string().trim().nullable().optional(),
  minimum_coverage_percent: z.number().min(0).max(100).default(40),
  is_active: z.boolean().default(true),
  metrics: z.array(ScoringProfileMetricInputSchema).min(1, 'At least one metric is required'),
});

export const RecalculateScoreRequestSchema = z.object({
  configuration_id: z.string().uuid().optional(),
  profile_id: z.string().uuid().optional(),
  force: z.boolean().optional().default(false),
});
