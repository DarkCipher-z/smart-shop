import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-xl',
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
        <div
          className={`relative transform overflow-hidden rounded-2xl bg-navy-800 dark:bg-navy-800 light:bg-white text-left align-middle shadow-2xl transition-all w-full border border-navy-700 dark:border-navy-700 light:border-gray-200 ${maxWidth}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-navy-700/80 dark:border-navy-700/80 light:border-gray-100 px-6 py-4">
            <div>
              <h3 className="text-lg font-bold text-gray-100 dark:text-gray-100 light:text-gray-900">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-100 hover:bg-navy-700/60 dark:hover:bg-navy-700/60 light:hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 max-h-[calc(85vh-140px)] overflow-y-auto">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-3 border-t border-navy-700/80 dark:border-navy-700/80 light:border-gray-100 px-6 py-4 bg-navy-900/40 dark:bg-navy-900/40 light:bg-gray-50/80">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
