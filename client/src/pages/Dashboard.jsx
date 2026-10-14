import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IndianRupee,
  Receipt,
  AlertTriangle,
  ShoppingCart,
  PlusCircle,
  FileBarChart,
  Calendar,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '../utils/api';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import DateRangePicker from '../components/ui/DateRangePicker';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dateRange, setDateRange] = useState({
    startDate: '2026-10-01',
    endDate: '2026-10-15',
  });
  const [loading, setLoading] = useState(true);

  // Dashboard state
  const [stats, setStats] = useState({
    todaySales: 0,
    totalRevenue: 0,
    totalOrders: 0,
    lowStockCount: 0,
  });
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [recentSales, setRecentSales] = useState([]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch sales summary report
      const summaryRes = await api.get('/reports/sales-summary', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }).catch(() => null);

      // 2. Fetch recent sales list
      const salesRes = await api.get('/sales', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        limit: 10,
      }).catch(() => null);

      // 3. Fetch top products
      const topProductsRes = await api.get('/reports/product-performance', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        limit: 5,
      }).catch(() => null);

      // 4. Fetch low stock count / products
      const lowStockRes = await api.get('/reports/low-stock-expiry').catch(() => null);

      const summaryData = summaryRes?.data || summaryRes || {};
      const salesList = salesRes?.data || salesRes?.sales || (Array.isArray(salesRes) ? salesRes : []);
      const topProdList = topProductsRes?.data || (Array.isArray(topProductsRes) ? topProductsRes : []);
      const lowStockData = lowStockRes?.data || lowStockRes?.products || (Array.isArray(lowStockRes) ? lowStockRes : []);

      // Calculate today sales from salesList or summary
      const todayStr = '2026-10-14'; // Reference demo today date
      const todayTotal = salesList
        .filter((s) => (s.created_at || '').startsWith(todayStr) && s.status !== 'cancelled')
        .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

      const totalRev = Number(summaryData.total_revenue || summaryData.revenue || 0);
      const totalOrd = Number(summaryData.total_orders || summaryData.orders || salesList.length || 0);

      setStats({
        todaySales: summaryData.today_sales !== undefined ? Number(summaryData.today_sales) : todayTotal,
        totalRevenue: totalRev,
        totalOrders: totalOrd,
        lowStockCount: Array.isArray(lowStockData) ? lowStockData.length : Number(summaryData.low_stock_count || 0),
      });

      // Daily chart data
      const chartPoints = summaryData.daily_trend || summaryData.timeline || [];
      if (Array.isArray(chartPoints) && chartPoints.length > 0) {
        setDailyRevenue(
          chartPoints.map((item) => ({
            date: item.date ? item.date.slice(5) : item.day || '',
            revenue: Number(item.revenue || item.total || 0),
          }))
        );
      } else {
        // Fallback aggregate from sales list by date
        const grouped = {};
        salesList.forEach((s) => {
          if (s.status === 'cancelled') return;
          const day = (s.created_at || '').substring(5, 10) || '10-14';
          grouped[day] = (grouped[day] || 0) + Number(s.total_amount || 0);
        });
        const mapped = Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, revenue]) => ({ date, revenue }));
        setDailyRevenue(mapped);
      }

      // Top products list
      if (Array.isArray(topProdList) && topProdList.length > 0) {
        setTopProducts(
          topProdList.slice(0, 5).map((p) => ({
            name: p.name || p.product_name || 'Item',
            units: Number(p.total_qty || p.units_sold || p.quantity || 0),
            revenue: Number(p.total_revenue || p.revenue || 0),
          }))
        );
      } else {
        setTopProducts([]);
      }

      setRecentSales(salesList.slice(0, 8));
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-100 dark:text-gray-100 light:text-gray-900 tracking-tight">
            {t('dashboard.title')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {t('dashboard.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={setDateRange}
          />
          <Button
            variant="primary"
            size="sm"
            icon={ShoppingCart}
            onClick={() => navigate('/pos')}
          >
            {t('dashboard.newSale')}
          </Button>
        </div>
      </div>

      {/* 4 Primary Metric StatCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('dashboard.todaysSales')}
          value={stats.todaySales}
          isCurrency
          icon={IndianRupee}
          color="cyan"
          trend="+8.5%"
          trendDirection="up"
          subtitle={t('dashboard.vsLastPeriod')}
        />
        <StatCard
          title={t('dashboard.totalRevenue')}
          value={stats.totalRevenue}
          isCurrency
          icon={TrendingUp}
          color="violet"
          trend="+14.2%"
          trendDirection="up"
          subtitle={`${dateRange.startDate} to ${dateRange.endDate}`}
        />
        <StatCard
          title={t('dashboard.totalOrders')}
          value={stats.totalOrders}
          icon={Receipt}
          color="emerald"
          trend="+5.1%"
          trendDirection="up"
          subtitle="Tax invoices issued"
        />
        <StatCard
          title={t('dashboard.lowStockItems')}
          value={stats.lowStockCount}
          icon={AlertTriangle}
          color={stats.lowStockCount > 0 ? 'amber' : 'emerald'}
          subtitle={stats.lowStockCount > 0 ? 'Requires attention' : 'Inventory healthy'}
        />
      </div>

      {/* Quick Action Navigation Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/pos')}
          className="p-4 rounded-2xl glass-card flex items-center justify-between group hover:border-violet-500/50 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-600/15 text-violet-400 group-hover:bg-violet-600 group-hover:text-white transition-colors">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-200">{t('dashboard.newSale')}</h4>
              <p className="text-[11px] text-gray-400">Open fast billing counter &amp; barcode scanner</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-violet-400 transition-colors" />
        </button>

        <button
          onClick={() => navigate('/inventory')}
          className="p-4 rounded-2xl glass-card flex items-center justify-between group hover:border-cyan-500/50 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-600/15 text-cyan-400 group-hover:bg-cyan-600 group-hover:text-white transition-colors">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-200">{t('dashboard.addProduct')}</h4>
              <p className="text-[11px] text-gray-400">Add SKUs, update prices &amp; adjust stock</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors" />
        </button>

        <button
          onClick={() => navigate('/reports')}
          className="p-4 rounded-2xl glass-card flex items-center justify-between group hover:border-emerald-500/50 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/15 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <FileBarChart className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-200">{t('dashboard.viewReports')}</h4>
              <p className="text-[11px] text-gray-400">GST tax ledger, profit margins &amp; analytics</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-emerald-400 transition-colors" />
        </button>
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Revenue Area Chart (2 Columns) */}
        <div className="lg:col-span-2">
          <Card
            title={t('dashboard.revenueTrend')}
            subtitle={`${dateRange.startDate} to ${dateRange.endDate}`}
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <LoadingSpinner text="Rendering chart..." />
              </div>
            ) : dailyRevenue.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <EmptyState
                  title={t('dashboard.noRecentSales')}
                  description="Start issuing bills through the Point of Sale to view daily trend."
                />
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dailyRevenue}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#6B7280"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#6B7280"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111827',
                        borderColor: '#374151',
                        borderRadius: '12px',
                        fontSize: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                      formatter={(val) => [formatCurrency(val), 'Revenue']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#8B5CF6"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#revenueGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Top Performing Products Bar Chart (1 Column) */}
        <div>
          <Card
            title={t('dashboard.topProducts')}
            subtitle="Ranked by sales volume (units)"
          >
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : topProducts.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <EmptyState
                  title="No top products yet"
                  description="Products will rank here automatically after retail sales."
                />
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topProducts}
                    layout="vertical"
                    margin={{ top: 5, right: 10, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                    <XAxis type="number" stroke="#6B7280" fontSize={10} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#9CA3AF"
                      fontSize={11}
                      width={80}
                      tickFormatter={(val) => (val.length > 12 ? `${val.slice(0, 10)}...` : val)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111827',
                        borderColor: '#374151',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                      formatter={(val) => [`${val} Units`, 'Quantity']}
                    />
                    <Bar
                      dataKey="units"
                      fill="#06B6D4"
                      radius={[0, 8, 8, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Recent Sales Transactions Table */}
      <Card
        title={t('dashboard.recentSales')}
        subtitle="Latest 10 bills generated in your store"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/sales')}
            className="text-violet-400 hover:text-violet-300"
          >
            View All Bills &rarr;
          </Button>
        }
      >
        {loading ? (
          <div className="py-12">
            <LoadingSpinner text="Fetching recent invoices..." />
          </div>
        ) : recentSales.length === 0 ? (
          <EmptyState
            title={t('dashboard.noRecentSales')}
            description="Create your first invoice by heading to the Point of Sale counter."
            action={
              <Button variant="primary" size="sm" onClick={() => navigate('/pos')}>
                Go to POS
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-navy-700/80 text-xs font-semibold text-gray-400 uppercase">
                  <th className="pb-3 px-3">Invoice #</th>
                  <th className="pb-3 px-3">Date &amp; Time</th>
                  <th className="pb-3 px-3">Customer</th>
                  <th className="pb-3 px-3">Payment</th>
                  <th className="pb-3 px-3 text-right">Total Amount</th>
                  <th className="pb-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700/50">
                {recentSales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => navigate(`/sales/${sale.id}`)}
                    className="hover:bg-navy-700/30 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 font-mono font-semibold text-violet-400">
                      {sale.invoice_number || `INV-${sale.id}`}
                    </td>
                    <td className="py-3 px-3 text-gray-300 text-xs">
                      {sale.created_at ? formatDateTime(sale.created_at) : '—'}
                    </td>
                    <td className="py-3 px-3 text-gray-200">
                      {sale.customer_name || 'Walk-in Customer'}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs uppercase font-medium text-gray-400">
                        {sale.payment_method || 'CASH'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-gray-100">
                      {formatCurrency(sale.total_amount)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge
                        variant={sale.status === 'cancelled' ? 'danger' : 'success'}
                        size="sm"
                        dot
                      >
                        {sale.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
