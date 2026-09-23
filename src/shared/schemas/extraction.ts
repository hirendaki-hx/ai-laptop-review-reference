import { z } from 'zod';

export const LaptopIdentitySchema = z.object({
  brand: z.string().trim().min(1, 'Brand is required'),
  model: z.string().trim().min(1, 'Model is required'),
  series: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  generation: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
});

export const ConfigurationDataSchema = z.object({
  cpu: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  gpu: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  gpu_tgp_w: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  ram_gb: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  ram_speed_mt_s: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  storage_gb: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  storage_type: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  display_size_inch: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  display_resolution: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  refresh_rate_hz: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  panel_type: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  battery_wh: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  weight_kg: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  thickness_mm: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
});

export const ReviewMetaSchema = z.object({
  title: z.string().trim().min(1, 'Review title is required'),
  reviewer: z.string().trim().min(1, 'Reviewer name or channel is required'),
  published_date: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  verdict_summary: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  verdict_score: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 10 ? v : null)),
  verdict_pros: z.array(z.string().trim()).default([]),
  verdict_cons: z.array(z.string().trim()).default([]),
});

export const EvidenceItemSchema = z.object({
  id: z.string().uuid().optional(),
  review_source_id: z.string().uuid().optional(),
  field_path: z.string().trim().min(1, 'Field path is required'),
  timestamp_seconds: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? Math.floor(v) : null)),
  timestamp_display: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  evidence_description: z.string().trim().min(1, 'Description of evidence is required'),
  evidence_text: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
});

export const BenchmarkItemSchema = z.object({
  id: z.string().uuid().optional(),
  review_source_id: z.string().uuid().optional(),
  benchmark_group: z.string().trim().min(1, 'Benchmark group/suite is required'),
  benchmark_version: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  variant: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  category: z.enum(['cpu', 'gpu', 'rendering', 'ai', 'storage', 'system', 'productivity']).default('system'),
  score: z.number().refine(v => !isNaN(v), 'Score must be a valid number'),
  score_type: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  unit: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  power_mode: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  settings_notes: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  notes: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  evidence: EvidenceItemSchema.nullable().optional(),
});

export const GamingItemSchema = z.object({
  id: z.string().uuid().optional(),
  review_source_id: z.string().uuid().optional(),
  game: z.string().trim().min(1, 'Game title is required'),
  resolution: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  preset: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  ray_tracing: z.boolean().nullable().optional().default(null),
  upscaling: z.boolean().nullable().optional().default(null),
  upscaling_mode: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  frame_generation: z.boolean().nullable().optional().default(null),
  gpu_mode: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  power_mode: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  avg_fps: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  one_percent_low_fps: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  zero_point_one_percent_low_fps: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  minimum_fps: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  notes: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  evidence: EvidenceItemSchema.nullable().optional(),
});

export const ThermalItemSchema = z.object({
  id: z.string().uuid().optional(),
  review_source_id: z.string().uuid().optional(),
  test_name: z.string().trim().min(1, 'Thermal test name is required'),
  duration_minutes: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  cpu_peak_c: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) ? v : null)),
  cpu_avg_c: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) ? v : null)),
  cpu_peak_power_w: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  cpu_avg_power_w: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  gpu_peak_c: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) ? v : null)),
  gpu_avg_c: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) ? v : null)),
  gpu_peak_power_w: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  gpu_avg_power_w: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  sustained_wattage_w: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  fan_noise_db: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  ambient_temp_c: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) ? v : null)),
  keyboard_min_c: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) ? v : null)),
  keyboard_max_c: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) ? v : null)),
  power_mode: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  notes: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  evidence: EvidenceItemSchema.nullable().optional(),
});

export const DEFAULT_EMPTY_DISPLAY = {
  brightness_sdr_nits: null,
  brightness_hdr_nits: null,
  srgb_percent: null,
  dci_p3_percent: null,
  adobe_rgb_percent: null,
  response_time_ms: null,
  g_sync: null,
  vrr: null,
  notes: null,
};

