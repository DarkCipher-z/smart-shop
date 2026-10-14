import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Receipt,
  Search,
  Filter,
  Download,
  Eye,
  Ban,
  Calendar,
  IndianRupee,
  ShoppingBag,
  CreditCard,
} from 'lucide-react';
import Papa from 'papaparse';
import api from '../utils/api';
import { formatCurrency, formatDateTime } from '../utils/format';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import StatCard from '../components/ui/StatCard';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import DateRangePicker from '../components/ui/DateRangePicker';

export default function Sales() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateRange, setDateRange] = useState({
    startDate: '2026-10-01',
    endDate: '2026-10-15',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Cancel dialog state
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sales', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      const list = res?.data || res?.sales || (Array.isArray(res) ? res : []);
      setSales(list);
    } catch (err) {
      toastError(err.message || 'Failed to fetch sales transactions');
    } finally {
      setLoading(false);
    }
  }, [dateRange, toastError]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const invoiceNo = (s.invoice_number || `INV-${s.id}`).toLowerCase();
      const customer = (s.customer_name || 'walk-in customer').toLowerCase();

      const matchesSearch = !q || invoiceNo.includes(q) || customer.includes(q);
      const matchesPayment =
        paymentFilter === 'All' ||
        (s.payment_method && s.payment_method.toLowerCase() === paymentFilter.toLowerCase());
      const matchesStatus =
        statusFilter === 'All' ||
        (statusFilter === 'completed' && s.status !== 'cancelled') ||
        (statusFilter === 'cancelled' && s.status === 'cancelled');

      return matchesSearch && matchesPayment && matchesStatus;
    });
  }, [sales, searchQuery, paymentFilter, statusFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let rev = 0;
    let count = 0;
    let cancelledCount = 0;

    filteredSales.forEach((s) => {
      if (s.status === 'cancelled') {
        cancelledCount++;
      } else {
        rev += Number(s.total_amount || 0);
        count++;
      }
    });

    const aov = count > 0 ? rev / count : 0;
    return {
      revenue: rev,
      orders: count,
      avgOrderValue: aov,
      cancelledOrders: cancelledCount,
    };
  }, [filteredSales]);

  // Cancel Sale Handler
  const handleConfirmCancel = async () => {
    if (!saleToCancel) return;
    setCancelling(true);
    try {
      await api.post(`/sales/${saleToCancel.id}/cancel`);
      success('Sale cancelled & credit note issued. Stock restored.');
      setSaleToCancel(null);
      fetchSales();
    } catch (err) {
      toastError(err.message || 'Failed to cancel invoice');
    } finally {
      setCancelling(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (filteredSales.length === 0) {
      toastError('No records to export.');
      return;
    }

    const rows = filteredSales.map((s) => ({
      'Invoice #': s.invoice_number || `INV-${s.id}`,
      'Date & Time': formatDateTime(s.created_at),
      Customer: s.customer_name || 'Walk-in Customer',
      'Payment Method': (s.payment_method || 'CASH').toUpperCase(),
      'Subtotal (₹)': s.subtotal_amount || 0,
      'Discount (₹)': s.discount_amount || 0,
      'GST Tax (₹)': s.tax_amount || 0,
      'Total Amount (₹)': s.total_amount || 0,
      Status: s.status === 'cancelled' ? 'CANCELLED' : 'COMPLETED',
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartshop_sales_ledger_${dateRange.startDate}_${dateRange.endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    success('Sales ledger CSV exported.');
  };

  const columns = [
    {
      header: t('sales.invoiceNumber'),
      accessor: 'invoice_number',
      render: (row) => (
        <span className="font-mono font-bold text-violet-400">
          {row.invoice_number || `INV-${row.id}`}
        </span>
      ),
    },
    {
      header: 'Date & Time',
      accessor: 'created_at',
      render: (row) => (
        <span className="text-xs text-gray-300">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      header: t('sales.customer'),
      accessor: 'customer_name',
      render: (row) => (
        <span className="font-medium text-gray-200">
          {row.customer_name || 'Walk-in Customer'}
        </span>
      ),
    },
    {
      header: 'Payment',
      accessor: 'payment_method',
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {(row.payment_method || 'CASH').toUpperCase()}
        </Badge>
      ),
    },
    {
      header: 'Tax (GST)',
      accessor: 'tax_amount',
      render: (row) => (
        <span className="font-mono text-xs text-cyan-400">
          {formatCurrency(row.tax_amount)}
        </span>
      ),
    },
    {
      header: 'Total Amount',
      accessor: 'total_amount',
      render: (row) => (
        <span className="font-bold text-gray-100 font-mono">
          {formatCurrency(row.total_amount)}
        </span>
      ),
    },
    {
      header: t('sales.status'),
      accessor: 'status',
      render: (row) => (
        <Badge
          variant={row.status === 'cancelled' ? 'danger' : 'success'}
          size="sm"
          dot
        >
          {row.status === 'cancelled' ? t('sales.cancelled') : t('sales.completed')}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => navigate(`/sales/${row.id}`)}
            title="View Invoice Detail"
            className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
          {row.status !== 'cancelled' && (
            <button
              onClick={() => setSaleToCancel(row)}
              title="Cancel Invoice & Issue Credit Note"
              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-100 tracking-tight">
            {t('sales.title')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {t('sales.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={setDateRange}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={handleExportCSV}
          >
            {t('common.export')}
          </Button>
        </div>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Period Sales Revenue"
          value={metrics.revenue}
          isCurrency
          icon={IndianRupee}
          color="violet"
        />
        <StatCard
          title="Completed Invoices"
          value={metrics.orders}
          icon={Receipt}
          color="emerald"
        />
        <StatCard
          title="Average Order Value"
          value={metrics.avgOrderValue}
          isCurrency
          icon={ShoppingBag}
          color="cyan"
        />
        <StatCard
          title="Cancelled Bills"
          value={metrics.cancelledOrders}
          icon={Ban}
          color={metrics.cancelledOrders > 0 ? 'rose' : 'neutral'}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl glass-card flex flex-col md:flex-row items-center gap-3">
        <div className="flex-1 w-full relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by invoice number or customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-navy-900/60 border border-navy-700/80 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 text-gray-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="text-xs py-2 w-full md:w-36"
          >
            <option value="All">All Payments</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI / QR</option>
            <option value="card">Card</option>
          </Select>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-2 w-full md:w-36"
          >
            <option value="All">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </div>

      {/* Sales Transactions Table */}
      <Table
        columns={columns}
        data={filteredSales}
        isLoading={loading}
        onRowClick={(row) => navigate(`/sales/${row.id}`)}
        emptyTitle="No sales transactions found"
        emptyDescription="No invoices matching the selected dates or search parameters."
        pageSize={12}
      />

      {/* CANCEL CONFIRM DIALOG */}
      <ConfirmDialog
        isOpen={!!saleToCancel}
        onClose={() => setSaleToCancel(null)}
        onConfirm={handleConfirmCancel}
        title={t('sales.cancelSale')}
        message={t('sales.confirmCancelSale')}
        confirmText="Issue Credit Note"
        isLoading={cancelling}
      />
    </div>
  );
}
