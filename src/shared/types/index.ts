export type BenchmarkCategory =
  | 'cpu'
  | 'gpu'
  | 'rendering'
  | 'ai'
  | 'storage'
  | 'system'
  | 'productivity';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'ready_for_review'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'duplicate';

export type RetailerType = 'amazon' | 'flipkart';
export type PriceSourceType = 'auto' | 'manual';
export type ImageSourceType = 'auto' | 'manual';

export interface LaptopBrand {
  id: string;
  name: string;
  created_at?: string;
}

export interface Laptop {
  id: string;
  brand_id: string;
  brand_name?: string;
  model: string;
  series: string | null;
  generation: string | null;
  created_at?: string;
}

export interface Configuration {
  id: string;
  laptop_id: string;
  cpu: string | null;
  gpu: string | null;
  gpu_tgp_w: number | null;
  ram_gb: number | null;
  ram_speed_mt_s: number | null;
  storage_gb: number | null;
  storage_type: string | null;
  display_size_inch: number | null;
  display_resolution: string | null;
  refresh_rate_hz: number | null;
  panel_type: string | null;
  battery_wh: number | null;
  weight_kg: number | null;
  thickness_mm: number | null;
  created_at?: string;
  laptop?: Laptop;
  review_count?: number;
}

export interface EvidenceRecord {
  id?: string;
  review_source_id?: string;
  field_path: string;
  timestamp_seconds?: number | null;
  timestamp_display?: string | null;
  evidence_description: string;
  evidence_text?: string | null;
  confidence: ConfidenceLevel;
  created_at?: string;
}

export interface BenchmarkResult {
  id?: string;
  review_source_id?: string;
  benchmark_group: string;
  benchmark_version?: string | null;
  variant?: string | null;
  category: BenchmarkCategory;
  score: number;
  score_type?: string | null;
  unit?: string | null;
  power_mode?: string | null;
  confidence?: ConfidenceLevel;
  settings_notes?: string | null;
  notes?: string | null;
  evidence?: EvidenceRecord | null;
}

export interface GamingResult {
  id?: string;
  review_source_id?: string;
  game: string;
  resolution?: string | null;
  preset?: string | null;
  ray_tracing?: boolean | null;
  upscaling?: boolean | null;
  upscaling_mode?: string | null;
  frame_generation?: boolean | null;
  gpu_mode?: string | null;
  power_mode?: string | null;
  avg_fps?: number | null;
  one_percent_low_fps?: number | null;
  zero_point_one_percent_low_fps?: number | null;
  minimum_fps?: number | null;
  notes?: string | null;
  evidence?: EvidenceRecord | null;
}

export interface ThermalResult {
  id?: string;
  review_source_id?: string;
  test_name: string;
  duration_minutes?: number | null;
  cpu_peak_c?: number | null;
  cpu_avg_c?: number | null;
  cpu_peak_power_w?: number | null;
  cpu_avg_power_w?: number | null;
  gpu_peak_c?: number | null;
  gpu_avg_c?: number | null;
  gpu_peak_power_w?: number | null;
  gpu_avg_power_w?: number | null;
  sustained_wattage_w?: number | null;
  fan_noise_db?: number | null;
  ambient_temp_c?: number | null;
  keyboard_min_c?: number | null;
  keyboard_max_c?: number | null;
  power_mode?: string | null;
  notes?: string | null;
  evidence?: EvidenceRecord | null;
}

export interface DisplayResult {
  id?: string;
  review_source_id?: string;
  test_name?: string | null;
  brightness_sdr_nits?: number | null;
  brightness_hdr_nits?: number | null;
  srgb_percent?: number | null;
  dci_p3_percent?: number | null;
  adobe_rgb_percent?: number | null;
  response_time_ms?: number | null;
  contrast_ratio?: string | null;
  delta_e?: number | null;
  g_sync?: boolean | null;
  vrr?: boolean | null;
  notes?: string | null;
  evidence?: EvidenceRecord | null;
}

export interface BatteryResult {
  id?: string;
  review_source_id?: string;
  battery_life_hours?: number | null;
  test_method?: string | null;
  brightness_percent?: number | null;
  gpu_mode?: string | null;
  charging_adapter_w?: number | null;
  zero_to_fifty_min?: number | null;
  full_charge_min?: number | null;
  usb_c_charging_w?: number | null;
  notes?: string | null;
  evidence?: EvidenceRecord | null;
}

export type PassStatus = 'pending' | 'success' | 'rate_limited' | 'failed' | 'skipped';

export interface PassStatusDetail {
  pass_name: string;
  status: PassStatus;
  error_code?: string | null;
  error_message?: string | null;
  retry_after_seconds?: number | null;
  items_extracted?: number;
  started_at?: string;
  completed_at?: string;
}

