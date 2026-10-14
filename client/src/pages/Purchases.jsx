import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Calendar,
  IndianRupee,
  Receipt,
  Trash2,
  Eye,
  CheckCircle,
} from 'lucide-react';
import api from '../utils/api';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import StatCard from '../components/ui/StatCard';
import DateRangePicker from '../components/ui/DateRangePicker';

export default function Purchases() {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('All');
  const [dateRange, setDateRange] = useState({
    startDate: '2026-10-01',
    endDate: '2026-10-15',
  });

  // New Purchase modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [savingPurchase, setSavingPurchase] = useState(false);

  // View Detail modal state
  const [viewingPurchase, setViewingPurchase] = useState(null);

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const [purchRes, suppRes, prodRes] = await Promise.all([
        api.get('/purchases', {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }).catch(() => []),
        api.get('/suppliers').catch(() => []),
        api.get('/products').catch(() => []),
      ]);

      setPurchases(purchRes?.data || purchRes?.purchases || (Array.isArray(purchRes) ? purchRes : []));
      setSuppliers(suppRes?.data || suppRes?.suppliers || (Array.isArray(suppRes) ? suppRes : []));
      setProducts(prodRes?.data || prodRes?.products || (Array.isArray(prodRes) ? prodRes : []));
    } catch (err) {
      toastError(err.message || 'Failed to fetch purchase orders');
    } finally {
      setLoading(false);
    }
  }, [dateRange, toastError]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  // Filtered purchases list
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const num = (p.purchase_number || p.bill_number || `PO-${p.id}`).toLowerCase();
      const supp = (p.supplier_name || '').toLowerCase();
      const matchesSearch = !q || num.includes(q) || supp.includes(q);
      const matchesSupp =
        selectedSupplierFilter === 'All' ||
        String(p.supplier_id) === String(selectedSupplierFilter);

      return matchesSearch && matchesSupp;
    });
  }, [purchases, searchQuery, selectedSupplierFilter]);

  // Aggregate metrics
  const totalCost = filteredPurchases.reduce((sum, p) => sum + Number(p.total_cost || p.total_amount || 0), 0);
  const totalItemsCount = filteredPurchases.reduce((sum, p) => sum + Number(p.items_count || p.total_items || 1), 0);

  // Add Item line to New Purchase Form
  const addItemToPurchase = (productId) => {
    const prod = products.find((p) => String(p.id) === String(productId));
    if (!prod) return;

    setPurchaseItems((prev) => {
      const exists = prev.find((item) => item.product_id === prod.id);
      if (exists) {
        return prev.map((item) =>
          item.product_id === prod.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          product_id: prod.id,
          name: prod.name,
          sku: prod.sku,
          unit: prod.unit || 'PCS',
          quantity: 1,
          cost_price: Number(prod.purchase_cost || prod.cost_price || 0),
        },
      ];
    });
  };

  const updatePurchaseItem = (productId, field, value) => {
    setPurchaseItems((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, [field]: Number(value) || 0 } : item
      )
    );
  };

  const removePurchaseItem = (productId) => {
    setPurchaseItems((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const purchaseTotalCalculated = purchaseItems.reduce(
    (sum, item) => sum + item.quantity * item.cost_price,
    0
  );

  // Save Inward Purchase
  const handleSavePurchase = async (e) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      toastError('Please select a supplier.');
      return;
    }
    if (purchaseItems.length === 0) {
      toastError('Please add at least one product item to inward.');
      return;
    }

    setSavingPurchase(true);
    try {
      const supplier = suppliers.find((s) => String(s.id) === String(selectedSupplierId));
      const payload = {
        supplier_id: Number(selectedSupplierId),
        supplier_name: supplier?.name || 'Vendor',
        purchase_number: billNumber || `PO-${Date.now().toString().slice(-6)}`,
        items: purchaseItems.map((it) => ({
          product_id: it.product_id,
          name: it.name,
          sku: it.sku,
          quantity: it.quantity,
          cost_price: it.cost_price,
        })),
        total_cost: purchaseTotalCalculated,
      };

      await api.post('/purchases', payload);
      success(t('purchases.purchaseSaved'));
      setShowNewModal(false);
      setPurchaseItems([]);
      setBillNumber('');
      setSelectedSupplierId('');
      fetchPurchases();
    } catch (err) {
      toastError(err.message || 'Failed to record inward purchase');
    } finally {
      setSavingPurchase(false);
    }
  };

  const columns = [
    {
      header: 'Purchase Bill #',
      accessor: 'purchase_number',
      render: (row) => (
        <span className="font-mono font-bold text-cyan-400">
          {row.purchase_number || row.bill_number || `PO-${row.id}`}
        </span>
      ),
    },
    {
      header: 'Inward Date',
      accessor: 'created_at',
      render: (row) => (
        <span className="text-xs text-gray-300">
          {formatDateTime(row.created_at || row.purchase_date)}
        </span>
      ),
    },
    {
      header: 'Supplier / Vendor',
      accessor: 'supplier_name',
      render: (row) => (
        <span className="font-medium text-gray-200">
          {row.supplier_name || 'Vendor'}
        </span>
      ),
    },
    {
      header: 'Items Count',
      render: (row) => (
        <span className="text-xs text-gray-300 font-semibold">
          {row.items?.length || row.items_count || 1} SKUs
        </span>
      ),
    },
    {
      header: 'Total Cost',
      accessor: 'total_cost',
      render: (row) => (
        <span className="font-bold text-gray-100 font-mono">
          {formatCurrency(row.total_cost || row.total_amount || 0)}
        </span>
      ),
    },
    {
      header: 'Stock Status',
      render: () => (
        <Badge variant="success" size="sm" dot>
          Stock Inwarded
        </Badge>
      ),
    },
    {
      header: 'Actions',
      render: (row) => (
        <button
          onClick={() => setViewingPurchase(row)}
          title="View Details"
          className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-100 tracking-tight">
            {t('purchases.title')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {t('purchases.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={setDateRange}
          />
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setShowNewModal(true)}
          >
            {t('purchases.newPurchase')}
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Inward Purchases"
          value={totalCost}
          isCurrency
          icon={IndianRupee}
          color="cyan"
        />
        <StatCard
          title="Vendor Invoices"
          value={filteredPurchases.length}
          icon={Receipt}
          color="violet"
        />
        <StatCard
          title="Inventory Items Stocked"
          value={totalItemsCount}
          icon={Truck}
          color="emerald"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl glass-card flex flex-col md:flex-row items-center gap-3">
        <div className="flex-1 w-full relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by vendor bill number or supplier name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-navy-900/60 border border-navy-700/80 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 text-gray-100"
          />
        </div>

        <Select
          value={selectedSupplierFilter}
          onChange={(e) => setSelectedSupplierFilter(e.target.value)}
          className="text-xs py-2 w-full md:w-56"
        >
          <option value="All">All Suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Purchases Table */}
      <Table
        columns={columns}
        data={filteredPurchases}
        isLoading={loading}
        emptyTitle="No inward purchases found"
        emptyDescription="Record purchase bills from vendors to track procurement costs and increase inventory."
        pageSize={10}
      />

      {/* RECORD INWARD PURCHASE MODAL */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title={t('purchases.newPurchase')}
        subtitle="Inward goods, specify purchase price and increment stock levels"
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSavePurchase}
              isLoading={savingPurchase}
              icon={CheckCircle}
            >
              Save Purchase &amp; Inward Stock
            </Button>
          </>
        }
      >
        <form onSubmit={handleSavePurchase} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Select Supplier / Vendor *"
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              required
            >
              <option value="">Choose Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.phone || 'No phone'})
                </option>
              ))}
            </Select>

            <Input
              label="Vendor Invoice / Bill Number"
              placeholder="e.g. VEN-2026-9042"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
            />
          </div>

          {/* Add product select */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Add Products to Inward *
            </label>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  addItemToPurchase(e.target.value);
                  e.target.value = '';
                }
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-navy-900 border border-navy-700 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">+ Click to select and add a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (SKU: {p.sku || 'N/A'}) — Cost: {formatCurrency(p.purchase_cost)}
                </option>
              ))}
            </select>
          </div>

          {/* Inward Items Table */}
          {purchaseItems.length > 0 && (
            <div className="border border-navy-700 rounded-2xl overflow-hidden bg-navy-900/60">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-navy-700 bg-navy-900 text-gray-400 font-semibold">
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3 text-center w-28">Quantity</th>
                    <th className="py-2.5 px-3 text-right w-36">Cost Price (₹)</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                    <th className="py-2.5 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {purchaseItems.map((item) => (
                    <tr key={item.product_id}>
                      <td className="py-2 px-3 text-gray-200 font-medium">
                        {item.name}
                        <span className="block text-[10px] text-gray-500 font-mono">
                          {item.sku}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updatePurchaseItem(item.product_id, 'quantity', e.target.value)
                          }
                          className="w-full py-1 px-2 rounded-lg bg-navy-800 border border-navy-700 text-center text-white"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.cost_price}
                          onChange={(e) =>
                            updatePurchaseItem(item.product_id, 'cost_price', e.target.value)
                          }
                          className="w-full py-1 px-2 rounded-lg bg-navy-800 border border-navy-700 text-right text-white"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-gray-100 font-mono">
                        {formatCurrency(item.quantity * item.cost_price)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removePurchaseItem(item.product_id)}
                          className="text-gray-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="p-3 bg-navy-900 border-t border-navy-700 flex justify-between items-center text-sm font-bold text-white">
                <span>Total Inward Cost:</span>
                <span className="text-cyan-400 text-base font-mono">
                  {formatCurrency(purchaseTotalCalculated)}
                </span>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* VIEW PURCHASE DETAIL MODAL */}
      {viewingPurchase && (
        <Modal
          isOpen={!!viewingPurchase}
          onClose={() => setViewingPurchase(null)}
          title="Purchase Record Details"
          subtitle={`Bill #${viewingPurchase.purchase_number || viewingPurchase.id}`}
          maxWidth="max-w-2xl"
          footer={
            <Button variant="secondary" onClick={() => setViewingPurchase(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-navy-900 border border-navy-700 grid grid-cols-2 gap-3">
              <div>
                <span className="text-gray-400 block font-semibold">Vendor Name:</span>
                <p className="text-sm font-bold text-gray-200">
                  {viewingPurchase.supplier_name || 'Vendor'}
                </p>
              </div>
              <div>
                <span className="text-gray-400 block font-semibold">Inward Date:</span>
                <p className="text-gray-200 font-mono">
                  {formatDateTime(viewingPurchase.created_at)}
                </p>
              </div>
            </div>

            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-navy-700 text-gray-400 font-semibold">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-center">Quantity</th>
                  <th className="py-2 text-right">Cost Price</th>
                  <th className="py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {(viewingPurchase.items || []).map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-2 text-gray-200">{it.name || it.product_name}</td>
                    <td className="py-2 text-center text-gray-300">{it.quantity}</td>
                    <td className="py-2 text-right text-gray-300 font-mono">
                      {formatCurrency(it.cost_price || it.unit_price)}
                    </td>
                    <td className="py-2 text-right font-bold text-white font-mono">
                      {formatCurrency((it.quantity || 1) * (it.cost_price || it.unit_price || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pt-3 border-t border-navy-700 flex justify-between text-sm font-bold text-white">
              <span>Grand Total Cost:</span>
              <span className="text-cyan-400 font-mono text-base">
                {formatCurrency(viewingPurchase.total_cost || viewingPurchase.total_amount)}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
