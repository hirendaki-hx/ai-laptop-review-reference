import type {
  BenchmarkResult,
  GamingResult,
  ThermalResult,
  DisplayResult,
  BatteryResult,
  EvidenceRecord,
  ExtractedDataPayload,
  ExtractionMetadata,
} from '../../../shared/types/index.ts';
import { DEFAULT_EMPTY_DISPLAY, DEFAULT_EMPTY_BATTERY } from '../../../shared/schemas/extraction.ts';

/**
 * Normalizes text strings for consistent deduplication comparisons
 */
function normalizeStr(val?: string | null): string {
  if (!val) return '';
  return val
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Generates a composite unique key for benchmark results to preserve distinct variants,
 * versions, power modes, and categories without collapsing them.
 */
export function getBenchmarkCompositeKey(b: BenchmarkResult): string {
  const group = normalizeStr(b.benchmark_group);
  const version = normalizeStr(b.benchmark_version);
  const variant = normalizeStr(b.variant);
  const power = normalizeStr(b.power_mode);
  const category = normalizeStr(b.category);
  const scoreType = normalizeStr(b.score_type);
  return `${group}|${version}|${variant}|${power}|${category}|${scoreType}`;
}

/**
 * Generates a composite unique key for gaming results to preserve distinct resolutions,
 * presets, ray tracing states, upscaling modes, and frame generation settings.
 */
export function getGamingCompositeKey(g: GamingResult): string {
  const game = normalizeStr(g.game);
  const res = normalizeStr(g.resolution);
  const preset = normalizeStr(g.preset);
  const rt = g.ray_tracing === true ? 'rt1' : g.ray_tracing === false ? 'rt0' : 'rtnull';
  const up = g.upscaling === true ? 'up1' : g.upscaling === false ? 'up0' : 'upnull';
  const upMode = normalizeStr(g.upscaling_mode);
  const fg = g.frame_generation === true ? 'fg1' : g.frame_generation === false ? 'fg0' : 'fgnull';
  const power = normalizeStr(g.power_mode);
  const gpuMode = normalizeStr(g.gpu_mode);
  return `${game}|${res}|${preset}|${rt}|${up}|${upMode}|${fg}|${power}|${gpuMode}`;
}

/**
 * Generates a composite unique key for thermal tests.
 */
export function getThermalCompositeKey(t: ThermalResult): string {
  const name = normalizeStr(t.test_name);
  const dur = t.duration_minutes != null ? String(t.duration_minutes) : '';
  const power = normalizeStr(t.power_mode);
  return `${name}|${dur}|${power}`;
}

/**
 * Generates a composite unique key for display measurements.
 */
export function getDisplayCompositeKey(d: DisplayResult): string {
  const testName = normalizeStr(d.test_name);
  const sdr = d.brightness_sdr_nits != null ? String(d.brightness_sdr_nits) : '';
  const srgb = d.srgb_percent != null ? String(d.srgb_percent) : '';
  const p3 = d.dci_p3_percent != null ? String(d.dci_p3_percent) : '';
  return `${testName}|${sdr}|${srgb}|${p3}`;
}

/**
 * Generates a composite unique key for battery tests.
 */
export function getBatteryCompositeKey(b: BatteryResult): string {
  const method = normalizeStr(b.test_method);
  const gpu = normalizeStr(b.gpu_mode);
  const hours = b.battery_life_hours != null ? String(b.battery_life_hours) : '';
  const chargeW = b.charging_adapter_w != null ? String(b.charging_adapter_w) : '';
  return `${method}|${gpu}|${hours}|${chargeW}`;
}

/**
 * Deterministically merges partial multi-pass extraction outputs into a pristine ExtractedDataPayload.
 * Never invents values, never turns missing scores to 0, and preserves distinct test conditions.
 */
export function mergeExtractionPasses(params: {
  identityAndSpecs?: Partial<ExtractedDataPayload>;
  benchmarks?: BenchmarkResult[];
  gaming?: GamingResult[];
  thermals?: ThermalResult[];
  displayResults?: DisplayResult[];
  batteryResults?: BatteryResult[];
  auditAdditions?: {
    benchmarks?: BenchmarkResult[];
    gaming?: GamingResult[];
    thermals?: ThermalResult[];
    displayResults?: DisplayResult[];
    batteryResults?: BatteryResult[];
    evidence?: EvidenceRecord[];
  };
  evidence?: EvidenceRecord[];
  meta: {
    passesCompleted: number;
    discoveredSegments: number;
    processingMode: string;
    sourceVideoAccess: 'full' | 'partial' | 'failed';
    completenessNotes?: string | null;
  };
}): ExtractedDataPayload {
  const baseLaptop = params.identityAndSpecs?.laptop || { brand: 'Unknown', model: 'Unknown' };
  const baseConfig = params.identityAndSpecs?.configuration || {};
  const baseMeta = params.identityAndSpecs?.review_meta || {
    title: 'Untitled Review',
    reviewer: 'Unknown Reviewer',
    verdict_pros: [],
    verdict_cons: [],
  };

  // 1. Merge Benchmarks with composite key deduplication
  const benchmarkMap = new Map<string, BenchmarkResult>();

  const processBenchmark = (b: BenchmarkResult) => {
    if (!b || !b.benchmark_group || b.score == null || isNaN(b.score)) return;
    const key = getBenchmarkCompositeKey(b);
    if (!benchmarkMap.has(key)) {
      benchmarkMap.set(key, { ...b });
    } else {
      // If duplicate key exists, merge notes or evidence if previous lacked it
      const existing = benchmarkMap.get(key)!;
      if (!existing.notes && b.notes) existing.notes = b.notes;
      if (!existing.evidence && b.evidence) existing.evidence = b.evidence;
      if (!existing.settings_notes && b.settings_notes) existing.settings_notes = b.settings_notes;
    }
  };

  (params.benchmarks || []).forEach(processBenchmark);
  (params.auditAdditions?.benchmarks || []).forEach(processBenchmark);

  const mergedBenchmarks = Array.from(benchmarkMap.values());

  // 2. Merge Gaming Results with composite key deduplication
  const gamingMap = new Map<string, GamingResult>();

  const processGaming = (g: GamingResult) => {
    if (!g || !g.game) return;
    const key = getGamingCompositeKey(g);
    if (!gamingMap.has(key)) {
      gamingMap.set(key, { ...g });
    } else {
      const existing = gamingMap.get(key)!;
      // Preserve richest available FPS data
      if (existing.avg_fps == null && g.avg_fps != null) existing.avg_fps = g.avg_fps;
      if (existing.one_percent_low_fps == null && g.one_percent_low_fps != null)
        existing.one_percent_low_fps = g.one_percent_low_fps;
      if (existing.zero_point_one_percent_low_fps == null && g.zero_point_one_percent_low_fps != null)
        existing.zero_point_one_percent_low_fps = g.zero_point_one_percent_low_fps;
      if (existing.minimum_fps == null && g.minimum_fps != null)
        existing.minimum_fps = g.minimum_fps;
      if (!existing.notes && g.notes) existing.notes = g.notes;
      if (!existing.evidence && g.evidence) existing.evidence = g.evidence;
    }
  };

  (params.gaming || []).forEach(processGaming);
  (params.auditAdditions?.gaming || []).forEach(processGaming);

  const mergedGaming = Array.from(gamingMap.values());

  // 3. Merge Thermal Results
  const thermalMap = new Map<string, ThermalResult>();

  const processThermal = (t: ThermalResult) => {
    if (!t || !t.test_name) return;
    const key = getThermalCompositeKey(t);
    if (!thermalMap.has(key)) {
      thermalMap.set(key, { ...t });
    } else {
      const existing = thermalMap.get(key)!;
      if (existing.cpu_peak_c == null && t.cpu_peak_c != null) existing.cpu_peak_c = t.cpu_peak_c;
      if (existing.cpu_avg_c == null && t.cpu_avg_c != null) existing.cpu_avg_c = t.cpu_avg_c;
      if (existing.gpu_peak_c == null && t.gpu_peak_c != null) existing.gpu_peak_c = t.gpu_peak_c;
      if (existing.gpu_avg_c == null && t.gpu_avg_c != null) existing.gpu_avg_c = t.gpu_avg_c;
      if (existing.cpu_avg_power_w == null && t.cpu_avg_power_w != null)
        existing.cpu_avg_power_w = t.cpu_avg_power_w;
      if (existing.gpu_avg_power_w == null && t.gpu_avg_power_w != null)
        existing.gpu_avg_power_w = t.gpu_avg_power_w;
      if (!existing.notes && t.notes) existing.notes = t.notes;
    }
  };

  (params.thermals || []).forEach(processThermal);
  (params.auditAdditions?.thermals || []).forEach(processThermal);

  const mergedThermals = Array.from(thermalMap.values());

  // 4. Merge Display Results
  const displayMap = new Map<string, DisplayResult>();

  const processDisplay = (d: DisplayResult) => {
    if (!d) return;
    const key = getDisplayCompositeKey(d);
    if (!displayMap.has(key)) {
      displayMap.set(key, { ...d });
    }
  };

  (params.displayResults || []).forEach(processDisplay);
  if (params.identityAndSpecs?.display) processDisplay(params.identityAndSpecs.display);
  (params.auditAdditions?.displayResults || []).forEach(processDisplay);

  const mergedDisplayResults = Array.from(displayMap.values());
  const primaryDisplay: DisplayResult =
    mergedDisplayResults.length > 0 ? mergedDisplayResults[0] : { ...DEFAULT_EMPTY_DISPLAY };

  // 5. Merge Battery Results
  const batteryMap = new Map<string, BatteryResult>();

  const processBattery = (b: BatteryResult) => {
    if (!b) return;
    const key = getBatteryCompositeKey(b);
    if (!batteryMap.has(key)) {
      batteryMap.set(key, { ...b });
    }
  };

  (params.batteryResults || []).forEach(processBattery);
  if (params.identityAndSpecs?.battery) processBattery(params.identityAndSpecs.battery);
  (params.auditAdditions?.batteryResults || []).forEach(processBattery);

  const mergedBatteryResults = Array.from(batteryMap.values());
  const primaryBattery: BatteryResult =
    mergedBatteryResults.length > 0 ? mergedBatteryResults[0] : { ...DEFAULT_EMPTY_BATTERY };

  // 6. Merge Evidence with deduplication
  const evidenceMap = new Map<string, EvidenceRecord>();

  const processEvidence = (ev: EvidenceRecord) => {
    if (!ev || !ev.field_path || !ev.evidence_description) return;
    const key = `${ev.field_path}|${ev.timestamp_seconds ?? ''}|${normalizeStr(ev.evidence_description)}`;
    if (!evidenceMap.has(key)) {
      evidenceMap.set(key, { ...ev });
    }
  };

  (params.evidence || []).forEach(processEvidence);
  (params.identityAndSpecs?.evidence || []).forEach(processEvidence);
  (params.auditAdditions?.evidence || []).forEach(processEvidence);

  // Extract nested evidence attached to benchmarks, games, thermals
  mergedBenchmarks.forEach(b => {
    if (b.evidence) processEvidence(b.evidence);
  });
  mergedGaming.forEach(g => {
    if (g.evidence) processEvidence(g.evidence);
  });
  mergedThermals.forEach(t => {
    if (t.evidence) processEvidence(t.evidence);
  });
  mergedDisplayResults.forEach(d => {
    if (d.evidence) processEvidence(d.evidence);
  });
  mergedBatteryResults.forEach(b => {
    if (b.evidence) processEvidence(b.evidence);
  });

  const mergedEvidence = Array.from(evidenceMap.values());

  const auditAdditionsCount =
    (params.auditAdditions?.benchmarks?.length || 0) +
    (params.auditAdditions?.gaming?.length || 0) +
    (params.auditAdditions?.thermals?.length || 0) +
    (params.auditAdditions?.displayResults?.length || 0) +
    (params.auditAdditions?.batteryResults?.length || 0);

  const extractionMeta: ExtractionMetadata = {
    extraction_version: '2.5.0-exhaustive',
    processing_mode: params.meta.processingMode || 'multi_pass_video',
    passes_completed: params.meta.passesCompleted,
    discovered_segments: params.meta.discoveredSegments,
    benchmark_count: mergedBenchmarks.length,
    gaming_count: mergedGaming.length,
    thermal_test_count: mergedThermals.length,
    display_test_count: mergedDisplayResults.length,
    battery_test_count: mergedBatteryResults.length,
    evidence_count: mergedEvidence.length,
    audit_additions_count: auditAdditionsCount,
    source_video_access: params.meta.sourceVideoAccess,
    completeness_notes: params.meta.completenessNotes || null,
  };

  return {
    laptop: {
      brand: baseLaptop.brand || 'Unknown',
      model: baseLaptop.model || 'Unknown',
      series: baseLaptop.series || null,
      generation: baseLaptop.generation || null,
    },
    configuration: {
      cpu: baseConfig.cpu || null,
      gpu: baseConfig.gpu || null,
      gpu_tgp_w: baseConfig.gpu_tgp_w || null,
      ram_gb: baseConfig.ram_gb || null,
      ram_speed_mt_s: baseConfig.ram_speed_mt_s || null,
      storage_gb: baseConfig.storage_gb || null,
      storage_type: baseConfig.storage_type || null,
      display_size_inch: baseConfig.display_size_inch || null,
      display_resolution: baseConfig.display_resolution || null,
      refresh_rate_hz: baseConfig.refresh_rate_hz || null,
      panel_type: baseConfig.panel_type || null,
      battery_wh: baseConfig.battery_wh || null,
      weight_kg: baseConfig.weight_kg || null,
      thickness_mm: baseConfig.thickness_mm || null,
    },
    review_meta: {
      title: baseMeta.title || 'Untitled Review',
      reviewer: baseMeta.reviewer || 'Unknown Reviewer',
      published_date: baseMeta.published_date || null,
      verdict_summary: baseMeta.verdict_summary || null,
      verdict_score: baseMeta.verdict_score != null ? baseMeta.verdict_score : null,
      verdict_pros: Array.isArray(baseMeta.verdict_pros) ? baseMeta.verdict_pros : [],
      verdict_cons: Array.isArray(baseMeta.verdict_cons) ? baseMeta.verdict_cons : [],
    },
    benchmarks: mergedBenchmarks,
    gaming: mergedGaming,
    thermals: mergedThermals,
    display: primaryDisplay,
    battery: primaryBattery,
    display_results: mergedDisplayResults,
    battery_results: mergedBatteryResults,
    evidence: mergedEvidence,
    extraction_meta: extractionMeta,
  };
}
