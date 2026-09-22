import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Cpu,
  Monitor,
  Award,
  Gamepad2,
  Battery,
  Thermometer,
  X,
  Scale,
  ArrowRight,
} from 'lucide-react';
import { FullConfigurationReport } from '../types.ts';
import { trackedFetch } from '../utils/trackedFetch.ts';

// Phase 9: Benchmark direction map
const BENCHMARK_DIRECTION: Record<string, 'higher' | 'lower' | 'info'> = {
  'Geekbench 6': 'higher',
  'Cinebench R23': 'higher',
  'Cinebench R24': 'higher',
  '3DMark Time Spy': 'higher',
  '3DMark Fire Strike': 'higher',
  '3DMark Steel Nomad': 'higher',
  'PCMark 10': 'higher',
  'Blender': 'lower',
  'PugetBench': 'higher',
  'CrossMark': 'higher',
  'Handbrake': 'lower',
  'CrystalDiskMark': 'higher',
};

function getBenchmarkDirection(group: string): 'higher' | 'lower' | 'info' {
  for (const [key, dir] of Object.entries(BENCHMARK_DIRECTION)) {
    if (group.toLowerCase().includes(key.toLowerCase())) {
      return dir;
    }
  }
  return 'higher'; // default fallback
}

interface CompareTabProps {
  comparedIds: string[];
  onRemoveFromCompare: (id: string) => void;
  onNavigateToBrowse: () => void;
  onSelectConfig: (id: string) => void;
}

