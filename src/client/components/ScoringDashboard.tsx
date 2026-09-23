import React, { useState, useEffect } from 'react';
import {
  ConfigurationScore,
  ConfigurationScoreDetail,
  ScoringProfile,
} from '../../shared/types/index.ts';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Award,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Info,
  CheckCircle2,
  AlertCircle,
  Gamepad2,
  Palette,
  Briefcase,
  BatteryCharging,
  Sliders,
} from 'lucide-react';

interface ScoringDashboardProps {
  configurationId: string;
  onOpenAdminScoring?: () => void;
}

export const ScoringDashboard: React.FC<ScoringDashboardProps> = ({
  configurationId,
  onOpenAdminScoring,
}) => {
  const { isAdmin } = useAuth();
  const [scores, setScores] = useState<ConfigurationScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [expandedProfileKey, setExpandedProfileKey] = useState<string | null>(null);

  const fetchScores = async () => {
    setLoading(true);
    try {
      const res = await api.getConfigurationScores(configurationId);
      if (res && res.scores) {
        setScores(res.scores);
        // Expand first score by default if exists
        if (res.scores.length > 0 && !expandedProfileKey) {
          setExpandedProfileKey(res.scores[0].profile_key);
        }
      }
    } catch (err) {
      console.warn('Error fetching scores:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
  }, [configurationId]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await api.recalculateScores(configurationId);
      await fetchScores();
    } catch (err) {
      console.error('Failed to recalculate scores:', err);
    } finally {
      setRecalculating(false);
    }
  };

  const getProfileIcon = (key: string) => {
    switch (key) {
      case 'gaming':
        return <Gamepad2 className="w-5 h-5 text-indigo-600" />;
      case 'creator':
        return <Palette className="w-5 h-5 text-purple-600" />;
      case 'productivity':
        return <Briefcase className="w-5 h-5 text-emerald-600" />;
      case 'battery':
      case 'portability':
        return <BatteryCharging className="w-5 h-5 text-amber-600" />;
      default:
        return <Award className="w-5 h-5 text-[#F27D26]" />;
    }
  };

  const getScoreColorClass = (score: number | null, status: string) => {
    if (status === 'insufficient_data' || score === null) {
      return 'border-neutral-300 bg-neutral-100 text-neutral-500';
    }
    if (score >= 85) return 'border-emerald-600 bg-emerald-50 text-emerald-800';
    if (score >= 70) return 'border-blue-600 bg-blue-50 text-blue-800';
    if (score >= 50) return 'border-amber-600 bg-amber-50 text-amber-800';
    return 'border-neutral-600 bg-neutral-100 text-neutral-800';
  };

  return (
    <div className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-neutral-200 pb-4 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <Award className="w-5 h-5 text-[#F27D26]" />
            <h2 className="font-mono font-bold text-base text-[#141414] uppercase tracking-tight">
              Verified Use-Case Scores
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-600 border border-neutral-300 font-bold uppercase">
              100% Deterministic
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-mono mt-1">
            Calculated directly from verified benchmark results and thermal/battery measurements.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {isAdmin && onOpenAdminScoring && (
            <button
              onClick={onOpenAdminScoring}
              className="flex items-center space-x-1.5 px-3 py-1.5 border border-[#141414] bg-white hover:bg-neutral-100 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Weights & Profiles</span>
            </button>
          )}

          <button
            onClick={handleRecalculate}
            disabled={recalculating || loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 border-2 border-[#141414] bg-[#141414] text-white hover:bg-[#F27D26] hover:border-[#F27D26] text-xs font-mono font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
            <span>{recalculating ? 'Calculating...' : 'Recalculate'}</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="p-8 text-center font-mono text-xs text-neutral-500">
          Loading verified score breakdown...
        </div>
      ) : scores.length === 0 ? (
        <div className="p-8 text-center font-mono border border-dashed border-neutral-300 bg-[#F9F8F6]">
          <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-xs font-bold text-neutral-700">No score profiles calculated yet</p>
          <p className="text-[11px] text-neutral-500 mt-1">
            Click "Recalculate" above to compute deterministic scores for this configuration.
          </p>
        </div>
      ) : (
        /* Score Profile Cards Grid */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {scores.map((sc) => {
              const isExpanded = expandedProfileKey === sc.profile_key;
              const hasInsufficientData = sc.status === 'insufficient_data';

              return (
                <div
                  key={sc.profile_id}
                  onClick={() => setExpandedProfileKey(isExpanded ? null : sc.profile_key)}
                  className={`border-2 p-4 cursor-pointer transition-all ${
                    isExpanded
                      ? 'border-[#141414] bg-[#FFFBEB] shadow-[3px_3px_0px_#141414]'
                      : 'border-neutral-300 bg-white hover:border-[#141414]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {getProfileIcon(sc.profile_key)}
                      <span className="font-mono font-bold text-xs uppercase tracking-wider text-[#141414]">
                        {sc.profile_name}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-400" />
                    )}
                  </div>

                  {/* Big Score Display */}
                  <div className="mt-3 flex items-baseline justify-between">
                    <div className="flex items-baseline space-x-1">
                      <span className="font-mono text-3xl font-extrabold text-[#141414]">
                        {sc.score !== null ? sc.score : '—'}
                      </span>
                      <span className="font-mono text-xs text-neutral-400 font-bold">/100</span>
                    </div>

                    <div
                      className={`px-2 py-0.5 border font-mono text-[10px] font-bold uppercase ${getScoreColorClass(
                        sc.score,
                        sc.status
                      )}`}
                    >
                      {hasInsufficientData ? 'Low Data' : sc.score && sc.score >= 80 ? 'Excellent' : 'Calculated'}
                    </div>
                  </div>

                  {/* Coverage Bar */}
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                      <span>Data Coverage</span>
                      <span className="font-bold">{sc.coverage_percent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-200 overflow-hidden">
                      <div
                        className={`h-full ${
                          sc.coverage_percent >= 70
                            ? 'bg-emerald-600'
                            : sc.coverage_percent >= 40
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, sc.coverage_percent)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] font-mono text-neutral-400 flex items-center justify-between">
                    <span>{sc.metrics_used} metrics used</span>
                    <span>v{sc.profile_version}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Metric Breakdown for Selected Profile */}
          {expandedProfileKey && (
            <div className="border-2 border-[#141414] bg-[#F9F8F6] p-4 animate-fade-in font-mono">
              {(() => {
                const selectedScore = scores.find((s) => s.profile_key === expandedProfileKey);
                if (!selectedScore) return null;

                const details = selectedScore.details || [];

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-300 pb-2">
                      <div className="flex items-center space-x-2">
                        {getProfileIcon(selectedScore.profile_key)}
                        <h3 className="font-bold text-sm text-[#141414] uppercase">
                          {selectedScore.profile_name} — Detailed Metric Breakdown
                        </h3>
                      </div>
                      <span className="text-xs text-neutral-500">
                        Profile Version: {selectedScore.profile_version}
                      </span>
                    </div>

                    {selectedScore.error_message && (
                      <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center space-x-2">
                        <Info className="w-4 h-4 shrink-0" />
                        <span>{selectedScore.error_message}</span>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="border-b-2 border-[#141414] text-neutral-600 font-bold uppercase">
                            <th className="py-2 px-2">Domain</th>
                            <th className="py-2 px-2">Metric</th>
                            <th className="py-2 px-2 text-right">Raw Measured</th>
                            <th className="py-2 px-2 text-right">Normalized (0-100)</th>
                            <th className="py-2 px-2 text-right">Weight</th>
                            <th className="py-2 px-2 text-right">Contribution</th>
                            <th className="py-2 px-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {details.map((d, idx) => (
                            <tr
                              key={d.metric_id || idx}
                              className={
                                d.eligibility_status === 'used'
                                  ? 'hover:bg-white'
                                  : 'opacity-60 bg-neutral-100'
                              }
                            >
                              <td className="py-2 px-2 font-semibold uppercase text-neutral-500">
                                {d.metric_domain}
                              </td>
                              <td className="py-2 px-2">
                                <div className="font-bold text-[#141414]">{d.metric_name}</div>
                                {d.reviewer_name && (
                                  <div className="text-[10px] text-neutral-400">
                                    Source: {d.reviewer_name}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-bold text-[#141414]">
                                {d.raw_value !== null ? `${d.raw_value} ${d.unit || ''}` : '—'}
                              </td>
                              <td className="py-2 px-2 text-right font-bold">
                                {d.normalized_score !== null ? d.normalized_score : '—'}
                              </td>
                              <td className="py-2 px-2 text-right text-neutral-600">
                                {d.weight} pts
                              </td>
                              <td className="py-2 px-2 text-right font-extrabold text-[#F27D26]">
                                {d.weighted_contribution !== null
                                  ? `+${d.weighted_contribution}`
                                  : '0'}
                              </td>
                              <td className="py-2 px-2">
                                {d.eligibility_status === 'used' ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold uppercase">
                                    Included
                                  </span>
                                ) : (
                                  <span
                                    title={d.exclusion_reason || ''}
                                    className="px-1.5 py-0.5 bg-neutral-200 text-neutral-600 border border-neutral-300 text-[10px] uppercase cursor-help"
                                  >
                                    Missing
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
