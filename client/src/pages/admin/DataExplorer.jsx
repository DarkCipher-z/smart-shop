import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  Search,
  Filter,
  RefreshCw,
  Table as TableIcon,
  Store,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api from '../../utils/api';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';

const TABLES = [
  { id: 'users', label: 'Users' },
  { id: 'shops', label: 'Shops' },
  { id: 'products', label: 'Products' },
  { id: 'sales', label: 'Sales' },
  { id: 'sale_items', label: 'Sale Items' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'customers', label: 'Customers' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'stock_movements', label: 'Stock Movements' },
  { id: 'audit_logs', label: 'Audit Logs' },
];

export default function DataExplorer() {
  const { t } = useTranslation();
  const { error: toastError } = useToast();

  const [selectedTable, setSelectedTable] = useState('products');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      const res = await api.get(`/admin/data-explorer?table=${selectedTable}`).catch(async () => {
        // Fallback directly to the resource endpoint if /admin/data-explorer is not implemented yet
        return await api.get(`/${selectedTable}`).catch(() => []);
      });

      const list = res?.data || res?.records || (Array.isArray(res) ? res : []);
      setData(list);
    } catch (err) {
      toastError(err.message || 'Failed to fetch table records');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTable, toastError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Extract column keys dynamically from first row
  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    const firstRow = data[0];
    return Object.keys(firstRow).filter((k) => typeof firstRow[k] !== 'object');
  }, [data]);

  // Filtered rows
  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return data;
    return data.filter((row) =>
      Object.values(row).some((val) =>
        val !== null && val !== undefined && String(val).toLowerCase().includes(q)
      )
    );
  }, [data, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-600/15 text-cyan-400 border border-cyan-500/20">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {t('admin.dataExplorer')}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Read-only system inspector across all database entities
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="text-xs py-2 w-48 font-semibold"
          >
            {TABLES.map((tb) => (
              <option key={tb.id} value={tb.id}>
                {tb.label} Table
              </option>
            ))}
          </Select>

          <button
            onClick={fetchData}
            title="Refresh Table Data"
            className="p-2.5 rounded-xl border border-navy-700 bg-navy-800 text-gray-300 hover:text-white hover:bg-navy-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Meta Bar */}
      <div className="p-4 rounded-2xl glass-card flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search across all columns..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-navy-900/60 border border-navy-700/80 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 text-gray-100"
          />
        </div>

        <div className="text-xs text-gray-400 font-medium">
          Showing {filteredData.length} total records in{' '}
          <span className="font-mono text-cyan-400 font-bold uppercase">{selectedTable}</span>
        </div>
      </div>

      {/* Grid Container */}
      <div className="rounded-2xl border border-navy-700/80 bg-navy-800/60 overflow-hidden shadow-lg">
        {loading ? (
          <div className="py-24">
            <LoadingSpinner size="lg" text={`Loading ${selectedTable} table records...`} />
          </div>
        ) : filteredData.length === 0 ? (
          <EmptyState
            title={`No records found in ${selectedTable}`}
            description="The selected table currently has 0 rows or no records matched your filter."
          />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-navy-950 border-b border-navy-700 text-gray-400 font-mono font-bold uppercase">
                  {/* Shop Column indicator if applicable */}
                  <th className="py-3 px-3">Shop</th>
                  {columns.map((col) => (
                    <th key={col} className="py-3 px-3 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700/50 font-mono">
                {paginatedRows.map((row, idx) => {
                  const shopId = row.shop_id || row.shopId || (row.role === 'admin' ? 'Global' : 1);
                  return (
                    <tr key={row.id || idx} className="hover:bg-navy-700/40 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge variant="cyan" size="sm">
                          Shop #{shopId}
                        </Badge>
                      </td>
                      {columns.map((col) => {
                        const val = row[col];
                        return (
                          <td
                            key={col}
                            className="py-2.5 px-3 whitespace-nowrap text-gray-300 max-w-xs truncate"
                            title={String(val ?? '')}
                          >
                            {val === null || val === undefined ? (
                              <span className="text-gray-600 font-sans italic">null</span>
                            ) : typeof val === 'boolean' ? (
                              val ? 'true' : 'false'
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && filteredData.length > pageSize && (
          <div className="flex items-center justify-between p-3 border-t border-navy-700/80 bg-navy-950/40 text-xs text-gray-400">
            <div>
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-navy-700 hover:bg-navy-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-navy-700 hover:bg-navy-700 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
