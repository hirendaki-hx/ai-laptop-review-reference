export type BenchmarkCategory =
  | 'cpu'
  | 'gpu'
  | 'rendering'
  | 'ai'
  | 'storage'
  | 'system'
  | 'productivity';

export interface LaptopIdentity {
  brand: string;
  model: string;
  series: string | null;
  generation: string | null;
}

export interface ConfigurationData {
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
}

export interface ReviewMeta {
  title: string;
  reviewer: string;
  published_date: string | null;
  verdict_summary: string | null;
  verdict_score: number | null;
  verdict_pros: string[];
  verdict_cons: string[];
}

export interface BenchmarkItem {
  id?: string;
  benchmark_group: string;
  variant: string | null;
  category: BenchmarkCategory;
  score: number;
  unit: string | null;
  power_mode: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

export interface GamingItem {
  id?: string;
  game: string;
  resolution: string | null;
  preset: string | null;
  ray_tracing: boolean | null;
  upscaling: boolean | null;
  upscaling_mode: string | null;
  avg_fps: number | null;
  one_percent_low_fps: number | null;
  notes: string | null;
}

export interface ThermalItem {
  id?: string;
  test_name: string;
  duration_minutes: number | null;
  cpu_peak_c: number | null;
  cpu_avg_c: number | null;
  cpu_peak_power_w: number | null;
  cpu_avg_power_w: number | null;
  gpu_peak_c: number | null;
  gpu_avg_c: number | null;
  keyboard_min_c: number | null;
  keyboard_max_c: number | null;
  notes: string | null;
}

export interface DisplayData {
  brightness_sdr_nits: number | null;
  brightness_hdr_nits: number | null;
  srgb_percent: number | null;
  dci_p3_percent: number | null;
  adobe_rgb_percent: number | null;
  response_time_ms: number | null;
  g_sync: boolean | null;
  vrr: boolean | null;
  notes: string | null;
}

export interface BatteryData {
  battery_life_hours: number | null;
  test_method: string | null;
  brightness_percent: number | null;
  gpu_mode: string | null;
  charging_adapter_w: number | null;
  zero_to_fifty_min: number | null;
  full_charge_min: number | null;
  usb_c_charging_w: number | null;
  notes: string | null;
}

export interface ExtractionData {
  laptop: LaptopIdentity;
  configuration: ConfigurationData;
  review_meta: ReviewMeta;
  benchmarks: BenchmarkItem[];
  gaming: GamingItem[];
  thermals: ThermalItem[];
  display: DisplayData;
  battery: BatteryData;
}

export type ExtractionJobStatus =
  | 'pending'
  | 'processing'
  | 'ready_for_review'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'duplicate';

export interface ExtractionJob {
  id: string;
  youtube_url: string;
  youtube_video_id: string;
  status: ExtractionJobStatus;
  raw_extraction: ExtractionData | null;
  error_message: string | null;
  review_source_id: string | null;
  created_at: string;
  existingReviewId?: string | null;
  existingLaptopName?: string | null;
}

// Database Entities
export interface BrandEntity {
  id: string;
  name: string;
}

export interface LaptopEntity {
  id: string;
  brand_id: string;
  model: string;
  series: string | null;
  generation: string | null;
  brand?: BrandEntity;
}

export interface ConfigurationEntity extends ConfigurationData {
  id: string;
  laptop_id: string;
  created_at?: string;
}

export interface ReviewSourceEntity extends ReviewMeta {
  id: string;
  configuration_id: string;
  youtube_url: string;
  youtube_video_id: string;
  raw_data: {
    raw_extraction?: ExtractionData;
    edited_extraction?: ExtractionData;
  };
  created_at?: string;
  benchmarks?: BenchmarkItem[];
  gaming?: GamingItem[];
  thermals?: ThermalItem[];
  display?: DisplayData | null;
  battery?: BatteryData | null;
}

export interface ConfigurationReport {
  configuration: ConfigurationEntity;
  laptop: LaptopEntity;
  brand: BrandEntity;
  reviews: ReviewSourceEntity[];
  siblingConfigurations: ConfigurationEntity[];
  allConfigurationsForLaptop?: ConfigurationEntity[];
  productListings?: ProductListingEntity[];
  priceHistory?: PriceHistoryEntity[];
}

export type FullConfigurationReport = ConfigurationReport;

export interface RefreshListingsResult {
  total: number;
  updated: number;
  priceChangedCount: number;
  failed: number;
  details: Array<{
    id: string;
    configurationId: string;
    retailer: Retailer;
    productUrl: string;
    oldPrice: number | null;
    newPrice: number | null;
    priceChanged: boolean;
    imageUpdated: boolean;
    error?: string | null;
  }>;
}

export interface LaptopSummary {
  laptop: LaptopEntity & { brand: BrandEntity };
  configurationsCount: number;
  reviewsCount: number;
  configurations: ConfigurationEntity[];
}

export type LaptopRow = LaptopSummary;


export type ConfigurationRow = ConfigurationEntity;
export type BenchmarkResultRow = BenchmarkItem;
export type GamingResultRow = GamingItem;
export type ThermalResultRow = ThermalItem;

export interface MatchedEntityInfo {
  brandMatched: BrandEntity | null;
  laptopMatched: LaptopEntity | null;
  matchedConfiguration: ConfigurationEntity | null;
  isExactMatch: boolean;
}

// Product Listings & Price History (Additive Schema)
export type Retailer = 'amazon' | 'flipkart';
export type ImageSource = 'auto' | 'manual';
export type PriceSource = 'auto' | 'manual';

export interface ProductListingEntity {
  id: string;
  configuration_id: string;
  retailer: Retailer;
  product_url: string;
  image_url: string | null;
  image_source: ImageSource | null;
  price_source: PriceSource | null;
  current_price: number | null;
  currency: string | null;
  in_stock: boolean | null;
  last_checked_at: string | null;
  created_at?: string;
}

export interface PriceHistoryEntity {
  id: string;
  listing_id: string;
  price: number;
  checked_at: string;
}

export interface RetailListingsInput {
  amazonUrl?: string;
  flipkartUrl?: string;
  manualImageUrl?: string;
  amazonManualPrice?: number | null;
  flipkartManualPrice?: number | null;
}

export interface RetailListingStatusResult {
  retailer: Retailer;
  productUrl: string;
  status: 'found' | 'saved_retry';
  price: number | null;
  priceSource?: PriceSource | null;
  currency: string | null;
  imageUrl: string | null;
  imageSource: ImageSource | null;
  inStock: boolean | null;
  message?: string;
}

export interface SupabaseStatusInfo {
  configured: boolean;
  reachable: boolean;
  status: 'live' | 'configured_unreachable' | 'missing';
  hasUrl: boolean;
  hasKey: boolean;
  url?: string;
  error?: string | null;
}


