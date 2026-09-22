import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  Save,
  XCircle,
  Database,
  Laptop,
  Cpu,
  Gamepad2,
  Flame,
  Monitor,
  Battery,
  Award,
  HelpCircle,
  ExternalLink,
  ShoppingCart,
  Tag,
  Image as ImageIcon,
} from 'lucide-react';
import {
  ExtractionData,
  MatchedEntityInfo,
  BenchmarkItem,
  GamingItem,
  ThermalItem,
  BenchmarkCategory,
  RetailListingStatusResult,
} from '../types.ts';
import { trackedFetch } from '../utils/trackedFetch.ts';

interface ReviewTabProps {
  jobId: string;
  initialData: ExtractionData;
  onCommitSuccess: (configId: string) => void;
  onDiscard: () => void;
}

export const ReviewTab: React.FC<ReviewTabProps> = ({
  jobId,
  initialData,
  onCommitSuccess,
  onDiscard,
}) => {
  const [data, setData] = useState<ExtractionData>(JSON.parse(JSON.stringify(initialData)));
  const [matchedInfo, setMatchedInfo] = useState<MatchedEntityInfo | null>(null);
  const [useExistingConfig, setUseExistingConfig] = useState<boolean>(false);
  const [isCheckingMatches, setIsCheckingMatches] = useState<boolean>(true);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Retail listings state (Additive)
  const [amazonUrl, setAmazonUrl] = useState<string>('');
  const [flipkartUrl, setFlipkartUrl] = useState<string>('');
  const [manualImageUrl, setManualImageUrl] = useState<string>('');
  const [amazonManualPrice, setAmazonManualPrice] = useState<string>('');
  const [flipkartManualPrice, setFlipkartManualPrice] = useState<string>('');
  const [listingStatuses, setListingStatuses] = useState<RetailListingStatusResult[] | null>(null);
  const [commitSuccessConfigId, setCommitSuccessConfigId] = useState<string | null>(null);

  // 1. Duplicate & entity match lookup on load
  useEffect(() => {
    let isMounted = true;
    async function checkMatches() {
      try {
        setIsCheckingMatches(true);
        const res = await trackedFetch(`/api/extract/${jobId}/matches`);
        if (res.ok) {
          const matchResult: MatchedEntityInfo = await res.json();
          if (!isMounted) return;
          setMatchedInfo(matchResult);
          // Default to "use existing" when match is exact on cpu + gpu + ram_gb
          if (matchResult.matchedConfiguration && matchResult.isExactMatch) {
            setUseExistingConfig(true);
          }
        }
      } catch (err) {
        console.warn('Match lookup failed:', err);
      } finally {
        if (isMounted) setIsCheckingMatches(false);
      }
    }
    checkMatches();

    return () => {
      isMounted = false;
    };
  }, [jobId]);

  // Core spec validation
  const missingSpecs: string[] = [];
  if (!data.laptop.brand?.trim()) missingSpecs.push('Brand');
  if (!data.laptop.model?.trim()) missingSpecs.push('Model');
  if (!data.configuration.cpu?.trim()) missingSpecs.push('CPU');
  if (!data.configuration.gpu?.trim()) missingSpecs.push('GPU');

  // Input helpers for top-level data
  const updateLaptop = (field: keyof typeof data.laptop, val: any) => {
    setData((prev) => ({
      ...prev,
      laptop: { ...prev.laptop, [field]: val },
    }));
  };

  const updateConfig = (field: keyof typeof data.configuration, val: any) => {
    setData((prev) => ({
      ...prev,
      configuration: { ...prev.configuration, [field]: val },
    }));
  };

  const updateDisplay = (field: keyof typeof data.display, val: any) => {
    setData((prev) => ({
      ...prev,
      display: { ...prev.display, [field]: val },
    }));
  };

  const updateBattery = (field: keyof typeof data.battery, val: any) => {
    setData((prev) => ({
      ...prev,
      battery: { ...prev.battery, [field]: val },
    }));
  };

  const updateReviewMeta = (field: keyof typeof data.review_meta, val: any) => {
    setData((prev) => ({
      ...prev,
      review_meta: { ...prev.review_meta, [field]: val },
    }));
  };

  // Benchmark handlers
  const updateBenchmark = (idx: number, field: keyof BenchmarkItem, val: any) => {
    setData((prev) => {
      const copy = [...prev.benchmarks];
      copy[idx] = { ...copy[idx], [field]: val };
      return { ...prev, benchmarks: copy };
    });
  };

  const deleteBenchmark = (idx: number) => {
    setData((prev) => ({
      ...prev,
      benchmarks: prev.benchmarks.filter((_, i) => i !== idx),
    }));
  };

  const addBenchmark = () => {
    const newItem: BenchmarkItem = {
      benchmark_group: '',
      variant: null,
      category: 'cpu',
      score: null as any,
      unit: null,
      power_mode: null,
      confidence: 'medium',
      notes: null,
    };
    setData((prev) => ({
      ...prev,
      benchmarks: [...prev.benchmarks, newItem],
    }));
  };

  // Gaming handlers
  const updateGaming = (idx: number, field: keyof GamingItem, val: any) => {
    setData((prev) => {
      const copy = [...prev.gaming];
      copy[idx] = { ...copy[idx], [field]: val };
      return { ...prev, gaming: copy };
    });
  };

  const deleteGaming = (idx: number) => {
    setData((prev) => ({
      ...prev,
      gaming: prev.gaming.filter((_, i) => i !== idx),
    }));
  };

  const addGaming = () => {
    const newItem: GamingItem = {
      game: '',
      resolution: data.configuration.display_resolution || null,
      preset: null,
      ray_tracing: false,
      upscaling: false,
      upscaling_mode: null,
      avg_fps: null,
      one_percent_low_fps: null,
      notes: null,
    };
    setData((prev) => ({
      ...prev,
      gaming: [...prev.gaming, newItem],
    }));
  };

  // Thermals handlers
  const updateThermal = (idx: number, field: keyof ThermalItem, val: any) => {
    setData((prev) => {
      const copy = [...prev.thermals];
      copy[idx] = { ...copy[idx], [field]: val };
      return { ...prev, thermals: copy };
    });
  };

  const deleteThermal = (idx: number) => {
    setData((prev) => ({
      ...prev,
      thermals: prev.thermals.filter((_, i) => i !== idx),
    }));
  };

  const addThermal = () => {
    const newItem: ThermalItem = {
      test_name: '',
      duration_minutes: null,
      cpu_peak_c: null,
      cpu_avg_c: null,
      cpu_peak_power_w: null,
      cpu_avg_power_w: null,
      gpu_peak_c: null,
      gpu_avg_c: null,
      keyboard_min_c: null,
      keyboard_max_c: null,
      notes: null,
    };
    setData((prev) => ({
      ...prev,
      thermals: [...prev.thermals, newItem],
    }));
  };

  // Commit to Supabase
  const handleConfirmAndCommit = async () => {
    setIsCommitting(true);
    setCommitError(null);

    try {
      const hasRetailListings = Boolean(
        amazonUrl.trim() || flipkartUrl.trim() || manualImageUrl.trim()
      );

      const parsedAmazonPrice = amazonManualPrice.trim() ? Number(amazonManualPrice.trim()) : undefined;
      const parsedFlipkartPrice = flipkartManualPrice.trim() ? Number(flipkartManualPrice.trim()) : undefined;

      const res = await trackedFetch(`/api/extract/${jobId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data,
          useExistingConfigId:
            useExistingConfig && matchedInfo?.matchedConfiguration?.id
              ? matchedInfo.matchedConfiguration.id
              : null,
          retailListings: hasRetailListings
            ? {
                amazonUrl: amazonUrl.trim() || undefined,
                flipkartUrl: flipkartUrl.trim() || undefined,
                manualImageUrl: manualImageUrl.trim() || undefined,
                amazonManualPrice: parsedAmazonPrice && !isNaN(parsedAmazonPrice) ? parsedAmazonPrice : undefined,
                flipkartManualPrice: parsedFlipkartPrice && !isNaN(parsedFlipkartPrice) ? parsedFlipkartPrice : undefined,
              }
            : undefined,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to commit extraction.');
      }

      if (resData.listingResults && resData.listingResults.length > 0) {
        setListingStatuses(resData.listingResults);
        setCommitSuccessConfigId(resData.configurationId);
        setIsCommitting(false);
      } else {
        setShowConfirmModal(false);
        onCommitSuccess(resData.configurationId);
      }
    } catch (err: any) {
      console.error('Commit failed:', err);
      setCommitError(err.message || 'Database write error');
      setIsCommitting(false);
    }
  };

  // Discard extraction
  const handleDiscard = async () => {
    if (!window.confirm('Are you sure you want to discard this extraction? No data will be written to the database.')) {
      return;
    }
    try {
      await trackedFetch(`/api/extract/${jobId}/discard`, { method: 'POST' });
    } catch (err) {
      console.warn('Discard failed:', err);
    }
    onDiscard();
  };

  const amazonStatus = listingStatuses?.find((l) => l.retailer === 'amazon');
  const flipkartStatus = listingStatuses?.find((l) => l.retailer === 'flipkart');

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 space-y-6 font-sans text-[#141414]" id="review-screen">
      {/* 1. Summary Strip at the top (Technical Banner) */}
      <div
        id="review-summary-strip"
        className="bg-yellow-100 border-2 border-[#141414] p-4 shadow-[4px_4px_0px_0px_#141414] flex flex-col md:flex-row md:items-center md:justify-between gap-4 font-mono"
      >
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse border border-[#141414]" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#141414]">
              VERIFICATION_REQUIRED :: Zero Auto-Writes Allowed
            </h2>
          </div>
          <p className="text-[11px] text-[#141414]/80 font-sans">
            Extracted: 1 laptop entity, 1 hardware config,{' '}
            <span className="font-bold text-[#141414] font-mono">{data.benchmarks.length} benchmarks</span>,{' '}
            <span className="font-bold text-[#141414] font-mono">{data.gaming.length} gaming FPS tests</span>,{' '}
            <span className="font-bold text-[#141414] font-mono">{data.thermals.length} thermal stress tests</span>,{' '}
            display & battery metrics. Confirm before committing to Supabase.
          </p>
        </div>

        {/* Missing Specs Indicators */}
        {missingSpecs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {missingSpecs.map((spec) => (
              <span
                key={spec}
                id={`missing-spec-${spec.toLowerCase()}`}
                className="inline-flex items-center space-x-1 px-2 py-1 bg-red-200 border border-red-700 text-red-900 text-[10px] font-mono font-bold uppercase"
              >
                <AlertTriangle className="w-3 h-3 text-red-700" />
                <span>MISSING: {spec}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-100 border border-emerald-700 text-emerald-900 text-[10px] font-mono font-bold uppercase">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>ALL_CORE_SPECS_VALIDATED</span>
          </div>
        )}
      </div>

      {/* 2. Entity Match / Duplicate Detection Inline Card */}
      {matchedInfo?.matchedConfiguration && (
        <div
          id="entity-match-card"
          className="p-4 bg-blue-50 border-2 border-blue-600 text-blue-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono shadow-[4px_4px_0px_0px_#141414]"
        >
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-blue-700" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-800">
                {matchedInfo.isExactMatch ? 'MATCH_FOUND :: Exact Existing Laptop Configuration' : 'MATCH_FOUND :: Similar Configuration Candidate'}
              </span>
            </div>
            <p className="text-xs text-[#141414] font-medium font-sans">
              Matches existing record:{' '}
              <strong className="text-blue-900 font-mono font-bold">
                {matchedInfo.brandMatched?.name} {matchedInfo.laptopMatched?.model}
              </strong>{' '}
              / {matchedInfo.matchedConfiguration.cpu} / {matchedInfo.matchedConfiguration.gpu} / {matchedInfo.matchedConfiguration.ram_gb}GB
            </p>
            <p className="text-[11px] text-blue-800/80 font-sans">
              Linking to existing configuration appends this reviewer's benchmark and thermal run alongside prior tests.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              id="use-existing-config-btn"
              type="button"
              onClick={() => setUseExistingConfig(true)}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border border-[#141414] transition-all ${
                useExistingConfig
                  ? 'bg-blue-700 text-white shadow-[2px_2px_0px_0px_#141414]'
                  : 'bg-white text-[#141414] hover:bg-gray-100'
              }`}
            >
              [✓ Attach to Existing]
            </button>
            <button
              id="different-config-btn"
              type="button"
              onClick={() => setUseExistingConfig(false)}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border border-[#141414] transition-all ${
                !useExistingConfig
                  ? 'bg-[#F27D26] text-[#141414] shadow-[2px_2px_0px_0px_#141414]'
                  : 'bg-white text-[#141414] hover:bg-gray-100'
              }`}
            >
              [Create New Config]
            </button>
          </div>
        </div>
      )}

      {/* 3. Grouped Editable Cards */}
      <div className="space-y-6">
        {/* Card 1: Laptop Identity */}
        <section className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414]" id="card-laptop-identity">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#141414]">
            <div className="flex items-center space-x-2">
              <Laptop className="w-4 h-4 text-[#141414]" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
                1.0 LAPTOP_IDENTITY (table: laptops)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-gray-500 uppercase">SCHEMA_VALIDATED</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Brand *</label>
              <input
                id="input-laptop-brand"
                type="text"
                value={data.laptop.brand || ''}
                onChange={(e) => updateLaptop('brand', e.target.value)}
                placeholder="e.g. Lenovo, ASUS, Apple"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Model *</label>
              <input
                id="input-laptop-model"
                type="text"
                value={data.laptop.model || ''}
                onChange={(e) => updateLaptop('model', e.target.value)}
                placeholder="e.g. Legion 7i, Zephyrus G16"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Series / Sub-model</label>
              <input
                id="input-laptop-series"
                type="text"
                value={data.laptop.series || ''}
                onChange={(e) => updateLaptop('series', e.target.value || null)}
                placeholder="e.g. Gen 9, GU605"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Generation / Year</label>
              <input
                id="input-laptop-generation"
                type="text"
                value={data.laptop.generation || ''}
                onChange={(e) => updateLaptop('generation', e.target.value || null)}
                placeholder="e.g. 2025"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
          </div>
        </section>

        {/* Card 2: Configuration */}
        <section className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414]" id="card-configuration">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#141414]">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-[#F27D26]" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
                2.0 HARDWARE_CONFIG (table: configurations)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-gray-500 uppercase">SPEC_CHECK</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">CPU *</label>
              <input
                id="input-config-cpu"
                type="text"
                value={data.configuration.cpu || ''}
                onChange={(e) => updateConfig('cpu', e.target.value || null)}
                placeholder="e.g. Intel Core Ultra 9 275HX"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">GPU *</label>
              <input
                id="input-config-gpu"
                type="text"
                value={data.configuration.gpu || ''}
                onChange={(e) => updateConfig('gpu', e.target.value || null)}
                placeholder="e.g. NVIDIA GeForce RTX 5070 Mobile"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">GPU TGP (Watts)</label>
              <input
                id="input-config-gpu-tgp"
                type="number"
                value={data.configuration.gpu_tgp_w ?? ''}
                onChange={(e) => updateConfig('gpu_tgp_w', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 140"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">RAM (GB)</label>
              <input
                id="input-config-ram-gb"
                type="number"
                value={data.configuration.ram_gb ?? ''}
                onChange={(e) => updateConfig('ram_gb', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 32"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">RAM Speed (MT/s)</label>
              <input
                id="input-config-ram-speed"
                type="number"
                value={data.configuration.ram_speed_mt_s ?? ''}
                onChange={(e) => updateConfig('ram_speed_mt_s', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 6400"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Storage (GB)</label>
              <input
                id="input-config-storage-gb"
                type="number"
                value={data.configuration.storage_gb ?? ''}
                onChange={(e) => updateConfig('storage_gb', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 1000"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Display Size (inches)</label>
              <input
                id="input-config-display-size"
                type="number"
                step="0.1"
                value={data.configuration.display_size_inch ?? ''}
                onChange={(e) => updateConfig('display_size_inch', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 16.0"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Resolution</label>
              <input
                id="input-config-resolution"
                type="text"
                value={data.configuration.display_resolution || ''}
                onChange={(e) => updateConfig('display_resolution', e.target.value || null)}
                placeholder="e.g. 2560x1600"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Refresh Rate (Hz)</label>
              <input
                id="input-config-refresh-rate"
                type="number"
                value={data.configuration.refresh_rate_hz ?? ''}
                onChange={(e) => updateConfig('refresh_rate_hz', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 240"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Panel Type</label>
              <input
                id="input-config-panel-type"
                type="text"
                value={data.configuration.panel_type || ''}
                onChange={(e) => updateConfig('panel_type', e.target.value || null)}
                placeholder="e.g. IPS, OLED, Mini-LED"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Battery (Wh)</label>
              <input
                id="input-config-battery-wh"
                type="number"
                step="0.1"
                value={data.configuration.battery_wh ?? ''}
                onChange={(e) => updateConfig('battery_wh', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 99.9"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Weight (kg)</label>
              <input
                id="input-config-weight-kg"
                type="number"
                step="0.01"
                value={data.configuration.weight_kg ?? ''}
                onChange={(e) => updateConfig('weight_kg', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 2.24"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs sm:text-sm font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
          </div>
        </section>

        {/* Card 3: Benchmarks */}
        <section className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414]" id="card-benchmarks">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#141414]">
            <div className="flex items-center space-x-2">
              <Award className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
                3.0 BENCHMARK_RESULTS ({data.benchmarks.length}) (table: benchmark_results)
              </h3>
            </div>
            <button
              id="add-benchmark-btn"
              type="button"
              onClick={addBenchmark}
              className="inline-flex items-center space-x-1 px-3 py-1 bg-white hover:bg-[#EBEAE7] border border-[#141414] text-[10px] font-mono uppercase font-bold text-[#141414]"
            >
              <Plus className="w-3 h-3 text-[#141414]" />
              <span>[+ Add Benchmark]</span>
            </button>
          </div>

          {data.benchmarks.length === 0 ? (
            <p className="text-xs text-gray-500 italic py-4 text-center font-mono">No benchmark items detected. Click "[+ Add Benchmark]" to insert.</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-12 text-[9px] uppercase font-bold text-gray-500 px-3 py-1 border-b border-[#141414]/20 font-mono">
                <span className="col-span-3">Benchmark Suite</span>
                <span className="col-span-2">Variant</span>
                <span className="col-span-2">Category</span>
                <span className="col-span-2">Score</span>
                <span className="col-span-2">Power Mode</span>
                <span className="col-span-1 text-right">Del</span>
              </div>
              {data.benchmarks.map((bm, idx) => (
                <div
                  key={idx}
                  id={`benchmark-row-${idx}`}
                  className="p-2.5 bg-white border border-[#141414]/30 hover:border-[#141414] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs font-mono"
                >
                  <div className="sm:col-span-3">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Suite</label>
                    <input
                      type="text"
                      value={bm.benchmark_group}
                      onChange={(e) => updateBenchmark(idx, 'benchmark_group', e.target.value)}
                      placeholder="e.g. Cinebench R23"
                      className="w-full bg-[#F9F8F6] border border-[#141414]/50 px-2 py-1 text-xs font-bold text-[#141414] outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Variant</label>
                    <input
                      type="text"
                      value={bm.variant || ''}
                      onChange={(e) => updateBenchmark(idx, 'variant', e.target.value || null)}
                      placeholder="Single/Multi-Core"
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Category</label>
                    <select
                      value={bm.category}
                      onChange={(e) => updateBenchmark(idx, 'category', e.target.value as BenchmarkCategory)}
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    >
                      <option value="cpu">CPU</option>
                      <option value="gpu">GPU</option>
                      <option value="rendering">Rendering</option>
                      <option value="ai">AI</option>
                      <option value="storage">Storage</option>
                      <option value="system">System</option>
                      <option value="productivity">Productivity</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Score</label>
                    <input
                      type="number"
                      value={bm.score ?? ''}
                      onChange={(e) => updateBenchmark(idx, 'score', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="Score"
                      className="w-full bg-[#F2F1EE] border border-[#141414] px-2 py-1 text-xs font-bold text-[#141414] outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Power Mode</label>
                    <input
                      type="text"
                      value={bm.power_mode || ''}
                      onChange={(e) => updateBenchmark(idx, 'power_mode', e.target.value || null)}
                      placeholder="e.g. Performance"
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => deleteBenchmark(idx)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete benchmark"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Card 4: Gaming */}
        <section className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414]" id="card-gaming">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#141414]">
            <div className="flex items-center space-x-2">
              <Gamepad2 className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
                4.0 GAMING_FPS_TESTS ({data.gaming.length}) (table: gaming_results)
              </h3>
            </div>
            <button
              id="add-gaming-btn"
              type="button"
              onClick={addGaming}
              className="inline-flex items-center space-x-1 px-3 py-1 bg-white hover:bg-[#EBEAE7] border border-[#141414] text-[10px] font-mono uppercase font-bold text-[#141414]"
            >
              <Plus className="w-3 h-3 text-[#141414]" />
              <span>[+ Add Game Test]</span>
            </button>
          </div>

          {data.gaming.length === 0 ? (
            <p className="text-xs text-gray-500 italic py-4 text-center font-mono">No gaming tests detected.</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-12 text-[9px] uppercase font-bold text-gray-500 px-3 py-1 border-b border-[#141414]/20 font-mono">
                <span className="col-span-3">Game Title</span>
                <span className="col-span-2">Resolution</span>
                <span className="col-span-2">Preset</span>
                <span className="col-span-2">Avg FPS</span>
                <span className="col-span-2">1% Low</span>
                <span className="col-span-1 text-right">Del</span>
              </div>
              {data.gaming.map((gm, idx) => (
                <div
                  key={idx}
                  id={`gaming-row-${idx}`}
                  className="p-2.5 bg-white border border-[#141414]/30 hover:border-[#141414] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs font-mono"
                >
                  <div className="sm:col-span-3">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Game</label>
                    <input
                      type="text"
                      value={gm.game}
                      onChange={(e) => updateGaming(idx, 'game', e.target.value)}
                      placeholder="e.g. Cyberpunk 2077"
                      className="w-full bg-[#F9F8F6] border border-[#141414]/50 px-2 py-1 text-xs font-bold text-[#141414] outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Resolution</label>
                    <input
                      type="text"
                      value={gm.resolution || ''}
                      onChange={(e) => updateGaming(idx, 'resolution', e.target.value || null)}
                      placeholder="1440p / 1600p"
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Preset</label>
                    <input
                      type="text"
                      value={gm.preset || ''}
                      onChange={(e) => updateGaming(idx, 'preset', e.target.value || null)}
                      placeholder="Ultra / High"
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Avg FPS</label>
                    <input
                      type="number"
                      value={gm.avg_fps ?? ''}
                      onChange={(e) => updateGaming(idx, 'avg_fps', e.target.value ? Number(e.target.value) : null)}
                      placeholder="Avg FPS"
                      className="w-full bg-[#F2F1EE] border border-[#141414] px-2 py-1 text-xs font-bold text-emerald-800 outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">1% Low</label>
                    <input
                      type="number"
                      value={gm.one_percent_low_fps ?? ''}
                      onChange={(e) => updateGaming(idx, 'one_percent_low_fps', e.target.value ? Number(e.target.value) : null)}
                      placeholder="1% Low"
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => deleteGaming(idx)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete game test"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Card 5: Thermals */}
        <section className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414]" id="card-thermals">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#141414]">
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-orange-600" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
                5.0 THERMAL_STRESS_TESTS ({data.thermals.length}) (table: thermal_results)
              </h3>
            </div>
            <button
              id="add-thermal-btn"
              type="button"
              onClick={addThermal}
              className="inline-flex items-center space-x-1 px-3 py-1 bg-white hover:bg-[#EBEAE7] border border-[#141414] text-[10px] font-mono uppercase font-bold text-[#141414]"
            >
              <Plus className="w-3 h-3 text-[#141414]" />
              <span>[+ Add Thermal Test]</span>
            </button>
          </div>

          {data.thermals.length === 0 ? (
            <p className="text-xs text-gray-500 italic py-4 text-center font-mono">No thermal stress tests detected.</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-12 text-[9px] uppercase font-bold text-gray-500 px-3 py-1 border-b border-[#141414]/20 font-mono">
                <span className="col-span-4">Test Description</span>
                <span className="col-span-2">CPU Peak (°C)</span>
                <span className="col-span-2">GPU Peak (°C)</span>
                <span className="col-span-3">Deck Max (°C)</span>
                <span className="col-span-1 text-right">Del</span>
              </div>
              {data.thermals.map((th, idx) => (
                <div
                  key={idx}
                  id={`thermal-row-${idx}`}
                  className="p-2.5 bg-white border border-[#141414]/30 hover:border-[#141414] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs font-mono"
                >
                  <div className="sm:col-span-4">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Test</label>
                    <input
                      type="text"
                      value={th.test_name}
                      onChange={(e) => updateThermal(idx, 'test_name', e.target.value)}
                      placeholder="e.g. AIDA64 + FurMark (20m)"
                      className="w-full bg-[#F9F8F6] border border-[#141414]/50 px-2 py-1 text-xs font-bold text-[#141414] outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">CPU Peak</label>
                    <input
                      type="number"
                      value={th.cpu_peak_c ?? ''}
                      onChange={(e) => updateThermal(idx, 'cpu_peak_c', e.target.value ? Number(e.target.value) : null)}
                      placeholder="Peak C"
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">GPU Peak</label>
                    <input
                      type="number"
                      value={th.gpu_peak_c ?? ''}
                      onChange={(e) => updateThermal(idx, 'gpu_peak_c', e.target.value ? Number(e.target.value) : null)}
                      placeholder="Peak C"
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[9px] sm:hidden text-gray-500 block uppercase">Deck Temp Max</label>
                    <input
                      type="number"
                      value={th.keyboard_max_c ?? ''}
                      onChange={(e) => updateThermal(idx, 'keyboard_max_c', e.target.value ? Number(e.target.value) : null)}
                      placeholder="Keyboard max C"
                      className="w-full bg-white border border-[#141414]/30 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => deleteThermal(idx)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete thermal test"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Card 6: Display & Battery */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Display */}
          <section className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414]" id="card-display">
            <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-[#141414]">
              <Monitor className="w-4 h-4 text-[#141414]" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
                6.1 DISPLAY_METRICS (display_results)
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">SDR Brightness (nits)</label>
                <input
                  type="number"
                  value={data.display.brightness_sdr_nits ?? ''}
                  onChange={(e) => updateDisplay('brightness_sdr_nits', e.target.value ? Number(e.target.value) : null)}
                  placeholder="500"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">HDR Brightness (nits)</label>
                <input
                  type="number"
                  value={data.display.brightness_hdr_nits ?? ''}
                  onChange={(e) => updateDisplay('brightness_hdr_nits', e.target.value ? Number(e.target.value) : null)}
                  placeholder="600"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">sRGB Coverage (%)</label>
                <input
                  type="number"
                  value={data.display.srgb_percent ?? ''}
                  onChange={(e) => updateDisplay('srgb_percent', e.target.value ? Number(e.target.value) : null)}
                  placeholder="100"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">DCI-P3 Coverage (%)</label>
                <input
                  type="number"
                  value={data.display.dci_p3_percent ?? ''}
                  onChange={(e) => updateDisplay('dci_p3_percent', e.target.value ? Number(e.target.value) : null)}
                  placeholder="100"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">Response Time (ms)</label>
                <input
                  type="number"
                  step="0.1"
                  value={data.display.response_time_ms ?? ''}
                  onChange={(e) => updateDisplay('response_time_ms', e.target.value ? Number(e.target.value) : null)}
                  placeholder="3.0"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div className="flex items-center space-x-4 pt-4">
                <label className="flex items-center space-x-1.5 text-xs font-mono font-bold text-[#141414] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(data.display.g_sync)}
                    onChange={(e) => updateDisplay('g_sync', e.target.checked)}
                    className="border-[#141414] text-[#141414] focus:ring-0"
                  />
                  <span>G-SYNC</span>
                </label>
                <label className="flex items-center space-x-1.5 text-xs font-mono font-bold text-[#141414] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(data.display.vrr)}
                    onChange={(e) => updateDisplay('vrr', e.target.checked)}
                    className="border-[#141414] text-[#141414] focus:ring-0"
                  />
                  <span>VRR</span>
                </label>
              </div>
            </div>
          </section>

          {/* Battery */}
          <section className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414]" id="card-battery">
            <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-[#141414]">
              <Battery className="w-4 h-4 text-[#141414]" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
                6.2 BATTERY_METRICS (battery_results)
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">Battery Life (Hours)</label>
                <input
                  type="number"
                  step="0.1"
                  value={data.battery.battery_life_hours ?? ''}
                  onChange={(e) => updateBattery('battery_life_hours', e.target.value ? Number(e.target.value) : null)}
                  placeholder="7.5"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">Power Adapter (Watts)</label>
                <input
                  type="number"
                  value={data.battery.charging_adapter_w ?? ''}
                  onChange={(e) => updateBattery('charging_adapter_w', e.target.value ? Number(e.target.value) : null)}
                  placeholder="230"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">0 - 50% Charge (Min)</label>
                <input
                  type="number"
                  value={data.battery.zero_to_fifty_min ?? ''}
                  onChange={(e) => updateBattery('zero_to_fifty_min', e.target.value ? Number(e.target.value) : null)}
                  placeholder="30"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">USB-C PD (Watts)</label>
                <input
                  type="number"
                  value={data.battery.usb_c_charging_w ?? ''}
                  onChange={(e) => updateBattery('usb_c_charging_w', e.target.value ? Number(e.target.value) : null)}
                  placeholder="100 or 140"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-1">Test Method & Conditions</label>
                <input
                  type="text"
                  value={data.battery.test_method || ''}
                  onChange={(e) => updateBattery('test_method', e.target.value || null)}
                  placeholder="e.g. 150 nits, Web browsing, Optimus mode"
                  className="w-full bg-white border border-[#141414] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Card 7: Reviewer Verdict & Metadata */}
        <section className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414]" id="card-verdict">
          <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-[#141414]">
            <Award className="w-4 h-4 text-purple-700" />
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
              7.0 REVIEW_SOURCE_METADATA (review_sources)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 font-mono text-xs">
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1">Reviewer / Channel *</label>
              <input
                id="input-reviewer"
                type="text"
                value={data.review_meta.reviewer || ''}
                onChange={(e) => updateReviewMeta('reviewer', e.target.value)}
                placeholder="e.g. Dave2D, Venom's Tech"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1">Video Title</label>
              <input
                id="input-review-title"
                type="text"
                value={data.review_meta.title || ''}
                onChange={(e) => updateReviewMeta('title', e.target.value)}
                placeholder="Full YouTube video title"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1">Verdict Score (/10)</label>
              <input
                id="input-verdict-score"
                type="number"
                step="0.1"
                min="1"
                max="10"
                value={data.review_meta.verdict_score ?? ''}
                onChange={(e) => updateReviewMeta('verdict_score', e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 9.1"
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1 font-mono">Verdict Summary</label>
            <textarea
              id="input-verdict-summary"
              rows={2}
              value={data.review_meta.verdict_summary || ''}
              onChange={(e) => updateReviewMeta('verdict_summary', e.target.value || null)}
              placeholder="Overall takeaway from the video reviewer..."
              className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-[#141414]"
            />
          </div>
        </section>

        {/* 8. Retail Listings (optional) */}
        <section
          id="section-retail-listings"
          className="p-5 bg-[#E4E3E0] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#141414] pb-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-[#141414] text-[#F27D26] flex items-center justify-center">
                <ShoppingCart className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-[#141414]">
                Retail Listings (optional)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-[#141414]/60 uppercase tracking-widest">
              product_listings • price_history
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            {/* Amazon product URL */}
            <div>
              <label
                htmlFor="input-amazon-url"
                className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1"
              >
                Amazon Product URL
              </label>
              <input
                id="input-amazon-url"
                type="url"
                value={amazonUrl}
                onChange={(e) => setAmazonUrl(e.target.value)}
                placeholder="https://www.amazon.in/dp/..."
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
              />
              {amazonStatus && (
                <div id="amazon-inline-status" className="mt-2 font-mono text-xs">
                  {amazonStatus.status === 'found' && amazonStatus.price !== null ? (
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-100 border border-emerald-700 text-emerald-900 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>
                        {amazonStatus.priceSource === 'manual'
                          ? `✓ Manual Price — ₹${amazonStatus.price.toLocaleString('en-IN')}`
                          : `✓ Found — ₹${amazonStatus.price.toLocaleString('en-IN')}`}
                      </span>
                    </span>
                  ) : (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 space-y-2">
                      <div className="flex items-center space-x-1.5 text-amber-900 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>⚠ Couldn't detect price — link saved, will retry</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200">
                        <label
                          htmlFor="input-amazon-manual-price"
                          className="text-[10px] uppercase font-bold text-[#141414]/80 whitespace-nowrap"
                        >
                          Manual Price (₹):
                        </label>
                        <input
                          id="input-amazon-manual-price"
                          type="number"
                          min="0"
                          step="1"
                          value={amazonManualPrice}
                          onChange={(e) => setAmazonManualPrice(e.target.value)}
                          placeholder="e.g. 74990"
                          className="w-32 bg-white border border-[#141414] px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-[#141414]"
                        />
                        <button
                          id="btn-reconfirm-amazon-manual-price"
                          type="button"
                          disabled={!amazonManualPrice.trim() || isCommitting}
                          onClick={handleConfirmAndCommit}
                          className="px-2.5 py-1 bg-[#F27D26] hover:bg-[#ff8e3a] text-[#141414] text-[10px] font-bold uppercase border border-[#141414] shadow-[1px_1px_0px_0px_#141414] disabled:opacity-50 cursor-pointer"
                        >
                          {isCommitting ? 'Saving...' : 'Re-confirm Price'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Flipkart product URL */}
            <div>
              <label
                htmlFor="input-flipkart-url"
                className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1"
              >
                Flipkart Product URL
              </label>
              <input
                id="input-flipkart-url"
                type="url"
                value={flipkartUrl}
                onChange={(e) => setFlipkartUrl(e.target.value)}
                placeholder="https://www.flipkart.com/.../p/..."
                className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
              />
              {flipkartStatus && (
                <div id="flipkart-inline-status" className="mt-2 font-mono text-xs">
                  {flipkartStatus.status === 'found' && flipkartStatus.price !== null ? (
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-100 border border-emerald-700 text-emerald-900 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>
                        {flipkartStatus.priceSource === 'manual'
                          ? `✓ Manual Price — ₹${flipkartStatus.price.toLocaleString('en-IN')}`
                          : `✓ Found — ₹${flipkartStatus.price.toLocaleString('en-IN')}`}
                      </span>
                    </span>
                  ) : (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 space-y-2">
                      <div className="flex items-center space-x-1.5 text-amber-900 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>⚠ Couldn't detect price — link saved, will retry</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200">
                        <label
                          htmlFor="input-flipkart-manual-price"
                          className="text-[10px] uppercase font-bold text-[#141414]/80 whitespace-nowrap"
                        >
                          Manual Price (₹):
                        </label>
                        <input
                          id="input-flipkart-manual-price"
                          type="number"
                          min="0"
                          step="1"
                          value={flipkartManualPrice}
                          onChange={(e) => setFlipkartManualPrice(e.target.value)}
                          placeholder="e.g. 69990"
                          className="w-32 bg-white border border-[#141414] px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-[#141414]"
                        />
                        <button
                          id="btn-reconfirm-flipkart-manual-price"
                          type="button"
                          disabled={!flipkartManualPrice.trim() || isCommitting}
                          onClick={handleConfirmAndCommit}
                          className="px-2.5 py-1 bg-[#F27D26] hover:bg-[#ff8e3a] text-[#141414] text-[10px] font-bold uppercase border border-[#141414] shadow-[1px_1px_0px_0px_#141414] disabled:opacity-50 cursor-pointer"
                        >
                          {isCommitting ? 'Saving...' : 'Re-confirm Price'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Manual image URL */}
          <div className="font-mono text-xs">
            <label
              htmlFor="input-manual-image-url"
              className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-1"
            >
              Manual Image URL
            </label>
            <input
              id="input-manual-image-url"
              type="url"
              value={manualImageUrl}
              onChange={(e) => setManualImageUrl(e.target.value)}
              placeholder="https://images.example.com/laptop.jpg"
              className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#141414]"
            />
            <p className="mt-1 text-[11px] text-[#141414]/60 font-sans italic">
              Only needed if we can't auto-detect an image from the links above.
            </p>
          </div>
        </section>
      </div>

      {/* 4. Sticky Bottom Action Bar (Technical Dashboard Style) */}
      <div className="sticky bottom-0 z-30 p-4 bg-[#141414] text-white border-2 border-[#141414] flex flex-col sm:flex-row items-center justify-between gap-4 font-mono shadow-[8px_8px_0px_0px_#141414]">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-[#E4E3E0]/60 font-bold">
            Target Destination: Supabase Postgres (Service Role)
          </div>
          <div className="text-xs font-bold text-[#F27D26] uppercase">
            STATUS: WAITING_FOR_USER_CONFIRMATION
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            id="discard-extraction-btn"
            type="button"
            onClick={handleDiscard}
            className="inline-flex items-center space-x-1.5 px-4 py-2 border border-red-500 text-red-400 hover:bg-red-950/40 text-xs font-bold uppercase transition-colors cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>Discard Extraction</span>
          </button>

          <button
            id="review-complete-save-btn"
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="inline-flex items-center space-x-2 px-6 py-2 bg-[#F27D26] hover:bg-[#ff8e3a] text-[#141414] text-xs font-bold uppercase tracking-widest border border-[#141414] transition-all cursor-pointer shadow-[2px_2px_0px_0px_#fff]"
          >
            <Save className="w-4 h-4" />
            <span>Review Complete — Save to Database</span>
          </button>
        </div>
      </div>

      {/* 5. Real Popup Confirmation Modal (Technical Dashboard Style) */}
      {showConfirmModal && (
        <div
          id="confirmation-modal-backdrop"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 font-mono"
        >
          <div
            id="confirmation-modal-dialog"
            className="bg-[#E4E3E0] border-2 border-[#141414] max-w-lg w-full p-6 shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] space-y-4"
          >
            {commitSuccessConfigId ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-3 pb-3 border-b border-[#141414]">
                  <div className="w-8 h-8 bg-emerald-600 text-white flex items-center justify-center border border-[#141414]">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#141414] uppercase tracking-tight">Database Commit Successful</h3>
                    <p className="text-[10px] text-emerald-800 uppercase font-mono">Payload committed to Supabase Postgres</p>
                  </div>
                </div>

                <div className="p-3 bg-white border border-[#141414] text-xs space-y-2.5 text-[#141414]">
                  <p className="font-bold uppercase text-[11px] text-[#141414]">Commit Summary & Retail Listings:</p>
                  <p className="text-[11px] text-[#141414]/80">
                    Configuration and test metrics were saved. Here is the status of your retail links:
                  </p>
                  <div className="space-y-2 pt-1">
                    {listingStatuses && listingStatuses.map((ls) => (
                      <div key={ls.retailer} className="p-2.5 bg-gray-50 border border-gray-300 flex flex-col space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold uppercase text-[11px] font-mono">{ls.retailer} Listing</span>
                          {ls.status === 'found' && ls.price !== null ? (
                            <span className="text-emerald-700 font-bold flex items-center space-x-1 font-mono text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {ls.priceSource === 'manual'
                                  ? `✓ Manual Price — ₹${ls.price.toLocaleString('en-IN')}`
                                  : `✓ Found — ₹${ls.price.toLocaleString('en-IN')}`}
                              </span>
                            </span>
                          ) : (
                            <span className="text-amber-700 font-bold flex items-center space-x-1 font-mono text-xs">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>⚠ Couldn't detect price — link saved, will retry</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono truncate">{ls.productUrl}</div>
                        {ls.imageUrl && (
                          <div className="text-[10px] text-gray-500 font-mono flex items-center space-x-1">
                            <span>Image:</span>
                            <span className="text-emerald-700 font-bold">[{ls.imageSource?.toUpperCase()}]</span>
                            <span className="truncate">{ls.imageUrl}</span>
                          </div>
                        )}
                        {(ls.status !== 'found' || ls.price === null) && (
                          <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center gap-2 font-mono text-xs">
                            <label
                              htmlFor={`modal-manual-price-${ls.retailer}`}
                              className="text-[10px] uppercase font-bold text-[#141414]/80 whitespace-nowrap"
                            >
                              Manual Price (₹):
                            </label>
                            <input
                              id={`modal-manual-price-${ls.retailer}`}
                              type="number"
                              min="0"
                              step="1"
                              value={ls.retailer === 'amazon' ? amazonManualPrice : flipkartManualPrice}
                              onChange={(e) => {
                                if (ls.retailer === 'amazon') setAmazonManualPrice(e.target.value);
                                else setFlipkartManualPrice(e.target.value);
                              }}
                              placeholder="e.g. 74990"
                              className="w-32 bg-white border border-[#141414] px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-[#141414]"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  {listingStatuses?.some((ls) => ls.status !== 'found' || ls.price === null) && (
                    <button
                      id="modal-reconfirm-manual-price-btn"
                      type="button"
                      disabled={isCommitting || (!amazonManualPrice.trim() && !flipkartManualPrice.trim())}
                      onClick={handleConfirmAndCommit}
                      className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-[#141414] text-xs font-bold uppercase tracking-wider border border-[#141414] shadow-[2px_2px_0px_0px_#141414] disabled:opacity-50 cursor-pointer"
                    >
                      {isCommitting ? 'Saving...' : 'Re-confirm Price'}
                    </button>
                  )}
                  <button
                    id="modal-proceed-to-report-btn"
                    type="button"
                    onClick={() => {
                      setShowConfirmModal(false);
                      onCommitSuccess(commitSuccessConfigId);
                    }}
                    className="px-6 py-2.5 bg-[#F27D26] hover:bg-[#ff8e3a] text-[#141414] text-xs font-bold uppercase tracking-widest border border-[#141414] shadow-[2px_2px_0px_0px_#141414] transition-all cursor-pointer flex items-center space-x-2 ml-auto"
                  >
                    <span>Proceed to Laptop Report →</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-3 pb-3 border-b border-[#141414]">
                  <div className="w-8 h-8 bg-[#141414] text-[#F27D26] flex items-center justify-center border border-[#141414]">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#141414] uppercase tracking-tight">Confirm Database Commit</h3>
                    <p className="text-[10px] text-[#141414]/70 uppercase">Zero Auto-write Enforced • User Confirmation Required</p>
                  </div>
                </div>

                {/* Restatement of exact items to be written */}
                <div className="p-3 bg-white border border-[#141414] text-xs space-y-2 text-[#141414]">
                  <p className="font-bold uppercase text-[11px]">Database transaction payload:</p>
                  <ul className="space-y-1 text-[11px]">
                    <li className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 bg-[#141414]" />
                      <span>
                        <strong>
                          {data.laptop.brand} {data.laptop.model}
                        </strong>{' '}
                        ({data.configuration.cpu || 'CPU'} / {data.configuration.gpu || 'GPU'} /{' '}
                        {data.configuration.ram_gb || 'RAM'}GB) —{' '}
                        <span className="text-[#F27D26] font-bold">
                          {useExistingConfig ? '[EXISTING_CONFIG]' : '[NEW_CONFIG]'}
                        </span>
                      </span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 bg-[#141414]" />
                      <span>
                        1 review source (<strong>{data.review_meta.reviewer}</strong>
                        {data.review_meta.published_date ? `, ${data.review_meta.published_date}` : ''})
                      </span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 bg-[#141414]" />
                      <span>
                        <strong>{data.benchmarks.length}</strong> benchmark items
                      </span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 bg-[#141414]" />
                      <span>
                        <strong>{data.gaming.length}</strong> gaming FPS runs
                      </span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 bg-[#141414]" />
                      <span>
                        <strong>{data.thermals.length}</strong> thermal stress runs
                      </span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 bg-[#141414]" />
                      <span>1 display result, 1 battery result</span>
                    </li>
                    {(amazonUrl.trim() || flipkartUrl.trim()) && (
                      <li className="flex items-center space-x-2">
                        <span className="w-1.5 h-1.5 bg-[#141414]" />
                        <span>
                          Retail listings:{' '}
                          {[
                            amazonUrl.trim()
                              ? `Amazon${amazonManualPrice.trim() ? ` (₹${Number(amazonManualPrice).toLocaleString('en-IN')} manual)` : ''}`
                              : '',
                            flipkartUrl.trim()
                              ? `Flipkart${flipkartManualPrice.trim() ? ` (₹${Number(flipkartManualPrice).toLocaleString('en-IN')} manual)` : ''}`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>

                <p className="text-[10px] text-[#141414]/70 font-sans italic">
                  Upon confirmation, this payload will be permanently written to Supabase Postgres via the server-side service role client.
                </p>

                {commitError && (
                  <div className="p-2.5 bg-red-100 border border-red-700 text-red-900 text-xs">
                    {commitError}
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    id="modal-cancel-btn"
                    type="button"
                    disabled={isCommitting}
                    onClick={() => setShowConfirmModal(false)}
                    className="px-4 py-2 border border-[#141414] bg-white text-[#141414] hover:bg-gray-100 text-xs font-bold uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="modal-confirm-and-save-btn"
                    type="button"
                    disabled={isCommitting}
                    onClick={handleConfirmAndCommit}
                    className="px-5 py-2 bg-[#F27D26] hover:bg-[#ff8e3a] text-[#141414] text-xs font-bold uppercase tracking-widest border border-[#141414] shadow-[2px_2px_0px_0px_#141414] transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    {isCommitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
                        <span>Writing to Supabase...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Confirm & Commit</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
