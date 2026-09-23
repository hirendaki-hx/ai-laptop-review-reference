import React, { useState, useEffect } from 'react';
import {
  Layers,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  X,
  Cpu,
  Tv,
  Flame,
  Battery,
  Gamepad2,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { Configuration } from '../../shared/types/index.ts';
import { Panel } from '../components/ui/Panel.tsx';
import { StatusBadge } from '../components/ui/StatusBadge.tsx';

interface ComparePageProps {
  compareConfigIds: string[];
  onRemoveFromCompare: (configId: string) => void;
  onSelectConfig: (configId: string) => void;
  onNavigateToBrowse: () => void;
}

export const ComparePage: React.FC<ComparePageProps> = ({
  compareConfigIds,
  onRemoveFromCompare,
  onSelectConfig,
  onNavigateToBrowse,
}) => {
  const [configs, setConfigs] = useState<Configuration[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (compareConfigIds.length === 0) {
      setConfigs([]);
      return;
    }

    setLoading(true);
    api
      .getCompare(compareConfigIds)
      .then(res => {
        setConfigs(res.configurations || []);
      })
      .catch(err => {
        console.warn('Compare fetch error:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [compareConfigIds]);

  if (compareConfigIds.length === 0) {
    return (
      <div className="border-2 border-[#141414] bg-[#F9F8F6] p-12 text-center space-y-4 shadow-[4px_4px_0px_#141414]">
        <Layers className="w-12 h-12 text-neutral-400 mx-auto" />
        <div>
          <h2 className="font-serif text-2xl font-bold text-[#141414]">
            Hardware Comparison Queue Empty
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 mt-1 max-w-md mx-auto">
            Select up to 3 verified laptop configurations from the Browse view to compare synthetic
            benchmarks, gaming FPS, and thermal curves under standardized conditions.
          </p>
        </div>
        <button
          onClick={onNavigateToBrowse}
          className="px-5 py-2.5 bg-[#141414] text-white hover:bg-[#F27D26] font-mono text-xs uppercase font-bold tracking-wider inline-flex items-center space-x-2 cursor-pointer"
        >
          <span>Browse Laptop Configurations</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Collect all unique game titles tested across the compared laptops
  const allGames: string[] = Array.from(
    new Set(
      configs.flatMap(c => (c.gaming_results || []).map(g => String(g.game)))
    )
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="border-2 border-[#141414] bg-[#F9F8F6] p-5 shadow-[4px_4px_0px_#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-1 px-2 py-0.5 font-mono text-[10px] uppercase font-bold bg-[#141414] text-white mb-1.5">
            <span>Condition-Aware Comparison Engine</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#141414]">
            Compare Configurations ({configs.length} of 3)
          </h1>
          <p className="text-xs text-neutral-600 mt-0.5">
            Evaluates comparability of tests based on exact resolution, preset, and power modes.
          </p>
        </div>

        {compareConfigIds.length < 3 && (
          <button
            onClick={onNavigateToBrowse}
            className="px-4 py-2 border-2 border-[#141414] bg-white hover:bg-neutral-100 font-mono text-xs uppercase font-bold flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Laptop</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 font-mono text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-[#F27D26]" />
          <span>Synchronizing comparison metrics...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Hardware Header Grid */}
          <div className={`grid grid-cols-1 md:grid-cols-${configs.length} gap-6`}>
            {configs.map(conf => (
              <div
                key={conf.id}
                className="border-2 border-[#141414] bg-white p-4 shadow-[3px_3px_0px_#141414] relative flex flex-col justify-between"
              >
                <button
                  onClick={() => onRemoveFromCompare(conf.id)}
                  title="Remove from comparison"
                  className="absolute top-2.5 right-2.5 p-1 hover:bg-red-50 text-neutral-400 hover:text-red-700 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="space-y-2 pr-6">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#141414] text-white font-bold uppercase">
                    {conf.laptop?.brand}
                  </span>
                  <h3 className="font-serif text-lg font-bold text-[#141414] leading-snug">
                    {conf.laptop?.model}
                  </h3>
                  {conf.laptop?.series && (
                    <p className="font-mono text-xs text-neutral-500">{conf.laptop.series}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-dashed border-neutral-300 space-y-1.5 font-mono text-xs">
                  <div>
                    <span className="text-neutral-500 block text-[10px]">CPU</span>
                    <span className="font-semibold">{conf.cpu || 'Not Stated'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px]">GPU & TGP</span>
                    <span className="font-semibold">
                      {conf.gpu || 'Not Stated'} {conf.gpu_tgp_w ? `(${conf.gpu_tgp_w}W)` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px]">RAM & Storage</span>
                    <span>
                      {conf.ram_gb ? `${conf.ram_gb}GB` : 'N/A'} •{' '}
                      {conf.storage_gb ? `${conf.storage_gb}GB` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[10px]">Display</span>
                    <span>{conf.display_resolution || 'N/A'} {conf.refresh_rate_hz ? `@ ${conf.refresh_rate_hz}Hz` : ''}</span>
                  </div>
                </div>

                <button
                  onClick={() => onSelectConfig(conf.id)}
                  className="mt-4 w-full py-1.5 bg-[#141414] text-white hover:bg-[#F27D26] font-mono text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer text-center"
                >
                  View Full Report
                </button>
              </div>
            ))}
          </div>

          {/* Condition-Aware Gaming Comparability Matrix */}
          <Panel title="Gaming Framerate Comparability Matrix" badge={<Gamepad2 className="w-4 h-4 text-[#F27D26]" />}>
            {allGames.length === 0 ? (
              <p className="font-mono text-xs text-neutral-500 italic py-4">
                No overlapping gaming benchmark results found across these configurations.
              </p>
            ) : (
              <div className="space-y-4">
                {allGames.map((game, gIdx) => {
                  // Collect tests for this game from each configuration
                  const testsByConfig = configs.map(c =>
                    (c.gaming_results || []).find(g => g.game.toLowerCase() === game.toLowerCase())
                  );

                  // Condition comparability check
                  const presentTests = testsByConfig.filter(Boolean);
                  let isComparable = true;
                  let diffReason = '';

                  if (presentTests.length > 1) {
                    const first = presentTests[0]!;
                    for (let i = 1; i < presentTests.length; i++) {
                      const cur = presentTests[i]!;
                      if (cur.resolution !== first.resolution) {
                        isComparable = false;
                        diffReason = `Resolutions differ (${first.resolution || 'Native'} vs ${cur.resolution || 'Native'})`;
                        break;
                      }
                      if (cur.preset !== first.preset) {
                        isComparable = false;
                        diffReason = `Presets differ (${first.preset || 'Default'} vs ${cur.preset || 'Default'})`;
                        break;
                      }
                      if (Boolean(cur.ray_tracing) !== Boolean(first.ray_tracing)) {
                        isComparable = false;
                        diffReason = 'Ray Tracing settings differ';
                        break;
                      }
                    }
                  }

                  return (
                    <div key={gIdx} className="border border-neutral-300 p-4 bg-white space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                        <span className="font-mono text-sm font-bold text-[#141414] uppercase">
                          {game}
                        </span>

                        {presentTests.length > 1 && (
                          <div className="flex items-center space-x-2">
                            {isComparable ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 font-mono text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold uppercase">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Directly Comparable</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 font-mono text-[10px] bg-amber-50 text-amber-800 border border-amber-300 font-bold uppercase" title={diffReason}>
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Test Conditions Differ: {diffReason}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                        {configs.map((conf, cIdx) => {
                          const test = testsByConfig[cIdx];
                          return (
                            <div key={conf.id} className="border border-neutral-200 p-2.5 bg-neutral-50 space-y-1">
                              <span className="text-[10px] text-neutral-500 uppercase block font-semibold">
                                {conf.laptop?.model}
                              </span>

                              {test ? (
                                <>
                                  <div className="text-base font-bold text-[#141414]">
                                    {test.avg_fps != null ? `${test.avg_fps} FPS` : 'N/A'}{' '}
                                    <span className="text-[10px] font-normal text-neutral-500">
                                      (1% Low: {test.one_percent_low_fps || '—'})
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-neutral-600">
                                    {test.resolution || 'Native'} • {test.preset || 'Default'}{' '}
                                    {test.ray_tracing ? '• RT ON' : ''}
                                  </div>
                                </>
                              ) : (
                                <span className="text-neutral-400 italic">Not tested in this review</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Thermals & Power Side-by-Side */}
          <Panel title="Thermals & Sustained Power Comparison" badge={<Flame className="w-4 h-4 text-[#F27D26]" />}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {configs.map(conf => {
                const t = conf.thermal_results?.[0];
                return (
                  <div key={conf.id} className="border border-neutral-300 p-4 bg-white space-y-2.5 font-mono text-xs">
                    <span className="font-bold text-neutral-800 uppercase block border-b pb-1.5">
                      {conf.laptop?.model}
                    </span>

                    {t ? (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">CPU Peak:</span>
                          <span className="font-bold">{t.cpu_peak_c ? `${t.cpu_peak_c}°C` : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">GPU Peak:</span>
                          <span className="font-bold">{t.gpu_peak_c ? `${t.gpu_peak_c}°C` : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Keyboard Hotspot:</span>
                          <span className="font-bold">{t.keyboard_max_c ? `${t.keyboard_max_c}°C` : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Sustained Wattage:</span>
                          <span className="font-bold">{t.sustained_wattage_w ? `${t.sustained_wattage_w}W` : 'N/A'}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-neutral-400 italic py-2">No thermal tests logged</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};
