import React, { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function DateRangePicker({
  startDate = '2026-10-01',
  endDate = '2026-10-15',
  onChange,
  className = '',
}) {
  const [currentStart, setCurrentStart] = useState(startDate);
  const [currentEnd, setCurrentEnd] = useState(endDate);
  const [activePreset, setActivePreset] = useState('oct2026');

  const applyPreset = (preset) => {
    setActivePreset(preset);
    let start = '';
    let end = '';

    const today = new Date();
    const format = (d) => d.toISOString().split('T')[0];

    switch (preset) {
      case 'today':
        start = format(today);
        end = format(today);
        break;
      case 'last7': {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        start = format(d);
        end = format(today);
        break;
      }
      case 'thisMonth': {
        const d = new Date(today.getFullYear(), today.getMonth(), 1);
        start = format(d);
        end = format(today);
        break;
      }
      case 'oct2026':
      default:
        start = '2026-10-01';
        end = '2026-10-15';
        break;
    }

    setCurrentStart(start);
    setCurrentEnd(end);
    onChange?.({ startDate: start, endDate: end });
  };

  const handleStartChange = (e) => {
    const val = e.target.value;
    setCurrentStart(val);
    setActivePreset('custom');
    onChange?.({ startDate: val, endDate: currentEnd });
  };

  const handleEndChange = (e) => {
    const val = e.target.value;
    setCurrentEnd(val);
    setActivePreset('custom');
    onChange?.({ startDate: currentStart, endDate: val });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 bg-navy-800/80 dark:bg-navy-800/80 light:bg-white p-2 rounded-2xl border border-navy-700/80 dark:border-navy-700/80 light:border-gray-200 shadow-sm ${className}`}>
      {/* Preset pills */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => applyPreset('oct2026')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
            activePreset === 'oct2026'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50'
          }`}
        >
          Oct 1–15, 2026
        </button>
        <button
          type="button"
          onClick={() => applyPreset('today')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
            activePreset === 'today'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50'
          }`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => applyPreset('last7')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
            activePreset === 'last7'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50'
          }`}
        >
          Last 7 Days
        </button>
        <button
          type="button"
          onClick={() => applyPreset('thisMonth')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
            activePreset === 'thisMonth'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50'
          }`}
        >
          This Month
        </button>
      </div>

      <div className="h-4 w-px bg-navy-700 dark:bg-navy-700 light:bg-gray-200 mx-1 hidden sm:block" />

      {/* Date Inputs */}
      <div className="flex items-center gap-2 text-xs">
        <div className="relative flex items-center">
          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            type="date"
            value={currentStart}
            onChange={handleStartChange}
            className="pl-8 pr-2 py-1 rounded-lg bg-navy-900/60 dark:bg-navy-900/60 light:bg-gray-50 border border-navy-700/60 dark:border-navy-700/60 light:border-gray-200 text-gray-200 dark:text-gray-200 light:text-gray-900 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <span className="text-gray-500 text-xs">to</span>
        <div className="relative flex items-center">
          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 pointer-events-none" />
          <input
            type="date"
            value={currentEnd}
            onChange={handleEndChange}
            className="pl-8 pr-2 py-1 rounded-lg bg-navy-900/60 dark:bg-navy-900/60 light:bg-gray-50 border border-navy-700/60 dark:border-navy-700/60 light:border-gray-200 text-gray-200 dark:text-gray-200 light:text-gray-900 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>
    </div>
  );
}
