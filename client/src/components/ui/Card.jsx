import React from 'react';

export default function Card({
  title,
  subtitle,
  action,
  icon: Icon,
  children,
  className = '',
  bodyClassName = 'p-6',
  headerClassName = 'px-6 py-4 border-b border-navy-700/80 dark:border-navy-700/80 light:border-gray-100',
  ...props
}) {
  return (
    <div
      className={`rounded-2xl glass-card overflow-hidden ${className}`}
      {...props}
    >
      {(title || subtitle || action || Icon) && (
        <div className={`flex items-center justify-between gap-4 ${headerClassName}`}>
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="p-2 rounded-xl bg-violet-600/10 text-violet-400 border border-violet-500/20">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-base font-bold text-gray-100 dark:text-gray-100 light:text-gray-900 leading-tight">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-gray-400 dark:text-gray-400 light:text-gray-500 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
