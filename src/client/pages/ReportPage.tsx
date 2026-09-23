import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Layers,
  Cpu,
  Tv,
  Battery,
  Flame,
  Gamepad2,
  ShieldCheck,
  ShoppingBag,
  Clock,
  Plus,
  Check,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { Configuration } from '../../shared/types/index.ts';
import { Panel } from '../components/ui/Panel.tsx';
import { MetricCard } from '../components/ui/MetricCard.tsx';
import { EvidenceBadge } from '../components/ui/EvidenceBadge.tsx';
import { ScoringDashboard } from '../components/ScoringDashboard.tsx';
import { AdminScoringModal } from '../components/AdminScoringModal.tsx';

interface ReportPageProps {
  configurationId: string;
  onBack: () => void;
  compareConfigIds: string[];
  onToggleCompare: (configId: string) => void;
}

export const ReportPage: React.FC<ReportPageProps> = ({
  configurationId,
  onBack,
  compareConfigIds,
  onToggleCompare,
}) => {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<
    'overview' | 'benchmarks' | 'gaming' | 'thermals' | 'display' | 'battery' | 'evidence' | 'pricing'
  >('overview');
  const [adminScoringModalOpen, setAdminScoringModalOpen] = useState(false);

  useEffect(() => {
    let isSubscribed = true;
    setLoading(true);

    api
      .getConfiguration(configurationId)
      .then(res => {
        if (isSubscribed) setConfig(res);
      })
      .catch(err => {
        if (isSubscribed) setError(err.message || 'Failed to load configuration report');
      })
      .finally(() => {
        if (isSubscribed) setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [configurationId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3 font-mono text-xs">
        <RefreshCw className="w-6 h-6 animate-spin text-[#F27D26]" />
        <span>Loading hardware report...</span>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="p-8 border-2 border-red-600 bg-red-50 text-red-800 font-mono text-xs space-y-4">
        <p className="font-bold">Error loading configuration report.</p>
        <p>{error || 'Configuration not found.'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-[#141414] text-white hover:bg-neutral-800"
        >
          Return to Browse
        </button>
      </div>
    );
  }

  const laptop = config.laptop;
  const reviews = config.review_sources || [];
  const benchmarks = config.benchmark_results || [];
  const gaming = config.gaming_results || [];
  const thermals = config.thermal_results || [];
  const display = config.display_results?.[0];
  const battery = config.battery_results?.[0];
  const evidenceList = config.evidence_records || [];
  const listings = config.product_listings || [];

  const isComparing = compareConfigIds.includes(config.id);

  return (
    <div className="space-y-6">
      {/* Back button & Action Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 font-mono text-xs font-bold text-neutral-700 hover:text-[#141414] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Browse</span>
        </button>

        <button
          onClick={() => onToggleCompare(config.id)}
          className={`px-3 py-1.5 border font-mono text-xs uppercase font-bold flex items-center space-x-1.5 transition-colors cursor-pointer ${
            isComparing
              ? 'bg-[#F27D26] text-white border-[#F27D26]'
              : 'border-[#141414] bg-white text-[#141414] hover:bg-neutral-100'
          }`}
        >
          {isComparing ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>In Comparison Queue</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Compare</span>
            </>
          )}
        </button>
      </div>

      {/* Main Header Card */}
      <div className="border-2 border-[#141414] bg-[#F9F8F6] p-5 sm:p-6 shadow-[4px_4px_0px_#141414]">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs px-2 py-0.5 bg-[#141414] text-white font-bold uppercase">
                {laptop?.brand || 'Brand'}
              </span>
              {laptop?.series && (
                <span className="font-mono text-xs text-neutral-600 font-semibold">
                  {laptop.series}
                </span>
              )}
              {laptop?.generation && (
                <span className="font-mono text-xs text-neutral-500">
                  • {laptop.generation}
                </span>
              )}
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#141414]">
              {laptop?.model || 'Laptop Model'}
            </h1>

            {/* Spec Ribbon */}
            <div className="pt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="px-2.5 py-1 bg-white border border-[#141414] font-semibold text-neutral-800">
                {config.cpu || 'CPU not stated'}
              </span>
              <span className="px-2.5 py-1 bg-white border border-[#141414] font-semibold text-neutral-800">
                {config.gpu || 'GPU not stated'}
                {config.gpu_tgp_w ? ` (${config.gpu_tgp_w}W TGP)` : ''}
              </span>
              <span className="px-2.5 py-1 bg-white border border-[#141414] text-neutral-700">
                {config.ram_gb ? `${config.ram_gb}GB RAM` : 'RAM N/A'}
                {config.ram_speed_mt_s ? ` @ ${config.ram_speed_mt_s}MHz` : ''}
              </span>
              <span className="px-2.5 py-1 bg-white border border-[#141414] text-neutral-700">
                {config.storage_gb
                  ? config.storage_gb >= 1024
                    ? `${config.storage_gb / 1024}TB SSD`
                    : `${config.storage_gb}GB SSD`
                  : 'Storage N/A'}
              </span>
              <span className="px-2.5 py-1 bg-white border border-[#141414] text-neutral-700">
                {config.display_size_inch ? `${config.display_size_inch}" ` : ''}
                {config.display_resolution || 'Display N/A'}
                {config.refresh_rate_hz ? ` @ ${config.refresh_rate_hz}Hz` : ''}
              </span>
            </div>
          </div>

          {/* Retail & Price Card */}
          <div className="shrink-0 border-2 border-[#141414] p-3.5 bg-white min-w-[240px]">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] uppercase font-bold text-neutral-500">
                Market Price
              </span>
              <ShoppingBag className="w-3.5 h-3.5 text-[#F27D26]" />
            </div>

            {listings.length > 0 ? (
              <div className="space-y-2 mt-2">
                {listings.map(l => (
                  <div key={l.id} className="flex items-center justify-between text-xs font-mono">
                    <span className="uppercase font-bold text-neutral-700">{l.retailer}:</span>
                    <span className="font-bold text-[#141414]">
                      {l.price ? `₹${l.price.toLocaleString()}` : 'Price unlisted'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono text-xs text-neutral-500 italic mt-1">
                No retail listings linked.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b-2 border-[#141414] bg-[#EBEAE7] overflow-x-auto">
        {[
          { id: 'overview', label: 'Hardware Overview' },
          { id: 'benchmarks', label: `Benchmarks (${benchmarks.length})` },
          { id: 'gaming', label: `Gaming FPS (${gaming.length})` },
          { id: 'thermals', label: `Thermals & Power (${thermals.length})` },
          { id: 'display', label: 'Display Lab' },
          { id: 'battery', label: 'Battery Runtime' },
          { id: 'evidence', label: `Verified Evidence (${evidenceList.length})` },
          { id: 'pricing', label: `Retail & Price History (${listings.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`px-4 py-2 font-mono text-xs uppercase font-bold tracking-wider whitespace-nowrap border-r-2 border-[#141414] transition-colors cursor-pointer ${
              activeSection === tab.id ? 'bg-[#141414] text-white' : 'text-neutral-700 hover:bg-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION: OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Verified Use-Case Scoring Dashboard */}
          <ScoringDashboard
            configurationId={configurationId}
            onOpenAdminScoring={() => setAdminScoringModalOpen(true)}
          />

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              label="CPU Processor"
              value={config.cpu || 'Not Stated'}
              subtext={laptop?.brand}
            />
            <MetricCard
              label="GPU Graphics"
              value={config.gpu || 'Not Stated'}
              unit={config.gpu_tgp_w ? `${config.gpu_tgp_w}W` : undefined}
            />
            <MetricCard
              label="Memory"
              value={config.ram_gb ? `${config.ram_gb} GB` : 'N/A'}
              unit={config.ram_speed_mt_s ? `@ ${config.ram_speed_mt_s}MHz` : undefined}
            />
            <MetricCard
              label="Battery Life"
              value={battery?.battery_life_hours ? `${battery.battery_life_hours}` : 'N/A'}
              unit="hours"
              subtext={battery?.test_method || 'Tested Runtime'}
            />
          </div>

          {/* Ingested Review Sources */}
          <Panel title="Ingested YouTube Review Sources" badge={<ShieldCheck className="w-4 h-4 text-[#F27D26]" />}>
            {reviews.length === 0 ? (
              <p className="font-mono text-xs text-neutral-500 italic">No review sources logged.</p>
            ) : (
              <div className="space-y-3">
                {reviews.map(r => (
                  <div
                    key={r.id}
                    className="border border-neutral-300 p-3.5 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-[#141414]">
                          {r.reviewer}
                        </span>
                        {r.rating && (
                          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                            Score: {r.rating}
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-sm text-neutral-800 mt-0.5">
                        &ldquo;{r.title}&rdquo;
                      </h4>
                      {r.verdict && (
                        <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
                          <strong>Verdict: </strong>
                          {r.verdict}
                        </p>
                      )}
                    </div>

                    <a
                      href={r.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-[#141414] text-white hover:bg-[#F27D26] font-mono text-xs uppercase font-bold flex items-center space-x-1 shrink-0 transition-colors"
                    >
                      <span>Watch Review</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* SECTION: BENCHMARKS */}
      {activeSection === 'benchmarks' && (
        <Panel title="Synthetic Performance Benchmarks">
          {benchmarks.length === 0 ? (
            <p className="font-mono text-xs text-neutral-500 italic py-4">
              No synthetic benchmarks logged for this configuration.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse border border-neutral-300">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700 border-b border-neutral-300">
                    <th className="p-2.5 text-left">Benchmark Suite</th>
                    <th className="p-2.5 text-left">Test Variant</th>
                    <th className="p-2.5 text-left">Category</th>
                    <th className="p-2.5 text-left">Score</th>
                    <th className="p-2.5 text-left">Power Mode</th>
                    <th className="p-2.5 text-left">Video Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((b, idx) => (
                    <tr key={idx} className="border-b border-neutral-200 hover:bg-neutral-50">
                      <td className="p-2.5 font-bold text-neutral-900">{b.benchmark_group}</td>
                      <td className="p-2.5 text-neutral-700">{b.variant || 'Standard'}</td>
                      <td className="p-2.5 uppercase text-[10px] text-neutral-500 font-semibold">
                        {b.category}
                      </td>
                      <td className="p-2.5 font-bold text-sm text-[#141414]">
                        {b.score.toLocaleString()} {b.unit}
                      </td>
                      <td className="p-2.5 text-neutral-600">
                        {b.power_mode ? (
                          <span className="px-1.5 py-0.5 bg-neutral-100 border text-[10px] uppercase">
                            {b.power_mode}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-2.5">
                        <EvidenceBadge evidence={b.evidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* SECTION: GAMING */}
      {activeSection === 'gaming' && (
        <Panel title="Gaming Framerates & Test Conditions">
          {gaming.length === 0 ? (
            <p className="font-mono text-xs text-neutral-500 italic py-4">
              No gaming tests logged for this configuration.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse border border-neutral-300">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700 border-b border-neutral-300">
                    <th className="p-2.5 text-left">Game Title</th>
                    <th className="p-2.5 text-left">Resolution</th>
                    <th className="p-2.5 text-left">Preset</th>
                    <th className="p-2.5 text-center">Ray Tracing</th>
                    <th className="p-2.5 text-center">Upscaling</th>
                    <th className="p-2.5 text-left">Average FPS</th>
                    <th className="p-2.5 text-left">1% Low FPS</th>
                    <th className="p-2.5 text-left">Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {gaming.map((g, idx) => (
                    <tr key={idx} className="border-b border-neutral-200 hover:bg-neutral-50">
                      <td className="p-2.5 font-bold text-neutral-900">{g.game}</td>
                      <td className="p-2.5 text-neutral-700">{g.resolution || 'Native'}</td>
                      <td className="p-2.5 text-neutral-700">{g.preset || 'Default'}</td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] uppercase font-bold border ${
                            g.ray_tracing
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-neutral-50 text-neutral-500 border-neutral-200'
                          }`}
                        >
                          {g.ray_tracing ? 'RT ON' : 'RT OFF'}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] uppercase font-bold border ${
                            g.upscaling
                              ? 'bg-sky-50 text-sky-800 border-sky-300'
                              : 'bg-neutral-50 text-neutral-500 border-neutral-200'
                          }`}
                        >
                          {g.upscaling ? 'Upscaled' : 'Native'}
                        </span>
                      </td>
                      <td className="p-2.5 font-bold text-sm text-[#141414]">
                        {g.avg_fps != null ? `${g.avg_fps} FPS` : 'N/A'}
                      </td>
                      <td className="p-2.5 text-neutral-700">
                        {g.one_percent_low_fps != null ? `${g.one_percent_low_fps} FPS` : '—'}
                      </td>
                      <td className="p-2.5">
                        <EvidenceBadge evidence={g.evidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* SECTION: THERMALS */}
      {activeSection === 'thermals' && (
        <Panel title="Thermal Measurements & Surface Temperatures">
          {thermals.length === 0 ? (
            <p className="font-mono text-xs text-neutral-500 italic py-4">
              No thermal test results logged.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {thermals.map((t, idx) => (
                <div key={idx} className="border border-neutral-300 p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-mono text-xs font-bold uppercase">{t.test_name}</span>
                    {t.sustained_wattage_w && (
                      <span className="font-mono text-xs text-neutral-600">
                        Wattage: <strong>{t.sustained_wattage_w}W</strong>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase">CPU Peak</span>
                      <span className="font-bold text-sm text-neutral-900">
                        {t.cpu_peak_c != null ? `${t.cpu_peak_c}°C` : 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase">CPU Avg</span>
                      <span className="font-bold text-sm text-neutral-900">
                        {t.cpu_avg_c != null ? `${t.cpu_avg_c}°C` : 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase">GPU Peak</span>
                      <span className="font-bold text-sm text-neutral-900">
                        {t.gpu_peak_c != null ? `${t.gpu_peak_c}°C` : 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase">Keyboard Hotspot</span>
                      <span className="font-bold text-sm text-neutral-900">
                        {t.keyboard_max_c != null ? `${t.keyboard_max_c}°C` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {t.fan_noise_db != null && (
                    <div className="pt-2 border-t border-dashed border-neutral-200 text-xs font-mono text-neutral-600">
                      Fan Noise: <strong>{t.fan_noise_db} dB</strong>
                    </div>
                  )}

                  {t.evidence && (
                    <div className="pt-1">
                      <EvidenceBadge evidence={t.evidence} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* SECTION: DISPLAY */}
      {activeSection === 'display' && (
        <Panel title="Display Lab Tests">
          {!display ? (
            <p className="font-mono text-xs text-neutral-500 italic py-4">
              No display laboratory measurements recorded.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard
                label="SDR Brightness"
                value={display.brightness_sdr_nits}
                unit="nits"
                evidence={<EvidenceBadge evidence={display.evidence} />}
              />
              <MetricCard
                label="sRGB Color Space"
                value={display.srgb_percent}
                unit="%"
                evidence={<EvidenceBadge evidence={display.evidence} />}
              />
              <MetricCard
                label="DCI-P3 Color Space"
                value={display.dci_p3_percent}
                unit="%"
                evidence={<EvidenceBadge evidence={display.evidence} />}
              />
              <MetricCard
                label="Response Time"
                value={display.response_time_ms}
                unit="ms"
                evidence={<EvidenceBadge evidence={display.evidence} />}
              />
            </div>
          )}
        </Panel>
      )}

      {/* SECTION: BATTERY */}
      {activeSection === 'battery' && (
        <Panel title="Battery Life & Charging">
          {!battery ? (
            <p className="font-mono text-xs text-neutral-500 italic py-4">
              No battery test data recorded.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard
                label="Battery Runtime"
                value={battery.battery_life_hours}
                unit="hours"
                subtext={battery.test_method || 'Standard Test'}
                evidence={<EvidenceBadge evidence={battery.evidence} />}
              />
              <MetricCard
                label="0-50% Fast Charge"
                value={battery.zero_to_fifty_min}
                unit="minutes"
                evidence={<EvidenceBadge evidence={battery.evidence} />}
              />
              <MetricCard
                label="100% Full Charge"
                value={battery.full_charge_min}
                unit="minutes"
                evidence={<EvidenceBadge evidence={battery.evidence} />}
              />
            </div>
          )}
        </Panel>
      )}

      {/* SECTION: EVIDENCE */}
      {activeSection === 'evidence' && (
        <Panel title="Verified Fact Provenance & Timestamps">
          {evidenceList.length === 0 ? (
            <p className="font-mono text-xs text-neutral-500 italic py-4">
              No evidence records logged.
            </p>
          ) : (
            <div className="space-y-2">
              {evidenceList.map((ev, idx) => (
                <div
                  key={idx}
                  className="border border-neutral-300 p-3 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-[#141414]">
                        {ev.field_path}
                      </span>
                      <EvidenceBadge evidence={ev} />
                    </div>
                    <p className="text-xs text-neutral-600">{ev.evidence_description}</p>
                    {ev.evidence_text && (
                      <p className="text-[11px] font-mono text-neutral-500 italic">
                        &ldquo;{ev.evidence_text}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* SECTION: PRICING */}
      {activeSection === 'pricing' && (
        <Panel title="Retail Listings & Price History">
          {listings.length === 0 ? (
            <p className="font-mono text-xs text-neutral-500 italic py-4">
              No retail product listings tracked for this configuration.
            </p>
          ) : (
            <div className="space-y-4">
              {listings.map(l => (
                <div key={l.id} className="border border-neutral-300 p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-mono text-xs font-bold uppercase">{l.retailer}</span>
                    <a
                      href={l.listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-[#F27D26] hover:underline flex items-center space-x-1"
                    >
                      <span>Open Product Listing</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="flex items-baseline space-x-2">
                    <span className="font-mono text-2xl font-bold text-[#141414]">
                      {l.price ? `₹${l.price.toLocaleString()}` : 'Price Not Listed'}
                    </span>
                    <span className="font-mono text-xs text-neutral-500">
                      ({l.in_stock ? 'In Stock' : 'Out of Stock / Unknown'})
                    </span>
                  </div>

                  {l.price_history && l.price_history.length > 0 && (
                    <div className="pt-2 border-t border-dashed border-neutral-200">
                      <span className="font-mono text-[10px] uppercase font-bold text-neutral-500 block mb-1">
                        Price History Trail
                      </span>
                      <div className="space-y-1 font-mono text-xs">
                        {l.price_history.map((h: any, hIdx: number) => (
                          <div key={hIdx} className="flex items-center justify-between text-neutral-600">
                            <span>{new Date(h.recorded_at).toLocaleDateString()}</span>
                            <span className="font-bold text-[#141414]">
                              ₹{h.price.toLocaleString()} ({h.source})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Admin Scoring Modal */}
      <AdminScoringModal
        isOpen={adminScoringModalOpen}
        onClose={() => setAdminScoringModalOpen(false)}
      />
    </div>
  );
};
