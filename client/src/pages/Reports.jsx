import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  TrendingUp,
  Receipt,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CreditCard,
  Percent,
  Boxes,
  PieChart as PieIcon,
  ShoppingBag,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import Papa from 'papaparse';
import api from '../utils/api';
import { formatCurrency, formatDate, formatDateTime, getStockStatus } from '../utils/format';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import DateRangePicker from '../components/ui/DateRangePicker';

const COLORS = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];

export default function Reports() {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState('sales');
  const [dateRange, setDateRange] = useState({
    startDate: '2026-10-01',
    endDate: '2026-10-15',
  });
  const [loading, setLoading] = useState(true);

  // Data states for reports
  const [salesSummary, setSalesSummary] = useState(null);
  const [profitAnalysis, setProfitAnalysis] = useState(null);
  const [productPerformance, setProductPerformance] = useState([]);
  const [categoryAnalysis, setCategoryAnalysis] = useState([]);
  const [stockReport, setStockReport] = useState([]);
  const [taxLedger, setTaxLedger] = useState(null);
  const [lowStockExpiry, setLowStockExpiry] = useState([]);
  const [paymentAnalysis, setPaymentAnalysis] = useState([]);

  const fetchCurrentTabReport = useCallback(async () => {
    setLoading(true);
    const params = { startDate: dateRange.startDate, endDate: dateRange.endDate };

    try {
      if (activeTab === 'sales') {
        const res = await api.get('/reports/sales-summary', params).catch(() => null);
        setSalesSummary(res?.data || res || {});
      } else if (activeTab === 'profit') {
        const res = await api.get('/reports/profit-analysis', params).catch(() => null);
        setProfitAnalysis(res?.data || res || {});
      } else if (activeTab === 'products') {
        const res = await api.get('/reports/product-performance', params).catch(() => []);
        setProductPerformance(res?.data || (Array.isArray(res) ? res : []));
      } else if (activeTab === 'categories') {
        const res = await api.get('/reports/category-analysis', params).catch(() => []);
        setCategoryAnalysis(res?.data || (Array.isArray(res) ? res : []));
      } else if (activeTab === 'stock') {
        const res = await api.get('/reports/stock-report').catch(() => []);
        setStockReport(res?.data || (Array.isArray(res) ? res : []));
      } else if (activeTab === 'tax') {
        const res = await api.get('/reports/tax-ledger', params).catch(() => null);
        setTaxLedger(res?.data || res || {});
      } else if (activeTab === 'lowStock') {
        const res = await api.get('/reports/low-stock-expiry').catch(() => []);
        setLowStockExpiry(res?.data || (Array.isArray(res) ? res : []));
      } else if (activeTab === 'payments') {
        const res = await api.get('/reports/payment-analysis', params).catch(() => []);
        setPaymentAnalysis(res?.data || (Array.isArray(res) ? res : []));
      }
    } catch (err) {
      toastError(err.message || 'Failed to generate report section');
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateRange, toastError]);

  useEffect(() => {
    fetchCurrentTabReport();
  }, [fetchCurrentTabReport]);

  // Export active section to CSV
  const handleExportSectionCSV = () => {
    let rows = [];
    let filename = `smartshop_${activeTab}_report_${dateRange.startDate}_${dateRange.endDate}.csv`;

    if (activeTab === 'sales') {
      const daily = salesSummary?.daily_trend || salesSummary?.timeline || [];
      rows = daily.map((d) => ({
        Date: d.date || d.day,
        'Revenue (₹)': d.revenue || d.total || 0,
        Orders: d.orders || 1,
      }));
    } else if (activeTab === 'profit') {
      const items = profitAnalysis?.items || [];
      rows = items.map((it) => ({
        Product: it.name || it.product_name,
        'Units Sold': it.units_sold || it.quantity,
        'Revenue (₹)': it.revenue,
        'COGS (₹)': it.cost,
        'Gross Profit (₹)': it.gross_profit,
        'Margin (%)': `${it.margin_percentage || 0}%`,
      }));
    } else if (activeTab === 'products') {
      rows = productPerformance.map((p) => ({
        Product: p.name || p.product_name,
        SKU: p.sku || '',
        'Units Sold': p.units_sold || p.total_qty || 0,
        'Revenue (₹)': p.revenue || p.total_revenue || 0,
      }));
    } else if (activeTab === 'categories') {
      rows = categoryAnalysis.map((c) => ({
        Category: c.category || c.name,
        'Units Sold': c.units || c.units_sold || 0,
        'Revenue (₹)': c.revenue || c.total || 0,
      }));
    } else if (activeTab === 'stock') {
      rows = stockReport.map((s) => ({
        SKU: s.sku,
        Name: s.name,
        Category: s.category,
        Stock: s.stock_quantity ?? s.stock,
        'Stock Value (₹)': (s.stock_quantity ?? s.stock ?? 0) * (s.purchase_cost ?? 0),
      }));
    } else if (activeTab === 'tax') {
      const entries = taxLedger?.invoices || taxLedger?.entries || [];
      rows = entries.map((e) => ({
        'Invoice #': e.invoice_number,
        Date: e.date,
        'Taxable (₹)': e.taxable_amount,
        'CGST (₹)': e.cgst,
        'SGST (₹)': e.sgst,
        'Total GST (₹)': e.total_tax,
      }));
    } else if (activeTab === 'lowStock') {
      rows = lowStockExpiry.map((l) => ({
        Name: l.name,
        SKU: l.sku,
        CurrentStock: l.stock_quantity ?? l.stock,
        MinLevel: l.min_stock_level,
        ExpiryDate: l.expiry_date,
      }));
    } else if (activeTab === 'payments') {
      rows = paymentAnalysis.map((p) => ({
        Method: (p.method || p.payment_method || '').toUpperCase(),
        Orders: p.orders_count || p.count,
        'Total (₹)': p.total_amount || p.revenue,
      }));
    }

    if (rows.length === 0) {
      toastError('No records to export in this tab.');
      return;
    }

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    success('Report section exported to CSV');
  };

  const tabs = [
    { id: 'sales', label: t('reports.salesSummary'), icon: TrendingUp },
    { id: 'profit', label: t('reports.profitAnalysis'), icon: Percent },
    { id: 'products', label: t('reports.productPerformance'), icon: ShoppingBag },
    { id: 'categories', label: t('reports.categoryAnalysis'), icon: PieIcon },
    { id: 'stock', label: t('reports.stockReport'), icon: Boxes },
    { id: 'tax', label: t('reports.taxLedger'), icon: Receipt },
    { id: 'lowStock', label: t('reports.lowStockExpiry'), icon: AlertTriangle },
    { id: 'payments', label: t('reports.paymentAnalysis'), icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-100 tracking-tight">
            {t('reports.title')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {t('reports.subtitle')}
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
            onClick={handleExportSectionCSV}
          >
            {t('common.export')}
          </Button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-navy-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
              activeTab === tab.id
                ? 'bg-navy-800/80 text-violet-400 border-violet-500'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:bg-navy-800/40'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB CONTENTS */}
      {loading ? (
        <div className="py-24 flex items-center justify-center">
          <LoadingSpinner size="lg" text="Generating analytics..." />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. SALES SUMMARY */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  title="Period Sales Revenue"
                  value={salesSummary?.total_revenue || 0}
                  isCurrency
                  icon={TrendingUp}
                  color="violet"
                />
                <StatCard
                  title="Total Completed Orders"
                  value={salesSummary?.total_orders || 0}
                  icon={Receipt}
                  color="emerald"
                />
                <StatCard
                  title="Average Bill Value (AOV)"
                  value={salesSummary?.average_order_value || 0}
                  isCurrency
                  icon={ShoppingBag}
                  color="cyan"
                />
              </div>

              <Card title="Sales Revenue Trend by Day">
                {(!salesSummary?.daily_trend || salesSummary.daily_trend.length === 0) ? (
                  <EmptyState title="No sales in selected period" description="Revenue is ₹0.00" />
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={salesSummary.daily_trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                        <XAxis dataKey="date" stroke="#6B7280" fontSize={11} />
                        <YAxis stroke="#6B7280" fontSize={11} tickFormatter={(v) => `₹${v}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
                          formatter={(v) => [formatCurrency(v), 'Revenue']}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* 2. PROFIT ANALYSIS */}
          {activeTab === 'profit' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  title="Gross Profit"
                  value={profitAnalysis?.gross_profit || 0}
                  isCurrency
                  icon={TrendingUp}
                  color="emerald"
                />
                <StatCard
                  title="Gross Margin"
                  value={`${Number(profitAnalysis?.margin_percentage || 0).toFixed(1)}%`}
                  icon={Percent}
                  color="violet"
                />
                <StatCard
                  title="Cost of Goods Sold (COGS)"
                  value={profitAnalysis?.cogs || 0}
                  isCurrency
                  icon={Boxes}
                  color="amber"
                />
              </div>

              <Card title="Itemized Profitability">
                {(!profitAnalysis?.items || profitAnalysis.items.length === 0) ? (
                  <EmptyState title="No profit data available" description="Gross profit is ₹0.00" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-navy-700 text-gray-400 font-semibold uppercase">
                          <th className="py-2.5 px-3">Product Name</th>
                          <th className="py-2.5 px-3 text-center">Units</th>
                          <th className="py-2.5 px-3 text-right">Revenue</th>
                          <th className="py-2.5 px-3 text-right">COGS</th>
                          <th className="py-2.5 px-3 text-right">Gross Profit</th>
                          <th className="py-2.5 px-3 text-right">Margin %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-navy-800">
                        {profitAnalysis.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-navy-800/30">
                            <td className="py-2.5 px-3 font-semibold text-gray-200">{it.name}</td>
                            <td className="py-2.5 px-3 text-center text-gray-300">{it.units_sold}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-gray-200">{formatCurrency(it.revenue)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-gray-400">{formatCurrency(it.cost)}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(it.gross_profit)}</td>
                            <td className="py-2.5 px-3 text-right text-cyan-400 font-bold">{it.margin_percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* 3. PRODUCT PERFORMANCE */}
          {activeTab === 'products' && (
            <Card title="Product Sales Ranking">
              {productPerformance.length === 0 ? (
                <EmptyState title="No product sales records" description="No sales volume recorded in this period." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-navy-700 text-gray-400 font-semibold uppercase">
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-3 text-center">Units Sold</th>
                        <th className="py-2.5 px-3 text-right">Total Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800">
                      {productPerformance.map((p, idx) => (
                        <tr key={idx} className="hover:bg-navy-800/30">
                          <td className="py-2.5 px-3 font-mono text-violet-400">{p.sku || '—'}</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-100">{p.name}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-white">{p.units_sold || p.total_qty || 0}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(p.revenue || p.total_revenue || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* 4. CATEGORY ANALYSIS */}
          {activeTab === 'categories' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title="Sales by Category (Distribution)">
                {categoryAnalysis.length === 0 ? (
                  <EmptyState title="No category sales" description="Zero revenue across all categories." />
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryAnalysis}
                          dataKey="revenue"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={(entry) => entry.category}
                        >
                          {categoryAnalysis.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card title="Category Revenue Breakdown">
                <div className="space-y-3">
                  {categoryAnalysis.map((c, i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-navy-900 border border-navy-800 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-semibold text-gray-200">{c.category || 'General'}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-400 font-mono block">{formatCurrency(c.revenue)}</span>
                        <span className="text-[10px] text-gray-400">{c.units || 0} units</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* 5. STOCK REPORT */}
          {activeTab === 'stock' && (
            <Card title="Current Inventory Valuation">
              {stockReport.length === 0 ? (
                <EmptyState title="No stock items found" description="Inventory catalog is empty." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-navy-700 text-gray-400 font-semibold uppercase">
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-center">On Hand</th>
                        <th className="py-2.5 px-3 text-right">Cost Value</th>
                        <th className="py-2.5 px-3 text-right">Retail Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800">
                      {stockReport.map((s, idx) => {
                        const qty = Number(s.stock_quantity ?? s.stock ?? 0);
                        const cost = Number(s.purchase_cost ?? 0);
                        const price = Number(s.selling_price ?? 0);
                        return (
                          <tr key={idx} className="hover:bg-navy-800/30">
                            <td className="py-2.5 px-3 font-mono text-gray-400">{s.sku || '—'}</td>
                            <td className="py-2.5 px-3 font-semibold text-gray-200">{s.name}</td>
                            <td className="py-2.5 px-3 text-gray-400">{s.category || 'General'}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-white">{qty} {s.unit || 'PCS'}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-gray-300">{formatCurrency(qty * cost)}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(qty * price)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* 6. TAX LEDGER */}
          {activeTab === 'tax' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <StatCard
                  title="Total GST Collected"
                  value={taxLedger?.total_tax || 0}
                  isCurrency
                  icon={Receipt}
                  color="cyan"
                />
                <StatCard
                  title="CGST (Central)"
                  value={taxLedger?.cgst || (Number(taxLedger?.total_tax || 0) / 2)}
                  isCurrency
                  icon={Receipt}
                  color="violet"
                />
                <StatCard
                  title="SGST (State)"
                  value={taxLedger?.sgst || (Number(taxLedger?.total_tax || 0) / 2)}
                  isCurrency
                  icon={Receipt}
                  color="emerald"
                />
                <StatCard
                  title="Taxable Turnover"
                  value={taxLedger?.total_taxable || 0}
                  isCurrency
                  icon={TrendingUp}
                  color="amber"
                />
              </div>

              <Card title="GST Compliance Invoices">
                <p className="text-xs text-gray-400 mb-4">
                  Indian GST Audit Trail · Split between CGST and SGST for intrastate retail supply.
                </p>
                {(!taxLedger?.invoices || taxLedger.invoices.length === 0) ? (
                  <EmptyState title="No tax records found" description="GST collected is ₹0.00" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-navy-700 text-gray-400 font-semibold uppercase">
                          <th className="py-2.5 px-3">Invoice #</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3 text-right">Taxable</th>
                          <th className="py-2.5 px-3 text-right">CGST</th>
                          <th className="py-2.5 px-3 text-right">SGST</th>
                          <th className="py-2.5 px-3 text-right">Total GST</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-navy-800">
                        {taxLedger.invoices.map((inv, idx) => (
                          <tr key={idx} className="hover:bg-navy-800/30">
                            <td className="py-2.5 px-3 font-mono font-bold text-violet-400">{inv.invoice_number}</td>
                            <td className="py-2.5 px-3 text-gray-300">{formatDate(inv.date)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-gray-300">{formatCurrency(inv.taxable_amount)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-cyan-400">{formatCurrency(inv.cgst)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-cyan-400">{formatCurrency(inv.sgst)}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(inv.total_tax)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* 7. LOW STOCK & EXPIRY */}
          {activeTab === 'lowStock' && (
            <Card title="Inventory Reorder &amp; Expiry Alerts">
              {lowStockExpiry.length === 0 ? (
                <EmptyState title="All products stocked & fresh" description="No low stock alerts or expiring batches." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-navy-700 text-gray-400 font-semibold uppercase">
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3 text-center">Current Stock</th>
                        <th className="py-2.5 px-3 text-center">Min Level</th>
                        <th className="py-2.5 px-3">Expiry Date</th>
                        <th className="py-2.5 px-3 text-center">Alert Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800">
                      {lowStockExpiry.map((it, idx) => {
                        const status = getStockStatus(it);
                        return (
                          <tr key={idx} className="hover:bg-navy-800/30">
                            <td className="py-2.5 px-3 font-mono text-gray-400">{it.sku || '—'}</td>
                            <td className="py-2.5 px-3 font-bold text-gray-100">{it.name}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-rose-400">{it.stock_quantity ?? it.stock ?? 0}</td>
                            <td className="py-2.5 px-3 text-center text-gray-400">{it.min_stock_level ?? 5}</td>
                            <td className="py-2.5 px-3 text-gray-300 font-mono">{formatDate(it.expiry_date)}</td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge variant={status === 'expired' || status === 'out_of_stock' ? 'danger' : 'warning'} size="sm" dot>
                                {status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* 8. PAYMENT ANALYSIS */}
          {activeTab === 'payments' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {paymentAnalysis.length === 0 ? (
                <div className="col-span-3">
                  <EmptyState title="No payment data" description="₹0.00 processed in selected period." />
                </div>
              ) : (
                paymentAnalysis.map((p, idx) => (
                  <div key={idx} className="p-5 rounded-2xl glass-card border border-navy-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase text-gray-400">{p.method || p.payment_method}</span>
                      <CreditCard className="w-5 h-5 text-violet-400" />
                    </div>
                    <h4 className="text-2xl font-black text-white font-mono">{formatCurrency(p.total_amount || p.revenue)}</h4>
                    <p className="text-xs text-gray-400 mt-1">{p.orders_count || p.count || 0} transactions</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
