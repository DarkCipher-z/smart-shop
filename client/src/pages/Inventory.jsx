import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit,
  Trash2,
  SlidersHorizontal,
  FileSpreadsheet,
  AlertTriangle,
} from 'lucide-react';
import Papa from 'papaparse';
import api from '../utils/api';
import { formatCurrency, formatDate, getStockStatus, getStockStatusColor } from '../utils/format';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FileUpload from '../components/ui/FileUpload';

const INITIAL_FORM = {
  sku: '',
  barcode: '',
  name: '',
  category: '',
  unit: 'PCS',
  purchase_cost: '',
  selling_price: '',
  gst_rate: 18,
  stock_quantity: 0,
  min_stock_level: 5,
  expiry_date: '',
  batch_number: '',
};

export default function Inventory() {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [savingProduct, setSavingProduct] = useState(false);

  // Stock Adjustment state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState('add'); // 'add' | 'subtract' | 'set'
  const [adjustReason, setAdjustReason] = useState('audit');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // Delete dialog state
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // CSV Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvData, setCsvData] = useState([]);
  const [importing, setImporting] = useState(false);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/products');
      const list = res?.data || res?.products || (Array.isArray(res) ? res : []);
      setProducts(list);
    } catch (err) {
      toastError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Unique categories list
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q));

      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;

      const status = getStockStatus(p);
      const matchesStatus =
        selectedStatus === 'All' ||
        (selectedStatus === 'in_stock' && status === 'in_stock') ||
        (selectedStatus === 'low_stock' && status === 'low_stock') ||
        (selectedStatus === 'out_of_stock' && status === 'out_of_stock') ||
        (selectedStatus === 'expiring_soon' && status === 'expiring_soon') ||
        (selectedStatus === 'expired' && status === 'expired');

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [products, searchQuery, selectedCategory, selectedStatus]);

  // Handle open Add Modal
  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData(INITIAL_FORM);
    setShowAddEditModal(true);
  };

  // Handle open Edit Modal
  const handleOpenEdit = (prod) => {
    setEditingProduct(prod);
    setFormData({
      sku: prod.sku || '',
      barcode: prod.barcode || '',
      name: prod.name || '',
      category: prod.category || '',
      unit: prod.unit || 'PCS',
      purchase_cost: prod.purchase_cost ?? prod.cost_price ?? '',
      selling_price: prod.selling_price ?? prod.price ?? '',
      gst_rate: prod.gst_rate ?? 18,
      stock_quantity: prod.stock_quantity ?? prod.stock ?? 0,
      min_stock_level: prod.min_stock_level ?? 5,
      expiry_date: prod.expiry_date ? prod.expiry_date.split('T')[0] : '',
      batch_number: prod.batch_number || '',
    });
    setShowAddEditModal(true);
  };

  // Save (Create or Update) Product
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.selling_price) {
      toastError('Name and Selling Price are required.');
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        ...formData,
        purchase_cost: Number(formData.purchase_cost) || 0,
        selling_price: Number(formData.selling_price) || 0,
        gst_rate: Number(formData.gst_rate) || 0,
        stock_quantity: Number(formData.stock_quantity) || 0,
        min_stock_level: Number(formData.min_stock_level) || 0,
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        success('Product updated successfully!');
      } else {
        await api.post('/products', payload);
        success('Product created successfully!');
      }

      setShowAddEditModal(false);
      fetchProducts();
    } catch (err) {
      toastError(err.message || 'Failed to save product');
    } finally {
      setSavingProduct(false);
    }
  };

  // Handle Stock Adjustment
  const handleOpenAdjust = (prod) => {
    setAdjustingProduct(prod);
    setAdjustQty('');
    setAdjustType('add');
    setAdjustReason('audit');
    setShowAdjustModal(true);
  };

  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    if (!adjustQty || Number(adjustQty) <= 0) {
      toastError('Please enter a valid positive quantity.');
      return;
    }

    setSavingAdjust(true);
    try {
      const currentStock = Number(adjustingProduct.stock_quantity ?? adjustingProduct.stock ?? 0);
      let newStock = currentStock;
      const numQty = Number(adjustQty);

      if (adjustType === 'add') newStock += numQty;
      else if (adjustType === 'subtract') newStock = Math.max(0, currentStock - numQty);
      else if (adjustType === 'set') newStock = numQty;

      await api.put(`/products/${adjustingProduct.id}`, {
        ...adjustingProduct,
        stock_quantity: newStock,
        adjustment_reason: adjustReason,
      });

      success(t('inventory.stockAdjustedSuccess'));
      setShowAdjustModal(false);
      fetchProducts();
    } catch (err) {
      toastError(err.message || 'Failed to adjust stock');
    } finally {
      setSavingAdjust(false);
    }
  };

  // Handle Delete Product
  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/products/${productToDelete.id}`);
      success('Product deleted successfully');
      setProductToDelete(null);
      fetchProducts();
    } catch (err) {
      toastError(err.message || 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (products.length === 0) {
      toastError('No products to export.');
      return;
    }

    const csvDataFormatted = products.map((p) => ({
      SKU: p.sku || '',
      Barcode: p.barcode || '',
      Name: p.name || '',
      Category: p.category || '',
      Unit: p.unit || 'PCS',
      'Purchase Cost': p.purchase_cost || 0,
      'Selling Price': p.selling_price || 0,
      'GST Rate': p.gst_rate || 0,
      'Current Stock': p.stock_quantity ?? p.stock ?? 0,
      'Min Stock Level': p.min_stock_level || 5,
      'Expiry Date': p.expiry_date || '',
      'Batch Number': p.batch_number || '',
    }));

    const csvString = Papa.unparse(csvDataFormatted);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smartshop_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('Inventory exported successfully');
  };

  // Download Sample CSV Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        sku: 'GROC-001',
        barcode: '8901030000001',
        name: 'Basmati Rice Premium 1kg',
        category: 'Grains & Staples',
        unit: 'KG',
        purchase_cost: 95.0,
        selling_price: 125.0,
        gst_rate: 5,
        stock_quantity: 50,
        min_stock_level: 10,
        expiry_date: '2027-12-31',
        batch_number: 'B-2026-01',
      },
      {
        sku: 'ELEC-002',
        barcode: '8901030000002',
        name: 'USB-C Fast Charging Cable 1.5m',
        category: 'Electronics',
        unit: 'PCS',
        purchase_cost: 150.0,
        selling_price: 299.0,
        gst_rate: 18,
        stock_quantity: 25,
        min_stock_level: 5,
        expiry_date: '',
        batch_number: 'EL-902',
      },
    ];

    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smart_shop_inventory_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Handle Submit Bulk CSV Import
  const handleImportCSV = async () => {
    if (!csvData || csvData.length === 0) {
      toastError('No valid data parsed from CSV.');
      return;
    }

    setImporting(true);
    let successCount = 0;
    try {
      for (const row of csvData) {
        if (!row.name && !row.Name) continue;
        const payload = {
          sku: row.sku || row.SKU || '',
          barcode: row.barcode || row.Barcode || '',
          name: row.name || row.Name,
          category: row.category || row.Category || 'General',
          unit: row.unit || row.Unit || 'PCS',
          purchase_cost: Number(row.purchase_cost || row['Purchase Cost']) || 0,
          selling_price: Number(row.selling_price || row['Selling Price']) || 0,
          gst_rate: Number(row.gst_rate || row['GST Rate']) || 18,
          stock_quantity: Number(row.stock_quantity || row['Current Stock']) || 0,
          min_stock_level: Number(row.min_stock_level || row['Min Stock Level']) || 5,
          expiry_date: row.expiry_date || row['Expiry Date'] || null,
          batch_number: row.batch_number || row['Batch Number'] || '',
        };

        await api.post('/products', payload).catch(() => null);
        successCount++;
      }

      success(`Successfully imported ${successCount} products!`);
      setShowImportModal(false);
      setCsvData([]);
      fetchProducts();
    } catch (err) {
      toastError(err.message || 'Import completed with errors');
    } finally {
      setImporting(false);
    }
  };

  // Table Columns
  const columns = [
    {
      header: 'SKU / Barcode',
      accessor: 'sku',
      render: (row) => (
        <div>
          <span className="font-mono font-semibold text-violet-400 text-xs">
            {row.sku || '—'}
          </span>
          {row.barcode && (
            <span className="block text-[10px] text-gray-500 font-mono">
              {row.barcode}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Product Name',
      accessor: 'name',
      render: (row) => (
        <div>
          <span className="font-bold text-gray-100 block">{row.name}</span>
          {row.batch_number && (
            <span className="text-[10px] text-gray-400">
              Batch: {row.batch_number}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Category',
      accessor: 'category',
      render: (row) => (
        <span className="text-xs text-gray-300">
          {row.category || 'General'}
        </span>
      ),
    },
    {
      header: 'Stock',
      accessor: 'stock_quantity',
      render: (row) => {
        const stock = Number(row.stock_quantity ?? row.stock ?? 0);
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white">{stock}</span>
            <span className="text-[10px] text-gray-400 uppercase">
              {row.unit || 'PCS'}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Cost Price',
      accessor: 'purchase_cost',
      render: (row) => (
        <span className="text-gray-400 font-mono text-xs">
          {formatCurrency(row.purchase_cost ?? row.cost_price ?? 0)}
        </span>
      ),
    },
    {
      header: 'Selling Price',
      accessor: 'selling_price',
      render: (row) => (
        <span className="font-bold text-emerald-400 font-mono text-xs">
          {formatCurrency(row.selling_price ?? row.price ?? 0)}
        </span>
      ),
    },
    {
      header: 'GST %',
      accessor: 'gst_rate',
      render: (row) => (
        <span className="text-cyan-400 text-xs font-semibold">
          {row.gst_rate || 0}%
        </span>
      ),
    },
    {
      header: 'Status',
      render: (row) => {
        const status = getStockStatus(row);
        const style = getStockStatusColor(status);
        return (
          <Badge variant={status === 'in_stock' ? 'success' : status === 'low_stock' ? 'warning' : 'danger'} size="sm" dot>
            {style.label}
          </Badge>
        );
      },
    },
    {
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleOpenAdjust(row)}
            title="Adjust Stock Level"
            className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenEdit(row)}
            title="Edit Product"
            className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => setProductToDelete(row)}
            title="Delete Product"
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
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
            {t('inventory.title')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {t('inventory.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={FileSpreadsheet}
            onClick={() => setShowImportModal(true)}
          >
            {t('inventory.importCsv')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={handleExportCSV}
          >
            {t('inventory.exportCsv')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={handleOpenAdd}
          >
            {t('inventory.addProduct')}
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl glass-card flex flex-col md:flex-row items-center gap-3">
        <div className="flex-1 w-full relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={t('inventory.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-navy-900/60 border border-navy-700/80 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 text-gray-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs py-2 w-full md:w-40"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'All' ? 'All Categories' : c}
              </option>
            ))}
          </Select>

          <Select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs py-2 w-full md:w-36"
          >
            <option value="All">All Statuses</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
            <option value="expiring_soon">Expiring Soon</option>
            <option value="expired">Expired</option>
          </Select>
        </div>
      </div>

      {/* Products Table */}
      <Table
        columns={columns}
        data={filteredProducts}
        isLoading={loading}
        emptyTitle="No inventory products found"
        emptyDescription="Add new products to catalog or import from CSV."
        pageSize={12}
      />

      {/* ADD / EDIT PRODUCT MODAL */}
      <Modal
        isOpen={showAddEditModal}
        onClose={() => setShowAddEditModal(false)}
        title={editingProduct ? t('inventory.editProduct') : t('inventory.addProduct')}
        subtitle="Specify product prices, barcodes and tax parameters"
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddEditModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveProduct}
              isLoading={savingProduct}
            >
              Save Product
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveProduct} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Product Name *"
            placeholder="e.g. Fortune Sunflower Oil 1L"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            containerClassName="md:col-span-2"
          />
          <Input
            label="SKU / Item Code"
            placeholder="e.g. OIL-001"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
          />
          <Input
            label="Barcode (EAN/UPC)"
            placeholder="e.g. 8901234567890"
            value={formData.barcode}
            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
          />
          <Input
            label="Category"
            placeholder="e.g. Groceries, Staples"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          />
          <Select
            label="Measurement Unit"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
          >
            <option value="PCS">Pieces (PCS)</option>
            <option value="KG">Kilograms (KG)</option>
            <option value="LTR">Liters (LTR)</option>
            <option value="PKT">Packet (PKT)</option>
            <option value="BOX">Box (BOX)</option>
            <option value="MTR">Meters (MTR)</option>
          </Select>
          <Input
            label="Purchase Cost Price (₹)"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.purchase_cost}
            onChange={(e) => setFormData({ ...formData, purchase_cost: e.target.value })}
          />
          <Input
            label="Selling Price (₹) *"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.selling_price}
            onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
            required
          />
          <Select
            label="GST Tax Rate (%)"
            value={formData.gst_rate}
            onChange={(e) => setFormData({ ...formData, gst_rate: Number(e.target.value) })}
          >
            <option value={0}>0% (Tax Exempt)</option>
            <option value={5}>5% GST</option>
            <option value={12}>12% GST</option>
            <option value={18}>18% GST</option>
            <option value={28}>28% GST</option>
          </Select>
          <Input
            label="Stock Quantity"
            type="number"
            placeholder="0"
            value={formData.stock_quantity}
            onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
          />
          <Input
            label="Minimum Alert Level"
            type="number"
            placeholder="5"
            value={formData.min_stock_level}
            onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
          />
          <Input
            label="Batch Number"
            placeholder="e.g. B-2026-04"
            value={formData.batch_number}
            onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
          />
          <Input
            label="Expiry Date"
            type="date"
            value={formData.expiry_date}
            onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
          />
        </form>
      </Modal>

      {/* STOCK ADJUSTMENT MODAL */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title={t('inventory.adjustStock')}
        subtitle={adjustingProduct ? `Product: ${adjustingProduct.name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdjustModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAdjustment}
              isLoading={savingAdjust}
            >
              Update Stock
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveAdjustment} className="space-y-4">
          <div className="p-3 rounded-xl bg-navy-900 border border-navy-700 flex justify-between items-center text-xs">
            <span className="text-gray-400">Current Stock:</span>
            <span className="text-base font-bold text-white">
              {adjustingProduct?.stock_quantity ?? adjustingProduct?.stock ?? 0}{' '}
              {adjustingProduct?.unit || 'PCS'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'add', label: '+ Add Stock' },
              { id: 'subtract', label: '- Remove Stock' },
              { id: 'set', label: '= Set Absolute' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setAdjustType(mode.id)}
                className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                  adjustType === mode.id
                    ? 'bg-violet-600 text-white border-violet-500'
                    : 'bg-navy-900 text-gray-400 border-navy-700 hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <Input
            label="Quantity to Adjust *"
            type="number"
            min="1"
            placeholder="Enter quantity"
            value={adjustQty}
            onChange={(e) => setAdjustQty(e.target.value)}
            required
            autoFocus
          />

          <Select
            label="Reason for Adjustment *"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
          >
            <option value="audit">Physical Inventory Audit</option>
            <option value="damaged">Damaged / Broken / Spoiled Goods</option>
            <option value="loss">Theft / Unaccounted Shrinkage</option>
            <option value="return">Customer Return</option>
          </Select>
        </form>
      </Modal>

      {/* CSV IMPORT MODAL */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Bulk Import Products via CSV"
        subtitle="Upload CSV formatted according to the Smart Shop product template"
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={handleDownloadTemplate}
              className="mr-auto"
            >
              Download Sample CSV
            </Button>
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleImportCSV}
              disabled={csvData.length === 0}
              isLoading={importing}
            >
              Import {csvData.length} Products
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FileUpload
            onDataParsed={(data) => setCsvData(data)}
            title="Upload Products CSV"
            description="Drag and drop your spreadsheet file (.csv)"
          />

          {csvData.length > 0 && (
            <div className="p-3 rounded-xl bg-navy-900 border border-navy-700 max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-gray-300 mb-2">
                Preview ({csvData.length} rows detected):
              </p>
              <div className="space-y-1 text-[11px] text-gray-400 font-mono">
                {csvData.slice(0, 5).map((row, i) => (
                  <div key={i} className="truncate">
                    {i + 1}. {row.name || row.Name || 'Unnamed'} — {row.selling_price || row['Selling Price'] || '0'}
                  </div>
                ))}
                {csvData.length > 5 && (
                  <p className="text-violet-400">...and {csvData.length - 5} more items</p>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* DELETE CONFIRM DIALOG */}
      <ConfirmDialog
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={handleDeleteProduct}
        title="Delete Product"
        message={`Are you sure you want to remove "${productToDelete?.name}" from your catalog? This cannot be undone.`}
        isLoading={deleting}
      />
    </div>
  );
}
