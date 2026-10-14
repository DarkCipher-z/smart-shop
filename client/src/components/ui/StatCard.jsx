import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

export default function StatCard({
  title,
  value,
  isCurrency = false,
  icon: Icon,
  trend,
  trendDirection = 'up',
  subtitle,
  color = 'violet',
  className = '',
}) {
  const displayValue = isCurrency ? formatCurrency(value) : (value ?? '0');

  const colorVariants = {
    violet: {
      iconBg: 'bg-violet-600/15 text-violet-400 border-violet-500/20',
      glow: 'hover:border-violet-500/40',
    },
    cyan: {
      iconBg: 'bg-cyan-600/15 text-cyan-400 border-cyan-500/20',
      glow: 'hover:border-cyan-500/40',
    },
    emerald: {
      iconBg: 'bg-emerald-600/15 text-emerald-400 border-emerald-500/20',
      glow: 'hover:border-emerald-500/40',
    },
    amber: {
      iconBg: 'bg-amber-600/15 text-amber-400 border-amber-500/20',
      glow: 'hover:border-amber-500/40',
    },
    rose: {
      iconBg: 'bg-rose-600/15 text-rose-400 border-rose-500/20',
      glow: 'hover:border-rose-500/40',
    },
  };

  const scheme = colorVariants[color] || colorVariants.violet;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl glass-card p-5 transition-all ${scheme.glow} ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-400 light:text-gray-500 uppercase tracking-wider">
            {title}
          </p>
          <h4 className="text-2xl font-extrabold text-gray-100 dark:text-gray-100 light:text-gray-900 mt-1.5 tracking-tight">
            {displayValue}
          </h4>
          {(trend || subtitle) && (
            <div className="flex items-center gap-1.5 mt-2.5">
              {trend && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    trendDirection === 'up'
                      ? 'text-emerald-400'
                      : trendDirection === 'down'
                      ? 'text-rose-400'
                      : 'text-gray-400'
                  }`}
                >
                  {trendDirection === 'up' ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : trendDirection === 'down' ? (
                    <TrendingDown className="w-3.5 h-3.5" />
                  ) : null}
                  {trend}
                </span>
              )}
              {subtitle && (
                <span className="text-[11px] text-gray-500 dark:text-gray-500 light:text-gray-400">
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div
            className={`p-3 rounded-2xl border shrink-0 ${scheme.iconBg}`}
          >
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
}
