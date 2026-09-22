import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Database,
  Trash2,
} from 'lucide-react';
import { ExtractionJob } from '../types.ts';
import { trackedFetch } from '../utils/trackedFetch.ts';

interface JobsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResumeReview: (jobId: string, rawData: any) => void;
}

export const JobsModal: React.FC<JobsModalProps> = ({
  isOpen,
  onClose,
  onResumeReview,
}) => {
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadJobs() {
      try {
        setLoading(true);
        const res = await trackedFetch('/api/jobs');
        if (res.ok) {
          const data: ExtractionJob[] = await res.json();
          if (isMounted) setJobs(data);
        }
      } catch (err) {
        console.warn('Failed to load extraction jobs:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadJobs();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDeletingId(jobId);
      const res = await trackedFetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
    } catch (err) {
      console.error('Failed to delete extraction job:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      setIsClearing(true);
      const res = await trackedFetch('/api/jobs', { method: 'DELETE' });
      if (res.ok) {
        setJobs([]);
      }
    } catch (err) {
      console.error('Failed to clear extraction jobs:', err);
    } finally {
      setIsClearing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-mono">
      <div className="bg-[#F9F8F6] border-2 border-[#141414] shadow-[8px_8px_0px_0px_#141414] max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col text-[#141414]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#141414]">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-[#141414]" />
            <h3 className="text-base font-serif italic font-bold text-[#141414]">Extraction Jobs Audit Trail</h3>
          </div>
          <div className="flex items-center space-x-2">
            {jobs.length > 0 && (
              <button
                id="clear-all-jobs-btn"
                onClick={handleClearAll}
                disabled={isClearing}
                className="px-2.5 py-1 border border-[#141414] bg-white text-xs font-mono font-bold uppercase hover:bg-red-50 hover:text-red-700 cursor-pointer flex items-center space-x-1"
                title="Clear all jobs from audit trail"
              >
                <Trash2 className="w-3 h-3" />
                <span>{isClearing ? 'Clearing...' : 'Clear All'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 border border-[#141414] bg-white text-[#141414] hover:bg-gray-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-600">
          History of video extraction jobs processed by the Gemini extraction worker. These records track extraction status and do not modify saved laptop data.
        </p>

        {/* Jobs List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-gray-500 font-bold uppercase tracking-wider">
              Loading jobs audit trail...
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 font-mono">
              No extraction jobs recorded yet.
            </div>
          ) : (
            jobs.map((job) => {
              const dateStr = new Date(job.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={job.id}
                  id={`job-row-${job.id.slice(0, 8)}`}
                  className="p-3.5 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_#141414] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="font-mono text-[11px] font-bold text-gray-500">
                        #{job.id.slice(0, 8)}
                      </span>
                      {job.status === 'completed' && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-700 text-[10px] font-bold flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Saved to DB</span>
                        </span>
                      )}
                      {job.status === 'ready_for_review' && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-700 text-[10px] font-bold flex items-center space-x-1">
                          <Sparkles className="w-3 h-3 text-[#F27D26]" />
                          <span>Ready for Review</span>
                        </span>
                      )}
                      {job.status === 'processing' && (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-900 border border-rose-700 text-[10px] font-bold flex items-center space-x-1">
                          <Clock className="w-3 h-3 animate-spin" />
                          <span>Extracting...</span>
                        </span>
                      )}
                      {job.status === 'duplicate' && (
                        <span className="px-2 py-0.5 bg-gray-200 text-gray-800 border border-gray-400 text-[10px] font-bold">
                          Duplicate
                        </span>
                      )}
                      {job.status === 'rejected' && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-300 text-[10px]">
                          Discarded
                        </span>
                      )}
                      {job.status === 'failed' && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-900 border border-red-700 text-[10px] font-bold">
                          Failed
                        </span>
                      )}
                    </div>

                    <p className="text-[#141414] truncate max-w-md font-mono text-[11px] font-medium">
                      {job.youtube_url}
                    </p>
                    <p className="text-[10px] text-gray-500">{dateStr}</p>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {job.status === 'ready_for_review' && job.raw_extraction && (
                      <button
                        onClick={() => {
                          onResumeReview(job.id, job.raw_extraction);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-[#141414] text-white font-bold text-xs hover:bg-gray-800 flex items-center space-x-1 shadow-[2px_2px_0px_0px_#141414] cursor-pointer"
                      >
                        <span>Review</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      id={`delete-job-${job.id.slice(0, 8)}`}
                      onClick={(e) => handleDeleteJob(job.id, e)}
                      disabled={deletingId === job.id}
                      className="p-1.5 border border-gray-300 hover:border-red-600 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete this job from audit trail"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
