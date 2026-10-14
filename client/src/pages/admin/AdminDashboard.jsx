import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Store,
  IndianRupee,
  Receipt,
  Boxes,
  AlertTriangle,
  Users,
  Activity,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import api from '../../utils/api';
import { formatCurrency } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [adminData, setAdminData] = useState(null);

  const fetchAdminDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/dashboard').catch(() => null);
      if (res) {
        setAdminData(res);
      }
    } catch (err) {
      toastError(err.message || 'Failed to load admin stats');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchAdminDashboard();
  }, [fetchAdminDashboard]);

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading enterprise dashboard..." />
      </div>
    );
  }

  // Safe normalization of global metrics
  const globalMetrics = adminData?.global_metrics || adminData?.system_stats || {};
  const rawShops = Array.isArray(adminData?.shops) ? adminData.shops : [];

  // Normalize shops array safely: handles both { shop, metrics, shopkeepers } and flat objects
  const shops = rawShops.map((item) => {
    const sObj = item?.shop || item || {};
    const mObj = item?.metrics || {};
    const shopkeepersList = Array.isArray(item?.shopkeepers) ? item.shopkeepers : [];

    return {
      id: sObj.id || item?.id || 1,
      name: sObj.name || item?.name || 'Retail Shop',
      code: sObj.code || item?.code || 'SHOP',
      invoice_prefix: sObj.invoice_prefix || sObj.code || 'INV',
      operating_hours: `${sObj.operating_start_time || '08:00'} - ${sObj.operating_end_time || '22:00'} IST`,
      status: 'active',
      revenue: Number(mObj.total_revenue ?? item?.revenue ?? item?.total_revenue ?? 0),
      orders: Number(mObj.total_orders ?? item?.orders ?? item?.order_count ?? 0),
      today_revenue: Number(mObj.today_revenue ?? 0),
      today_orders: Number(mObj.today_orders ?? 0),
      total_products: Number(mObj.total_products ?? 0),
      inventory_value: Number(mObj.inventory_valuation ?? item?.inventory_value ?? 0),
      retail_value: Number(mObj.retail_valuation ?? 0),
      low_stock_count: Number(mObj.low_stock_count ?? item?.low_stock_count ?? 0),
      shopkeepers: shopkeepersList,
    };
  });

  const comparisonChartData = shops.map((s) => {
    const sName = String(s.name || 'Shop');
    return {
      name: sName.length > 14 ? `${sName.slice(0, 13)}...` : sName,
      fullName: sName,
      Revenue: Number(s.revenue || 0),
      InventoryValue: Number(s.inventory_value || 0),
    };
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-600/15 text-cyan-400 border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {t('admin.dashboardTitle')}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Multi-shop live inventory &amp; billing comparison across all 3 retail outlets
            </p>
          </div>
        </div>
        <Badge variant="cyan" size="md" dot>
          Super Admin Live
        </Badge>
      </div>

      {/* System-wide Aggregate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="All Shops Combined Revenue"
          value={globalMetrics.total_revenue || 0}
          isCurrency
          icon={IndianRupee}
          color="cyan"
          subtitle="Lifetime retail turnover"
        />
        <StatCard
          title="Combined Invoices"
          value={globalMetrics.total_orders || 0}
          icon={Receipt}
          color="violet"
          subtitle="Processed across network"
        />
        <StatCard
          title="Total Inventory Valuation"
          value={globalMetrics.total_inventory_valuation || 0}
          isCurrency
          icon={Boxes}
          color="emerald"
          subtitle={`${globalMetrics.total_products || 0} catalog products`}
        />
        <StatCard
          title="System User Accounts"
          value={globalMetrics.total_users || 4}
          icon={Users}
          color="amber"
          subtitle="Shopkeepers & administrators"
        />
      </div>

      {/* Cross-Shop Comparison Cards (Side-by-side) */}
      <div>
        <h3 className="text-base font-bold text-gray-200 mb-3 flex items-center gap-2">
          <Store className="w-4 h-4 text-violet-400" />
          {t('admin.crossShopComparison')} ({shops.length} Retail Tenants)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {shops.map((shop) => (
            <div
              key={shop.id}
              className="p-5 rounded-3xl glass-card border border-navy-700/80 flex flex-col justify-between relative overflow-hidden group hover:border-violet-500/40 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/5 rounded-full blur-2xl pointer-events-none group-hover:bg-violet-600/10 transition-colors" />
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="p-2.5 rounded-xl bg-violet-600/15 text-violet-400 border border-violet-500/20">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="success" size="sm" dot>
                      Active
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-navy-800 text-[10px] font-mono font-bold text-cyan-400 border border-navy-700">
                    {shop.invoice_prefix}
                  </span>
                  <span className="text-[11px] text-gray-400">Shop #{shop.id}</span>
                </div>

                <h4 className="text-sm font-extrabold text-white mt-1 line-clamp-1">
                  {shop.name}
                </h4>
                <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                  Hours: {shop.operating_hours}
                </p>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-navy-800">
                    <span className="text-gray-400">Total Revenue:</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {formatCurrency(shop.revenue)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-navy-800">
                    <span className="text-gray-400">Orders Processed:</span>
                    <span className="font-semibold text-gray-200 font-mono">
                      {shop.orders}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-navy-800">
                    <span className="text-gray-400">Inventory Valuation:</span>
                    <span className="font-semibold text-cyan-400 font-mono">
                      {formatCurrency(shop.inventory_value)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-navy-800">
                    <span className="text-gray-400">Active SKUs:</span>
                    <span className="font-semibold text-gray-300">
                      {shop.total_products} items
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-gray-400">Low Stock SKUs:</span>
                    <span
                      className={`font-bold ${
                        shop.low_stock_count > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {shop.low_stock_count > 0
                        ? `${shop.low_stock_count} alerts`
                        : 'Stock Healthy'}
                    </span>
                  </div>
                </div>
              </div>

              {shop.shopkeepers.length > 0 && (
                <div className="mt-4 pt-3 border-t border-navy-800/80 flex items-center justify-between text-[11px] text-gray-400">
                  <span className="truncate">
                    In-charge: <strong className="text-gray-200">{shop.shopkeepers[0]?.full_name}</strong>
                  </span>
                  <span className="text-violet-400 font-mono text-[10px]">
                    {shop.shopkeepers[0]?.role}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Chart */}
      <Card
        title="Revenue vs Inventory Value Comparison"
        subtitle="Benchmark sales performance against working capital tied in stock"
      >
        <div className="h-72 w-full pt-2" style={{ minHeight: '280px' }}>
          <ResponsiveContainer width="100%" height={260} minWidth={0}>
            <BarChart
              data={comparisonChartData}
              margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
              <XAxis dataKey="name" stroke="#6B7280" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#6B7280"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${v >= 1000 ? `${v / 1000}k` : v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  borderColor: '#374151',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                }}
                formatter={(v) => [formatCurrency(v)]}
                labelStyle={{ color: '#E5E7EB', fontWeight: 'bold' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Bar dataKey="Revenue" fill="#8B5CF6" radius={[6, 6, 0, 0]} name="Revenue" />
              <Bar dataKey="InventoryValue" fill="#06B6D4" radius={[6, 6, 0, 0]} name="Inventory Value" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
