import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, AlertCircle, Video, ShieldCheck, Zap } from 'lucide-react';
import { api } from '../lib/api.ts';
import { GeminiModelInfo, ModelHealthStatus } from '../../shared/types/index.ts';
import { StatusBadge } from './ui/StatusBadge.tsx';

interface ModelSelectorProps {
  selectedModel?: string;
  onSelectModel?: (modelId: string) => void;
  mode?: 'compact' | 'full';
  showSetActive?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onSelectModel,
  mode = 'compact',
  showSetActive = true,
}) => {
  const [models, setModels] = useState<GeminiModelInfo[]>([]);
  const [activeModel, setActiveModel] = useState<string>('gemini-3.8-flash');
  const [loading, setLoading] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: ModelHealthStatus; latencyMs?: number; error?: string }>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const data = await api.getModels();
      setModels(data.models);
      setActiveModel(data.activeModel);
      if (!selectedModel && onSelectModel) {
        onSelectModel(data.activeModel);
      }
    } catch (err: any) {
      console.error('Failed to fetch models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleTestModel = async (modelId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTestingModelId(modelId);
    try {
      const result = await api.testModel(modelId);
      setTestResults(prev => ({
        ...prev,
        [modelId]: {
          status: result.status as ModelHealthStatus,
          latencyMs: result.latencyMs,
          error: result.error,
        },
      }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [modelId]: {
          status: 'unavailable',
          error: err.message,
        },
      }));
    } finally {
      setTestingModelId(null);
    }
  };

  const handleSetActive = async (modelId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await api.setActiveModel(modelId);
      setActiveModel(res.currentModel);
      if (onSelectModel) {
        onSelectModel(res.currentModel);
      }
      setStatusMessage(`Default model set to ${res.currentModel}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage(`Failed: ${err.message}`);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const currentSelection = selectedModel || activeModel;

  if (mode === 'compact') {
    return (
      <div className="border border-[#141414] bg-white p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-neutral-800">
              Extraction AI Model
            </span>
            {activeModel && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 bg-neutral-100 text-neutral-600 border border-neutral-300">
                Default: {activeModel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={fetchModels}
            disabled={loading}
            className="p-1 hover:bg-neutral-100 border border-transparent hover:border-neutral-300 text-neutral-600 cursor-pointer disabled:opacity-50"
            title="Refresh models"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <div className="relative flex-1">
            <select
              value={currentSelection}
              onChange={e => {
                const val = e.target.value;
                if (onSelectModel) onSelectModel(val);
              }}
              className="w-full px-3 py-1.5 bg-white border border-[#141414] font-mono text-xs focus:outline-none focus:border-[#F27D26] cursor-pointer"
            >
              {models.map(m => {
                const res = testResults[m.id];
                const statusTag = res ? `[${res.status.toUpperCase()}]` : '';
                return (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.id}) {statusTag}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => handleTestModel(currentSelection)}
              disabled={testingModelId === currentSelection}
              className="px-3 py-1.5 font-mono text-xs font-bold border border-[#141414] bg-white hover:bg-neutral-100 flex items-center space-x-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${testingModelId === currentSelection ? 'animate-spin' : ''}`} />
              <span>Test Model</span>
            </button>

            {showSetActive && currentSelection !== activeModel && (
              <button
                type="button"
                onClick={() => handleSetActive(currentSelection)}
                className="px-3 py-1.5 font-mono text-xs font-bold border border-[#141414] bg-[#141414] text-white hover:bg-[#F27D26] cursor-pointer"
              >
                Set as Default
              </button>
            )}
          </div>
        </div>

        {/* Health status preview of current selection */}
        {testResults[currentSelection] && (
          <div className="mt-1 flex items-center justify-between text-xs font-mono p-2 border border-neutral-200 bg-neutral-50">
            <div className="flex items-center space-x-2">
              <StatusBadge status={testResults[currentSelection].status} size="sm" />
              {testResults[currentSelection].latencyMs != null && (
                <span className="text-neutral-600">{testResults[currentSelection].latencyMs}ms ping</span>
              )}
            </div>
            {testResults[currentSelection].error && (
              <span className="text-red-600 text-[11px] truncate max-w-xs" title={testResults[currentSelection].error}>
                {testResults[currentSelection].error}
              </span>
            )}
          </div>
        )}

        {statusMessage && (
          <p className="font-mono text-[11px] text-emerald-700 bg-emerald-50 p-1 border border-emerald-200">
            {statusMessage}
          </p>
        )}
      </div>
    );
  }

  // Full Mode: detailed model list with status badges, capabilities, and actions
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-1 border-b border-neutral-200">
        <div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-neutral-800">
            Available Gemini Extraction Models
          </span>
          <p className="text-[11px] text-neutral-500">
            Live discovery filtered for multimodal video extraction capability.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchModels}
          disabled={loading}
          className="flex items-center space-x-1 px-2 py-1 font-mono text-xs border border-[#141414] bg-white hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {statusMessage && (
        <div className="p-2 border border-emerald-200 bg-emerald-50 text-emerald-800 font-mono text-xs flex items-center space-x-2">
          <Check className="w-3.5 h-3.5" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {models.map(m => {
          const isCurrentActive = m.id === activeModel;
          const isSelected = m.id === currentSelection;
          const test = testResults[m.id];
          const isTesting = testingModelId === m.id;

          return (
            <div
              key={m.id}
              onClick={() => onSelectModel && onSelectModel(m.id)}
              className={`p-3 border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-[#141414] bg-white shadow-[2px_2px_0px_#141414]'
                  : 'border-neutral-300 bg-neutral-50 hover:bg-white hover:border-neutral-400'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <span className="font-mono font-bold text-xs text-[#141414]">
                      {m.displayName}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-500">({m.id})</span>
                    {isCurrentActive && (
                      <span className="font-mono text-[9px] font-bold px-1.5 py-0.2 bg-[#141414] text-white">
                        ACTIVE DEFAULT
                      </span>
                    )}
                    <span className="font-mono text-[9px] px-1 py-0.2 bg-neutral-200 text-neutral-700 uppercase">
                      {m.releaseClass}
                    </span>
                    {m.videoCapability === 'VERIFIED' && (
                      <span className="font-mono text-[9px] px-1 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 flex items-center space-x-0.5">
                        <Video className="w-2.5 h-2.5" />
                        <span>VIDEO VERIFIED</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 line-clamp-1">{m.description}</p>
                </div>

                {/* Health Status & Action */}
                <div className="flex items-center space-x-2 shrink-0">
                  {test ? (
                    <div className="text-right">
                      <StatusBadge status={test.status} size="sm" />
                      {test.latencyMs != null && (
                        <p className="font-mono text-[10px] text-neutral-500 mt-0.5">{test.latencyMs}ms</p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={e => handleTestModel(m.id, e)}
                      disabled={isTesting}
                      className="px-2 py-1 font-mono text-[11px] border border-[#141414] bg-white hover:bg-neutral-100 flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                    >
                      <Zap className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Testing...' : 'Test'}</span>
                    </button>
                  )}

                  {isCurrentActive ? (
                    <span className="text-emerald-700">
                      <Check className="w-4 h-4" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={e => handleSetActive(m.id, e)}
                      className="px-2 py-1 font-mono text-[11px] font-bold border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
                    >
                      Set Active
                    </button>
                  )}
                </div>
              </div>

              {test?.error && (
                <div className="mt-2 p-1.5 bg-red-50 border border-red-200 font-mono text-[10px] text-red-700 break-words">
                  {test.error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
