import React, { useState, useEffect } from 'react';
import {
  ListTodo,
  RefreshCw,
  RotateCcw,
  Trash2,
  ExternalLink,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { ExtractionJob } from '../../shared/types/index.ts';
import { Panel } from '../components/ui/Panel.tsx';
import { StatusBadge } from '../components/ui/StatusBadge.tsx';

interface JobsPageProps {
  onOpenReview: (jobId: string) => void;
  onOpenReport: (configId: string) => void;
}

export const JobsPage: React.FC<JobsPageProps> = ({
  onOpenReview,
  onOpenReport,
}) => {
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await api.getJobs();
      setJobs(res.jobs || []);
    } catch (err: any) {
      console.warn('Jobs fetch error:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to fetch extraction jobs.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleResume = async (jobId: string) => {
    setActionLoading(jobId);
    setFeedback(null);
    try {
      await api.resumeJob(jobId);
      setFeedback({ type: 'success', message: `Job #${jobId.slice(0, 8)} resumption started from last completed pass.` });
      await fetchJobs();
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Resume failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async (jobId: string) => {
    setActionLoading(jobId);
    setFeedback(null);
    try {
      await api.retryJob(jobId);
      setFeedback({ type: 'success', message: `Job #${jobId.slice(0, 8)} retry initiated.` });
      await fetchJobs();
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Retry failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (jobId: string) => {
    setActionLoading(jobId);
    setFeedback(null);
    const previousJobs = [...jobs];

    // Optimistically remove from state and display immediately
    setJobs(prev => prev.filter(j => j.id !== jobId));

    try {
      await api.deleteJob(jobId);
      setFeedback({ type: 'success', message: `Job #${jobId.slice(0, 8)} deleted from database.` });
    } catch (err: any) {
      // Revert if delete failed
      setJobs(previousJobs);
      setFeedback({ type: 'error', message: `Delete failed: ${err.message || 'Server error'}` });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredJobs = jobs.filter(j => {
    if (filter === 'all') return true;
    return j.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="border-2 border-[#141414] bg-[#F9F8F6] p-5 shadow-[4px_4px_0px_#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 font-mono text-[10px] uppercase font-bold bg-[#141414] text-white mb-1.5">
            <span>Job Lifecycle Audit Trail</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#141414]">
            Persistent Extraction Jobs
          </h1>
          <p className="text-xs text-neutral-600 mt-0.5">
            Audit pipeline execution, inspect errors, recover interrupted extractions, and launch human reviews.
          </p>
        </div>

        <button
          onClick={fetchJobs}
          disabled={loading}
          className="px-4 py-2 border-2 border-[#141414] bg-white hover:bg-neutral-100 font-mono text-xs uppercase font-bold flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 border-2 text-xs font-mono font-bold flex items-center justify-between shadow-[2px_2px_0px_#141414] ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-700 text-emerald-900'
              : 'bg-red-50 border-red-700 text-red-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[10px] uppercase font-bold hover:underline cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex border-b-2 border-[#141414] bg-[#EBEAE7] overflow-x-auto">
        {['all', 'ready_for_review', 'processing', 'completed', 'failed', 'pending'].map(st => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={`px-4 py-2 font-mono text-xs uppercase font-bold tracking-wider whitespace-nowrap border-r-2 border-[#141414] transition-colors cursor-pointer ${
              filter === st ? 'bg-[#141414] text-white' : 'text-neutral-700 hover:bg-white'
            }`}
          >
            {st.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Jobs Table */}
      <Panel title={`Logged Extractions (${filteredJobs.length})`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-2 font-mono text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-[#F27D26]" />
            <span>Loading extraction jobs...</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <p className="text-xs font-mono text-neutral-500 italic py-6 text-center">
            No extraction jobs matching the &ldquo;{filter}&rdquo; filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse border border-neutral-300">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700 border-b border-neutral-300">
                  <th className="p-2.5 text-left">Video ID & Source</th>
                  <th className="p-2.5 text-left">Status</th>
                  <th className="p-2.5 text-left">Model</th>
                  <th className="p-2.5 text-left">Attempts</th>
                  <th className="p-2.5 text-left">Duration</th>
                  <th className="p-2.5 text-left">Created At</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map(job => (
                  <tr key={job.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                    <td className="p-2.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-[#141414]">{job.youtube_video_id}</span>
                        <a
                          href={job.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-400 hover:text-[#F27D26]"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      {job.error_message && (
                        <p className="text-[10px] text-red-600 line-clamp-1 mt-0.5">
                          {job.error_message}
                        </p>
                      )}
                    </td>

                    <td className="p-2.5">
                      <StatusBadge status={job.status} size="sm" />
                    </td>

                    <td className="p-2.5 text-neutral-600">
                      {job.model_used || '—'}
                    </td>

                    <td className="p-2.5 font-bold">
                      {job.attempt_count || 1}
                    </td>

                    <td className="p-2.5 text-neutral-600">
                      {job.processing_duration_ms
                        ? `${(job.processing_duration_ms / 1000).toFixed(1)}s`
                        : '—'}
                    </td>

                    <td className="p-2.5 text-neutral-500 text-[11px]">
                      {new Date(job.created_at).toLocaleString()}
                    </td>

                    <td className="p-2.5 text-right">
                      <div className="inline-flex items-center space-x-1.5">
                        {job.status === 'ready_for_review' && (
                          <button
                            onClick={() => onOpenReview(job.id)}
                            className="px-2.5 py-1 bg-[#16A34A] text-white hover:bg-[#15803D] font-bold text-[11px] uppercase transition-colors cursor-pointer"
                          >
                            Review →
                          </button>
                        )}

                        {job.status === 'failed' && (
                          <div className="inline-flex items-center space-x-1">
                            {job.raw_extraction && (
                              <button
                                onClick={() => handleResume(job.id)}
                                disabled={actionLoading === job.id}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] uppercase font-bold flex items-center space-x-1 cursor-pointer"
                                title="Resume from last completed pass"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Resume</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleRetry(job.id)}
                              disabled={actionLoading === job.id}
                              className="px-2 py-1 border border-neutral-400 hover:bg-neutral-100 text-[11px] uppercase font-bold flex items-center space-x-1 cursor-pointer"
                              title="Restart extraction completely"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Restart</span>
                            </button>
                          </div>
                        )}

                        <button
                          id={`delete-job-btn-${job.id.slice(0, 8)}`}
                          onClick={() => handleDelete(job.id)}
                          disabled={actionLoading === job.id}
                          className="p-1.5 border border-transparent hover:border-red-400 hover:bg-red-50 text-neutral-400 hover:text-red-700 transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete extraction job from database"
                        >
                          {actionLoading === job.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-600" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};
