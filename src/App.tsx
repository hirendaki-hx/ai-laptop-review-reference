import React, { useState } from 'react';
import { AuthProvider } from './client/context/AuthContext.tsx';
import { Layout } from './client/components/Layout.tsx';
import { ExtractPage } from './client/pages/ExtractPage.tsx';
import { ReviewPage } from './client/pages/ReviewPage.tsx';
import { BrowsePage } from './client/pages/BrowsePage.tsx';
import { ReportPage } from './client/pages/ReportPage.tsx';
import { ComparePage } from './client/pages/ComparePage.tsx';
import { JobsPage } from './client/pages/JobsPage.tsx';
import { Check } from 'lucide-react';

function AppContent() {
  const [currentTab, setCurrentTab] = useState<'browse' | 'compare' | 'extract' | 'jobs' | 'report'>('browse');
  const [activeReviewJobId, setActiveReviewJobId] = useState<string | null>(null);
  const [activeReportConfigId, setActiveReportConfigId] = useState<string | null>(null);
  const [compareConfigIds, setCompareConfigIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleOpenReview = (jobId: string) => {
    setActiveReviewJobId(jobId);
    // When review opens, we stay in 'extract' or dedicated view
  };

  const handleCommitSuccess = (configId: string) => {
    setActiveReviewJobId(null);
    setActiveReportConfigId(configId);
    setCurrentTab('report');
    showToast('Verified review successfully committed to database!');
  };

  const handleToggleCompare = (configId: string) => {
    setCompareConfigIds(prev => {
      if (prev.includes(configId)) {
        showToast('Removed from comparison');
        return prev.filter(id => id !== configId);
      } else {
        if (prev.length >= 3) {
          showToast('Maximum 3 configurations can be compared simultaneously.');
          return prev;
        }
        showToast('Added to comparison queue');
        return [...prev, configId];
      }
    });
  };

  return (
    <Layout
      currentTab={currentTab}
      onSelectTab={tab => {
        if (tab !== 'extract') {
          // If moving away, we keep active review state intact
        }
        setCurrentTab(tab);
      }}
      activeReportConfigId={activeReportConfigId}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in font-mono">
          <div className="px-4 py-2.5 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_#141414] text-[#141414] text-xs font-bold flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Pages */}
      {currentTab === 'browse' && (
        <BrowsePage
          onSelectConfig={id => {
            setActiveReportConfigId(id);
            setCurrentTab('report');
          }}
          onNavigateToExtract={() => setCurrentTab('extract')}
          compareConfigIds={compareConfigIds}
          onToggleCompare={handleToggleCompare}
        />
      )}

      {currentTab === 'extract' && (
        <>
          {activeReviewJobId ? (
            <ReviewPage
              jobId={activeReviewJobId}
              onCommitSuccess={handleCommitSuccess}
              onCancel={() => setActiveReviewJobId(null)}
            />
          ) : (
            <ExtractPage
              onOpenReview={handleOpenReview}
              onOpenReport={configId => {
                setActiveReportConfigId(configId);
                setCurrentTab('report');
              }}
            />
          )}
        </>
      )}

      {currentTab === 'report' && activeReportConfigId && (
        <ReportPage
          configurationId={activeReportConfigId}
          onBack={() => setCurrentTab('browse')}
          compareConfigIds={compareConfigIds}
          onToggleCompare={handleToggleCompare}
        />
      )}

      {currentTab === 'compare' && (
        <ComparePage
          compareConfigIds={compareConfigIds}
          onRemoveFromCompare={handleToggleCompare}
          onSelectConfig={id => {
            setActiveReportConfigId(id);
            setCurrentTab('report');
          }}
          onNavigateToBrowse={() => setCurrentTab('browse')}
        />
      )}

      {currentTab === 'jobs' && (
        <JobsPage
          onOpenReview={jobId => {
            setActiveReviewJobId(jobId);
            setCurrentTab('extract');
          }}
          onOpenReport={configId => {
            setActiveReportConfigId(configId);
            setCurrentTab('report');
          }}
        />
      )}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
