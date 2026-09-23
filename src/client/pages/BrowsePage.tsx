import React, { useState, useEffect } from 'react';
import {
  Search,
  Laptop as LaptopIcon,
  Layers,
  ArrowRight,
  ExternalLink,
  Plus,
  Check,
  Sparkles,
  RefreshCw,
  Cpu,
  Tv,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { Panel } from '../components/ui/Panel.tsx';

interface BrowsePageProps {
  onSelectConfig: (configId: string) => void;
  onNavigateToExtract: () => void;
  compareConfigIds: string[];
  onToggleCompare: (configId: string) => void;
}

export const BrowsePage: React.FC<BrowsePageProps> = ({
  onSelectConfig,
  onNavigateToExtract,
  compareConfigIds,
  onToggleCompare,
}) => {
  const [laptops, setLaptops] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [laptopsRes, brandsRes] = await Promise.all([
        api.getLaptops({ search, brand: selectedBrand || undefined, limit: 30 }),
        api.getBrands(),
      ]);
      setLaptops(laptopsRes.laptops || []);
      setBrands(brandsRes.brands || []);
    } catch (err) {
      console.warn('Browse fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search, selectedBrand]);

  return (
    <div className="space-y-6">
      {/* Search & Hero Bar */}
      <div className="border-2 border-[#141414] bg-[#F9F8F6] p-5 shadow-[4px_4px_0px_#141414]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 font-mono text-[10px] uppercase font-bold bg-[#141414] text-white mb-1.5">
              <span>Verified Hardware Intelligence</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#141414]">
              Browse Hardware Configurations
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 mt-1 max-w-2xl">
              Inspect lab-measured benchmarks, gaming framerates, thermal wattage curves, and display
              color tests extracted with zero hallucination.
            </p>
          </div>

          <button
            onClick={onNavigateToExtract}
            className="px-4 py-2.5 bg-[#141414] text-white hover:bg-[#F27D26] font-mono text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer flex items-center space-x-2 shrink-0 border-2 border-[#141414]"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F27D26]" />
            <span>Ingest New Review</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="mt-5 relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search laptops by model, brand, processor, GPU, or series..."
            className="w-full pl-10 pr-4 py-2 border-2 border-[#141414] font-mono text-xs focus:outline-none focus:border-[#F27D26] bg-white"
          />
        </div>

        {/* Brand Filter Pills */}
        <div className="mt-3 flex items-center space-x-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedBrand('')}
            className={`px-3 py-1 font-mono text-xs uppercase font-semibold border transition-colors cursor-pointer shrink-0 ${
              selectedBrand === ''
                ? 'bg-[#141414] text-white border-[#141414]'
                : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#141414]'
            }`}
          >
            All Brands
          </button>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBrand(b.name)}
              className={`px-3 py-1 font-mono text-xs uppercase font-semibold border transition-colors cursor-pointer shrink-0 ${
                selectedBrand === b.name
                  ? 'bg-[#141414] text-white border-[#141414]'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#141414]'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Laptops & Configs Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 font-mono text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-[#F27D26]" />
          <span>Querying verified hardware configurations...</span>
        </div>
      ) : laptops.length === 0 ? (
        <div className="border-2 border-dashed border-neutral-400 p-12 text-center bg-white space-y-4">
          <LaptopIcon className="w-10 h-10 text-neutral-400 mx-auto" />
          <div>
            <h3 className="font-mono text-sm font-bold uppercase text-neutral-800">
              No Laptops Ingested Yet
            </h3>
            <p className="text-xs text-neutral-600 mt-1 max-w-md mx-auto">
              No review videos have been processed yet or no matching laptops found. Paste a YouTube URL to extract the first laptop data profile!
            </p>
          </div>
          <button
            onClick={onNavigateToExtract}
            className="px-5 py-2.5 bg-[#141414] text-white hover:bg-[#F27D26] font-mono text-xs uppercase font-bold tracking-wider inline-flex items-center space-x-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F27D26]" />
            <span>Extract First Review</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {laptops.map(laptop => {
            const configs = laptop.configurations || [];
            const primaryConfig = configs[0];

            return (
              <div
                key={laptop.id}
                className="bg-[#F9F8F6] border-2 border-[#141414] shadow-[3px_3px_0px_#141414] flex flex-col justify-between hover:border-[#F27D26] transition-colors"
              >
                <div className="p-4 border-b-2 border-[#141414] bg-[#EBEAE7] flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#141414] text-white font-bold uppercase">
                      {laptop.brand}
                    </span>
                    {laptop.series && (
                      <span className="font-mono text-[11px] text-neutral-600 font-semibold">
                        {laptop.series}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-neutral-500">
                    {configs.length} {configs.length === 1 ? 'Config' : 'Configs'}
                  </span>
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#141414] leading-snug">
                      {laptop.model}
                    </h3>
                    {laptop.generation && (
                      <p className="font-mono text-[11px] text-neutral-500 mt-0.5">
                        {laptop.generation}
                      </p>
                    )}
                  </div>

                  {/* Primary Configuration Preview */}
                  {primaryConfig ? (
                    <div className="border border-neutral-300 p-2.5 bg-white space-y-1.5 font-mono text-xs">
                      <div className="flex items-start space-x-1.5">
                        <Cpu className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                        <span className="font-semibold text-neutral-800 line-clamp-1">
                          {primaryConfig.cpu || 'Spec not stated'}
                        </span>
                      </div>
                      <div className="flex items-start space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                        <span className="text-neutral-700 line-clamp-1">
                          {primaryConfig.gpu || 'Integrated Graphics'}
                          {primaryConfig.gpu_tgp_w ? ` (${primaryConfig.gpu_tgp_w}W)` : ''}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] text-neutral-500 pt-1 border-t border-dashed border-neutral-200">
                        <span>{primaryConfig.ram_gb ? `${primaryConfig.ram_gb}GB RAM` : 'RAM N/A'}</span>
                        <span>•</span>
                        <span>
                          {primaryConfig.storage_gb
                            ? primaryConfig.storage_gb >= 1024
                              ? `${primaryConfig.storage_gb / 1024}TB`
                              : `${primaryConfig.storage_gb}GB`
                            : 'SSD N/A'}
                        </span>
                        <span>•</span>
                        <span>
                          {primaryConfig.display_resolution || 'Display N/A'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 border border-dashed border-neutral-300 text-xs font-mono text-neutral-400 text-center">
                      No configurations logged
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-2 flex items-center justify-between gap-2">
                    {primaryConfig && (
                      <button
                        onClick={() => onToggleCompare(primaryConfig.id)}
                        className={`px-2.5 py-1.5 border font-mono text-[11px] uppercase font-bold flex items-center space-x-1 transition-colors cursor-pointer ${
                          compareConfigIds.includes(primaryConfig.id)
                            ? 'bg-[#F27D26] text-white border-[#F27D26]'
                            : 'border-[#141414] bg-white text-[#141414] hover:bg-neutral-100'
                        }`}
                      >
                        {compareConfigIds.includes(primaryConfig.id) ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Compared</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Compare</span>
                          </>
                        )}
                      </button>
                    )}

                    {primaryConfig && (
                      <button
                        onClick={() => onSelectConfig(primaryConfig.id)}
                        className="px-3.5 py-1.5 bg-[#141414] text-white hover:bg-[#F27D26] font-mono text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer flex items-center space-x-1.5 ml-auto"
                      >
                        <span>View Report</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
