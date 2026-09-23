import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { parseAndValidateYouTubeUrl } from '../../server/services/urlValidator.ts';
import { ExtractionJob } from '../../shared/types/index.ts';
import { Panel } from '../components/ui/Panel.tsx';
import { StatusBadge } from '../components/ui/StatusBadge.tsx';
import { ModelSelector } from '../components/ModelSelector.tsx';

interface ExtractPageProps {
  onOpenReview: (jobId: string) => void;
  onOpenReport: (configId: string) => void;
}

export const ExtractPage: React.FC<ExtractPageProps> = ({
  onOpenReview,
  onOpenReport,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [urlValidation, setUrlValidation] = useState<{
    isValid: boolean;
    videoId: string | null;
    error?: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<any | null>(null);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ExtractionJob | null>(null);

  const [recentJobs, setRecentJobs] = useState<ExtractionJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Validate URL as user types
  useEffect(() => {
    if (!urlInput.trim()) {
      setUrlValidation(null);
      return;
    }
    const res = parseAndValidateYouTubeUrl(urlInput.trim());
    setUrlValidation(res);
  }, [urlInput]);

  // Load recent jobs
  const fetchRecentJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await api.getJobs();
      setRecentJobs(res.jobs || []);
    } catch (err) {
      console.warn('Jobs fetch error:', err);
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    fetchRecentJobs();
  }, []);

  // Poll active extraction job
  useEffect(() => {
    if (!activeJobId) return;

    let isSubscribed = true;
    let pollInterval = 2000;

    const poll = async () => {
      try {
        const job = await api.getJob(activeJobId);
        if (!isSubscribed) return;

        setActiveJob(job);

        // Stop polling on terminal states
        if (
          job.status === 'ready_for_review' ||
          job.status === 'completed' ||
          job.status === 'failed' ||
          job.status === 'rejected'
        ) {
          fetchRecentJobs();
          return;
        }

        setTimeout(poll, pollInterval);
      } catch (err: any) {
        if (!isSubscribed) return;
        console.warn('Job poll error:', err);
        setTimeout(poll, 4000);
      }
    };

    poll();

    return () => {
      isSubscribed = false;
    };
  }, [activeJobId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlValidation?.isValid) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setDuplicateInfo(null);

    try {
      const res = await api.extractVideo(urlInput.trim(), selectedModel || undefined);
      setActiveJobId(res.jobId);
    } catch (err: any) {
      if (err.code === 'DUPLICATE_VIDEO') {
        setDuplicateInfo(err.details);
      } else {
        setSubmitError(err.message || 'Failed to submit extraction job');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="border-2 border-[#141414] bg-[#F9F8F6] p-5 shadow-[4px_4px_0px_#141414]">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 font-mono text-[10px] uppercase font-bold bg-[#141414] text-white mb-2">
            <span>V2 Zero-Hallucination Pipeline</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#141414]">
            Extract Laptop Review from YouTube
          </h1>
          <p className="mt-1 text-sm text-neutral-600 leading-relaxed">
            Enter a YouTube laptop review URL. Gemini will extract verified specifications,
            synthetic benchmarks, gaming framerates, thermal measurements, and evidence timestamps.
            All extracted data requires <strong>human verification</strong> before being committed.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Ingestion Form & Active Progress */}
        <div className="lg:col-span-2 space-y-6">
          <Panel title="Input YouTube Review" badge={<Sparkles className="w-4 h-4 text-[#F27D26]" />}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Active Model Selector Component */}
              <div>
                <ModelSelector
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  mode="compact"
                  showSetActive={true}
                />
              </div>

              <div>
                <label className="block font-mono text-xs uppercase font-bold text-neutral-700 mb-1.5">
                  YouTube Video URL
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={isSubmitting || (activeJob != null && (activeJob.status === 'pending' || activeJob.status === 'processing'))}
                    className="w-full px-3.5 py-2.5 border-2 border-[#141414] font-mono text-xs focus:outline-none focus:border-[#F27D26] bg-white disabled:opacity-50"
                  />
                </div>

                {/* Instant Validation Feedback */}
                {urlInput.trim() && (
                  <div className="mt-2 flex items-center space-x-2 text-xs font-mono">
                    {urlValidation?.isValid ? (
                      <span className="text-emerald-700 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Valid YouTube Video ID: <strong>{urlValidation.videoId}</strong></span>
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{urlValidation?.error || 'Invalid YouTube URL'}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {submitError && (
                <div className="p-3 border-2 border-red-600 bg-red-50 text-red-800 text-xs font-mono flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block">Extraction Submission Error:</strong>
                    <span>{submitError}</span>
                  </div>
                </div>
              )}

              {duplicateInfo && (
                <div className="p-4 border-2 border-amber-600 bg-amber-50 text-amber-900 text-xs font-mono space-y-2">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-700" />
                    <strong className="text-sm">Video Already Ingested & Published</strong>
                  </div>
                  <p>
                    This YouTube review has already been extracted and published to the database.
                  </p>
                  {duplicateInfo.configuration_id && (
                    <button
                      type="button"
                      onClick={() => onOpenReport(duplicateInfo.configuration_id)}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#141414] text-white hover:bg-[#F27D26] transition-colors cursor-pointer text-xs uppercase font-bold"
                    >
                      <span>View Published Report</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="font-mono text-[11px] text-neutral-500">
                  Accepts watch?v=, youtu.be/, shorts/, embed/
                </span>

                <button
                  type="submit"
                  disabled={
                    !urlValidation?.isValid ||
                    isSubmitting ||
                    (activeJob != null &&
                      (activeJob.status === 'pending' || activeJob.status === 'processing'))
                  }
                  className="px-5 py-2.5 bg-[#141414] text-white hover:bg-[#F27D26] disabled:opacity-40 disabled:hover:bg-[#141414] font-mono text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer flex items-center space-x-2 border-2 border-[#141414]"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Start Extraction</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </Panel>

          {/* Active Job Stepper */}
          {activeJob && (
            <Panel
              title={`Job Status: ${activeJob.id.slice(0, 8)}...`}
              badge={<StatusBadge status={activeJob.status} />}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                  <div className="border border-neutral-300 p-2 bg-white">
                    <span className="text-neutral-500 block text-[10px] uppercase">Video ID</span>
                    <span className="font-bold">{activeJob.youtube_video_id}</span>
                  </div>
                  <div className="border border-neutral-300 p-2 bg-white">
                    <span className="text-neutral-500 block text-[10px] uppercase">Attempt Count</span>
                    <span className="font-bold">{activeJob.attempt_count || 1} / 3</span>
                  </div>
                  <div className="border border-neutral-300 p-2 bg-white">
                    <span className="text-neutral-500 block text-[10px] uppercase">Duration</span>
                    <span className="font-bold">
                      {activeJob.processing_duration_ms
                        ? `${(activeJob.processing_duration_ms / 1000).toFixed(1)}s`
                        : 'In progress...'}
                    </span>
                  </div>
                </div>

                {/* Progress Steps */}
                <div className="space-y-2 border border-neutral-300 p-3 bg-white">
                  <div className="font-mono text-xs font-bold uppercase text-neutral-600 mb-2">
                    Ingestion Pipeline
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center space-x-2 text-emerald-700">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>1. YouTube URL validated & canonicalized</span>
                    </div>

                    <div className="flex items-center space-x-2 text-emerald-700">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>2. Persistent extraction job created in Supabase</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {activeJob.status === 'processing' ? (
                        <>
                          <RefreshCw className="w-4 h-4 text-[#F27D26] animate-spin shrink-0" />
                          <span className="text-[#F27D26] font-bold">
                            3. Gemini model analyzing review video & extracting data...
                          </span>
                        </>
                      ) : activeJob.status === 'ready_for_review' || activeJob.status === 'completed' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span className="text-emerald-700">
                            3. Gemini extraction completed with structured schema
                          </span>
                        </>
                      ) : activeJob.status === 'failed' ? (
                        <div className="space-y-1.5 w-full">
                          <div className="flex items-center space-x-2">
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                            <span className="text-red-600 font-bold">
                              3. Extraction failed: {activeJob.error_message}
                            </span>
                          </div>
                          {activeJob.error_message?.includes('QUOTA') && (
                            <div className="p-2 border border-amber-300 bg-amber-50 text-amber-900 text-[11px] font-mono">
                              <strong>Quota Limit Reached:</strong> Switch to an available alternative model (e.g. <code>gemini-3.1-flash-lite</code>) in the model selector above, or wait for your Gemini quota to reset.
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                          <span className="text-neutral-500">3. Awaiting model processing</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      {activeJob.status === 'ready_for_review' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span className="text-emerald-700 font-bold">
                            4. Ready for human review and verification
                          </span>
                        </>
                      ) : activeJob.status === 'completed' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span className="text-emerald-700">
                            4. Human review verified and committed to database
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                          <span className="text-neutral-500">4. Human review required</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Call to action when ready */}
                {activeJob.status === 'ready_for_review' && (
                  <div className="p-4 bg-[#EBF7EE] border-2 border-[#16A34A] flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-sm text-[#14532D]">
                        Data Extracted Successfully!
                      </p>
                      <p className="text-xs text-[#166534]">
                        Review specifications, match configurations, and verify evidence before saving.
                      </p>
                    </div>
                    <button
                      onClick={() => onOpenReview(activeJob.id)}
                      className="px-5 py-2.5 bg-[#16A34A] text-white hover:bg-[#15803D] font-mono text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer flex items-center space-x-2 shrink-0 border border-[#14532D]"
                    >
                      <span>Open Review Tab</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>

        {/* Right Col: Recent Extraction Jobs */}
        <div className="space-y-6">
          <Panel
            title="Recent Jobs"
            actions={
              <button
                onClick={fetchRecentJobs}
                disabled={loadingJobs}
                className="p-1 hover:bg-neutral-200 transition-colors cursor-pointer"
                title="Refresh jobs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingJobs ? 'animate-spin' : ''}`} />
              </button>
            }
          >
            {recentJobs.length === 0 ? (
              <p className="text-xs text-neutral-500 font-mono italic py-4 text-center">
                No extraction jobs recorded yet.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {recentJobs.map(job => (
                  <div
                    key={job.id}
                    className="border border-[#141414] p-2.5 bg-white hover:border-[#F27D26] transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-neutral-800">
                        {job.youtube_video_id}
                      </span>
                      <StatusBadge status={job.status} size="sm" />
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
                      <span>{new Date(job.created_at).toLocaleTimeString()}</span>
                      {job.status === 'ready_for_review' && (
                        <button
                          onClick={() => onOpenReview(job.id)}
                          className="text-[#F27D26] hover:underline font-bold uppercase"
                        >
                          Review →
                        </button>
                      )}
                      {job.status === 'completed' && job.review_source_id && (
                        <span className="text-emerald-700 font-semibold">Committed</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
};
