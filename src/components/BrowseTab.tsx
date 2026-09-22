import React, { useState, useEffect } from 'react';
import {
  Search,
  Laptop,
  Cpu,
  Zap,
  Layers,
  ChevronRight,
  Scale,
  Check,
  Filter,
  Sparkles,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { LaptopRow, ConfigurationRow } from '../types.ts';
import { trackedFetch } from '../utils/trackedFetch.ts';

interface BrowseTabProps {
  onSelectConfig: (configId: string) => void;
  onToggleCompare: (configId: string) => void;
  comparedIds: string[];
  currentReportConfigId?: string | null;
  onLaptopDeleted?: (laptopId: string, deletedConfigIds: string[]) => void;
}

export const BrowseTab: React.FC<BrowseTabProps> = ({
  onSelectConfig,
  onToggleCompare,
  comparedIds,
  currentReportConfigId,
  onLaptopDeleted,
}) => {
  const [laptops, setLaptops] = useState<LaptopRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<LaptopRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadLaptops() {
      try {
        setLoading(true);
        const url = searchQuery.trim()
          ? `/api/laptops?q=${encodeURIComponent(searchQuery.trim())}`
          : '/api/laptops';
        const res = await trackedFetch(url);
        if (res.ok) {
          const data: LaptopRow[] = await res.json();
          if (isMounted) setLaptops(data);
        }
      } catch (err) {
        console.warn('Failed to load laptops:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    const timer = setTimeout(loadLaptops, 250);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Extract unique brands
  const brands: string[] = Array.from(
    new Set(laptops.map((l) => l.laptop?.brand?.name).filter(Boolean) as string[])
  );

  const filteredLaptops = laptops.filter((item) => {
    if (selectedBrand !== 'all' && item.laptop?.brand?.name !== selectedBrand) return false;
    return true;
  });

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const laptopId = deleteTarget.laptop.id;
    const configIds = (deleteTarget.configurations || []).map((c) => c.id);

    try {
      setIsDeleting(true);
      const res = await trackedFetch(`/api/laptops/${laptopId}`, { method: 'DELETE' });
      if (res.ok) {
        setLaptops((prev) => prev.filter((item) => item.laptop.id !== laptopId));
        if (onLaptopDeleted) {
          onLaptopDeleted(laptopId, configIds);
        }
        setDeleteTarget(null);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete laptop');
      }
    } catch (err) {
      console.error('Failed to delete laptop:', err);
      alert('Error deleting laptop');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 space-y-6 font-sans text-[#141414]" id="browse-view">
      {/* Search & Filter Header */}
      <div className="space-y-4">
        <div className="border-b-2 border-[#141414] pb-4">
          <h1 className="text-2xl sm:text-3xl font-serif italic font-bold text-[#141414] tracking-tight">
            Browse Verified Hardware Registry
          </h1>
          <p className="text-xs sm:text-sm font-mono text-gray-600 mt-1">
            Search verified laptop hardware configurations stored in Supabase Postgres
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 font-mono">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
            <input
              id="browse-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by brand, model, CPU, GPU..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] text-[#141414] text-xs font-mono shadow-[3px_3px_0px_0px_#141414] focus:outline-none placeholder-gray-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-[#141414] shrink-0" />
            <select
              id="brand-filter-select"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-white border-2 border-[#141414] text-[#141414] text-xs font-mono font-bold uppercase px-3 py-2.5 shadow-[3px_3px_0px_0px_#141414] focus:outline-none cursor-pointer"
            >
              <option value="all">ALL BRANDS ({laptops.length})</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Laptops Grid */}
      {loading ? (
        <div className="py-20 text-center font-mono">
          <div className="w-10 h-10 border-2 border-[#141414] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-xs uppercase font-bold tracking-wider">Searching database...</p>
        </div>
      ) : filteredLaptops.length === 0 ? (
        <div className="p-12 text-center bg-[#F9F8F6] border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] font-mono">
          <Laptop className="w-8 h-8 text-gray-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold uppercase text-[#141414]">No laptops found</h3>
          <p className="text-xs text-gray-600 mt-1">
            Try a different search or extract a new review video from YouTube!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredLaptops.map((item) => {
            const lap = item.laptop;
            const configs = item.configurations || [];
            const primaryConfig = configs[0];

            return (
              <div
                key={lap.id}
                id={`laptop-card-${lap.id}`}
                className="bg-[#F9F8F6] border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_#141414] hover:shadow-[6px_6px_0px_0px_#141414] transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2 font-mono">
                        <span className="px-2 py-0.5 bg-[#141414] text-white text-[10px] font-bold uppercase tracking-wider">
                          {lap.brand?.name || 'Laptop'}
                        </span>
                        {lap.series && (
                          <span className="text-[11px] text-gray-600 font-medium">{lap.series}</span>
                        )}
                        {lap.generation && (
                          <span className="text-[11px] text-gray-500">{lap.generation}</span>
                        )}
                      </div>
                      <h3 className="font-serif italic font-bold text-[#141414] text-xl mt-1 tracking-tight">
                        {lap.brand?.name} {lap.model}
                      </h3>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-white border border-[#141414] text-[#141414] text-[10px] font-mono font-bold">
                        {configs.length} {configs.length === 1 ? 'CONFIG' : 'CONFIGS'}
                      </span>
                      <button
                        id={`delete-laptop-btn-${lap.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(item);
                        }}
                        disabled={isDeleting}
                        className="p-1.5 border border-gray-300 hover:border-red-600 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title={`Delete ${lap.brand?.name} ${lap.model}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Primary Configuration Preview */}
                  {primaryConfig ? (
                    <div className="p-3 bg-white border border-[#141414] text-xs font-mono space-y-1.5 text-[#141414]">
                      <div className="flex items-center space-x-1.5 font-medium">
                        <Cpu className="w-3.5 h-3.5 text-[#F27D26] shrink-0" />
                        <span className="truncate">{primaryConfig.cpu || 'Unknown CPU'}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 font-medium">
                        <Zap className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span className="truncate">
                          {primaryConfig.gpu || 'Unknown GPU'}
                          {primaryConfig.gpu_tgp_w ? ` (${primaryConfig.gpu_tgp_w}W)` : ''}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-gray-600 text-[11px] pt-0.5">
                        <span>{primaryConfig.ram_gb ? `${primaryConfig.ram_gb}GB RAM` : ''}</span>
                        <span>
                          {primaryConfig.storage_gb
                            ? primaryConfig.storage_gb >= 1000
                              ? `${primaryConfig.storage_gb / 1000}TB SSD`
                              : `${primaryConfig.storage_gb}GB SSD`
                            : ''}
                        </span>
                        <span>{primaryConfig.display_resolution || ''}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 font-mono italic">No configurations attached.</p>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-[#141414]/20 mt-4 font-mono">
                  {primaryConfig ? (
                    <button
                      id={`compare-toggle-btn-${primaryConfig.id}`}
                      onClick={() => onToggleCompare(primaryConfig.id)}
                      className={`inline-flex items-center space-x-1.5 px-3 py-1.5 border border-[#141414] text-xs font-bold transition-all cursor-pointer ${
                        comparedIds.includes(primaryConfig.id)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white hover:bg-gray-100 text-[#141414]'
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>
                        {comparedIds.includes(primaryConfig.id) ? '[✓ In Compare]' : '[+ Compare]'}
                      </span>
                    </button>
                  ) : (
                    <div />
                  )}

                  {primaryConfig && (
                    <button
                      id={`view-report-btn-${lap.id}`}
                      onClick={() => onSelectConfig(primaryConfig.id)}
                      className="inline-flex items-center space-x-1 px-3.5 py-1.5 bg-[#141414] hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-[2px_2px_0px_0px_#141414] cursor-pointer"
                    >
                      <span>VIEW REPORT</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Laptop Deletion Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-mono">
          <div className="bg-[#F9F8F6] border-2 border-[#141414] shadow-[8px_8px_0px_0px_#141414] max-w-md w-full p-6 space-y-4 text-[#141414]">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#141414]">
              <div className="flex items-center space-x-2 text-red-700">
                <AlertTriangle className="w-5 h-5 text-red-700" />
                <h3 className="text-base font-serif italic font-bold text-[#141414]">
                  Confirm Laptop Deletion
                </h3>
              </div>
              <button
                onClick={() => !isDeleting && setDeleteTarget(null)}
                disabled={isDeleting}
                className="p-1 border border-[#141414] bg-white text-[#141414] hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Confirmation details */}
            <div className="p-3.5 bg-red-50 border border-red-300 text-xs text-red-900 space-y-2 leading-relaxed">
              <p className="font-bold text-sm">
                Delete {deleteTarget.laptop.brand?.name} {deleteTarget.laptop.model}?
              </p>
              <p>
                This removes {deleteTarget.configurationsCount} configuration(s), {deleteTarget.reviewsCount} review(s), and all their benchmark/gaming/thermal/display/battery data and retail listings. This cannot be undone.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#141414]/20">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 border border-[#141414] bg-white hover:bg-gray-100 text-xs font-bold uppercase transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-laptop-btn"
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase border border-[#141414] shadow-[2px_2px_0px_0px_#141414] transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Laptop'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