export const CompareTab: React.FC<CompareTabProps> = ({
  comparedIds,
  onRemoveFromCompare,
  onNavigateToBrowse,
  onSelectConfig,
}) => {
  const [reports, setReports] = useState<FullConfigurationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadComparisons() {
      if (comparedIds.length === 0) {
        setReports([]);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      try {
        const configIdsParam = comparedIds.join(',');
        const res = await trackedFetch(`/api/compare?configIds=${encodeURIComponent(configIdsParam)}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to fetch comparison data');
        }
        const data = await res.json();
        setReports(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadComparisons();
  }, [comparedIds]);

  // Gather unique benchmark keys across all selected configurations
  const allBenchmarkKeys = new Set<string>();
  reports.forEach((rep) => {
    rep.reviews.forEach((rev) => {
      (rev.benchmarks || []).forEach((b) => {
        allBenchmarkKeys.add(`${b.benchmark_group}__${b.variant || ''}`);
      });
    });
  });
  
  // Phase 9: Make grid layout responsive to number of reports
  const gridStyle = { gridTemplateColumns: `minmax(200px, 1.5fr) repeat(${reports.length}, minmax(180px, 1fr))` };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-16 px-4 text-center font-mono">
        <div className="w-8 h-8 border-2 border-[#141414] border-t-transparent animate-spin mx-auto mb-3" />
        <span className="font-mono text-xs uppercase font-bold tracking-wider text-[#141414]">
          Loading comparison matrix...
        </span>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] pb-24">
      {/* Pinned action bar */}
      <div className="sticky top-0 z-40 bg-[#F9F8F6]/95 backdrop-blur-sm border-b-2 border-[#141414] p-4 mb-6 flex justify-between items-center">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 bg-[#141414] text-[#E4E3E0] text-[9px] font-mono uppercase tracking-widest mb-1 border border-[#141414]">
            <Scale className="w-2.5 h-2.5 text-[#F27D26]" />
            <span>Matrix Engine</span>
          </div>
          <h2 className="text-lg sm:text-xl font-mono font-bold tracking-tight text-[#141414] uppercase">Head-to-Head Comparison</h2>
          <p className="text-xs font-mono text-[#141414]/70 mt-0.5">COMPARING {reports.length} CONFIGURATION{reports.length === 1 ? '' : 'S'}</p>
        </div>
        <button
          onClick={onNavigateToBrowse}
          className="px-4 py-2 bg-white hover:bg-[#F9F8F6] border-2 border-[#141414] shadow-[2px_2px_0px_0px_#141414] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-mono font-bold text-xs uppercase tracking-wider text-[#141414] cursor-pointer"
        >
          Browse Laptops
        </button>
      </div>

      {error ? (
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="p-4 bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] text-red-700 font-mono text-xs font-bold uppercase">
            <span className="text-[#141414] block mb-1">SYSTEM_ALERT :: COMPARISON_FAILED</span>
            {error}
          </div>
        </div>
      ) : reports.length === 0 ? (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 my-4 sm:my-8">
          <div className="bg-[#F9F8F6] border-2 border-[#141414] p-6 sm:p-8 shadow-[6px_6px_0px_0px_#141414]" id="compare-empty-card">
            {/* Panel Metadata Bar */}
            <div className="flex items-center justify-between border-b-2 border-[#141414] pb-3 mb-6 font-mono text-[10px] uppercase">
              <div className="flex items-center space-x-2 text-[#141414]">
                <div className="w-2 h-2 bg-[#F27D26]" />
                <span className="font-bold tracking-wider">HARDWARE_MATRIX :: VACANT</span>
              </div>
              <span className="text-[#141414]/60 tracking-wider">SLOTS_AVAILABLE: 4</span>
            </div>

            {/* Content Area */}
            <div className="text-center py-2">
              <div className="w-12 h-12 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_#141414] flex items-center justify-center mx-auto mb-4 text-[#141414]">
                <Scale className="w-6 h-6 text-[#F27D26]" />
              </div>
              <h3 className="text-xl font-mono font-bold tracking-tight text-[#141414] uppercase">
                No laptops selected
              </h3>
              <p className="text-xs sm:text-sm font-serif italic text-[#141414]/75 mt-2 mb-6 max-w-md mx-auto">
                Go to the Browse tab to search for laptops and add them to your comparison matrix.
              </p>
              <button
                onClick={onNavigateToBrowse}
                className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-[#F27D26] hover:bg-[#ff8e3a] text-[#141414] border-2 border-[#141414] font-mono font-bold text-xs uppercase tracking-widest transition-colors shadow-[3px_3px_0px_0px_#141414] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] cursor-pointer"
              >
                <span>Browse Laptops</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Steps Footer */}
            <div className="mt-8 pt-4 border-t border-[#141414]/20 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left font-mono text-[11px] text-[#141414]/80">
              <div className="bg-white border border-[#141414] p-3 shadow-[2px_2px_0px_0px_#141414]">
                <div className="font-bold text-[10px] uppercase text-[#F27D26] mb-1">01. BROWSE</div>
                <div className="leading-snug">Locate verified laptop models in the registry</div>
              </div>
              <div className="bg-white border border-[#141414] p-3 shadow-[2px_2px_0px_0px_#141414]">
                <div className="font-bold text-[10px] uppercase text-[#F27D26] mb-1">02. SELECT</div>
                <div className="leading-snug">Click &quot;Compare&quot; on up to 4 configurations</div>
              </div>
              <div className="bg-white border border-[#141414] p-3 shadow-[2px_2px_0px_0px_#141414]">
                <div className="font-bold text-[10px] uppercase text-[#F27D26] mb-1">03. CROSS-CHECK</div>
                <div className="leading-snug">Evaluate side-by-side specs, gaming & thermals</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-8 overflow-x-auto pb-12">
          
          {/* Header Row */}
          <div className="grid gap-4 min-w-[800px]" style={gridStyle}>
            <div className="invisible">Label Column</div>
            {reports.map((r) => (
              <div key={r.configuration.id} className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] p-4 flex flex-col justify-between relative group">
                <button
                  onClick={() => onRemoveFromCompare(r.configuration.id)}
                  className="absolute top-2 right-2 p-1 bg-white border border-[#141414] hover:bg-red-50 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
                  title="Remove from comparison"
                >
                  <X className="w-4 h-4" />
                </button>
                <div 
                  className="cursor-pointer hover:bg-gray-50 transition-colors -mx-4 -mt-4 p-4 pb-0"
                  onClick={() => onSelectConfig(r.configuration.id)}
                >
                  <h3 className="font-serif italic font-bold text-lg leading-tight text-[#141414] flex items-center pr-6">
                    {r.brand.name} {r.laptop.model}
                    <ExternalLink className="w-3.5 h-3.5 ml-1.5 text-gray-400 shrink-0" />
                  </h3>
                  <p className="text-xs font-mono text-gray-500 mt-1 truncate">
                    {r.laptop.series} {r.laptop.generation}
                  </p>
                  <div className="mt-4 space-y-1 text-xs">
                    <div className="flex items-start">
                      <Cpu className="w-3.5 h-3.5 text-gray-400 mr-1.5 mt-0.5 shrink-0" />
                      <span className="font-mono text-[#141414]">{r.configuration.cpu}</span>
                    </div>
                    <div className="flex items-start">
                      <Monitor className="w-3.5 h-3.5 text-gray-400 mr-1.5 mt-0.5 shrink-0" />
                      <span className="font-mono text-[#141414]">
                        {r.configuration.gpu} {r.configuration.gpu_tgp_w ? `(${r.configuration.gpu_tgp_w}W)` : ''}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Retail Price Display */}
                {r.productListings && r.productListings.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-[#141414]/10">
                    <span className="text-[10px] uppercase font-mono font-bold text-gray-500 tracking-wider block mb-2">Current Retail</span>
                    {r.productListings.map((listing) => (
                      <a 
                        key={listing.id} 
                        href={listing.product_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center justify-between group p-1.5 -mx-1.5 hover:bg-gray-50 font-mono"
                      >
                        <span className="text-xs font-bold capitalize text-[#141414] flex items-center">
                          {listing.retailer}
                          <ExternalLink className="w-3 h-3 ml-1 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                        <span className="text-sm font-bold text-emerald-800">
                          {listing.current_price ? `₹${listing.current_price.toLocaleString()}` : 'Check'}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 1. Core Specs Comparison */}
          <div className="bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] overflow-hidden min-w-[800px]">
            <div className="p-3.5 bg-white border-b-2 border-[#141414] font-mono font-bold text-xs uppercase tracking-wider text-[#141414] flex items-center">
              <Cpu className="w-4 h-4 mr-2 text-[#F27D26]" />
              Core Specifications
            </div>
            <div className="divide-y divide-[#141414]/20 text-xs font-mono">
              
              <div className="grid p-3 hover:bg-white/60" style={gridStyle}>
                <span className="text-[#141414]/70 font-bold uppercase text-[10px]">Memory</span>
                {reports.map((r, i) => (
                  <span key={i} className="text-[#141414]">
                    {r.configuration.ram_gb ? `${r.configuration.ram_gb}GB` : '—'} 
                    {r.configuration.ram_speed_mt_s ? ` @ ${r.configuration.ram_speed_mt_s} MT/s` : ''}
                  </span>
                ))}
              </div>

              <div className="grid p-3 hover:bg-white/60" style={gridStyle}>
                <span className="text-[#141414]/70 font-bold uppercase text-[10px]">Storage</span>
                {reports.map((r, i) => (
                  <span key={i} className="text-[#141414]">
                    {r.configuration.storage_gb ? `${r.configuration.storage_gb}GB SSD` : '—'}
                  </span>
                ))}
              </div>

              <div className="grid p-3 hover:bg-white/60" style={gridStyle}>
                <span className="text-[#141414]/70 font-bold uppercase text-[10px]">Display</span>
                {reports.map((r, i) => (
                  <span key={i} className="text-[#141414]">
                    {r.configuration.display_resolution || '—'}
                    {r.configuration.refresh_rate_hz ? ` @ ${r.configuration.refresh_rate_hz}Hz` : ''}
                    {r.configuration.panel_type ? ` (${r.configuration.panel_type})` : ''}
                  </span>
                ))}
              </div>

              <div className="grid p-3 hover:bg-white/60" style={gridStyle}>
                <span className="text-[#141414]/70 font-bold uppercase text-[10px]">Battery Capacity</span>
                {reports.map((r, i) => (
                  <span key={i} className="text-[#141414]">
                    {r.configuration.battery_wh ? `${r.configuration.battery_wh} Wh` : '—'}
                  </span>
                ))}
              </div>

              <div className="grid p-3 hover:bg-white/60" style={gridStyle}>
                <span className="text-[#141414]/70 font-bold uppercase text-[10px]">Chassis Weight</span>
                {reports.map((r, i) => (
                  <span key={i} className="text-[#141414]">
                    {r.configuration.weight_kg ? `${r.configuration.weight_kg} kg` : '—'}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Benchmark Comparison */}
          <div className="bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] overflow-hidden min-w-[800px]">
            <div className="p-3.5 bg-white border-b-2 border-[#141414] font-mono font-bold text-xs uppercase tracking-wider text-[#141414] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4 text-[#F27D26]" />
                <span>Synthetic Benchmarks</span>
              </div>
              <span className="text-[10px] text-emerald-800 font-bold">
                [Highlighted indicates top score based on direction]
              </span>
            </div>
            <div className="divide-y divide-[#141414]/20 text-xs">
              {Array.from(allBenchmarkKeys).map((key) => {
                const [group, variant] = key.split('__');
                const dir = getBenchmarkDirection(group);
                
                const scores = reports.map((rep) => {
                  for (const rev of rep.reviews) {
                    const found = (rev.benchmarks || []).find(
                      (b) => b.benchmark_group === group && (b.variant || '') === variant
                    );
                    if (found) return found.score;
                  }
                  return null;
                });

                const validScores = scores.filter((s): s is number => s !== null && typeof s === 'number');
                
                let targetScore: number | null = null;
                if (validScores.length > 1) {
                  if (dir === 'higher') targetScore = Math.max(...validScores);
                  else if (dir === 'lower') targetScore = Math.min(...validScores);
                }

                return (
                  <div key={key} className="grid p-3 hover:bg-white/60 items-center font-mono" style={gridStyle}>
                    <div>
                      <span className="font-bold text-[#141414] block">{group}</span>
                      {variant && <span className="text-[10px] text-gray-500 block">{variant}</span>}
                      <span className="text-[9px] uppercase tracking-wide text-gray-400 block mt-0.5">
                        {dir === 'higher' ? 'Higher is better' : dir === 'lower' ? 'Lower is better' : 'Informational'}
                      </span>
                    </div>
                    {scores.map((s, idx) => {
                      const isWinner = s !== null && targetScore !== null && s === targetScore;
                      return (
                        <div key={idx}>
                          {s !== null ? (
                            <span
                              className={`px-2 py-0.5 border text-xs font-bold inline-block shadow-[1px_1px_0px_0px_#141414] ${
                                isWinner
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-700'
                                  : 'bg-white text-[#141414] border-[#141414]'
                              }`}
                            >
                              {s.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Gaming Comparison */}
          <div className="bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] overflow-hidden min-w-[800px]">
            <div className="p-3.5 bg-white border-b-2 border-[#141414] font-mono font-bold text-xs uppercase tracking-wider text-[#141414] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Gamepad2 className="w-4 h-4 text-[#F27D26]" />
                <span>Gaming Comparison (Strictly Matched Settings)</span>
              </div>
              <span className="text-[10px] text-gray-500">
                Only identical resolution, preset, and features are directly comparable
              </span>
            </div>
            <div className="divide-y divide-[#141414]/20 text-xs">
              {Array.from(
                new Set(
                  reports.flatMap((r) =>
                    r.reviews.flatMap((rev) => (rev.gaming || []).map((g) => g.game))
                  )
                )
              ).map((gameName) => {
                const gameResults = reports.map((r) => {
                  for (const rev of r.reviews) {
                    const found = (rev.gaming || []).find((g) => g.game === gameName);
                    if (found) return found;
                  }
                  return null;
                });

                // Phase 9: Check strict comparability
                const nonNulls = gameResults.filter(Boolean);
                const isComparable =
                  nonNulls.length > 1 &&
                  nonNulls.every(
                    (g) =>
                      g?.resolution === nonNulls[0]?.resolution &&
                      g?.preset === nonNulls[0]?.preset &&
                      !!g?.ray_tracing === !!nonNulls[0]?.ray_tracing &&
                      !!g?.upscaling === !!nonNulls[0]?.upscaling &&
                      g?.upscaling_mode === nonNulls[0]?.upscaling_mode
                  );

                const maxAvg = isComparable
                  ? Math.max(...nonNulls.map((g) => g?.avg_fps || 0))
                  : null;

                return (
                  <div key={gameName} className="grid p-3 hover:bg-white/60 items-center font-mono" style={gridStyle}>
                    <div>
                      <span className="font-bold text-[#141414] block">{gameName}</span>
                      {!isComparable && nonNulls.length > 1 && (
                        <span className="text-[10px] text-amber-700 block mt-0.5 font-bold leading-tight">
                          Settings differ (not directly comparable)
                        </span>
                      )}
                    </div>
                    {gameResults.map((g, idx) => {
                      if (!g) return <div key={idx}><span className="text-gray-400">—</span></div>;
                      const isWinner = isComparable && maxAvg && g.avg_fps === maxAvg;
                      
                      const features = [];
                      if (g.ray_tracing) features.push('RT');
                      if (g.upscaling) features.push(g.upscaling_mode || 'Upscale');
                      
                      return (
                        <div key={idx} className="space-y-0.5">
                          <span
                            className={`font-mono font-bold text-xs px-2 py-0.5 border inline-block shadow-[1px_1px_0px_0px_#141414] ${
                              isWinner
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-700'
                                : 'bg-white text-[#141414] border-[#141414]'
                            }`}
                          >
                            {g.avg_fps ? `${g.avg_fps} FPS` : '—'}
                          </span>
                          <span className="text-[10px] text-gray-500 block leading-tight">
                            {g.resolution || ''} {g.preset || ''} {features.length > 0 ? `(${features.join(', ')})` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
};
