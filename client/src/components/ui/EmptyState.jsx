import React from 'react';
import { PackageOpen } from 'lucide-react';

export default function EmptyState({
  icon: Icon = PackageOpen,
  title = 'No records found',
  description = 'There are no items to display at this time.',
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-navy-800/80 dark:bg-navy-800/80 light:bg-gray-100 flex items-center justify-center text-gray-500 border border-navy-700/80 dark:border-navy-700/80 light:border-gray-200 mb-4 shadow-inner">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-200 dark:text-gray-200 light:text-gray-800 mb-1.5">
        {title}
      </h3>
      <p className="text-xs text-gray-400 dark:text-gray-400 light:text-gray-500 max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
