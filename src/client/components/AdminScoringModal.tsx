import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal.tsx';
import { ScoringProfile, ScoringMetricDefinition } from '../../shared/types/index.ts';
import { api } from '../lib/api.ts';
import { Sliders, Plus, RotateCcw, Check, AlertCircle, Layers } from 'lucide-react';

interface AdminScoringModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminScoringModal: React.FC<AdminScoringModalProps> = ({ isOpen, onClose }) => {
  const [profiles, setProfiles] = useState<ScoringProfile[]>([]);
  const [metrics, setMetrics] = useState<ScoringMetricDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<ScoringProfile | null>(null);
  const [recalculatingAll, setRecalculatingAll] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([
        api.getAdminProfiles(),
        api.getAdminMetrics(),
      ]);
      setProfiles(pRes.profiles || []);
      setMetrics(mRes.metrics || []);
      if (pRes.profiles && pRes.profiles.length > 0 && !selectedProfile) {
        setSelectedProfile(pRes.profiles[0]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load scoring admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const handleToggleActive = async (profileId: string, currentActive: boolean) => {
    try {
      await api.toggleProfileStatus(profileId, !currentActive);
      setSuccessMsg(`Profile status updated`);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile');
    }
  };

  const handleRecalculateAll = async () => {
    setRecalculatingAll(true);
    setErrorMsg(null);
    try {
      const res = await api.recalculateScores();
      setSuccessMsg(res.message || 'Recalculation initiated');
    } catch (err: any) {
      setErrorMsg(err.message || 'Recalculation failed');
    } finally {
      setRecalculatingAll(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scoring Profile & Metric Engine Administration"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6 font-mono text-xs">
        {/* Alerts */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center space-x-2">
            <Check className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Global Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#F9F8F6] border border-[#141414]">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-[#F27D26]" />
            <span className="font-bold text-[#141414] uppercase">
              Scoring Profiles ({profiles.length}) & Metric Definitions ({metrics.length})
            </span>
          </div>

          <button
            onClick={handleRecalculateAll}
            disabled={recalculatingAll}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#141414] text-white hover:bg-[#F27D26] font-bold uppercase transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${recalculatingAll ? 'animate-spin' : ''}`} />
            <span>{recalculatingAll ? 'Recalculating...' : 'Recalculate All Scores'}</span>
          </button>
        </div>

        {/* Profiles Table */}
        {loading ? (
          <div className="p-6 text-center text-neutral-500">Loading scoring configurations...</div>
        ) : (
          <div className="space-y-4">
            <div className="border border-[#141414] bg-white overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-100 border-b border-[#141414] uppercase text-neutral-600 font-bold">
                    <th className="py-2.5 px-3">Profile Name</th>
                    <th className="py-2.5 px-3">Key</th>
                    <th className="py-2.5 px-3">Version</th>
                    <th className="py-2.5 px-3">Metrics</th>
                    <th className="py-2.5 px-3">Min Coverage</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {profiles.map((p) => {
                    const isSelected = selectedProfile?.id === p.id;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedProfile(p)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#FFFBEB] font-bold' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-[#141414]">{p.name}</td>
                        <td className="py-2.5 px-3 text-neutral-500 font-semibold">{p.profile_key}</td>
                        <td className="py-2.5 px-3">v{p.version}</td>
                        <td className="py-2.5 px-3">{p.metrics?.length || 0} metrics</td>
                        <td className="py-2.5 px-3">{p.minimum_coverage_percent}%</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${
                              p.is_active
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-neutral-200 text-neutral-600 border-neutral-300'
                            }`}
                          >
                            {p.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleActive(p.id, p.is_active);
                            }}
                            className="px-2 py-1 border border-[#141414] bg-white hover:bg-neutral-100 text-[10px] font-bold uppercase cursor-pointer"
                          >
                            {p.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Selected Profile Metric Weights Inspector */}
            {selectedProfile && (
              <div className="border border-[#141414] bg-[#F9F8F6] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-300 pb-2">
                  <div className="font-bold uppercase text-[#141414]">
                    Metrics & Weights in {selectedProfile.name} (v{selectedProfile.version})
                  </div>
                  <span className="text-neutral-500 text-[10px]">
                    {selectedProfile.description || 'Verified hardware performance index'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse bg-white border border-neutral-300">
                    <thead>
                      <tr className="bg-neutral-100 border-b border-neutral-300 uppercase text-neutral-600 font-bold">
                        <th className="py-2 px-2.5">Domain</th>
                        <th className="py-2 px-2.5">Metric Key</th>
                        <th className="py-2 px-2.5">Display Name</th>
                        <th className="py-2 px-2.5">Normalization</th>
                        <th className="py-2 px-2.5 text-right">Weight</th>
                        <th className="py-2 px-2.5">Required</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {selectedProfile.metrics?.map((pm) => (
                        <tr key={pm.metric_id}>
                          <td className="py-2 px-2.5 font-bold uppercase text-neutral-500">
                            {pm.metric?.domain}
                          </td>
                          <td className="py-2 px-2.5 text-neutral-600">{pm.metric?.metric_key}</td>
                          <td className="py-2 px-2.5 font-bold text-[#141414]">{pm.metric?.name}</td>
                          <td className="py-2 px-2.5 text-[10px] text-neutral-500">
                            {pm.metric?.normalization_method} ({pm.metric?.min_value} - {pm.metric?.max_value} {pm.metric?.unit})
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold text-[#F27D26]">
                            {pm.weight} pts
                          </td>
                          <td className="py-2 px-2.5">
                            {pm.is_required ? (
                              <span className="px-1 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold uppercase">
                                Yes
                              </span>
                            ) : (
                              <span className="text-neutral-400">No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
