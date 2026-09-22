import { z } from 'zod';

export const LaptopIdentitySchema = z.object({
  brand: z.string().min(1, "Brand is required"),
  model: z.string().min(1, "Model is required"),
  series: z.string().nullable().transform(v => v || null),
  generation: z.string().nullable().transform(v => v || null),
});

export const ConfigurationDataSchema = z.object({
  cpu: z.string().nullable().transform(v => v || null),
  gpu: z.string().nullable().transform(v => v || null),
  gpu_tgp_w: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  ram_gb: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  ram_speed_mt_s: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  storage_gb: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  storage_type: z.string().nullable().transform(v => v || null),
  display_size_inch: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  display_resolution: z.string().nullable().transform(v => v || null),
  refresh_rate_hz: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  panel_type: z.string().nullable().transform(v => v || null),
  battery_wh: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  weight_kg: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  thickness_mm: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
});

export const ReviewMetaSchema = z.object({
  title: z.string().min(1, "Title is required"),
  reviewer: z.string().min(1, "Reviewer is required"),
  published_date: z.string().nullable().transform(v => v || null),
  verdict_summary: z.string().nullable().transform(v => v || null),
  verdict_score: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 10) ? v : null),
  verdict_pros: z.array(z.string()).default([]),
  verdict_cons: z.array(z.string()).default([]),
});

export const BenchmarkItemSchema = z.object({
  id: z.string().optional(),
  benchmark_group: z.string().min(1).default("Unknown"),
  variant: z.string().nullable().transform(v => v || null),
  category: z.enum(['cpu', 'gpu', 'rendering', 'ai', 'storage', 'system', 'productivity']).default('system'),
  score: z.number().refine(v => !isNaN(v), "Score must be a valid number"),
  unit: z.string().nullable().transform(v => v || null),
  power_mode: z.string().nullable().transform(v => v || null),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  notes: z.string().nullable().transform(v => v || null),
});

export const GamingItemSchema = z.object({
  id: z.string().optional(),
  game: z.string().min(1).default("Unknown"),
  resolution: z.string().nullable().transform(v => v || null),
  preset: z.string().nullable().transform(v => v || null),
  ray_tracing: z.boolean().nullable(),
  upscaling: z.boolean().nullable(),
  upscaling_mode: z.string().nullable().transform(v => v || null),
  avg_fps: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  one_percent_low_fps: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  notes: z.string().nullable().transform(v => v || null),
});

export const ThermalItemSchema = z.object({
  id: z.string().optional(),
  test_name: z.string().min(1).default("Unknown"),
  duration_minutes: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  cpu_peak_c: z.number().nullable().transform(v => (v != null && !isNaN(v)) ? v : null),
  cpu_avg_c: z.number().nullable().transform(v => (v != null && !isNaN(v)) ? v : null),
  cpu_peak_power_w: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  cpu_avg_power_w: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  gpu_peak_c: z.number().nullable().transform(v => (v != null && !isNaN(v)) ? v : null),
  gpu_avg_c: z.number().nullable().transform(v => (v != null && !isNaN(v)) ? v : null),
  keyboard_min_c: z.number().nullable().transform(v => (v != null && !isNaN(v)) ? v : null),
  keyboard_max_c: z.number().nullable().transform(v => (v != null && !isNaN(v)) ? v : null),
  notes: z.string().nullable().transform(v => v || null),
});

export const DisplayDataSchema = z.object({
  brightness_sdr_nits: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  brightness_hdr_nits: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  srgb_percent: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 200) ? v : null),
  dci_p3_percent: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 200) ? v : null),
  adobe_rgb_percent: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 200) ? v : null),
  response_time_ms: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  g_sync: z.boolean().nullable(),
  vrr: z.boolean().nullable(),
  notes: z.string().nullable().transform(v => v || null),
});

export const BatteryDataSchema = z.object({
  battery_life_hours: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  test_method: z.string().nullable().transform(v => v || null),
  brightness_percent: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0 && v <= 100) ? v : null),
  gpu_mode: z.string().nullable().transform(v => v || null),
  charging_adapter_w: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  zero_to_fifty_min: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  full_charge_min: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  usb_c_charging_w: z.number().nullable().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  notes: z.string().nullable().transform(v => v || null),
});

export const ExtractionDataSchema = z.object({
  laptop: LaptopIdentitySchema,
  configuration: ConfigurationDataSchema,
  review_meta: ReviewMetaSchema,
  benchmarks: z.array(BenchmarkItemSchema).default([]),
  gaming: z.array(GamingItemSchema).default([]),
  thermals: z.array(ThermalItemSchema).default([]),
  display: DisplayDataSchema,
  battery: BatteryDataSchema,
});

export const RetailListingsInputSchema = z.object({
  amazonUrl: z.string().url().nullable().optional().transform(v => v || null),
  flipkartUrl: z.string().url().nullable().optional().transform(v => v || null),
  manualImageUrl: z.string().url().nullable().optional().transform(v => v || null),
  amazonManualPrice: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
  flipkartManualPrice: z.number().nullable().optional().transform(v => (v != null && !isNaN(v) && v >= 0) ? v : null),
});

export const CommitPayloadSchema = z.object({
  jobId: z.string().uuid(),
  data: ExtractionDataSchema,
  useExistingConfigId: z.string().uuid().nullable().optional(),
  retailListings: RetailListingsInputSchema.optional(),
});
