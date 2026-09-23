import React from 'react';

interface PanelProps {
  id?: string;
  title?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export const Panel: React.FC<PanelProps> = ({
  id,
  title,
  badge,
  actions,
  children,
  className = '',
  headerClassName = '',
}) => {
  return (
    <div
      id={id}
      className={`bg-[#F9F8F6] border-2 border-[#141414] shadow-[3px_3px_0px_#141414] ${className}`}
    >
      {(title || badge || actions) && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b-2 border-[#141414] bg-[#EBEAE7] ${headerClassName}`}
        >
          <div className="flex items-center space-x-2">
            {badge && <span>{badge}</span>}
            {title && (
              <h3 className="font-mono text-xs uppercase tracking-wider font-bold text-[#141414]">
                {title}
              </h3>
            )}
          </div>
          {actions && <div className="flex items-center space-x-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
};
