import { mergeExtractionPasses, getBenchmarkCompositeKey, getGamingCompositeKey } from './deterministicMerge.ts';
import { normalizeExtractionInput, ExtractedDataPayloadSchema } from '../../../shared/schemas/extraction.ts';

/**
 * Realistic Fixture A: Full Gaming Laptop Review (e.g. Legion Pro 7i with 8 games, 6 benchmarks, 2 thermal loops, display lab, battery test)
 */
export const FIXTURE_A_FULL_GAMING = {
  identityAndSpecs: {
    laptop: {
      brand: 'Lenovo',
      model: 'Legion Pro 7i',
      series: 'Legion Pro',
      generation: 'Gen 9 (2024)',
    },
    configuration: {
      cpu: 'Intel Core i9-14900HX',
      gpu: 'NVIDIA GeForce RTX 4080 Laptop GPU',
      gpu_tgp_w: 175,
      ram_gb: 32,
      ram_speed_mt_s: 5600,
      storage_gb: 1000,
      storage_type: 'PCIe 4.0 NVMe SSD',
      display_size_inch: 16.0,
      display_resolution: '2560x1600',
      refresh_rate_hz: 240,
      panel_type: 'IPS',
      battery_wh: 99.9,
      weight_kg: 2.62,
      thickness_mm: 25.9,
    },
    review_meta: {
      title: 'Lenovo Legion Pro 7i Gen 9 (2024) In-Depth Review & Benchmarks',
      reviewer: 'Jarrod Tech',
      published_date: '2024-03-15',
      verdict_summary: 'Exceptional sustained gaming performance and keyboard ergonomics, slightly loud fans in Performance mode.',
      verdict_score: 9.1,
      verdict_pros: ['Top tier GPU wattage (175W)', 'Bright 240Hz screen', 'Excellent thermal headroom'],
      verdict_cons: ['Heavy power brick', 'Fan noise under full load'],
    },
  },
  benchmarks: [
    {
      benchmark_group: 'Cinebench',
      benchmark_version: 'R23',
      variant: 'Multi-Core',
      category: 'cpu' as const,
      score: 33450,
      unit: 'pts',
      power_mode: 'Custom / Performance',
      confidence: 'high' as const,
    },
    {
      benchmark_group: 'Cinebench',
      benchmark_version: 'R23',
      variant: 'Single-Core',
      category: 'cpu' as const,
      score: 2180,
      unit: 'pts',
      power_mode: 'Custom / Performance',
      confidence: 'high' as const,
    },
    {
      benchmark_group: '3DMark',
      benchmark_version: 'Time Spy',
      variant: 'Graphics Score',
      category: 'gpu' as const,
      score: 19420,
      unit: 'pts',
      power_mode: 'Performance',
      confidence: 'high' as const,
    },
    {
      benchmark_group: '3DMark',
      benchmark_version: 'Time Spy',
      variant: 'CPU Score',
      category: 'cpu' as const,
      score: 16100,
      unit: 'pts',
      power_mode: 'Performance',
      confidence: 'high' as const,
    },
  ],
  gaming: [
    {
      game: 'Cyberpunk 2077',
      resolution: '2560x1600',
      preset: 'Ultra',
      ray_tracing: false,
      upscaling: false,
      upscaling_mode: 'Native',
      avg_fps: 78.4,
      one_percent_low_fps: 61.2,
    },
    {
      game: 'Cyberpunk 2077',
      resolution: '2560x1600',
      preset: 'Ray Tracing Ultra',
      ray_tracing: true,
      upscaling: true,
      upscaling_mode: 'DLSS Quality',
      frame_generation: true,
      avg_fps: 94.6,
      one_percent_low_fps: 74.0,
    },
    {
      game: 'Shadow of the Tomb Raider',
      resolution: '2560x1600',
      preset: 'Highest',
      ray_tracing: false,
      upscaling: false,
      avg_fps: 142.0,
      one_percent_low_fps: 110.5,
    },
  ],
  thermals: [
    {
      test_name: 'Cinebench R23 10-Minute Stress',
      duration_minutes: 10,
      cpu_peak_c: 96,
      cpu_avg_c: 88,
      cpu_avg_power_w: 140,
      gpu_peak_c: null,
      keyboard_max_c: 38.2,
      fan_noise_db: 51.5,
    },
  ],
  displayResults: [
    {
      test_name: 'Factory SDR Calibration',
      brightness_sdr_nits: 520,
      srgb_percent: 100,
      dci_p3_percent: 74.2,
      response_time_ms: 3.2,
      g_sync: true,
      vrr: true,
    },
  ],
  batteryResults: [
    {
      test_method: '1080p YouTube Video Loop 150 nits',
      battery_life_hours: 5.8,
      gpu_mode: 'iGPU Eco Mode',
      charging_adapter_w: 330,
      zero_to_fifty_min: 24,
    },
  ],
};

