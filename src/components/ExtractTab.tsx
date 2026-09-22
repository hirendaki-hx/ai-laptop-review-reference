import React, { useState, useEffect } from 'react';
import {
  Youtube,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Cpu,
  Layers,
  Flame,
  Gamepad2,
  BatteryCharging,
} from 'lucide-react';
import { ExtractionData, ExtractionJob } from '../types.ts';
import { trackedFetch } from '../utils/trackedFetch.ts';

interface ExtractTabProps {
  onExtractionReady: (jobId: string, data: ExtractionData) => void;
  onNavigateToReport: (configId: string) => void;
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
}

export const ExtractTab: React.FC<ExtractTabProps> = ({
  onExtractionReady,
  onNavigateToReport,
  activeJobId,
  setActiveJobId,
}) => {
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollingJob, setPollingJob] = useState<ExtractionJob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    existingReviewId?: string;
    existingLaptopName?: string;
    configurationId?: string;
  } | null>(null);

  // Poll active extraction job
  useEffect(() => {
    if (!activeJobId) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await trackedFetch(`/api/extract/${activeJobId}`);
        if (!res.ok) throw new Error('Failed to check job status');
        const job: ExtractionJob = await res.json();

        if (!isMounted) return;
        setPollingJob(job);

        if (job.status === 'duplicate') {
          clearInterval(interval);
          setIsSubmitting(false);
          setDuplicateInfo({
            existingReviewId: job.existingReviewId || job.review_source_id || undefined,
            existingLaptopName: job.existingLaptopName || 'Existing Laptop',
            configurationId: undefined,
          });
        } else if (job.status === 'ready_for_review' && job.raw_extraction) {
          clearInterval(interval);
          setIsSubmitting(false);
          onExtractionReady(job.id, job.raw_extraction);
        } else if (job.status === 'failed') {
          clearInterval(interval);
          setIsSubmitting(false);
          setErrorMessage(job.error_message || 'Video extraction failed. Please check the URL.');
        }
      } catch (err: any) {
        console.warn('Job polling error:', err);
      }
    }, 1800);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeJobId, onExtractionReady]);

  const handleStartExtraction = async (videoUrlToUse?: string) => {
    const targetUrl = (videoUrlToUse || url).trim();
    if (!targetUrl) return;

    setErrorMessage(null);
    setDuplicateInfo(null);
    setIsSubmitting(true);

    try {
      const res = await trackedFetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          language,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start extraction');
      }

      if (data.status === 'duplicate') {
        setIsSubmitting(false);
        setDuplicateInfo({
          existingReviewId: data.existingReviewId,
          existingLaptopName: data.existingLaptopName,
          configurationId: data.configurationId,
        });
        return;
      }

      setActiveJobId(data.jobId);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Failed to initiate extraction');
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      {/* Hero Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center space-x-2 px-3 py-0.5 bg-[#141414] text-[#E4E3E0] text-[10px] font-mono uppercase tracking-widest mb-3 border border-[#141414]">
          <Sparkles className="w-3 h-3 text-[#F27D26]" />
          <span>Multimodal Pipeline :: YouTube Video Extraction</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-mono font-bold tracking-tight text-[#141414] uppercase">
          Video To Structured Laptop Database
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-[#141414]/70 max-w-2xl mx-auto font-serif italic">
          Paste any laptop review video. Gemini watches the video frames, audio, and benchmarks. You review and verify every field before committing to Supabase Postgres.
        </p>
      </div>

      {/* Main Extraction Form Card */}
      <div className="bg-[#F9F8F6] border-2 border-[#141414] p-6 sm:p-8 shadow-[6px_6px_0px_0px_#141414] mb-8" id="extract-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleStartExtraction();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="youtube-url-input" className="block text-[10px] uppercase font-bold text-[#141414]/70 mb-2 font-mono">
              TARGET_YOUTUBE_URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#141414]">
                <Youtube className="w-5 h-5 text-rose-600" />
              </div>
              <input
                id="youtube-url-input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                disabled={isSubmitting}
                className="w-full pl-11 pr-4 py-3 bg-white border border-[#141414] text-[#141414] placeholder-[#141414]/40 font-mono text-xs sm:text-sm outline-none focus:ring-1 focus:ring-[#141414] disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
            <div className="flex items-center space-x-2 text-xs font-mono text-[#141414]">
              <span className="text-[10px] uppercase font-bold text-[#141414]/70">LANGUAGE_TRACK:</span>
              <select
                id="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isSubmitting}
                className="bg-white border border-[#141414] px-2.5 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-[#141414]"
              >
                <option value="en">English (Default)</option>
                <option value="es">Spanish</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="zh">Chinese</option>
              </select>
            </div>

            <button
              id="extract-submit-button"
              type="submit"
              disabled={isSubmitting || !url.trim()}
              className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-[#F27D26] hover:bg-[#ff8e3a] text-[#141414] border border-[#141414] font-mono font-bold text-xs uppercase tracking-widest transition-colors shadow-[2px_2px_0px_0px_#141414] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#141414]" />
                  <span>Processing Extraction...</span>
                </>
              ) : (
                <>
                  <span>Initiate Extraction</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Duplicate Video Banner */}
        {duplicateInfo && (
          <div
            id="duplicate-video-banner"
            className="mt-6 p-4 bg-yellow-100 border border-[#141414] text-[#141414] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs"
          >
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs uppercase">
                  Duplicate Source Detected
                </h4>
                <p className="text-[11px] text-[#141414]/80 mt-0.5 font-sans">
                  This YouTube video review is already logged in the database under{' '}
                  <span className="font-bold text-[#141414]">
                    {duplicateInfo.existingLaptopName}
                  </span>
                  .
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {duplicateInfo.configurationId && (
                <button
                  id="view-existing-report-btn"
                  onClick={() => onNavigateToReport(duplicateInfo.configurationId!)}
                  className="px-3 py-1.5 bg-[#141414] text-white text-[10px] font-mono uppercase font-bold hover:bg-[#333] transition-colors flex items-center space-x-1"
                >
                  <span>View Report</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => setDuplicateInfo(null)}
                className="px-2.5 py-1.5 border border-[#141414] text-[10px] uppercase font-bold text-[#141414] hover:bg-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Progress / Status Display */}
        {isSubmitting && (
          <div id="extraction-progress-box" className="mt-6 p-5 bg-[#EBEAE7] border border-[#141414] space-y-3 font-mono">
            <div className="flex items-center justify-between text-xs text-[#141414]">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
                <span className="font-bold text-[11px] uppercase tracking-wider">
                  {pollingJob?.status === 'processing'
                    ? 'Gemini Multimodal Inference in Progress'
                    : 'Extraction Job Queued (202 Accepted)'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-gray-600 uppercase">
                JOB_ID: #{activeJobId?.slice(0, 8)}
              </span>
            </div>

            {/* Stepper */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs pt-1">
              <div className="p-2 bg-white border border-[#141414] flex items-center space-x-2 text-[10px] uppercase font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>URL Validated</span>
              </div>
              <div className="p-2 bg-white border border-[#141414] flex items-center space-x-2 text-[10px] uppercase font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Dup Checked</span>
              </div>
              <div className="p-2 bg-yellow-100 border border-[#141414] flex items-center space-x-2 text-[10px] uppercase font-bold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-amber-700" />
                <span>Gemini Analysis</span>
              </div>
              <div className="p-2 bg-gray-100 border border-[#141414]/30 flex items-center space-x-2 text-[10px] uppercase font-bold text-gray-500">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Verification</span>
              </div>
            </div>

            <p className="text-[10px] text-[#141414]/70 font-mono italic text-center pt-1">
              Analyzing video frames, OCR benchmark charts, and spoken timestamps... (~10-25 seconds)
            </p>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="mt-6 p-4 bg-red-100 border border-red-600 text-red-900 text-xs font-mono flex items-start space-x-3">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold uppercase text-[11px]">Extraction Fault</h4>
              <p className="text-xs mt-0.5">{errorMessage}</p>
            </div>
            <button
              onClick={() => handleStartExtraction()}
              className="px-3 py-1 bg-[#141414] text-white text-[10px] uppercase font-bold hover:bg-[#333]"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Extraction Architecture Explanation */}
      <div className="border-t border-[#141414] pt-8">
        <h3 className="text-[10px] font-mono uppercase font-bold tracking-widest text-[#141414]/70 mb-4 text-center">
          Engine Guardrails & Verification Guarantees
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center font-mono">
          <div className="p-3 bg-white border border-[#141414]">
            <Cpu className="w-4 h-4 text-[#141414] mx-auto mb-1.5" />
            <h5 className="text-[10px] font-bold uppercase text-[#141414]">Zero Hallucination</h5>
            <p className="text-[10px] text-gray-600 mt-0.5 font-sans">Strict "DO NOT GUESS" prompts</p>
          </div>
          <div className="p-3 bg-white border border-[#141414]">
            <Layers className="w-4 h-4 text-[#F27D26] mx-auto mb-1.5" />
            <h5 className="text-[10px] font-bold uppercase text-[#141414]">Human Confirmation</h5>
            <p className="text-[10px] text-gray-600 mt-0.5 font-sans">Edit every field before commit</p>
          </div>
          <div className="p-3 bg-white border border-[#141414]">
            <Gamepad2 className="w-4 h-4 text-[#141414] mx-auto mb-1.5" />
            <h5 className="text-[10px] font-bold uppercase text-[#141414]">Exact Game Settings</h5>
            <p className="text-[10px] text-gray-600 mt-0.5 font-sans">Resolution, ray tracing, preset</p>
          </div>
          <div className="p-3 bg-white border border-[#141414]">
            <BatteryCharging className="w-4 h-4 text-[#141414] mx-auto mb-1.5" />
            <h5 className="text-[10px] font-bold uppercase text-[#141414]">Supabase Postgres</h5>
            <p className="text-[10px] text-gray-600 mt-0.5 font-sans">Server-only relational storage</p>
          </div>
        </div>
      </div>
    </div>
  );
};
