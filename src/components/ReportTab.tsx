import React, { useState, useEffect } from 'react';
import {
  Laptop,
  Cpu,
  Award,
  Gamepad2,
  Flame,
  Monitor,
  Battery,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Scale,
  Sparkles,
  Calendar,
  User,
  ThumbsUp,
  ThumbsDown,
  Zap,
  Code2,
  Check,
  Layers,
  Tag,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import {
  ConfigurationReport,
  BenchmarkResultRow,
  GamingResultRow,
  ThermalResultRow,
  BenchmarkCategory,
} from '../types.ts';
import { trackedFetch } from '../utils/trackedFetch.ts';

interface ReportTabProps {
  configId: string;
  onSelectConfig: (id: string) => void;
  onToggleCompare: (configId: string) => void;
  isCompared: boolean;
}

const CATEGORY_NAMES: Record<BenchmarkCategory, string> = {
  cpu: 'CPU Processing & Compute',
  gpu: 'GPU Graphics & Compute',
  rendering: '3D Rendering & Ray Tracing',
  ai: 'AI & NPU Accelerators',
  storage: 'Storage Read / Write',
  system: 'System & Full Workload',
  productivity: 'Office & Productivity',
};

export const ReportTab: React.FC<ReportTabProps> = ({
  configId,
  onSelectConfig,
  onToggleCompare,
  isCompared,
}) => {
  const [report, setReport] = useState<ConfigurationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeReportTab, setActiveReportTab] = useState<
    'benchmarks' | 'gaming' | 'thermals' | 'display' | 'battery' | 'verdict' | 'raw'
  >('benchmarks');
  const [expandedRawJson, setExpandedRawJson] = useState<string | null>(null);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const handleRefreshListings = async () => {
    try {
      setRefreshingPrices(true);
      setRefreshMessage(null);
      const res = await trackedFetch('/api/listings/refresh', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const repRes = await trackedFetch(`/api/configurations/${configId}`);
        if (repRes.ok) {
          const updatedReport: ConfigurationReport = await repRes.json();
          setReport(updatedReport);
        }
        setRefreshMessage(
          `Refreshed ${data.updated || 0} listings (${data.priceChangedCount || 0} price changes logged)`
        );
        setTimeout(() => setRefreshMessage(null), 5000);
      } else {
        setRefreshMessage(data.error || 'Refresh failed');
      }
    } catch (err: any) {
      setRefreshMessage(err.message || 'Refresh failed');
    } finally {
      setRefreshingPrices(false);
    }
  };

  const refetchReport = async () => {
    try {
      const repRes = await trackedFetch(`/api/configurations/${configId}`);
      if (repRes.ok) {
        const updatedReport: ConfigurationReport = await repRes.json();
        setReport(updatedReport);
      }
    } catch (err) {
      console.error('Failed to refetch report:', err);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    const confirmed = window.confirm(
      'Delete this review and its benchmark/gaming/thermal/display/battery data? This cannot be undone.'
    );
    if (!confirmed) return;

    try {
      const res = await trackedFetch(`/api/reviews/${reviewId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await refetchReport();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete review');
      }
    } catch (err: any) {
      console.error('Error deleting review:', err);
      alert('Error deleting review');
    }
  };

  const handleDeleteListing = async (listingId: string) => {
    const confirmed = window.confirm(
      'Remove this retail listing? Price history will also be deleted.'
    );
    if (!confirmed) return;

    try {
      const res = await trackedFetch(`/api/listings/${listingId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await refetchReport();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete listing');
      }
    } catch (err: any) {
      console.error('Error deleting listing:', err);
      alert('Error deleting listing');
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function fetchReport() {
      try {
        setLoading(true);
        setError(null);
        const res = await trackedFetch(`/api/configurations/${configId}`);
        if (!res.ok) {
          throw new Error('Failed to load laptop report.');
        }
        const data: ConfigurationReport = await res.json();
        if (isMounted) {
          setReport(data);
          if (data.reviews.length > 0) {
            setExpandedRawJson(data.reviews[0].id);
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error loading report');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchReport();

    return () => {
      isMounted = false;
    };
  }, [configId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-20 px-4 text-center font-mono text-[#141414]">
        <div className="w-10 h-10 border-2 border-[#141414] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-xs uppercase font-bold tracking-wider">Loading verified specs from Supabase...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center font-mono">
        <div className="p-6 bg-[#F9F8F6] border-2 border-[#141414] shadow-[6px_6px_0px_0px_#141414] text-[#141414]">
          <h3 className="text-base font-bold uppercase tracking-wider mb-2">Report Not Found</h3>
          <p className="text-xs text-gray-600 mb-4">{error || 'Configuration ID does not exist in public schema.'}</p>
        </div>
      </div>
    );
  }

  const { laptop, brand, configuration, reviews, siblingConfigurations } = report;

  // Flatten benchmarks across reviews for aggregate group display
  const allBenchmarks: { review: any; item: BenchmarkResultRow }[] = [];
  reviews.forEach((rev) => {
    (rev.benchmarks || []).forEach((bm) => {
      allBenchmarks.push({ review: rev, item: bm });
    });
  });

  // Group benchmarks by category, then by benchmark_group
  const benchmarksByCategory: Record<
    string,
    Record<string, { variant: string | null; score: number; unit: string | null; reviewer: string; power_mode: string | null }[]>
  > = {};

  allBenchmarks.forEach(({ review, item }) => {
    const cat = item.category || 'cpu';
    if (!benchmarksByCategory[cat]) benchmarksByCategory[cat] = {};
    if (!benchmarksByCategory[cat][item.benchmark_group]) {
      benchmarksByCategory[cat][item.benchmark_group] = [];
    }
    benchmarksByCategory[cat][item.benchmark_group].push({
      variant: item.variant,
      score: item.score,
      unit: item.unit,
      reviewer: review.reviewer,
      power_mode: item.power_mode,
    });
  });

  // Collect gaming, thermals, display, battery
  const allGaming: { review: any; item: GamingResultRow }[] = [];
  reviews.forEach((rev) => {
    (rev.gaming || []).forEach((gm) => allGaming.push({ review: rev, item: gm }));
  });

  const allThermals: { review: any; item: ThermalResultRow }[] = [];
  reviews.forEach((rev) => {
    (rev.thermals || []).forEach((th) => allThermals.push({ review: rev, item: th }));
  });

  const displayResults = reviews.map((r) => r.display).filter(Boolean);
  const batteryResults = reviews.map((r) => r.battery).filter(Boolean);
  const productListings = report.productListings || [];
  const heroImage = productListings.find((l) => l.image_url)?.image_url;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 space-y-6 font-sans text-[#141414]" id="report-view">
      {/* Header Banner */}
      <div className="bg-[#F9F8F6] border-2 border-[#141414] p-6 sm:p-8 shadow-[6px_6px_0px_0px_#141414] relative">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          {heroImage && (
            <div className="w-full md:w-52 h-40 bg-white border-2 border-[#141414] shrink-0 p-2.5 flex items-center justify-center shadow-[3px_3px_0px_0px_#141414] overflow-hidden">
              <img
                src={heroImage}
                alt={`${brand.name} ${laptop.model}`}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}

          <div className="space-y-3 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 bg-[#141414] text-white text-[10px] font-mono uppercase font-bold tracking-wider">
                {brand.name}
              </span>
              {laptop.series && (
                <span className="px-2 py-0.5 bg-white border border-[#141414] text-[#141414] text-[10px] font-mono">
                  {laptop.series}
                </span>
              )}
              {laptop.generation && (
                <span className="px-2 py-0.5 bg-white border border-[#141414] text-[#141414] text-[10px] font-mono">
                  {laptop.generation}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-serif italic font-bold text-[#141414] tracking-tight">
              {brand.name} {laptop.model}
            </h1>

            {/* Spec Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
              {configuration.cpu && (
                <span className="px-2.5 py-1 bg-white border border-[#141414] text-[#141414] font-medium flex items-center space-x-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#F27D26]" />
                  <span>{configuration.cpu}</span>
                </span>
              )}
              {configuration.gpu && (
                <span className="px-2.5 py-1 bg-white border border-[#141414] text-[#141414] font-medium flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-rose-600" />
                  <span>
                    {configuration.gpu}
                    {configuration.gpu_tgp_w ? ` (${configuration.gpu_tgp_w}W)` : ''}
                  </span>
                </span>
              )}
              {configuration.ram_gb && (
                <span className="px-2.5 py-1 bg-white border border-[#141414] text-[#141414] font-medium">
                  {configuration.ram_gb}GB RAM
                  {configuration.ram_speed_mt_s ? ` @ ${configuration.ram_speed_mt_s} MT/s` : ''}
                </span>
              )}
              {configuration.storage_gb && (
                <span className="px-2.5 py-1 bg-white border border-[#141414] text-[#141414] font-medium">
                  {configuration.storage_gb >= 1000
                    ? `${configuration.storage_gb / 1000}TB SSD`
                    : `${configuration.storage_gb}GB SSD`}
                </span>
              )}
              {configuration.display_resolution && (
                <span className="px-2.5 py-1 bg-white border border-[#141414] text-[#141414] font-medium">
                  {configuration.display_size_inch ? `${configuration.display_size_inch}" ` : ''}
                  {configuration.display_resolution}
                  {configuration.refresh_rate_hz ? ` @ ${configuration.refresh_rate_hz}Hz` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Compare & Actions */}
          <div className="flex items-center space-x-3 shrink-0 font-mono">
            <button
              id="report-compare-toggle-btn"
              onClick={() => onToggleCompare(configuration.id)}
              className={`inline-flex items-center space-x-2 px-4 py-2 text-xs font-bold uppercase transition-all border-2 border-[#141414] cursor-pointer ${
                isCompared
                  ? 'bg-emerald-600 text-white shadow-[2px_2px_0px_0px_#141414]'
                  : 'bg-white hover:bg-gray-100 text-[#141414] shadow-[2px_2px_0px_0px_#141414]'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>{isCompared ? '[✓ In Compare]' : '[+ Add to Compare]'}</span>
            </button>
          </div>
        </div>

        {/* Sibling Configurations Switcher */}
        {siblingConfigurations.length > 1 && (
          <div className="mt-6 pt-4 border-t border-[#141414]/20 font-mono">
            <label className="text-[10px] uppercase font-bold text-[#141414]/70 block mb-2">
              Other configurations for this laptop:
            </label>
            <div className="flex flex-wrap gap-2">
              {siblingConfigurations.map((sib) => (
                <button
                  key={sib.id}
                  onClick={() => onSelectConfig(sib.id)}
                  className={`px-2.5 py-1 text-xs font-mono transition-all border border-[#141414] cursor-pointer ${
                    sib.id === configuration.id
                      ? 'bg-[#141414] text-white font-bold'
                      : 'bg-white hover:bg-gray-100 text-[#141414]'
                  }`}
                >
                  {sib.cpu} • {sib.gpu} • {sib.ram_gb}GB
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Retail Pricing & Availability (Amazon / Flipkart) */}
        {productListings.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[#141414]/20 flex flex-wrap items-center justify-between gap-3 font-mono">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-bold text-[#141414] uppercase text-[10px] flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-[#141414]" />
                <span>RETAIL PRICING:</span>
              </span>
              {productListings.map((listing) => (
                <div
                  key={listing.id}
                  className="inline-flex items-center border border-[#141414] bg-white shadow-[2px_2px_0px_0px_#141414]"
                >
                  <a
                    href={listing.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    id={`listing-link-${listing.retailer}`}
                    className="inline-flex items-center space-x-2 px-3 py-1 hover:bg-[#EBEAE7] text-xs font-mono transition-colors"
                  >
                    <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 bg-[#141414] text-white">
                      {listing.retailer}
                    </span>
                    {listing.current_price !== null && listing.current_price > 0 ? (
                      <span className="font-bold text-[#141414]">
                        ₹{listing.current_price.toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <span className="text-gray-500 italic text-[11px]">View Listing</span>
                    )}
                    {listing.in_stock === true && (
                      <span className="text-[9px] text-emerald-800 font-bold bg-emerald-50 px-1 border border-emerald-300">
                        In Stock
                      </span>
                    )}
                    {listing.in_stock === false && (
                      <span className="text-[9px] text-rose-800 font-bold bg-rose-50 px-1 border border-rose-300">
                        Out of Stock
                      </span>
                    )}
                    <ExternalLink className="w-3 h-3 text-[#141414]" />
                  </a>
                  <button
                    type="button"
                    id={`delete-listing-btn-${listing.id}`}
                    onClick={() => handleDeleteListing(listing.id)}
                    className="p-1 px-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border-l border-[#141414]/30 transition-colors cursor-pointer"
                    title={`Remove ${listing.retailer} listing`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <button
              id="report-refresh-prices-btn"
              onClick={handleRefreshListings}
              disabled={refreshingPrices}
              title="Refresh pricing and availability from retailer websites"
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-[11px] font-mono border border-[#141414] bg-white hover:bg-gray-100 disabled:opacity-50 cursor-pointer shadow-[2px_2px_0px_0px_#141414]"
            >
              <RefreshCw className={`w-3 h-3 ${refreshingPrices ? 'animate-spin' : ''}`} />
              <span>{refreshingPrices ? 'Refreshing...' : 'Refresh Prices'}</span>
            </button>
          </div>
        )}

        {refreshMessage && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono">
            {refreshMessage}
          </div>
        )}

        {/* Review Sources attribution row */}
        <div className="mt-5 pt-4 border-t border-[#141414]/20 flex flex-wrap items-center gap-3 text-xs font-mono">
          <span className="font-bold text-[#141414] uppercase text-[10px] flex items-center space-x-1">
            <User className="w-3.5 h-3.5 text-[#141414]" />
            <span>SOURCES ({reviews.length}):</span>
          </span>
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="inline-flex items-center border border-[#141414] bg-white shadow-[2px_2px_0px_0px_#141414]"
            >
              <a
                href={rev.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 hover:bg-[#EBEAE7] text-[#141414] transition-colors"
              >
                <span className="font-bold">{rev.reviewer}</span>
                {rev.verdict_score && (
                  <span className="px-1 py-0.2 bg-[#F27D26] text-[#141414] text-[10px] font-bold">
                    {rev.verdict_score}/10
                  </span>
                )}
                <ExternalLink className="w-3 h-3 text-[#141414]" />
              </a>
              <button
                type="button"
                id={`delete-review-btn-${rev.id}`}
                onClick={() => handleDeleteReview(rev.id)}
                className="p-1 px-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border-l border-[#141414]/30 transition-colors cursor-pointer"
                title={`Delete review by ${rev.reviewer}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="border-b-2 border-[#141414] flex items-center space-x-1 overflow-x-auto pb-0 text-xs font-mono font-bold uppercase">
        <button
          id="tab-benchmarks"
          onClick={() => setActiveReportTab('benchmarks')}
          className={`flex items-center space-x-2 px-4 py-2 border-t-2 border-x-2 whitespace-nowrap transition-all cursor-pointer ${
            activeReportTab === 'benchmarks'
              ? 'border-[#141414] bg-[#141414] text-white -mb-[2px] z-10'
              : 'border-transparent bg-transparent text-[#141414]/70 hover:text-[#141414] hover:bg-[#141414]/5'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Benchmarks ({allBenchmarks.length})</span>
        </button>

        <button
          id="tab-gaming"
          onClick={() => setActiveReportTab('gaming')}
          className={`flex items-center space-x-2 px-4 py-2 border-t-2 border-x-2 whitespace-nowrap transition-all cursor-pointer ${
            activeReportTab === 'gaming'
              ? 'border-[#141414] bg-[#141414] text-white -mb-[2px] z-10'
              : 'border-transparent bg-transparent text-[#141414]/70 hover:text-[#141414] hover:bg-[#141414]/5'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5" />
          <span>Gaming ({allGaming.length})</span>
        </button>

        <button
          id="tab-thermals"
          onClick={() => setActiveReportTab('thermals')}
          className={`flex items-center space-x-2 px-4 py-2 border-t-2 border-x-2 whitespace-nowrap transition-all cursor-pointer ${
            activeReportTab === 'thermals'
              ? 'border-[#141414] bg-[#141414] text-white -mb-[2px] z-10'
              : 'border-transparent bg-transparent text-[#141414]/70 hover:text-[#141414] hover:bg-[#141414]/5'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Thermals ({allThermals.length})</span>
        </button>

        <button
          id="tab-display"
          onClick={() => setActiveReportTab('display')}
          className={`flex items-center space-x-2 px-4 py-2 border-t-2 border-x-2 whitespace-nowrap transition-all cursor-pointer ${
            activeReportTab === 'display'
              ? 'border-[#141414] bg-[#141414] text-white -mb-[2px] z-10'
              : 'border-transparent bg-transparent text-[#141414]/70 hover:text-[#141414] hover:bg-[#141414]/5'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Display</span>
        </button>

        <button
          id="tab-battery"
          onClick={() => setActiveReportTab('battery')}
          className={`flex items-center space-x-2 px-4 py-2 border-t-2 border-x-2 whitespace-nowrap transition-all cursor-pointer ${
            activeReportTab === 'battery'
              ? 'border-[#141414] bg-[#141414] text-white -mb-[2px] z-10'
              : 'border-transparent bg-transparent text-[#141414]/70 hover:text-[#141414] hover:bg-[#141414]/5'
          }`}
        >
          <Battery className="w-3.5 h-3.5" />
          <span>Battery</span>
        </button>

        <button
          id="tab-verdict"
          onClick={() => setActiveReportTab('verdict')}
          className={`flex items-center space-x-2 px-4 py-2 border-t-2 border-x-2 whitespace-nowrap transition-all cursor-pointer ${
            activeReportTab === 'verdict'
              ? 'border-[#141414] bg-[#141414] text-white -mb-[2px] z-10'
              : 'border-transparent bg-transparent text-[#141414]/70 hover:text-[#141414] hover:bg-[#141414]/5'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Verdict & Pros/Cons</span>
        </button>

        <button
          id="tab-raw"
          onClick={() => setActiveReportTab('raw')}
          className={`flex items-center space-x-2 px-4 py-2 border-t-2 border-x-2 whitespace-nowrap transition-all cursor-pointer ${
            activeReportTab === 'raw'
              ? 'border-[#141414] bg-[#141414] text-white -mb-[2px] z-10'
              : 'border-transparent bg-transparent text-[#141414]/70 hover:text-[#141414] hover:bg-[#141414]/5'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Raw Extraction</span>
        </button>
      </div>

      {/* Tab 1: Benchmarks */}
      {activeReportTab === 'benchmarks' && (
        <div className="space-y-8 font-mono" id="benchmarks-section">
          {Object.keys(benchmarksByCategory).length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414]">
              No benchmark scores recorded for this configuration.
            </div>
          ) : (
            (Object.keys(benchmarksByCategory) as BenchmarkCategory[]).map((cat) => {
              const groups = benchmarksByCategory[cat];
              const groupKeys = Object.keys(groups);
              if (groupKeys.length === 0) return null;

              return (
                <section key={cat} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[#141414] pb-1">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 bg-[#F27D26]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#141414]">
                        {CATEGORY_NAMES[cat] || cat}
                      </h3>
                    </div>
                    <span className="text-[10px] text-gray-500 uppercase">CATEGORY: {cat}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupKeys.map((groupName) => {
                      const items = groups[groupName];
                      const hasVariants = items.some((i) => Boolean(i.variant));

                      return (
                        <div
                          key={groupName}
                          id={`benchmark-card-${groupName.toLowerCase().replace(/\s+/g, '-')}`}
                          className="bg-[#F9F8F6] border-2 border-[#141414] p-4 shadow-[4px_4px_0px_0px_#141414] space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-[#141414] pb-2">
                            <h4 className="font-bold text-[#141414] text-sm tracking-tight">
                              {groupName}
                            </h4>
                            <span className="text-[10px] font-bold text-[#F27D26] uppercase">
                              {cat}
                            </span>
                          </div>

                          {/* Side-by-side variant presentation or single-card representation */}
                          {hasVariants ? (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              {items.map((it, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 bg-white border border-[#141414] text-center"
                                >
                                  <span className="text-[10px] text-gray-500 font-bold uppercase block truncate">
                                    {it.variant || 'Standard'}
                                  </span>
                                  <span className="text-lg font-bold text-[#141414] mt-0.5 block tracking-tight">
                                    {it.score.toLocaleString()}
                                  </span>
                                  <span className="text-[9px] text-gray-500 block truncate mt-0.5">
                                    {it.reviewer}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-3 bg-white border border-[#141414] text-center">
                              <span className="text-2xl font-bold text-[#141414] tracking-tight">
                                {items[0].score.toLocaleString()}
                              </span>
                              {items[0].unit && (
                                <span className="text-xs text-gray-500 ml-1.5 font-bold">
                                  {items[0].unit}
                                </span>
                              )}
                              <div className="mt-1 flex items-center justify-center space-x-2 text-[10px] text-gray-500">
                                <span>By {items[0].reviewer}</span>
                                {items[0].power_mode && (
                                  <span>• {items[0].power_mode}</span>
                                )}
                              </div>
                            </div>
                          )}

                          {items.length > 2 && (
                            <div className="border-t border-[#141414]/20 pt-2 space-y-1">
                              {items.map((it, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between text-[10px] text-gray-600"
                                >
                                  <span className="truncate">{it.reviewer} ({it.variant || 'Score'})</span>
                                  <span className="font-bold text-[#141414]">
                                    {it.score.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Gaming */}
      {activeReportTab === 'gaming' && (
        <div className="space-y-4 font-mono" id="gaming-section">
          {allGaming.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414]">
              No gaming FPS benchmarks recorded for this configuration.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allGaming.map(({ review, item }, idx) => (
                <div
                  key={idx}
                  className="bg-[#F9F8F6] border-2 border-[#141414] p-4 shadow-[4px_4px_0px_0px_#141414] space-y-3"
                >
                  <div className="flex items-start justify-between border-b border-[#141414] pb-2">
                    <div>
                      <h4 className="font-bold text-[#141414] text-sm">{item.game}</h4>
                      <div className="flex items-center space-x-1.5 mt-1 text-[10px]">
                        {item.resolution && (
                          <span className="px-1.5 py-0.5 bg-white border border-[#141414] text-[#141414]">
                            {item.resolution}
                          </span>
                        )}
                        {item.preset && (
                          <span className="px-1.5 py-0.5 bg-white border border-[#141414] text-[#141414]">
                            {item.preset}
                          </span>
                        )}
                        {item.upscaling && (
                          <span className="px-1.5 py-0.5 bg-blue-100 border border-blue-600 text-blue-900">
                            {item.upscaling_mode || 'Upscaled'}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="text-[10px] text-gray-500 uppercase">{review.reviewer}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-2.5 bg-white border border-[#141414] text-center">
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">Avg FPS</span>
                      <span className="text-xl font-bold text-emerald-800 tracking-tight">
                        {item.avg_fps ?? '—'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white border border-[#141414] text-center">
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">1% Low</span>
                      <span className="text-xl font-bold text-[#141414] tracking-tight">
                        {item.one_percent_low_fps ?? '—'}
                      </span>
                    </div>
                  </div>

                  {item.avg_fps && (
                    <div className="w-full bg-[#EBEAE7] border border-[#141414] h-2">
                      <div
                        className="bg-[#141414] h-full transition-all"
                        style={{ width: `${Math.min(100, (item.avg_fps / 144) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Thermals */}
      {activeReportTab === 'thermals' && (
        <div className="space-y-4 font-mono" id="thermals-section">
          {allThermals.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414]">
              No thermal stress test results recorded.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allThermals.map(({ review, item }, idx) => (
                <div
                  key={idx}
                  className="bg-[#F9F8F6] border-2 border-[#141414] p-4 shadow-[4px_4px_0px_0px_#141414] space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-[#141414] pb-2">
                    <div>
                      <h4 className="font-bold text-[#141414] text-sm">{item.test_name}</h4>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Duration: {item.duration_minutes ? `${item.duration_minutes}m` : 'Loop'} • Reviewer: {review.reviewer}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-white border border-[#141414] text-center">
                      <span className="text-[9px] uppercase font-bold text-gray-500 block">CPU Peak</span>
                      <span className="text-lg font-bold text-orange-600 mt-0.5 block">
                        {item.cpu_peak_c ? `${item.cpu_peak_c}°C` : '—'}
                      </span>
                      {item.cpu_peak_power_w && (
                        <span className="text-[9px] text-gray-500 block">
                          {item.cpu_peak_power_w}W
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 bg-white border border-[#141414] text-center">
                      <span className="text-[9px] uppercase font-bold text-gray-500 block">GPU Peak</span>
                      <span className="text-lg font-bold text-rose-600 mt-0.5 block">
                        {item.gpu_peak_c ? `${item.gpu_peak_c}°C` : '—'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-white border border-[#141414] text-center">
                      <span className="text-[9px] uppercase font-bold text-gray-500 block">Deck Max</span>
                      <span className="text-lg font-bold text-amber-700 mt-0.5 block">
                        {item.keyboard_max_c ? `${item.keyboard_max_c}°C` : '—'}
                      </span>
                      <span className="text-[9px] text-gray-500 block">Surface</span>
                    </div>
                  </div>

                  {item.notes && (
                    <p className="text-[11px] text-gray-600 italic bg-white p-2.5 border border-[#141414]">
                      "{item.notes}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Display */}
      {activeReportTab === 'display' && (
        <div className="space-y-6 font-mono" id="display-section">
          {displayResults.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414]">
              No calibrated display measurements recorded.
            </div>
          ) : (
            displayResults.map((disp, idx) => (
              <div key={idx} className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414] space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-white border border-[#141414]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">SDR Brightness</span>
                    <span className="text-xl font-bold text-[#141414] mt-1 block">
                      {disp.brightness_sdr_nits ? `${disp.brightness_sdr_nits} nits` : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-[#141414]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">HDR Peak</span>
                    <span className="text-xl font-bold text-[#141414] mt-1 block">
                      {disp.brightness_hdr_nits ? `${disp.brightness_hdr_nits} nits` : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-[#141414]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Response Time</span>
                    <span className="text-xl font-bold text-[#141414] mt-1 block">
                      {disp.response_time_ms ? `${disp.response_time_ms}ms` : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-[#141414]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Sync Support</span>
                    <div className="flex items-center justify-center space-x-2 mt-2">
                      {disp.g_sync && (
                        <span className="px-1.5 py-0.5 bg-emerald-100 border border-emerald-700 text-emerald-900 text-[10px] font-bold">
                          G-Sync
                        </span>
                      )}
                      {disp.vrr && (
                        <span className="px-1.5 py-0.5 bg-blue-100 border border-blue-700 text-blue-900 text-[10px] font-bold">
                          VRR
                        </span>
                      )}
                      {!disp.g_sync && !disp.vrr && (
                        <span className="text-xs text-gray-500">Standard</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Color Gamuts */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                    Color Space Coverage
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs text-[#141414] mb-1">
                        <span>sRGB</span>
                        <span className="font-bold">{disp.srgb_percent ?? '—'}%</span>
                      </div>
                      <div className="w-full bg-[#EBEAE7] border border-[#141414] h-2">
                        <div
                          className="bg-[#141414] h-full"
                          style={{ width: `${Math.min(100, disp.srgb_percent || 0)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-[#141414] mb-1">
                        <span>DCI-P3</span>
                        <span className="font-bold">{disp.dci_p3_percent ?? '—'}%</span>
                      </div>
                      <div className="w-full bg-[#EBEAE7] border border-[#141414] h-2">
                        <div
                          className="bg-[#F27D26] h-full"
                          style={{ width: `${Math.min(100, disp.dci_p3_percent || 0)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-[#141414] mb-1">
                        <span>Adobe RGB</span>
                        <span className="font-bold">{disp.adobe_rgb_percent ?? '—'}%</span>
                      </div>
                      <div className="w-full bg-[#EBEAE7] border border-[#141414] h-2">
                        <div
                          className="bg-purple-700 h-full"
                          style={{ width: `${Math.min(100, disp.adobe_rgb_percent || 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 5: Battery */}
      {activeReportTab === 'battery' && (
        <div className="space-y-6 font-mono" id="battery-section">
          {batteryResults.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414]">
              No battery test results recorded.
            </div>
          ) : (
            batteryResults.map((bat, idx) => (
              <div key={idx} className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414] space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-white border border-[#141414]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Battery Run Time</span>
                    <span className="text-2xl font-bold text-emerald-800 mt-1 block">
                      {bat.battery_life_hours ? `${bat.battery_life_hours} hrs` : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-[#141414]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Power Adapter</span>
                    <span className="text-xl font-bold text-[#141414] mt-1 block">
                      {bat.charging_adapter_w ? `${bat.charging_adapter_w}W` : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-[#141414]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">0 - 50% Fast Charge</span>
                    <span className="text-xl font-bold text-[#141414] mt-1 block">
                      {bat.zero_to_fifty_min ? `${bat.zero_to_fifty_min} min` : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-[#141414]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">USB-C PD</span>
                    <span className="text-xl font-bold text-[#141414] mt-1 block">
                      {bat.usb_c_charging_w ? `${bat.usb_c_charging_w}W` : '—'}
                    </span>
                  </div>
                </div>

                {bat.test_method && (
                  <div className="p-3 bg-white border border-[#141414] text-xs text-[#141414]">
                    <span className="font-bold text-gray-500 uppercase text-[10px] block mb-1">
                      Measurement Conditions:
                    </span>
                    <p>{bat.test_method}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 6: Verdict & Pros/Cons */}
      {activeReportTab === 'verdict' && (
        <div className="space-y-6 font-mono" id="verdict-section">
          {reviews.map((rev) => (
            <div key={rev.id} className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414] space-y-4">
              <div className="flex items-center justify-between border-b border-[#141414] pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-[#141414] text-white flex items-center justify-center font-bold text-sm">
                    {rev.reviewer.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-[#141414] text-sm">{rev.reviewer}</h4>
                    <p className="text-[10px] text-gray-600">{rev.title}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {rev.verdict_score && (
                    <div className="px-3 py-1 bg-[#F27D26] border border-[#141414] text-[#141414] font-bold text-sm">
                      {rev.verdict_score} / 10
                    </div>
                  )}
                  <button
                    type="button"
                    id={`delete-verdict-review-btn-${rev.id}`}
                    onClick={() => handleDeleteReview(rev.id)}
                    className="p-1.5 border border-gray-300 hover:border-red-600 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    title={`Delete review by ${rev.reviewer}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {rev.verdict_summary && (
                <p className="text-xs text-[#141414] leading-relaxed italic bg-white p-3 border border-[#141414]">
                  "{rev.verdict_summary}"
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pros */}
                <div className="p-3 bg-emerald-50 border border-emerald-700 space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-900 font-bold text-[10px] uppercase tracking-wider">
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>Reviewer Highlights & Pros</span>
                  </div>
                  {rev.verdict_pros && rev.verdict_pros.length > 0 ? (
                    <ul className="space-y-1 text-xs text-emerald-950 font-sans">
                      {rev.verdict_pros.map((pro, i) => (
                        <li key={i} className="flex items-start space-x-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                          <span>{pro}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 italic">None highlighted</p>
                  )}
                </div>

                {/* Cons */}
                <div className="p-3 bg-red-50 border border-red-700 space-y-2">
                  <div className="flex items-center space-x-2 text-red-900 font-bold text-[10px] uppercase tracking-wider">
                    <ThumbsDown className="w-3.5 h-3.5" />
                    <span>Reviewer Criticisms & Cons</span>
                  </div>
                  {rev.verdict_cons && rev.verdict_cons.length > 0 ? (
                    <ul className="space-y-1 text-xs text-red-950 font-sans">
                      {rev.verdict_cons.map((con, i) => (
                        <li key={i} className="flex items-start space-x-1.5">
                          <span className="w-1.5 h-1.5 bg-red-700 shrink-0 mt-1.5" />
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 italic">None highlighted</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 7: Raw Extracted JSON Viewer */}
      {activeReportTab === 'raw' && (
        <div className="space-y-4 font-mono" id="raw-json-section">
          <p className="text-xs text-gray-600">
            AUDIT_TRAIL :: Exact unedited JSON extracted by Gemini models from YouTube review streams.
          </p>
          {reviews.map((rev) => (
            <div key={rev.id} className="bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpandedRawJson(expandedRawJson === rev.id ? null : rev.id)
                }
                className="w-full p-3.5 flex items-center justify-between text-left hover:bg-gray-100 text-xs font-bold text-[#141414] cursor-pointer"
              >
                <span>Raw Extraction: {rev.reviewer} ({rev.title})</span>
                {expandedRawJson === rev.id ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {expandedRawJson === rev.id && (
                <pre className="p-4 bg-white text-[11px] font-mono text-[#141414] overflow-x-auto border-t-2 border-[#141414] max-h-96">
                  {JSON.stringify(rev.raw_extraction || rev, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