/**
 * Realistic Fixture B: Ultrabook with Missing Gaming and Missing Thermals (e.g. MacBook Air or Zenbook)
 * Checks that missing sections do NOT fail validation and do NOT invent scores.
 */
export const FIXTURE_B_ULTRABOOK_NO_GAMING = {
  identityAndSpecs: {
    laptop: {
      brand: 'Apple',
      model: 'MacBook Air 15',
      series: 'MacBook Air',
      generation: 'M3 (2024)',
    },
    configuration: {
      cpu: 'Apple M3 (8-Core CPU, 10-Core GPU)',
      ram_gb: 16,
      storage_gb: 512,
      display_size_inch: 15.3,
      display_resolution: '2880x1864',
      panel_type: 'Liquid Retina IPS',
      battery_wh: 66.5,
      weight_kg: 1.51,
      thickness_mm: 11.5,
    },
    review_meta: {
      title: '15-inch M3 MacBook Air Review: The Sweet Spot',
      reviewer: 'The Verge',
      verdict_summary: 'Sleek chassis, silent fanless operation, and class-leading battery life.',
      verdict_score: 9.0,
      verdict_pros: ['Fanless completely silent', '15+ hour battery', 'Terrific trackpad and build'],
      verdict_cons: ['Only 2 Thunderbolt ports', '60Hz display'],
    },
  },
  benchmarks: [
    {
      benchmark_group: 'Geekbench',
      benchmark_version: '6',
      variant: 'Single-Core',
      category: 'cpu' as const,
      score: 3120,
    },
    {
      benchmark_group: 'Geekbench',
      benchmark_version: '6',
      variant: 'Multi-Core',
      category: 'cpu' as const,
      score: 12050,
    },
  ],
  gaming: [],
  thermals: [],
  displayResults: [
    {
      brightness_sdr_nits: 505,
      srgb_percent: 100,
      dci_p3_percent: 98.5,
    },
  ],
  batteryResults: [
    {
      test_method: 'Web browsing battery test',
      battery_life_hours: 15.2,
    },
  ],
};

/**
 * Fixture validation runner
 */
export function runFixtureSelfTest(): {
  fixtureAPassed: boolean;
  fixtureBPassed: boolean;
  dedupCheckPassed: boolean;
} {
  // Test A
  const mergedA = mergeExtractionPasses({
    ...FIXTURE_A_FULL_GAMING,
    meta: {
      passesCompleted: 5,
      discoveredSegments: 6,
      processingMode: 'multi_pass_deep',
      sourceVideoAccess: 'full',
    },
  });
  const normA = normalizeExtractionInput(mergedA);
  const valA = ExtractedDataPayloadSchema.safeParse(normA);

  // Test B (Missing gaming & thermals)
  const mergedB = mergeExtractionPasses({
    ...FIXTURE_B_ULTRABOOK_NO_GAMING,
    meta: {
      passesCompleted: 4,
      discoveredSegments: 3,
      processingMode: 'multi_pass_standard',
      sourceVideoAccess: 'full',
    },
  });
  const normB = normalizeExtractionInput(mergedB);
  const valB = ExtractedDataPayloadSchema.safeParse(normB);

  // Test Deduplication
  const key1 = getBenchmarkCompositeKey({
    benchmark_group: 'Cinebench',
    benchmark_version: 'R23',
    variant: 'Multi-Core',
    category: 'cpu',
    score: 30000,
  });
  const key2 = getBenchmarkCompositeKey({
    benchmark_group: 'Cinebench',
    benchmark_version: 'R23',
    variant: 'Single-Core',
    category: 'cpu',
    score: 2000,
  });
  const dedupCheckPassed = key1 !== key2;

  return {
    fixtureAPassed: valA.success,
    fixtureBPassed: valB.success,
    dedupCheckPassed,
  };
}
