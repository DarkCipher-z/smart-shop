import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

export default function Table({
  columns,
  data = [],
  isLoading = false,
  emptyTitle = 'No data records found',
  emptyDescription = 'There are no items to display matching the current criteria.',
  emptyAction,
  pageSize = 10,
  onRowClick,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (columnKey) => {
    let direction = 'asc';
    if (sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }

      return sortConfig.direction === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [data, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  return (
    <div className="w-full flex flex-col rounded-2xl border border-navy-700/80 dark:border-navy-700/80 light:border-gray-200 bg-navy-800/60 dark:bg-navy-800/60 light:bg-white overflow-hidden shadow-sm">
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-navy-700 dark:border-navy-700 light:border-gray-200 bg-navy-900/50 dark:bg-navy-900/50 light:bg-gray-50/80 text-xs font-semibold text-gray-400 dark:text-gray-400 light:text-gray-500 uppercase tracking-wider">
              {columns.map((col, index) => {
                const isSortable = col.sortable !== false && col.accessor;
                return (
                  <th
                    key={col.accessor || index}
                    className={`py-3.5 px-4 select-none ${col.headerClassName || ''} ${
                      isSortable ? 'cursor-pointer hover:text-white transition-colors' : ''
                    }`}
                    onClick={() => isSortable && handleSort(col.accessor)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.header}</span>
                      {isSortable && (
                        <span className="text-gray-500">
                          {sortConfig.key === col.accessor ? (
                            sortConfig.direction === 'asc' ? (
                              <ChevronUp className="w-3.5 h-3.5 text-violet-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-violet-400" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/60 dark:divide-navy-700/60 light:divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <LoadingSpinner size="lg" text="Loading table data..." />
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={row.id || rowIndex}
                  onClick={() => onRowClick?.(row)}
                  className={`transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-violet-900/10 dark:hover:bg-violet-900/10 light:hover:bg-violet-50/50' : 'hover:bg-navy-700/30 dark:hover:bg-navy-700/30 light:hover:bg-gray-50'
                  }`}
                >
                  {columns.map((col, colIndex) => (
                    <td
                      key={col.accessor || colIndex}
                      className={`py-3.5 px-4 text-gray-200 dark:text-gray-200 light:text-gray-800 ${
                        col.cellClassName || ''
                      }`}
                    >
                      {col.render
                        ? col.render(row, rowIndex)
                        : row[col.accessor] !== undefined && row[col.accessor] !== null
                        ? String(row[col.accessor])
                        : '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!isLoading && data.length > pageSize && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-navy-700/60 dark:border-navy-700/60 light:border-gray-200 bg-navy-900/30 dark:bg-navy-900/30 light:bg-gray-50/50 text-xs text-gray-400">
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, data.length)} of {data.length} records
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-navy-700 dark:border-navy-700 light:border-gray-200 hover:bg-navy-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-gray-200">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-navy-700 dark:border-navy-700 light:border-gray-200 hover:bg-navy-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
