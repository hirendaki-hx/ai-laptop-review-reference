import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  subtext?: string;
  tags?: string[];
  evidence?: React.ReactNode;
  highlight?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  subtext,
  tags,
  evidence,
  highlight = false,
}) => {
  const isNull = value == null || value === '';

  return (
    <div
      className={`border-2 border-[#141414] p-3 flex flex-col justify-between transition-colors ${
        highlight ? 'bg-[#FFF9F3] border-[#F27D26]' : 'bg-white'
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
            {label}
          </span>
          {tags && tags.length > 0 && (
            <div className="flex space-x-1">
              {tags.map((t, idx) => (
                <span
                  key={idx}
                  className="font-mono text-[9px] px-1 py-0.2 bg-neutral-100 border border-neutral-300 uppercase"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-baseline space-x-1 my-1">
          {isNull ? (
            <span className="font-mono text-xl font-bold text-neutral-400">
              N/A
            </span>
          ) : (
            <>
              <span className="font-mono text-2xl font-bold text-[#141414]">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </span>
              {unit && (
                <span className="font-mono text-xs text-neutral-500 font-medium">
                  {unit}
                </span>
              )}
            </>
          )}
        </div>

        {subtext && (
          <p className="text-xs text-neutral-600 line-clamp-1 mt-0.5">{subtext}</p>
        )}
      </div>

      {evidence && <div className="mt-2 pt-2 border-t border-dashed border-neutral-200">{evidence}</div>}
    </div>
  );
};
