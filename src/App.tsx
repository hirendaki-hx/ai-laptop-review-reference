import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { ExtractTab } from './components/ExtractTab.tsx';
import { ReviewTab } from './components/ReviewTab.tsx';
import { ReportTab } from './components/ReportTab.tsx';
import { BrowseTab } from './components/BrowseTab.tsx';
import { CompareTab } from './components/CompareTab.tsx';
import { JobsModal } from './components/JobsModal.tsx';
import { ExtractionData, SupabaseStatusInfo } from './types.ts';
import { AlertCircle, Database, Check } from 'lucide-react';
import { trackedFetch } from './utils/trackedFetch.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<
    'extract' | 'review' | 'report' | 'browse' | 'compare'
  >('extract');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ExtractionData | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [comparedIds, setComparedIds] = useState<string[]>([]);
  const [isJobsModalOpen, setIsJobsModalOpen] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean>(false);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatusInfo | null>(null);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check system status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await trackedFetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          if (data.supabase) {
            setSupabaseStatus(data.supabase);
            setSupabaseConfigured(Boolean(data.supabase.configured && data.supabase.reachable));
          }
          setHasGeminiKey(Boolean(data.hasGeminiKey));
        }
      } catch (err) {
        console.warn('Status check failed:', err);
      }
    }
    checkStatus();
  }, []);

  // Show transient toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // When extraction finishes in background and is ready for human review
  const handleExtractionReady = (jobId: string, data: ExtractionData) => {
    setActiveJobId(jobId);
    setReviewData(data);
    setCurrentTab('review');
    showToast('Gemini extraction finished! Please review the extracted data before saving.');
  };

  // When review is committed to Supabase
  const handleCommitSuccess = (configId: string) => {
    setSelectedConfigId(configId);
    setReviewData(null);
    setActiveJobId(null);
    setCurrentTab('report');
    showToast('✓ Successfully committed to Supabase database!');
  };

  // When user discards extraction
  const handleDiscard = () => {
    setReviewData(null);
    setActiveJobId(null);
    setCurrentTab('extract');
    showToast('Extraction discarded. Nothing was written to the database.');
  };

  // Navigate directly to a configuration report
  const handleSelectConfig = (configId: string) => {
    setSelectedConfigId(configId);
    setCurrentTab('report');
  };

  // Toggle configuration in compare list
  const handleToggleCompare = (configId: string) => {
    if (comparedIds.includes(configId)) {
      setComparedIds(comparedIds.filter((id) => id !== configId));
      showToast('Removed from compare list.');
    } else {
      if (comparedIds.length >= 3) {
        showToast('Maximum 3 configurations can be compared simultaneously.');
        return;
      }
      setComparedIds([...comparedIds, configId]);
      showToast('Added to compare list! Click "Compare" in the header to view.');
    }
  };

  // Resume review from jobs modal
  const handleResumeReview = (jobId: string, rawData: any) => {
    setActiveJobId(jobId);
    setReviewData(rawData);
    setCurrentTab('review');
  };

  // Handle laptop deletion
  const handleLaptopDeleted = (laptopId: string, deletedConfigIds: string[]) => {
    if (selectedConfigId && deletedConfigIds.includes(selectedConfigId)) {
      setSelectedConfigId(null);
      if (currentTab === 'report') {
        setCurrentTab('browse');
      }
    }
    setComparedIds((prev) => prev.filter((id) => !deletedConfigIds.includes(id)));
    showToast('Laptop and associated records deleted successfully.');
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] flex flex-col font-sans selection:bg-[#141414] selection:text-white">
      {/* Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        hasActiveReview={Boolean(reviewData && activeJobId)}
        comparedCount={comparedIds.length}
        supabaseConfigured={supabaseConfigured}
        supabaseStatus={supabaseStatus}
        onOpenJobs={() => setIsJobsModalOpen(true)}
      />

      {/* Supabase connection error banner if credentials exist but test query failed */}
      {supabaseStatus?.status === 'configured_unreachable' && (
        <div className="bg-rose-950 text-rose-100 border-b-2 border-rose-800 px-4 py-2 text-center text-xs font-mono">
          <div className="max-w-6xl mx-auto flex items-center justify-center space-x-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span>
              <strong>[SUPABASE CONNECTION ERROR]</strong> Supabase credentials were provided but the connection test failed:{' '}
              <span className="text-rose-200 font-bold">{supabaseStatus.error || 'Connection failed'}</span>. Database operations will report explicit errors rather than silently losing data.
            </span>
          </div>
        </div>
      )}

      {/* Supabase connection info banner if in demo fallback mode */}
      {(!supabaseStatus || supabaseStatus.status === 'missing') && !supabaseConfigured && (
        <div className="bg-[#141414] text-white border-b-2 border-[#141414] px-4 py-2 text-center text-xs font-mono">
          <div className="max-w-6xl mx-auto flex items-center justify-center space-x-2">
            <Database className="w-3.5 h-3.5 shrink-0 text-[#F27D26]" />
            <span>
              <strong>[IN-MEMORY TEST REGISTRY ACTIVE]</strong> Connect your live Supabase project by providing{' '}
              <code className="bg-gray-800 px-1.5 py-0.5 border border-gray-600 text-amber-300">SUPABASE_URL</code> and{' '}
              <code className="bg-gray-800 px-1.5 py-0.5 border border-gray-600 text-amber-300">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
              in your environment. All extractions, edits, and commits function smoothly in memory during testing!
            </span>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in font-mono">
          <div className="px-4 py-2.5 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_#141414] text-[#141414] text-xs font-bold flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-700" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Content Areas */}
      <main className="flex-1">
        {currentTab === 'extract' && (
          <ExtractTab
            onExtractionReady={handleExtractionReady}
            onNavigateToReport={handleSelectConfig}
            activeJobId={activeJobId}
            setActiveJobId={setActiveJobId}
          />
        )}

        {currentTab === 'review' && reviewData && activeJobId && (
          <ReviewTab
            jobId={activeJobId}
            initialData={reviewData}
            onCommitSuccess={handleCommitSuccess}
            onDiscard={handleDiscard}
          />
        )}

        {currentTab === 'report' && selectedConfigId && (
          <ReportTab
            configId={selectedConfigId}
            onSelectConfig={handleSelectConfig}
            onToggleCompare={handleToggleCompare}
            isCompared={comparedIds.includes(selectedConfigId)}
          />
        )}

        {currentTab === 'report' && !selectedConfigId && (
          <div className="max-w-4xl mx-auto py-20 px-4 text-center font-mono">
            <div className="p-10 bg-[#F9F8F6] border-2 border-[#141414] shadow-[6px_6px_0px_0px_#141414] space-y-4">
              <p className="text-gray-600 text-sm font-bold uppercase">No laptop report selected.</p>
              <button
                onClick={() => setCurrentTab('browse')}
                className="px-4 py-2 bg-[#141414] text-white text-xs font-bold uppercase hover:bg-gray-800 shadow-[2px_2px_0px_0px_#141414] cursor-pointer"
              >
                Browse Available Laptops
              </button>
            </div>
          </div>
        )}

        {currentTab === 'browse' && (
          <BrowseTab
            onSelectConfig={handleSelectConfig}
            onToggleCompare={handleToggleCompare}
            comparedIds={comparedIds}
            currentReportConfigId={selectedConfigId}
            onLaptopDeleted={handleLaptopDeleted}
          />
        )}

        {currentTab === 'compare' && (
          <CompareTab
            comparedIds={comparedIds}
            onRemoveFromCompare={(id) => setComparedIds(comparedIds.filter((x) => x !== id))}
            onNavigateToBrowse={() => setCurrentTab('browse')}
            onSelectConfig={handleSelectConfig}
          />
        )}
      </main>

      {/* Extraction Jobs Audit Modal */}
      <JobsModal
        isOpen={isJobsModalOpen}
        onClose={() => setIsJobsModalOpen(false)}
        onResumeReview={handleResumeReview}
      />

      {/* Footer */}
      <footer className="border-t-2 border-[#141414] bg-[#F9F8F6] py-5 text-center text-xs font-mono text-gray-700">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AI Laptop Review — YouTube Video Analysis & Supabase Postgres Registry</span>
          <span className="font-bold text-[#141414]">Powered by Gemini & @supabase/supabase-js</span>
        </div>
      </footer>
    </div>
  );
}
