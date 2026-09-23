import React from 'react';
import { ConfidenceLevel, ServiceState, JobStatus } from '../../../shared/types/index.ts';

interface StatusBadgeProps {
  status: ServiceState | JobStatus | string;
  label?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md',
}) => {
  const norm = status.toLowerCase();
  const displayLabel = label || status.toUpperCase().replace(/_/g, ' ');

  let bg = 'bg-neutral-200 text-neutral-800 border-neutral-400';
  let dot = 'bg-neutral-500';

  if (norm === 'live' || norm === 'completed' || norm === 'exact match' || norm === 'available' || norm === 'healthy') {
    bg = 'bg-[#EBF7EE] text-[#14532D] border-[#16A34A]';
    dot = 'bg-[#16A34A]';
  } else if (
    norm === 'processing' ||
    norm === 'pending' ||
    norm === 'ready_for_review' ||
    norm === 'likely match' ||
    norm === 'checking'
  ) {
    bg = 'bg-[#FEF6EE] text-[#9A3412] border-[#F27D26]';
    dot = 'bg-[#F27D26] animate-pulse';
  } else if (norm === 'warning' || norm === 'partial match' || norm === 'schema_mismatch') {
    bg = 'bg-[#FEFCE8] text-[#854D0E] border-[#CA8A04]';
    dot = 'bg-[#CA8A04]';
  } else if (norm === 'quota_limited') {
    bg = 'bg-[#FFF1F2] text-[#9F1239] border-[#F43F5E]';
    dot = 'bg-[#F43F5E]';
  } else if (norm === 'error' || norm === 'failed' || norm === 'rejected' || norm === 'no match' || norm === 'unavailable' || norm === 'auth_error' || norm === 'unreachable') {
    bg = 'bg-[#FEF2F2] text-[#991B1B] border-[#DC2626]';
    dot = 'bg-[#DC2626]';
  } else if (norm === 'not_configured') {
    bg = 'bg-neutral-100 text-neutral-600 border-neutral-300';
    dot = 'bg-neutral-400';
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center space-x-1.5 font-mono font-semibold border ${bg} ${padding} uppercase tracking-wider rounded-none`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span>{displayLabel}</span>
    </span>
  );
};