export const DEFAULT_EMPTY_BATTERY = {
  battery_life_hours: null,
  test_method: null,
  brightness_percent: null,
  gpu_mode: null,
  charging_adapter_w: null,
  zero_to_fifty_min: null,
  full_charge_min: null,
  usb_c_charging_w: null,
  notes: null,
};

export const DisplayDataSchema = z.object({
  id: z.string().uuid().optional(),
  review_source_id: z.string().uuid().optional(),
  test_name: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  brightness_sdr_nits: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  brightness_hdr_nits: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  srgb_percent: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 200 ? v : null)),
  dci_p3_percent: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 200 ? v : null)),
  adobe_rgb_percent: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 200 ? v : null)),
  response_time_ms: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  contrast_ratio: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  delta_e: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  g_sync: z.boolean().nullable().optional().default(null),
  vrr: z.boolean().nullable().optional().default(null),
  notes: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  evidence: EvidenceItemSchema.nullable().optional(),
});

export const BatteryDataSchema = z.object({
  id: z.string().uuid().optional(),
  review_source_id: z.string().uuid().optional(),
  battery_life_hours: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  test_method: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  brightness_percent: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 100 ? v : null)),
  gpu_mode: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  charging_adapter_w: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  zero_to_fifty_min: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  full_charge_min: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  usb_c_charging_w: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0 ? v : null)),
  notes: z.string().trim().nullable().optional().transform(v => (v ? v.trim() : null)),
  evidence: EvidenceItemSchema.nullable().optional(),
});

export const PassStatusSchema = z.enum(['pending', 'success', 'rate_limited', 'failed', 'skipped']);

export const PassStatusDetailSchema = z.object({
  pass_name: z.string(),
  status: PassStatusSchema,
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  retry_after_seconds: z.number().nullable().optional(),
  items_extracted: z.number().optional().default(0),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
});

export const ExtractionMetadataSchema = z.object({
  extraction_version: z.string().default('2.6.0-quota-aware'),
  processing_mode: z.string().default('multi_pass_video'),
  passes_completed: z.number().default(1),
  total_passes_required: z.number().optional().default(5),
  overall_status: z.enum(['complete', 'partial', 'rate_limited', 'failed']).optional().default('complete'),
  pass_statuses: z.record(z.string(), PassStatusDetailSchema).optional().default({}),
  discovered_segments: z.number().default(0),
  benchmark_count: z.number().default(0),
  gaming_count: z.number().default(0),
  thermal_test_count: z.number().default(0),
  display_test_count: z.number().default(0),
  battery_test_count: z.number().default(0),
  evidence_count: z.number().default(0),
  audit_additions_count: z.number().default(0),
  source_video_access: z.enum(['full', 'partial', 'failed']).default('full'),
  completeness_notes: z.string().nullable().optional(),
  rate_limit_info: z.object({
    blocked_pass: z.string(),
    retry_after_seconds: z.number(),
    retry_available_at: z.string().optional(),
  }).nullable().optional(),
});

export const ExtractedDataPayloadSchema = z.object({
  laptop: LaptopIdentitySchema,
  configuration: ConfigurationDataSchema,
  review_meta: ReviewMetaSchema,
  benchmarks: z.array(BenchmarkItemSchema).default([]),
  gaming: z.array(GamingItemSchema).default([]),
  thermals: z.array(ThermalItemSchema).default([]),
  display: DisplayDataSchema.nullable().optional().default(DEFAULT_EMPTY_DISPLAY).transform(v => v || DEFAULT_EMPTY_DISPLAY),
  battery: BatteryDataSchema.nullable().optional().default(DEFAULT_EMPTY_BATTERY).transform(v => v || DEFAULT_EMPTY_BATTERY),
  display_results: z.array(DisplayDataSchema).optional().default([]),
  battery_results: z.array(BatteryDataSchema).optional().default([]),
  evidence: z.array(EvidenceItemSchema).default([]),
  extraction_meta: ExtractionMetadataSchema.optional(),
});

