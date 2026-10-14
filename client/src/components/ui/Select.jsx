import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(function Select(
  {
    label,
    error,
    helperText,
    options = [],
    placeholder,
    className = '',
    containerClassName = '',
    id,
    children,
    ...props
  },
  ref
) {
  const selectId = id || props.name || Math.random().toString(36).substring(2, 9);

  return (
    <div className={`w-full ${containerClassName}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-gray-300 dark:text-gray-300 light:text-gray-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative rounded-xl">
        <select
          ref={ref}
          id={selectId}
          className={`w-full rounded-xl bg-navy-800/90 dark:bg-navy-800/90 light:bg-white text-gray-100 dark:text-gray-100 light:text-gray-900 border appearance-none transition-all text-sm focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed pl-3.5 pr-10 py-2.5 ${
            error
              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-navy-700 dark:border-navy-700 light:border-gray-300 hover:border-navy-600 focus:border-violet-500 focus:ring-violet-500/20'
          } ${className}`}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.length > 0
            ? options.map((opt) => (
                <option
                  key={opt.value ?? opt.id ?? opt}
                  value={opt.value ?? opt.id ?? opt}
                  className="bg-navy-900 text-gray-100"
                >
                  {opt.label ?? opt.name ?? opt}
                </option>
              ))
            : children}
        </select>
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-400 font-medium">{error}</p>}
      {!error && helperText && <p className="mt-1 text-xs text-gray-400">{helperText}</p>}
    </div>
  );
});

export default Select;
