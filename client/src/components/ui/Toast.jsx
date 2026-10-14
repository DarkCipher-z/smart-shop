import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'info', onClose }) {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-cyan-400 shrink-0" />,
  };

  const bgStyles = {
    success: 'bg-navy-800 border-emerald-500/40 text-emerald-100 shadow-emerald-500/10',
    error: 'bg-navy-800 border-rose-500/40 text-rose-100 shadow-rose-500/10',
    warning: 'bg-navy-800 border-amber-500/40 text-amber-100 shadow-amber-500/10',
    info: 'bg-navy-800 border-cyan-500/40 text-cyan-100 shadow-cyan-500/10',
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md animate-slide-in ${
        bgStyles[type] || bgStyles.info
      }`}
    >
      {icons[type] || icons.info}
      <div className="flex-1 text-sm font-medium leading-snug">{message}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors shrink-0 p-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
