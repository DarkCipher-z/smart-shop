import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X } from 'lucide-react';
import Papa from 'papaparse';
import Button from './Button';

export default function FileUpload({
  onDataParsed,
  accept = '.csv',
  maxSizeMB = 5,
  title = 'Upload CSV File',
  description = 'Drag & drop your CSV file here or browse from your computer',
}) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [parsedPreview, setParsedPreview] = useState(null);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFile = (selectedFile) => {
    setError(null);
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv') && selectedFile.type !== 'text/csv') {
      setError('Only .csv files are supported.');
      return;
    }

    if (selectedFile.size > maxSizeMB * 1024 * 1024) {
      setError(`File size exceeds limit of ${maxSizeMB}MB.`);
      return;
    }

    setFile(selectedFile);

    // Parse CSV with PapaParse
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setError(`Error parsing CSV: ${results.errors[0].message}`);
          return;
        }
        setParsedPreview(results.data);
        onDataParsed?.(results.data, selectedFile);
      },
      error: (err) => {
        setError(`Failed to read file: ${err.message}`);
      },
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setFile(null);
    setParsedPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onDataParsed?.([], null);
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {!file ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
            dragActive
              ? 'border-violet-500 bg-violet-500/10'
              : 'border-navy-700 dark:border-navy-700 light:border-gray-300 bg-navy-900/40 dark:bg-navy-900/40 light:bg-gray-50 hover:border-violet-500/50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
          />
          <div className="p-3.5 rounded-2xl bg-violet-600/10 text-violet-400 mb-3 border border-violet-500/20">
            <UploadCloud className="w-7 h-7" />
          </div>
          <p className="text-sm font-semibold text-gray-200 dark:text-gray-200 light:text-gray-800">
            {title}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-400 light:text-gray-500 mt-1 max-w-xs text-center">
            {description}
          </p>
          <span className="mt-3 text-[11px] font-semibold text-violet-400 underline">
            Browse file
          </span>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-navy-700 bg-navy-800/80 dark:bg-navy-800/80 light:bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2.5 rounded-xl bg-violet-600/15 text-violet-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-200 truncate">
                {file.name}
              </p>
              <p className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {parsedPreview ? `${parsedPreview.length} rows loaded` : 'File ready'} (
                {(file.size / 1024).toFixed(1)} KB)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-navy-700/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