export interface ExtractionMetadata {
  extraction_version: string;
  processing_mode: string;
  passes_completed: number;
  total_passes_required?: number;
  overall_status?: 'complete' | 'partial' | 'rate_limited' | 'failed';
  pass_statuses?: Record<string, PassStatusDetail>;
  discovered_segments: number;
  benchmark_count: number;
  gaming_count: number;
  thermal_test_count: number;
  display_test_count: number;
  battery_test_count: number;
  evidence_count: number;
  audit_additions_count: number;
  source_video_access: 'full' | 'partial' | 'failed';
  completeness_notes?: string | null;
  rate_limit_info?: {
    blocked_pass: string;
    retry_after_seconds: number;
    retry_available_at?: string;
  } | null;
}

export interface ReviewSource {
  id: string;
  configuration_id: string;
  youtube_url: string;
  youtube_video_id: string;
  title: string;
  reviewer: string;
  published_date: string | null;
  verdict_summary: string | null;
  verdict_score: number | null;
  verdict_pros: string[];
  verdict_cons: string[];
  raw_data?: Record<string, unknown> | null;
  created_at?: string;
}

export interface ExtractionJob {
  id: string;
  youtube_url: string;
  youtube_video_id: string;
  status: JobStatus;
  raw_extraction: ExtractedDataPayload | null;
  error_message: string | null;
  review_source_id: string | null;
  attempt_count: number;
  last_started_at: string | null;
  completed_at: string | null;
  model_used: string | null;
  processing_duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductListing {
  id: string;
  configuration_id: string;
  retailer: RetailerType;
  product_url: string;
  image_url: string | null;
  image_source: ImageSourceType;
  price_source: PriceSourceType;
  current_price: number | null;
  currency: string;
  in_stock: boolean | null;
  last_checked_at: string | null;
  created_at?: string;
  price_history?: PriceHistoryRecord[];
}

export interface PriceHistoryRecord {
  id: string;
  listing_id: string;
  price: number;
  checked_at: string;
}

export interface ReviewAudit {
  id: string;
  review_source_id: string;
  reviewer_identity: string;
  action: 'created' | 'modified' | 'discarded';
  diff_summary: Record<string, unknown> | null;
  created_at: string;
}

// Extraction Payload transferred between Gemini, Review, and Commit
export interface ExtractedDataPayload {
  laptop: {
    brand: string;
    model: string;
    series?: string | null;
    generation?: string | null;
  };
  configuration: {
    cpu?: string | null;
    gpu?: string | null;
    gpu_tgp_w?: number | null;
    ram_gb?: number | null;
    ram_speed_mt_s?: number | null;
    storage_gb?: number | null;
    storage_type?: string | null;
    display_size_inch?: number | null;
    display_resolution?: string | null;
    refresh_rate_hz?: number | null;
    panel_type?: string | null;
    battery_wh?: number | null;
    weight_kg?: number | null;
    thickness_mm?: number | null;
  };
  review_meta: {
    title: string;
    reviewer: string;
    published_date?: string | null;
    verdict_summary?: string | null;
    verdict_score?: number | null;
    verdict_pros?: string[];
    verdict_cons?: string[];
  };
  benchmarks: BenchmarkResult[];
  gaming: GamingResult[];
  thermals: ThermalResult[];
  display?: DisplayResult | null;
  battery?: BatteryResult | null;
  display_results?: DisplayResult[];
  battery_results?: BatteryResult[];
  evidence: EvidenceRecord[];
  extraction_meta?: ExtractionMetadata;
}

// Matching Classification
export type MatchClassification = 'EXACT MATCH' | 'LIKELY MATCH' | 'PARTIAL MATCH' | 'NO MATCH';

export interface ConfigurationMatchResult {
  classification: MatchClassification;
  confidenceScore: number; // 0 to 100
  matchedConfiguration: Configuration | null;
  matchedLaptop: Laptop | null;
  matchedBrand: LaptopBrand | null;
  matchingReasons: string[];
  differingFields: string[];
}

// System Status
export type ServiceState =
  | 'LIVE'
  | 'ERROR'
  | 'WARNING'
  | 'NOT_CONFIGURED'
  | 'UNREACHABLE'
  | 'AUTH_ERROR'
  | 'DATABASE_ERROR'
  | 'QUOTA_LIMITED'
  | 'SCHEMA_MISMATCH';

export interface SystemStatusResponse {
  application: {
    name: string;
    version: string;
    environment: string;
    status: ServiceState;
  };
  gemini: {
    status: ServiceState;
    model: string;
    latencyMs?: number;
    error?: string;
  };
  supabase: {
    status: ServiceState;
    reachable: boolean;
    connectionStatus?: ServiceState;
    schemaStatus?: 'HEALTHY' | 'SCHEMA_MISMATCH' | 'ERROR' | 'NOT_CONFIGURED';
    latencyMs?: number;
    schemaDetails?: {
      missingTables: string[];
      missingColumns: Array<{ table: string; column: string }>;
      missingFunctions: string[];
      remedy: string;
    };
    error?: string;
  };
  authentication: {
    adminKeyConfigured: boolean;
  };
  timestamp: string;
}

// Standard API Error
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

// Authentication & Roles
export type UserRole = 'viewer' | 'reviewer' | 'admin';

export interface UserProfile {
  id: string;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthContextUser {
  id: string;
  email?: string;
  role: UserRole;
  displayName: string;
  isActive: boolean;
}

// Benchmark & Scoring System Contracts
export type DirectionType = 'higher_is_better' | 'lower_is_better' | 'binary' | 'custom';
export type NormalizationMethod = 'fixed_range' | 'percentile' | 'target' | 'binary' | 'custom';
export type AggregationMethod = 'mean' | 'median' | 'best' | 'latest' | 'max' | 'min';
export type MetricSourceType = 'configuration' | 'benchmark' | 'gaming' | 'thermal' | 'display' | 'battery';
export type ScoreStatus = 'calculated' | 'stale' | 'insufficient_data' | 'error';
export type ScoreEligibilityStatus = 'used' | 'excluded' | 'missing' | 'not_comparable' | 'invalid';

export interface BenchmarkDefinition {
  id: string;
  benchmark_key: string;
  name: string;
  version: string | null;
  variant: string | null;
  category: BenchmarkCategory;
  unit: string | null;
  direction: DirectionType;
  description: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ScoringMetricDefinition {
  id: string;
  metric_key: string;
  name: string;
  description: string | null;
  domain: string;
  source_type: MetricSourceType;
  source_key: string;
  unit: string | null;
  direction: DirectionType;
  normalization_method: NormalizationMethod;
  fixed_min: number | null;
  fixed_max: number | null;
  target_value: number | null;
  aggregation_method: AggregationMethod;
  comparability_key: string | null;
  version: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ScoringProfileMetric {
  id?: string;
  profile_id: string;
  metric_id: string;
  weight: number;
  is_required: boolean;
  weight_override?: number | null;
  metric?: ScoringMetricDefinition;
  created_at?: string;
  updated_at?: string;
}

export interface ScoringProfile {
  id: string;
  profile_key: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  minimum_coverage_percent: number;
  metrics?: ScoringProfileMetric[];
  created_at?: string;
  updated_at?: string;
}

export interface ConfigurationScoreDetail {
  id?: string;
  configuration_score_id?: string;
  metric_id: string;
  metric_name?: string;
  metric_domain?: string;
  raw_value: number | null;
  normalized_score: number | null;
  weight: number;
  effective_percentage?: number;
  weighted_contribution: number | null;
  unit: string | null;
  source_type: string | null;
  source_id?: string | null;
  review_source_id?: string | null;
  reviewer_name?: string | null;
  timestamp_display?: string | null;
  comparability_key: string | null;
  eligibility_status: ScoreEligibilityStatus;
  exclusion_reason: string | null;
  created_at?: string;
}

export interface ConfigurationScore {
  id: string;
  configuration_id: string;
  profile_id: string;
  profile_key?: string;
  profile_name?: string;
  profile_version?: number;
  score: number | null;
  coverage_percent: number | null;
  metrics_used: number;
  metrics_available: number;
  status: ScoreStatus;
  calculated_at: string | null;
  calculation_version: number | null;
  error_message: string | null;
  details?: ConfigurationScoreDetail[];
  created_at?: string;
  updated_at?: string;
}

export interface ScoringDiagnostics {
  status: 'READY' | 'ERROR' | 'NOT_CONFIGURED';
  metricsCount: number;
  profilesCount: number;
  activeProfilesCount: number;
  staleScoresCount: number;
  lastRecalculationAt: string | null;
  lastError: string | null;
}

// Gemini Model Discovery & Health
export type ModelHealthStatus =
  | 'available'
  | 'quota_limited'
  | 'auth_error'
  | 'unavailable'
  | 'checking'
  | 'unsupported';

export interface GeminiModelInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportsGenerateContent: boolean;
  videoCapability: 'VERIFIED' | 'CAPABILITY_UNVERIFIED' | 'UNSUPPORTED';
  supportsStructuredJson: boolean;
  releaseClass: 'stable' | 'preview' | 'experimental';
  status?: ModelHealthStatus;
  latencyMs?: number;
  lastTestedAt?: string;
  error?: string;
}