/**
 * Normalizes raw Gemini extraction output to ensure top-level and nested sections
 * are safely defined with nulls/empty arrays instead of failing validation on missing keys.
 * Crucially: DOES NOT invent values or convert missing data to 0.
 */
export function normalizeExtractionInput(raw: any): any {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }

  const normalized = { ...raw };

  // If display is an array with items, pick first for backward compat display object, and preserve display_results
  if (Array.isArray(normalized.display_results) && normalized.display_results.length > 0) {
    if (!normalized.display || typeof normalized.display !== 'object') {
      normalized.display = { ...DEFAULT_EMPTY_DISPLAY, ...normalized.display_results[0] };
    }
  } else if (Array.isArray(normalized.display)) {
    normalized.display_results = [...normalized.display];
    normalized.display = normalized.display.length > 0 ? { ...DEFAULT_EMPTY_DISPLAY, ...normalized.display[0] } : { ...DEFAULT_EMPTY_DISPLAY };
  } else if (normalized.display === undefined || normalized.display === null || typeof normalized.display !== 'object') {
    normalized.display = { ...DEFAULT_EMPTY_DISPLAY };
  } else {
    normalized.display = {
      ...DEFAULT_EMPTY_DISPLAY,
      ...normalized.display,
    };
  }

  // If battery is an array with items, pick first for backward compat battery object, and preserve battery_results
  if (Array.isArray(normalized.battery_results) && normalized.battery_results.length > 0) {
    if (!normalized.battery || typeof normalized.battery !== 'object') {
      normalized.battery = { ...DEFAULT_EMPTY_BATTERY, ...normalized.battery_results[0] };
    }
  } else if (Array.isArray(normalized.battery)) {
    normalized.battery_results = [...normalized.battery];
    normalized.battery = normalized.battery.length > 0 ? { ...DEFAULT_EMPTY_BATTERY, ...normalized.battery[0] } : { ...DEFAULT_EMPTY_BATTERY };
  } else if (normalized.battery === undefined || normalized.battery === null || typeof normalized.battery !== 'object') {
    normalized.battery = { ...DEFAULT_EMPTY_BATTERY };
  } else {
    normalized.battery = {
      ...DEFAULT_EMPTY_BATTERY,
      ...normalized.battery,
    };
  }

  // Ensure arrays are arrays
  if (!Array.isArray(normalized.benchmarks)) {
    normalized.benchmarks = [];
  }
  if (!Array.isArray(normalized.gaming)) {
    normalized.gaming = [];
  }
  if (!Array.isArray(normalized.thermals)) {
    normalized.thermals = [];
  }
  if (!Array.isArray(normalized.display_results)) {
    normalized.display_results = normalized.display ? [normalized.display] : [];
  }
  if (!Array.isArray(normalized.battery_results)) {
    normalized.battery_results = normalized.battery ? [normalized.battery] : [];
  }
  if (!Array.isArray(normalized.evidence)) {
    normalized.evidence = [];
  }

  if (normalized.review_meta && typeof normalized.review_meta === 'object') {
    if (!Array.isArray(normalized.review_meta.verdict_pros)) {
      normalized.review_meta.verdict_pros = [];
    }
    if (!Array.isArray(normalized.review_meta.verdict_cons)) {
      normalized.review_meta.verdict_cons = [];
    }
  }

  return normalized;
}

export const RetailListingsInputSchema = z.object({
  amazonUrl: z.string().trim().url().nullable().optional().transform(v => (v ? v.trim() : null)),
  flipkartUrl: z.string().trim().url().nullable().optional().transform(v => (v ? v.trim() : null)),
  manualImageUrl: z.string().trim().url().nullable().optional().transform(v => (v ? v.trim() : null)),
  amazonManualPrice: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
  flipkartManualPrice: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v > 0 ? v : null)),
});

export const CommitPayloadSchema = z.object({
  data: ExtractedDataPayloadSchema,
  useExistingConfigId: z.string().uuid().nullable().optional(),
  retailListings: RetailListingsInputSchema.optional(),
  reviewerIdentity: z.string().trim().default('admin_reviewer'),
});
