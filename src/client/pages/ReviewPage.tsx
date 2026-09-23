import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Save,
  Trash2,
  AlertTriangle,
  Layers,
  Sparkles,
  ExternalLink,
  Plus,
  X,
  CheckCircle2,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  ExtractedDataPayload,
  ConfigurationMatchResult,
  BenchmarkResult,
  GamingResult,
  ThermalResult,
} from '../../shared/types/index.ts';
import { Panel } from '../components/ui/Panel.tsx';
import { StatusBadge } from '../components/ui/StatusBadge.tsx';
import { EvidenceBadge } from '../components/ui/EvidenceBadge.tsx';

interface ReviewPageProps {
  jobId: string;
  onCommitSuccess: (configurationId: string) => void;
  onCancel: () => void;
}

export const ReviewPage: React.FC<ReviewPageProps> = ({
  jobId,
  onCommitSuccess,
  onCancel,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ExtractedDataPayload | null>(null);
  const [matches, setMatches] = useState<ConfigurationMatchResult[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Optional Retail inputs
  const [amazonUrl, setAmazonUrl] = useState('');
  const [flipkartUrl, setFlipkartUrl] = useState('');
  const [amazonManualPrice, setAmazonManualPrice] = useState<string>('');
  const [flipkartManualPrice, setFlipkartManualPrice] = useState<string>('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [retailPreview, setRetailPreview] = useState<{
    amazon?: any;
    flipkart?: any;
  }>({});
  const [previewingRetail, setPreviewingRetail] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);

  // Active section tab for review
  const [activeTab, setActiveTab] = useState<
    'specs' | 'benchmarks' | 'gaming' | 'thermals' | 'display_battery' | 'evidence' | 'retail'
  >('specs');

  const handleResumeExtraction = async () => {
    if (resuming) return;
    setResuming(true);
    setResumeMessage('Resuming extraction from last incomplete pass...');
    try {
      await api.resumeJob(jobId);
      setResumeMessage('Job resumed! Polling for fresh pass results...');
      // Poll job for update
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const updatedJob = await api.getJob(jobId);
          if (updatedJob.raw_extraction) {
            setData(updatedJob.raw_extraction);
          }
          if (updatedJob.status === 'ready_for_review' || updatedJob.status === 'failed' || attempts > 30) {
            clearInterval(interval);
            setResuming(false);
            if (updatedJob.status === 'ready_for_review') {
              setResumeMessage('Extraction resumed successfully! Fresh test data captured.');
            } else if (updatedJob.error_message) {
              setResumeMessage(`Extraction notice: ${updatedJob.error_message}`);
            }
          }
        } catch {
          if (attempts > 30) {
            clearInterval(interval);
            setResuming(false);
          }
        }
      }, 3000);
    } catch (err: any) {
      setResuming(false);
      setResumeMessage(`Resume error: ${err?.message || 'Failed to resume extraction'}`);
    }
  };

  // Load Job and Matches
  useEffect(() => {
    let isSubscribed = true;

    async function loadData() {
      setLoading(true);
      try {
        const job = await api.getJob(jobId);
        if (!isSubscribed) return;

        if (job.raw_extraction) {
          setData(job.raw_extraction);
        }

        // Fetch intelligent configuration matches
        try {
          const matchRes = await api.getJobMatches(jobId);
          if (isSubscribed && matchRes.matches) {
            setMatches(matchRes.matches);
            // If there is an exact match, pre-suggest it but don't auto-commit
            const exact = matchRes.matches.find(m => m.classification === 'EXACT MATCH');
            if (exact && exact.matchedConfiguration) {
              setSelectedConfigId(exact.matchedConfiguration.id);
            }
          }
        } catch (matchErr) {
          console.warn('Match fetching notice:', matchErr);
        }
      } catch (err: any) {
        if (!isSubscribed) return;
        setCommitError(err.message || 'Failed to load extraction job');
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    loadData();

    return () => {
      isSubscribed = false;
    };
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3 font-mono text-xs">
        <RefreshCw className="w-6 h-6 animate-spin text-[#F27D26]" />
        <span>Loading extracted data for review...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 border-2 border-red-600 bg-red-50 text-red-800 font-mono text-xs space-y-4">
        <p className="font-bold">Error loading extraction payload.</p>
        <p>{commitError || 'No extraction data available.'}</p>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-[#141414] text-white hover:bg-neutral-800"
        >
          Return to Extract
        </button>
      </div>
    );
  }

  // Handle Spec Updates
  const updateLaptopIdentity = (field: keyof ExtractedDataPayload['laptop'], val: string) => {
    setData(prev => (prev ? { ...prev, laptop: { ...prev.laptop, [field]: val } } : prev));
  };

  const updateConfigField = (field: keyof ExtractedDataPayload['configuration'], val: any) => {
    setData(prev =>
      prev ? { ...prev, configuration: { ...prev.configuration, [field]: val } } : prev
    );
  };

  // Preview retail URL scraper
  const handlePreviewRetail = async (retailer: 'amazon' | 'flipkart', url: string) => {
    if (!url.trim()) return;
    setPreviewingRetail(true);
    try {
      const res = await api.previewRetailUrl(url.trim());
      setRetailPreview(prev => ({ ...prev, [retailer]: res.result }));
    } catch (err: any) {
      console.warn(`Retail preview error for ${retailer}:`, err);
    } finally {
      setPreviewingRetail(false);
    }
  };

  // Final Commit Handler
  const handleCommit = async () => {
    setIsCommitting(true);
    setCommitError(null);

    try {
      const payload = {
        data,
        useExistingConfigId: selectedConfigId,
        reviewerIdentity: 'admin_reviewer',
        retailListings: {
          amazonUrl: amazonUrl.trim() || null,
          flipkartUrl: flipkartUrl.trim() || null,
          manualImageUrl: manualImageUrl.trim() || null,
          amazonManualPrice: amazonManualPrice ? parseFloat(amazonManualPrice) : null,
          flipkartManualPrice: flipkartManualPrice ? parseFloat(flipkartManualPrice) : null,
        },
      };

      const result = await api.commitJob(jobId, payload);
      onCommitSuccess(result.configuration_id);
    } catch (err: any) {
      setCommitError(err.message || 'Transaction commit failed');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleDiscard = async () => {
    if (!confirm('Are you sure you want to discard this extraction?')) return;
    try {
      await api.discardJob(jobId);
      onCancel();
    } catch (err: any) {
      alert(err.message || 'Discard failed');
    }
  };

  // Missing spec warnings
  const missingSpecs: string[] = [];
  if (!data.configuration.cpu) missingSpecs.push('CPU Processor');
  if (!data.configuration.gpu) missingSpecs.push('GPU Graphics');
  if (!data.configuration.ram_gb) missingSpecs.push('RAM Capacity');
  if (!data.configuration.storage_gb) missingSpecs.push('Storage Capacity');
  if (!data.configuration.display_resolution) missingSpecs.push('Display Resolution');

  return (
    <div className="space-y-6">
      {/* Human Review Banner */}
      <div className="border-2 border-[#141414] bg-[#F9F8F6] p-4 sm:p-5 shadow-[4px_4px_0px_#141414]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 font-mono text-[10px] uppercase font-bold bg-[#141414] text-white">
                <ShieldCheck className="w-3 h-3 text-[#F27D26]" />
                <span>Human Verification Protocol</span>
              </span>
              <span className="font-mono text-xs text-neutral-500">Job: {jobId.slice(0, 8)}</span>
            </div>
            <h1 className="font-serif text-2xl font-bold text-[#141414] mt-1">
              Verify & Confirm Extraction: {data.laptop.brand} {data.laptop.model}
            </h1>
            <p className="text-xs text-neutral-600 mt-0.5">
              Reviewer: <strong>{data.review_meta.reviewer}</strong> • Video: &ldquo;
              {data.review_meta.title}&rdquo;
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleDiscard}
              disabled={isCommitting}
              className="px-3.5 py-2 border-2 border-red-700 text-red-700 hover:bg-red-50 font-mono text-xs uppercase font-bold transition-colors cursor-pointer flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>

            <button
              onClick={handleCommit}
              disabled={isCommitting}
              className="px-5 py-2 bg-[#141414] text-white hover:bg-[#F27D26] disabled:opacity-40 font-mono text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer flex items-center space-x-2 border-2 border-[#141414]"
            >
              {isCommitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Committing...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Confirm & Commit</span>
                </>
              )}
            </button>
          </div>
        </div>

        {commitError && (
          <div className="mt-4 p-3 border-2 border-red-600 bg-red-50 text-red-800 text-xs font-mono">
            <strong>Commit Failed: </strong>
            <span>{commitError}</span>
          </div>
        )}
      </div>

      {/* Exhaustive Extraction Metadata / Provenance Badge */}
      {data.extraction_meta && (
        <div className="p-3 border-2 border-[#141414] bg-[#F7F6F3] text-[#141414] text-xs font-mono space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-300 pb-2">
            <div className="flex items-center flex-wrap gap-2">
              <span className="px-2 py-0.5 bg-[#141414] text-white font-bold text-[10px] uppercase">
                Exhaustive Pipeline v{data.extraction_meta.extraction_version}
              </span>
              <span className="text-neutral-700">
                Mode: <strong>{data.extraction_meta.processing_mode}</strong> ({data.extraction_meta.passes_completed}/{data.extraction_meta.total_passes_required || 5} Passes Completed)
              </span>
              {data.extraction_meta.overall_status === 'rate_limited' ? (
                <span className="px-2 py-0.5 bg-amber-500 text-white font-bold text-[10px] uppercase animate-pulse">
                  RATE LIMITED / INCOMPLETE
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-emerald-600 text-white font-bold text-[10px] uppercase">
                  COMPLETE
                </span>
              )}
            </div>
            <div className="text-[11px] text-neutral-600">
              Source Video Access: <strong className="text-emerald-700 uppercase">{data.extraction_meta.source_video_access}</strong>
            </div>
          </div>

          {/* Pass Status Details Bar */}
          {data.extraction_meta.pass_statuses && Object.keys(data.extraction_meta.pass_statuses).length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {Object.entries(data.extraction_meta.pass_statuses).map(([key, p]: [string, any]) => {
                const isSuccess = p.status === 'success';
                const isRateLimit = p.status === 'rate_limited';
                const isFailed = p.status === 'failed';
                return (
                  <div
                    key={key}
                    className={`px-2 py-1 border flex items-center space-x-1 ${
                      isSuccess
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : isRateLimit
                        ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold'
                        : isFailed
                        ? 'bg-red-50 border-red-300 text-red-800'
                        : 'bg-neutral-100 border-neutral-300 text-neutral-600'
                    }`}
                  >
                    <span>{key.toUpperCase()}:</span>
                    <span>
                      {isRateLimit
                        ? `RATE LIMITED (${p.retry_after_seconds ? `${p.retry_after_seconds}s` : 'WAIT'})`
                        : p.status.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Rate Limit Blocked Notice & Resume CTA */}
          {data.extraction_meta.overall_status === 'rate_limited' && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-[11px] flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong>Quota Cooldown: </strong>
                <span>
                  {data.extraction_meta.rate_limit_info?.blocked_pass || 'A pass'} reached Gemini free tier rate limit.
                  {data.extraction_meta.rate_limit_info?.retry_after_seconds
                    ? ` Retry is recommended after ~${data.extraction_meta.rate_limit_info.retry_after_seconds} seconds.`
                    : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResumeExtraction}
                disabled={resuming}
                className="px-3 py-1 bg-[#141414] text-white hover:bg-[#F27D26] font-bold uppercase transition-colors cursor-pointer text-[10px] flex items-center space-x-1"
              >
                {resuming && <RefreshCw className="w-3 h-3 animate-spin" />}
                <span>{resuming ? 'Resuming...' : 'Resume Remaining Passes'}</span>
              </button>
            </div>
          )}

          {resumeMessage && (
            <div className="p-2 bg-blue-50 border border-blue-300 text-blue-900 text-[11px]">
              {resumeMessage}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
            <div className="p-1.5 bg-white border border-neutral-200">
              <span className="block text-neutral-500 text-[10px]">Segments</span>
              <span className="font-bold">{data.extraction_meta.discovered_segments}</span>
            </div>
            <div className="p-1.5 bg-white border border-neutral-200">
              <span className="block text-neutral-500 text-[10px]">Benchmarks</span>
              <span className={`font-bold ${data.extraction_meta.pass_statuses?.benchmarks?.status === 'rate_limited' ? 'text-amber-600 text-[10px]' : ''}`}>
                {data.extraction_meta.pass_statuses?.benchmarks?.status === 'rate_limited' ? 'RATE LIMITED' : data.extraction_meta.benchmark_count}
              </span>
            </div>
            <div className="p-1.5 bg-white border border-neutral-200">
              <span className="block text-neutral-500 text-[10px]">Game Tests</span>
              <span className={`font-bold ${data.extraction_meta.pass_statuses?.gaming?.status === 'rate_limited' ? 'text-amber-600 text-[10px]' : ''}`}>
                {data.extraction_meta.pass_statuses?.gaming?.status === 'rate_limited' ? 'RATE LIMITED' : data.extraction_meta.gaming_count}
              </span>
            </div>
            <div className="p-1.5 bg-white border border-neutral-200">
              <span className="block text-neutral-500 text-[10px]">Thermals</span>
              <span className={`font-bold ${data.extraction_meta.pass_statuses?.thermals_display_battery?.status === 'rate_limited' ? 'text-amber-600 text-[10px]' : ''}`}>
                {data.extraction_meta.pass_statuses?.thermals_display_battery?.status === 'rate_limited' ? 'RATE LIMITED' : data.extraction_meta.thermal_test_count}
              </span>
            </div>
            <div className="p-1.5 bg-white border border-neutral-200">
              <span className="block text-neutral-500 text-[10px]">Display & Batt</span>
              <span className={`font-bold ${data.extraction_meta.pass_statuses?.thermals_display_battery?.status === 'rate_limited' ? 'text-amber-600 text-[10px]' : ''}`}>
                {data.extraction_meta.pass_statuses?.thermals_display_battery?.status === 'rate_limited' ? 'RATE LIMITED' : (data.extraction_meta.display_test_count || 0) + (data.extraction_meta.battery_test_count || 0)}
              </span>
            </div>
            <div className="p-1.5 bg-white border border-neutral-200">
              <span className="block text-neutral-500 text-[10px]">Evidence</span>
              <span className="font-bold">{data.extraction_meta.evidence_count}</span>
            </div>
          </div>
          {data.extraction_meta.completeness_notes && (
            <div className="text-[11px] text-neutral-600 italic">
              Audit Note: {data.extraction_meta.completeness_notes}
            </div>
          )}
        </div>
      )}

      {/* Missing Spec Warnings Bar */}
      {missingSpecs.length > 0 && (
        <div className="p-3 border-2 border-amber-600 bg-amber-50 text-amber-900 text-xs font-mono flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Missing Identifying Hardware Specifications:</strong>
            <p className="mt-0.5 text-neutral-700">
              The reviewer did not explicitly test or state: {missingSpecs.join(', ')}. In accordance
              with V2 zero-guessing policy, these will be saved as NULL unless entered manually.
            </p>
          </div>
        </div>
      )}

      {/* Configuration Matching Section */}
      <Panel
        title="Configuration Matching & Deduplication"
        badge={<Layers className="w-4 h-4 text-[#F27D26]" />}
      >
        <div className="space-y-3">
          <p className="text-xs text-neutral-600">
            Compare candidate configurations in the database. Choose whether to associate this review
            with an existing verified configuration or create a new distinct hardware profile.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Create as New Option */}
            <div
              onClick={() => setSelectedConfigId(null)}
              className={`border-2 p-3.5 cursor-pointer transition-colors ${
                selectedConfigId === null
                  ? 'border-[#F27D26] bg-[#FFF9F3]'
                  : 'border-[#141414] bg-white hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-bold uppercase">
                  Create New Configuration
                </span>
                {selectedConfigId === null && (
                  <CheckCircle2 className="w-4 h-4 text-[#F27D26]" />
                )}
              </div>
              <p className="text-xs text-neutral-600">
                Register a new hardware configuration under {data.laptop.brand} {data.laptop.model}.
              </p>
            </div>

            {/* Existing Matches */}
            {matches.map((m, idx) => {
              const conf = m.matchedConfiguration;
              if (!conf) return null;
              const isSelected = selectedConfigId === conf.id;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedConfigId(conf.id)}
                  className={`border-2 p-3.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-[#F27D26] bg-[#FFF9F3]'
                      : 'border-[#141414] bg-white hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <StatusBadge status={m.classification} size="sm" />
                      <span className="font-mono text-[11px] font-bold">
                        {m.confidenceScore}% Confidence
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-[#F27D26]" />}
                  </div>

                  <p className="font-mono text-xs font-semibold text-[#141414] mt-1">
                    {conf.cpu || 'Unknown CPU'} • {conf.gpu || 'Unknown GPU'} • {conf.ram_gb || '?'}GB RAM
                  </p>

                  <div className="mt-1 space-y-0.5 text-[11px] font-mono text-neutral-600">
                    <div>Matches: {m.matchingReasons.join(', ')}</div>
                    {m.differingFields.length > 0 && (
                      <div className="text-amber-700">Diff: {m.differingFields.join('; ')}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* Review Tab Navigation */}
      <div className="flex border-b-2 border-[#141414] bg-[#EBEAE7] overflow-x-auto">
        {[
          { id: 'specs', label: '1. Specs & Identity' },
          { id: 'benchmarks', label: `2. Benchmarks (${data.benchmarks.length})` },
          { id: 'gaming', label: `3. Gaming FPS (${data.gaming.length})` },
          { id: 'thermals', label: `4. Thermals (${data.thermals.length})` },
          { id: 'display_battery', label: '5. Display & Battery' },
          { id: 'evidence', label: `6. Evidence (${data.evidence.length})` },
          { id: 'retail', label: '7. Retail & Pricing' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 font-mono text-xs uppercase font-bold tracking-wider whitespace-nowrap border-r-2 border-[#141414] transition-colors cursor-pointer ${
              activeTab === tab.id ? 'bg-[#141414] text-white' : 'text-neutral-700 hover:bg-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Specs & Identity */}
      {activeTab === 'specs' && (
        <div className="space-y-6">
          <Panel title="Laptop Identity">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Brand *
                </label>
                <input
                  type="text"
                  value={data.laptop.brand}
                  onChange={e => updateLaptopIdentity('brand', e.target.value)}
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Model *
                </label>
                <input
                  type="text"
                  value={data.laptop.model}
                  onChange={e => updateLaptopIdentity('model', e.target.value)}
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Series
                </label>
                <input
                  type="text"
                  value={data.laptop.series || ''}
                  onChange={e => updateLaptopIdentity('series', e.target.value)}
                  placeholder="e.g. Legion, ROG, XPS"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Generation / Year
                </label>
                <input
                  type="text"
                  value={data.laptop.generation || ''}
                  onChange={e => updateLaptopIdentity('generation', e.target.value)}
                  placeholder="e.g. Gen 9, 2024"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>
            </div>
          </Panel>

          <Panel title="Hardware Specifications (Tested Unit)">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  CPU Processor
                </label>
                <input
                  type="text"
                  value={data.configuration.cpu || ''}
                  onChange={e => updateConfigField('cpu', e.target.value || null)}
                  placeholder="e.g. Intel Core i9-14900HX"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  GPU Graphics
                </label>
                <input
                  type="text"
                  value={data.configuration.gpu || ''}
                  onChange={e => updateConfigField('gpu', e.target.value || null)}
                  placeholder="e.g. NVIDIA RTX 4080 Laptop GPU"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  GPU TGP (Watts)
                </label>
                <input
                  type="number"
                  value={data.configuration.gpu_tgp_w || ''}
                  onChange={e =>
                    updateConfigField(
                      'gpu_tgp_w',
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  placeholder="e.g. 175"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  RAM Capacity (GB)
                </label>
                <input
                  type="number"
                  value={data.configuration.ram_gb || ''}
                  onChange={e =>
                    updateConfigField('ram_gb', e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  placeholder="e.g. 32"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  RAM Speed (MT/s or MHz)
                </label>
                <input
                  type="number"
                  value={data.configuration.ram_speed_mt_s || ''}
                  onChange={e =>
                    updateConfigField(
                      'ram_speed_mt_s',
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  placeholder="e.g. 5600"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Storage Capacity (GB)
                </label>
                <input
                  type="number"
                  value={data.configuration.storage_gb || ''}
                  onChange={e =>
                    updateConfigField(
                      'storage_gb',
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  placeholder="e.g. 1024 for 1TB"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Screen Size (Inches)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={data.configuration.display_size_inch || ''}
                  onChange={e =>
                    updateConfigField(
                      'display_size_inch',
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  placeholder="e.g. 16.0"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Display Resolution
                </label>
                <input
                  type="text"
                  value={data.configuration.display_resolution || ''}
                  onChange={e => updateConfigField('display_resolution', e.target.value || null)}
                  placeholder="e.g. 2560x1600"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Refresh Rate (Hz)
                </label>
                <input
                  type="number"
                  value={data.configuration.refresh_rate_hz || ''}
                  onChange={e =>
                    updateConfigField(
                      'refresh_rate_hz',
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  placeholder="e.g. 240"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Battery Capacity (Wh)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={data.configuration.battery_wh || ''}
                  onChange={e =>
                    updateConfigField('battery_wh', e.target.value ? parseFloat(e.target.value) : null)
                  }
                  placeholder="e.g. 99.9"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={data.configuration.weight_kg || ''}
                  onChange={e =>
                    updateConfigField('weight_kg', e.target.value ? parseFloat(e.target.value) : null)
                  }
                  placeholder="e.g. 2.45"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase font-bold text-neutral-700 mb-1">
                  Thickness (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={data.configuration.thickness_mm || ''}
                  onChange={e =>
                    updateConfigField(
                      'thickness_mm',
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  placeholder="e.g. 21.9"
                  className="w-full px-3 py-1.5 border border-[#141414] font-mono text-xs bg-white"
                />
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* Tab 2: Benchmarks */}
      {activeTab === 'benchmarks' && (
        <Panel
          title="Synthetic Benchmarks & Productivity Tests"
          actions={
            <button
              onClick={() => {
                const newB: BenchmarkResult = {
                  benchmark_group: 'Cinebench',
                  benchmark_version: 'R23',
                  variant: 'Multi-Core',
                  category: 'cpu',
                  score: 0,
                  score_type: 'points',
                  unit: 'pts',
                  power_mode: 'Performance',
                  confidence: 'high',
                  settings_notes: null,
                  notes: null,
                };
                setData(prev => (prev ? { ...prev, benchmarks: [...prev.benchmarks, newB] } : prev));
              }}
              className="flex items-center space-x-1 px-2 py-1 bg-[#141414] text-white text-xs font-mono cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Benchmark</span>
            </button>
          }
        >
          {data.benchmarks.length === 0 ? (
            <p className="text-xs font-mono text-neutral-500 italic py-4">
              No benchmarks were tested in this review video.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse border border-neutral-300">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700 border-b border-neutral-300">
                    <th className="p-2 text-left">Suite</th>
                    <th className="p-2 text-left">Version</th>
                    <th className="p-2 text-left">Variant / Sub-test</th>
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-left">Score *</th>
                    <th className="p-2 text-left">Unit</th>
                    <th className="p-2 text-left">Power Profile</th>
                    <th className="p-2 text-left">Settings Notes</th>
                    <th className="p-2 text-left">Evidence</th>
                    <th className="p-2 text-center w-10">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.benchmarks.map((b, idx) => (
                    <tr key={idx} className="border-b border-neutral-200 hover:bg-neutral-50">
                      <td className="p-2">
                        <input
                          type="text"
                          value={b.benchmark_group}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.benchmarks];
                              updated[idx].benchmark_group = val;
                              return { ...prev, benchmarks: updated };
                            });
                          }}
                          placeholder="e.g. Cinebench"
                          className="w-28 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={b.benchmark_version || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.benchmarks];
                              updated[idx].benchmark_version = val || null;
                              return { ...prev, benchmarks: updated };
                            });
                          }}
                          placeholder="e.g. R23 / 2024"
                          className="w-20 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={b.variant || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.benchmarks];
                              updated[idx].variant = val || null;
                              return { ...prev, benchmarks: updated };
                            });
                          }}
                          placeholder="e.g. Multi-Core"
                          className="w-28 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={b.category}
                          onChange={e => {
                            const val = e.target.value as any;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.benchmarks];
                              updated[idx].category = val;
                              return { ...prev, benchmarks: updated };
                            });
                          }}
                          className="px-2 py-1 border border-neutral-300 bg-white"
                        >
                          <option value="cpu">CPU</option>
                          <option value="gpu">GPU</option>
                          <option value="rendering">Rendering</option>
                          <option value="ai">AI</option>
                          <option value="storage">Storage</option>
                          <option value="system">System</option>
                          <option value="productivity">Productivity</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={b.score ?? ''}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.benchmarks];
                              updated[idx].score = isNaN(val) ? (null as any) : val;
                              return { ...prev, benchmarks: updated };
                            });
                          }}
                          className="w-24 px-2 py-1 border border-neutral-300 bg-white font-bold"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={b.unit || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.benchmarks];
                              updated[idx].unit = val || null;
                              return { ...prev, benchmarks: updated };
                            });
                          }}
                          placeholder="pts"
                          className="w-16 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={b.power_mode || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.benchmarks];
                              updated[idx].power_mode = val || null;
                              return { ...prev, benchmarks: updated };
                            });
                          }}
                          placeholder="Turbo / Balanced"
                          className="w-28 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={b.settings_notes || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.benchmarks];
                              updated[idx].settings_notes = val || null;
                              return { ...prev, benchmarks: updated };
                            });
                          }}
                          placeholder="e.g. 10m throttle loop"
                          className="w-32 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        {b.evidence ? (
                          <EvidenceBadge evidence={b.evidence} />
                        ) : (
                          <span className="text-neutral-400 italic">None</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => {
                            setData(prev =>
                              prev
                                ? {
                                    ...prev,
                                    benchmarks: prev.benchmarks.filter((_, i) => i !== idx),
                                  }
                                : prev
                            );
                          }}
                          className="text-red-600 hover:text-red-900 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Tab 3: Gaming */}
      {activeTab === 'gaming' && (
        <Panel
          title="Gaming Framerates & Test Conditions"
          actions={
            <button
              onClick={() => {
                const newG: GamingResult = {
                  game: 'Cyberpunk 2077',
                  resolution: '2560x1600',
                  preset: 'Ultra',
                  ray_tracing: false,
                  upscaling: false,
                  upscaling_mode: null,
                  frame_generation: null,
                  gpu_mode: 'dGPU Only',
                  power_mode: 'Turbo',
                  avg_fps: 60,
                  one_percent_low_fps: 45,
                  zero_point_one_percent_low_fps: null,
                  minimum_fps: null,
                  notes: null,
                };
                setData(prev => (prev ? { ...prev, gaming: [...prev.gaming, newG] } : prev));
              }}
              className="flex items-center space-x-1 px-2 py-1 bg-[#141414] text-white text-xs font-mono cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Game Test</span>
            </button>
          }
        >
          {data.gaming.length === 0 ? (
            <p className="text-xs font-mono text-neutral-500 italic py-4">
              No gaming benchmarks tested.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse border border-neutral-300">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700 border-b border-neutral-300">
                    <th className="p-2 text-left">Game</th>
                    <th className="p-2 text-left">Resolution</th>
                    <th className="p-2 text-left">Preset</th>
                    <th className="p-2 text-center">RT</th>
                    <th className="p-2 text-center">Upscaling / Mode</th>
                    <th className="p-2 text-center">Frame Gen</th>
                    <th className="p-2 text-left">GPU / Power Mode</th>
                    <th className="p-2 text-left">Avg FPS</th>
                    <th className="p-2 text-left">1% Low</th>
                    <th className="p-2 text-left">0.1% Low / Min</th>
                    <th className="p-2 text-center w-10">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gaming.map((g, idx) => (
                    <tr key={idx} className="border-b border-neutral-200 hover:bg-neutral-50">
                      <td className="p-2">
                        <input
                          type="text"
                          value={g.game}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].game = val;
                              return { ...prev, gaming: updated };
                            });
                          }}
                          className="w-32 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={g.resolution || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].resolution = val || null;
                              return { ...prev, gaming: updated };
                            });
                          }}
                          placeholder="2560x1600"
                          className="w-24 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={g.preset || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].preset = val || null;
                              return { ...prev, gaming: updated };
                            });
                          }}
                          placeholder="Ultra"
                          className="w-20 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(g.ray_tracing)}
                          onChange={e => {
                            const checked = e.target.checked;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].ray_tracing = checked;
                              return { ...prev, gaming: updated };
                            });
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center space-x-1">
                          <input
                            type="checkbox"
                            checked={Boolean(g.upscaling)}
                            onChange={e => {
                              const checked = e.target.checked;
                              setData(prev => {
                                if (!prev) return prev;
                                const updated = [...prev.gaming];
                                updated[idx].upscaling = checked;
                                return { ...prev, gaming: updated };
                              });
                            }}
                          />
                          <input
                            type="text"
                            value={g.upscaling_mode || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setData(prev => {
                                if (!prev) return prev;
                                const updated = [...prev.gaming];
                                updated[idx].upscaling_mode = val || null;
                                return { ...prev, gaming: updated };
                              });
                            }}
                            placeholder="DLSS Quality"
                            className="w-24 px-1.5 py-0.5 border border-neutral-300 bg-white text-[11px]"
                          />
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(g.frame_generation)}
                          onChange={e => {
                            const checked = e.target.checked;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].frame_generation = checked;
                              return { ...prev, gaming: updated };
                            });
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={`${g.gpu_mode || ''}${g.power_mode ? ` / ${g.power_mode}` : ''}`}
                          onChange={e => {
                            const val = e.target.value;
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].power_mode = val || null;
                              return { ...prev, gaming: updated };
                            });
                          }}
                          placeholder="Turbo"
                          className="w-24 px-1.5 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={g.avg_fps ?? ''}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].avg_fps = isNaN(val) ? null : val;
                              return { ...prev, gaming: updated };
                            });
                          }}
                          className="w-16 px-2 py-1 border border-neutral-300 bg-white font-bold"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={g.one_percent_low_fps ?? ''}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].one_percent_low_fps = isNaN(val) ? null : val;
                              return { ...prev, gaming: updated };
                            });
                          }}
                          className="w-16 px-2 py-1 border border-neutral-300 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={g.zero_point_one_percent_low_fps ?? g.minimum_fps ?? ''}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setData(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.gaming];
                              updated[idx].zero_point_one_percent_low_fps = isNaN(val) ? null : val;
                              return { ...prev, gaming: updated };
                            });
                          }}
                          placeholder="0.1% Low"
                          className="w-16 px-1.5 py-1 border border-neutral-300 bg-white text-[11px]"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => {
                            setData(prev =>
                              prev
                                ? {
                                    ...prev,
                                    gaming: prev.gaming.filter((_, i) => i !== idx),
                                  }
                                : prev
                            );
                          }}
                          className="text-red-600 hover:text-red-900 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Tab 4: Thermals */}
      {activeTab === 'thermals' && (
        <Panel
          title="Thermal Stress Tests, Acoustics & Sustained Power Draw"
          actions={
            <button
              onClick={() => {
                const newT: ThermalResult = {
                  test_name: 'Cinebench R23 10-Minute Loop',
                  duration_minutes: 10,
                  cpu_peak_c: 95,
                  cpu_avg_c: 88,
                  cpu_peak_power_w: 140,
                  cpu_avg_power_w: 115,
                  gpu_peak_c: null,
                  gpu_avg_c: null,
                  gpu_peak_power_w: null,
                  gpu_avg_power_w: null,
                  sustained_wattage_w: null,
                  fan_noise_db: 48.5,
                  ambient_temp_c: 21.0,
                  keyboard_min_c: null,
                  keyboard_max_c: 38.0,
                  power_mode: 'Turbo',
                  notes: null,
                };
                setData(prev => (prev ? { ...prev, thermals: [...prev.thermals, newT] } : prev));
              }}
              className="flex items-center space-x-1 px-2 py-1 bg-[#141414] text-white text-xs font-mono cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Thermal Test</span>
            </button>
          }
        >
          {data.thermals.length === 0 ? (
            <p className="text-xs font-mono text-neutral-500 italic py-4">
              No thermal tests recorded.
            </p>
          ) : (
            <div className="space-y-4">
              {data.thermals.map((t, idx) => (
                <div key={idx} className="border border-neutral-300 p-3 bg-white space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={t.test_name}
                        onChange={e => {
                          const val = e.target.value;
                          setData(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.thermals];
                            updated[idx].test_name = val;
                            return { ...prev, thermals: updated };
                          });
                        }}
                        className="font-mono text-xs font-bold uppercase border-b border-neutral-400 bg-white px-1 py-0.5"
                      />
                      {t.duration_minutes && (
                        <span className="text-[11px] text-neutral-500 font-mono">
                          ({t.duration_minutes} min loop)
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setData(prev =>
                          prev
                            ? {
                                ...prev,
                                thermals: prev.thermals.filter((_, i) => i !== idx),
                              }
                            : prev
                        );
                      }}
                      className="text-red-600 hover:text-red-900 cursor-pointer text-xs font-mono"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
                    <div>
                      <span className="text-neutral-500 block text-[10px]">CPU Peak (°C)</span>
                      <input
                        type="number"
                        value={t.cpu_peak_c ?? ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setData(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.thermals];
                            updated[idx].cpu_peak_c = isNaN(val) ? null : val;
                            return { ...prev, thermals: updated };
                          });
                        }}
                        className="w-full px-2 py-1 border bg-white"
                      />
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px]">CPU Avg (°C)</span>
                      <input
                        type="number"
                        value={t.cpu_avg_c ?? ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setData(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.thermals];
                            updated[idx].cpu_avg_c = isNaN(val) ? null : val;
                            return { ...prev, thermals: updated };
                          });
                        }}
                        className="w-full px-2 py-1 border bg-white"
                      />
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px]">CPU Avg Power (W)</span>
                      <input
                        type="number"
                        value={t.cpu_avg_power_w ?? ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setData(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.thermals];
                            updated[idx].cpu_avg_power_w = isNaN(val) ? null : val;
                            return { ...prev, thermals: updated };
                          });
                        }}
                        className="w-full px-2 py-1 border bg-white"
                      />
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px]">GPU Peak (°C)</span>
                      <input
                        type="number"
                        value={t.gpu_peak_c ?? ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setData(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.thermals];
                            updated[idx].gpu_peak_c = isNaN(val) ? null : val;
                            return { ...prev, thermals: updated };
                          });
                        }}
                        className="w-full px-2 py-1 border bg-white"
                      />
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px]">GPU Avg Power (W)</span>
                      <input
                        type="number"
                        value={t.gpu_avg_power_w ?? ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setData(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.thermals];
                            updated[idx].gpu_avg_power_w = isNaN(val) ? null : val;
                            return { ...prev, thermals: updated };
                          });
                        }}
                        className="w-full px-2 py-1 border bg-white"
                      />
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px]">Fan Noise (dBA)</span>
                      <input
                        type="number"
                        step="0.1"
                        value={t.fan_noise_db ?? ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setData(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.thermals];
                            updated[idx].fan_noise_db = isNaN(val) ? null : val;
                            return { ...prev, thermals: updated };
                          });
                        }}
                        className="w-full px-2 py-1 border bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Tab 5: Display & Battery */}
      {activeTab === 'display_battery' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Panel title="Display Lab Measurements">
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[10px] text-neutral-500 uppercase">SDR Max Brightness (nits)</label>
                <input
                  type="number"
                  value={data.display.brightness_sdr_nits ?? ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setData(prev =>
                      prev
                        ? {
                            ...prev,
                            display: { ...prev.display, brightness_sdr_nits: isNaN(val) ? null : val },
                          }
                        : prev
                    );
                  }}
                  className="w-full px-2 py-1 border bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] text-neutral-500 uppercase">HDR Peak Brightness (nits)</label>
                <input
                  type="number"
                  value={data.display.brightness_hdr_nits ?? ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setData(prev =>
                      prev
                        ? {
                            ...prev,
                            display: { ...prev.display, brightness_hdr_nits: isNaN(val) ? null : val },
                          }
                        : prev
                    );
                  }}
                  className="w-full px-2 py-1 border bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-neutral-500 uppercase">sRGB Gamut (%)</label>
                  <input
                    type="number"
                    value={data.display.srgb_percent ?? ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setData(prev =>
                        prev
                          ? {
                              ...prev,
                              display: { ...prev.display, srgb_percent: isNaN(val) ? null : val },
                            }
                          : prev
                      );
                    }}
                    className="w-full px-2 py-1 border bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 uppercase">DCI-P3 Gamut (%)</label>
                  <input
                    type="number"
                    value={data.display.dci_p3_percent ?? ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setData(prev =>
                        prev
                          ? {
                              ...prev,
                              display: { ...prev.display, dci_p3_percent: isNaN(val) ? null : val },
                            }
                          : prev
                      );
                    }}
                    className="w-full px-2 py-1 border bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-neutral-500 uppercase">Response Time (ms)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={data.display.response_time_ms ?? ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setData(prev =>
                        prev
                          ? {
                              ...prev,
                              display: { ...prev.display, response_time_ms: isNaN(val) ? null : val },
                            }
                          : prev
                      );
                    }}
                    className="w-full px-2 py-1 border bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 uppercase">Contrast Ratio</label>
                  <input
                    type="text"
                    value={data.display.contrast_ratio || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setData(prev =>
                        prev
                          ? {
                              ...prev,
                              display: { ...prev.display, contrast_ratio: val || null },
                            }
                          : prev
                      );
                    }}
                    placeholder="e.g. 1200:1 / Infinite"
                    className="w-full px-2 py-1 border bg-white"
                  />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Battery & Charging Runtime">
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[10px] text-neutral-500 uppercase">Battery Life (Hours)</label>
                <input
                  type="number"
                  step="0.1"
                  value={data.battery.battery_life_hours ?? ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setData(prev =>
                      prev
                        ? {
                            ...prev,
                            battery: { ...prev.battery, battery_life_hours: isNaN(val) ? null : val },
                          }
                        : prev
                    );
                  }}
                  className="w-full px-2 py-1 border bg-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-neutral-500 uppercase">Test Methodology</label>
                <input
                  type="text"
                  value={data.battery.test_method || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setData(prev =>
                      prev
                        ? {
                            ...prev,
                            battery: { ...prev.battery, test_method: val || null },
                          }
                        : prev
                    );
                  }}
                  placeholder="e.g. 1080p YouTube loop at 150 nits"
                  className="w-full px-2 py-1 border bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-neutral-500 uppercase">Bundled Charger (W)</label>
                  <input
                    type="number"
                    value={data.battery.charging_adapter_w ?? ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setData(prev =>
                        prev
                          ? {
                              ...prev,
                              battery: { ...prev.battery, charging_adapter_w: isNaN(val) ? null : val },
                            }
                          : prev
                      );
                    }}
                    placeholder="240"
                    className="w-full px-2 py-1 border bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 uppercase">0-50% Fast Charge (Min)</label>
                  <input
                    type="number"
                    value={data.battery.zero_to_fifty_min ?? ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setData(prev =>
                        prev
                          ? {
                              ...prev,
                              battery: { ...prev.battery, zero_to_fifty_min: isNaN(val) ? null : val },
                            }
                          : prev
                      );
                    }}
                    className="w-full px-2 py-1 border bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-neutral-500 uppercase">USB-C Power Delivery Support (W)</label>
                <input
                  type="number"
                  value={data.battery.usb_c_charging_w ?? ''}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setData(prev =>
                      prev
                        ? {
                            ...prev,
                            battery: { ...prev.battery, usb_c_charging_w: isNaN(val) ? null : val },
                          }
                        : prev
                    );
                  }}
                  placeholder="100"
                  className="w-full px-2 py-1 border bg-white"
                />
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* Tab 6: Evidence & Provenance */}
      {activeTab === 'evidence' && (
        <Panel title="Extracted Evidence & Timestamp Links">
          {data.evidence.length === 0 ? (
            <p className="text-xs font-mono text-neutral-500 italic py-4">
              No evidence timestamps were extracted from the video.
            </p>
          ) : (
            <div className="space-y-2">
              {data.evidence.map((ev, idx) => (
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

      {/* Tab 7: Retail & Pricing */}
      {activeTab === 'retail' && (
        <Panel
          title="Retail Listings & Product Pricing"
          badge={<ShoppingBag className="w-4 h-4 text-[#F27D26]" />}
        >
          <div className="space-y-5">
            <p className="text-xs text-neutral-600">
              Optionally link official retail listings for this configuration. Price scraping will run
              via pure Schema.org Product data extractor. Even if scraping fails or is blocked, this review
              will commit cleanly.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Amazon Section */}
              <div className="border border-neutral-300 p-4 bg-white space-y-3">
                <span className="font-mono text-xs font-bold uppercase text-neutral-800">
                  Amazon Listing
                </span>
                <div>
                  <label className="block text-[10px] text-neutral-500 font-mono mb-1">
                    Amazon Product URL
                  </label>
                  <div className="flex space-x-1">
                    <input
                      type="url"
                      value={amazonUrl}
                      onChange={e => setAmazonUrl(e.target.value)}
                      placeholder="https://www.amazon.in/dp/..."
                      className="w-full px-2 py-1.5 border border-neutral-300 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handlePreviewRetail('amazon', amazonUrl)}
                      disabled={!amazonUrl.trim() || previewingRetail}
                      className="px-2 py-1 bg-neutral-200 hover:bg-neutral-300 text-xs font-mono font-bold cursor-pointer shrink-0"
                    >
                      Test
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 font-mono mb-1">
                    Manual Price Override (₹ INR)
                  </label>
                  <input
                    type="number"
                    value={amazonManualPrice}
                    onChange={e => setAmazonManualPrice(e.target.value)}
                    placeholder="e.g. 189990"
                    className="w-full px-2 py-1.5 border border-neutral-300 font-mono text-xs"
                  />
                  <span className="text-[10px] text-neutral-400 font-mono">
                    Used if auto-scraper returns no price or gets blocked.
                  </span>
                </div>

                {retailPreview.amazon && (
                  <div className="p-2 bg-neutral-50 border border-neutral-200 text-xs font-mono">
                    <p className="font-bold">Scraper Result:</p>
                    <p>Price: {retailPreview.amazon.price ? `₹${retailPreview.amazon.price}` : 'Not detected'}</p>
                    <p>In Stock: {retailPreview.amazon.inStock ? 'Yes' : 'No / Unknown'}</p>
                  </div>
                )}
              </div>

              {/* Flipkart Section */}
              <div className="border border-neutral-300 p-4 bg-white space-y-3">
                <span className="font-mono text-xs font-bold uppercase text-neutral-800">
                  Flipkart Listing
                </span>
                <div>
                  <label className="block text-[10px] text-neutral-500 font-mono mb-1">
                    Flipkart Product URL
                  </label>
                  <div className="flex space-x-1">
                    <input
                      type="url"
                      value={flipkartUrl}
                      onChange={e => setFlipkartUrl(e.target.value)}
                      placeholder="https://www.flipkart.com/..."
                      className="w-full px-2 py-1.5 border border-neutral-300 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handlePreviewRetail('flipkart', flipkartUrl)}
                      disabled={!flipkartUrl.trim() || previewingRetail}
                      className="px-2 py-1 bg-neutral-200 hover:bg-neutral-300 text-xs font-mono font-bold cursor-pointer shrink-0"
                    >
                      Test
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-500 font-mono mb-1">
                    Manual Price Override (₹ INR)
                  </label>
                  <input
                    type="number"
                    value={flipkartManualPrice}
                    onChange={e => setFlipkartManualPrice(e.target.value)}
                    placeholder="e.g. 185990"
                    className="w-full px-2 py-1.5 border border-neutral-300 font-mono text-xs"
                  />
                  <span className="text-[10px] text-neutral-400 font-mono">
                    Used if auto-scraper returns no price.
                  </span>
                </div>

                {retailPreview.flipkart && (
                  <div className="p-2 bg-neutral-50 border border-neutral-200 text-xs font-mono">
                    <p className="font-bold">Scraper Result:</p>
                    <p>Price: {retailPreview.flipkart.price ? `₹${retailPreview.flipkart.price}` : 'Not detected'}</p>
                    <p>In Stock: {retailPreview.flipkart.inStock ? 'Yes' : 'No / Unknown'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Manual Image URL Fallback */}
            <div className="border border-neutral-300 p-4 bg-white space-y-2">
              <label className="block font-mono text-xs uppercase font-bold text-neutral-800">
                Fallback Laptop Product Image URL
              </label>
              <input
                type="url"
                value={manualImageUrl}
                onChange={e => setManualImageUrl(e.target.value)}
                placeholder="https://... (Solely used if auto-detection returns no image)"
                className="w-full px-3 py-2 border border-neutral-300 font-mono text-xs"
              />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
};
