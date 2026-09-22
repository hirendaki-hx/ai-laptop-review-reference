import React from 'react';
import {
  Laptop,
  Search,
  Scale,
  Youtube,
  History,
  CheckCircle2,
  AlertCircle,
  Database,
  Sparkles,
} from 'lucide-react';
import { SupabaseStatusInfo } from '../types.ts';

interface HeaderProps {
  currentTab: 'extract' | 'review' | 'report' | 'browse' | 'compare';
  setCurrentTab: (tab: 'extract' | 'review' | 'report' | 'browse' | 'compare') => void;
  hasActiveReview: boolean;
  comparedCount: number;
  supabaseConfigured: boolean;
  supabaseStatus?: SupabaseStatusInfo | null;
  onOpenJobs: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  hasActiveReview,
  comparedCount,
  supabaseConfigured,
  supabaseStatus,
  onOpenJobs,
}) => {
  const isLive = supabaseStatus?.status === 'live' || (supabaseConfigured && (!supabaseStatus || supabaseStatus.reachable));
  const isConnError = supabaseStatus?.status === 'configured_unreachable';

  const badgeText = isLive
    ? 'SUPABASE: LIVE'
    : isConnError
    ? 'DB: CONNECTION_ERROR'
    : 'DB: LOCAL_FALLBACK';

  const badgeColor = isLive
    ? 'text-emerald-800'
    : isConnError
    ? 'text-rose-800'
    : 'text-amber-800';

  const dotColor = isLive
    ? 'bg-emerald-500'
    : isConnError
    ? 'bg-rose-500'
    : 'bg-amber-500';

  const badgeTitle = isLive
    ? `Connected to Supabase Postgres (${supabaseStatus?.url || 'Live'})`
    : isConnError
    ? `Supabase is configured but unreachable: ${supabaseStatus?.error || 'Check service role key and network/database permissions'}`
    : 'Demo in-memory fallback active. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to save permanently to Supabase.';
  return (
    <header className="sticky top-0 z-40 bg-[#F2F1EE] border-b border-[#141414] text-[#141414]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Brand Logo & Identifier */}
          <div
            className="flex items-center space-x-3 cursor-pointer select-none"
            onClick={() => setCurrentTab('extract')}
            id="brand-logo-button"
          >
            <div className="w-8 h-8 bg-[#141414] text-[#E4E3E0] flex items-center justify-center border border-[#141414]">
              <Laptop className="w-4 h-4 text-[#F27D26]" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold tracking-tighter text-base sm:text-lg text-[#141414]">
                AI.LAPTOP_REVIEW
              </span>
              <span className="hidden md:inline-block px-2 py-0.5 bg-[#141414] text-[#E4E3E0] text-[10px] font-mono uppercase tracking-widest">
                {hasActiveReview ? 'Status: Review Required' : 'Status: Online'}
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="hidden md:flex items-center space-x-2" id="main-navigation">
            <button
              id="nav-extract-btn"
              onClick={() => setCurrentTab('extract')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono uppercase font-bold tracking-tight transition-colors border border-[#141414] ${
                currentTab === 'extract'
                  ? 'bg-[#141414] text-[#E4E3E0]'
                  : 'bg-white text-[#141414] hover:bg-[#EBEAE7]'
              }`}
            >
              <Youtube className="w-3.5 h-3.5 text-rose-600" />
              <span>Extract</span>
            </button>

            {hasActiveReview && (
              <button
                id="nav-review-btn"
                onClick={() => setCurrentTab('review')}
                className={`relative flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono uppercase font-bold tracking-tight transition-colors border border-[#141414] ${
                  currentTab === 'review'
                    ? 'bg-[#F27D26] text-[#141414]'
                    : 'bg-yellow-300 text-[#141414] hover:bg-yellow-400'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#141414]" />
                <span>Review & Edit</span>
                <span className="w-2 h-2 bg-[#141414] rounded-full animate-ping absolute -top-1 -right-1" />
              </button>
            )}

            <button
              id="nav-browse-btn"
              onClick={() => setCurrentTab('browse')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono uppercase font-bold tracking-tight transition-colors border border-[#141414] ${
                currentTab === 'browse'
                  ? 'bg-[#141414] text-[#E4E3E0]'
                  : 'bg-white text-[#141414] hover:bg-[#EBEAE7]'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Browse</span>
            </button>

            <button
              id="nav-compare-btn"
              onClick={() => setCurrentTab('compare')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono uppercase font-bold tracking-tight transition-colors border border-[#141414] ${
                currentTab === 'compare'
                  ? 'bg-[#141414] text-[#E4E3E0]'
                  : 'bg-white text-[#141414] hover:bg-[#EBEAE7]'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Compare</span>
              {comparedCount > 0 && (
                <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold bg-[#F27D26] text-[#141414] border border-[#141414]">
                  {comparedCount}
                </span>
              )}
            </button>

            <button
              id="nav-jobs-btn"
              onClick={onOpenJobs}
              className="flex items-center space-x-1 px-3 py-1.5 text-xs font-mono uppercase font-bold tracking-tight text-[#141414] border border-[#141414] bg-white hover:bg-[#EBEAE7]"
              title="Extraction Jobs Audit"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Audit Log</span>
            </button>
          </nav>

          {/* Status Indicators */}
          <div className="flex items-center space-x-3">
            <div
              className={`hidden sm:flex items-center space-x-2 px-3 py-1 text-[11px] font-mono border border-[#141414] bg-white ${badgeColor}`}
              title={badgeTitle}
              id="supabase-status-badge"
            >
              <Database className="w-3 h-3 text-[#141414]" />
              <span className="font-bold">{badgeText}</span>
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            </div>

            {/* Mobile Nav Toggle / Tab Selector */}
            <div className="flex md:hidden items-center space-x-1">
              <button
                onClick={() => setCurrentTab('extract')}
                className={`p-1.5 border border-[#141414] ${currentTab === 'extract' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414]'}`}
                title="Extract"
              >
                <Youtube className="w-4 h-4" />
              </button>
              {hasActiveReview && (
                <button
                  onClick={() => setCurrentTab('review')}
                  className={`p-1.5 border border-[#141414] ${currentTab === 'review' ? 'bg-[#F27D26] text-[#141414]' : 'bg-yellow-300 text-[#141414]'}`}
                  title="Review"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setCurrentTab('browse')}
                className={`p-1.5 border border-[#141414] ${currentTab === 'browse' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414]'}`}
                title="Browse"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentTab('compare')}
                className={`p-1.5 border border-[#141414] ${currentTab === 'compare' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414]'}`}
                title="Compare"
              >
                <Scale className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

