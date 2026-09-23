import React from 'react';
import { ExternalLink, Clock, ShieldCheck } from 'lucide-react';
import { EvidenceRecord } from '../../../shared/types/index.ts';

interface EvidenceBadgeProps {
  evidence?: EvidenceRecord | null;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  showDetails?: boolean;
}

export const EvidenceBadge: React.FC<EvidenceBadgeProps> = ({
  evidence,
  youtubeUrl,
  youtubeVideoId,
  showDetails = false,
}) => {
  if (!evidence) {
    return (
      <span className="font-mono text-[10px] text-neutral-400 italic">
        No timestamp logged
      </span>
    );
  }

  // Construct direct timestamp link if seconds or video info exist
  let linkUrl: string | null = null;
  if (evidence.timestamp_seconds != null && (youtubeVideoId || youtubeUrl)) {
    const videoId =
      youtubeVideoId || (youtubeUrl ? new URL(youtubeUrl).searchParams.get('v') : null);
    if (videoId) {
      linkUrl = `https://www.youtube.com/watch?v=${videoId}&t=${evidence.timestamp_seconds}s`;
    }
  }

  const confidenceColor =
    evidence.confidence === 'high'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-300'
      : evidence.confidence === 'low'
      ? 'text-amber-700 bg-amber-50 border-amber-300'
      : 'text-sky-700 bg-sky-50 border-sky-300';

  return (
    <div className="inline-flex flex-col space-y-1">
      <div className="inline-flex items-center space-x-1.5 flex-wrap">
        {linkUrl ? (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open review at timestamp ${evidence.timestamp_display || `${evidence.timestamp_seconds}s`}`}
            className="inline-flex items-center space-x-1 px-1.5 py-0.5 font-mono text-[11px] bg-[#141414] text-white hover:bg-[#F27D26] transition-colors"
          >
            <Clock className="w-3 h-3" />
            <span>{evidence.timestamp_display || `${evidence.timestamp_seconds}s`}</span>
            <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-70" />
          </a>
        ) : evidence.timestamp_display ? (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 font-mono text-[11px] bg-neutral-200 text-neutral-800">
            <Clock className="w-3 h-3 text-neutral-600" />
            <span>{evidence.timestamp_display}</span>
          </span>
        ) : null}

        <span
          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 font-mono text-[10px] uppercase border ${confidenceColor}`}
        >
          <ShieldCheck className="w-2.5 h-2.5" />
          <span>{evidence.confidence} conf</span>
        </span>
      </div>

      {showDetails && evidence.evidence_description && (
        <p className="text-xs text-neutral-600 line-clamp-2">
          {evidence.evidence_description}
        </p>
      )}
    </div>
  );
};
