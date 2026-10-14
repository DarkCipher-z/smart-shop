import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  UserPlus,
  Search,
  Download,
  Upload,
  Edit,
  Trash2,
  Receipt,
  FileSpreadsheet,
  Phone,
  Mail,
  MapPin,
  FileText,
} from 'lucide-react';
import Papa from 'papaparse';
import api from '../utils/api';
import { formatCurrency, formatDateTime } from '../utils/format';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FileUpload from '../components/ui/FileUpload';

const INITIAL_FORM = {
  name: '',
  phone: '',
  email: '',
  address: '',
  gstin: '',
  notes: '',
};

export default function Customers() {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit Modal state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [savingCustomer, setSavingCustomer] = useState(false);

  // History modal state
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [customerSales, setCustomerSales] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Delete state
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvData, setCsvData] = useState([]);
  const [importing, setImporting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers');
      const list = res?.data || res?.customers || (Array.isArray(res) ? res : []);
      setCustomers(list);
    } catch (err) {
      toastError(err.message || 'Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Filtered list
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.gstin && c.gstin.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormData(INITIAL_FORM);
    setShowAddEditModal(true);
  };

  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      gstin: customer.gstin || '',
      notes: customer.notes || '',
    });
    setShowAddEditModal(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toastError('Name and Phone number are required.');
      return;
    }

    setSavingCustomer(true);
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, formData);
        success('Customer details updated');
      } else {
        await api.post('/customers', formData);
        success('Customer added successfully');
      }
      setShowAddEditModal(false);
      fetchCustomers();
    } catch (err) {
      toastError(err.message || 'Failed to save customer');
    } finally {
      setSavingCustomer(false);
    }
  };

  // View Purchase History
  const handleViewHistory = async (customer) => {
    setHistoryCustomer(customer);
    setLoadingHistory(true);
    try {
      const res = await api.get(`/sales?customerId=${customer.id}`);
      const list = res?.data || res?.sales || (Array.isArray(res) ? res : []);
      setCustomerSales(list);
    } catch {
      setCustomerSales([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Delete Customer
  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/customers/${customerToDelete.id}`);
      success('Customer deleted');
      setCustomerToDelete(null);
      fetchCustomers();
    } catch (err) {
      toastError(err.message || 'Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (customers.length === 0) {
      toastError('No customers to export.');
      return;
    }

    const rows = customers.map((c) => ({
      Name: c.name || '',
      Phone: c.phone || '',
      Email: c.email || '',
      Address: c.address || '',
      GSTIN: c.gstin || '',
      'Total Purchases': c.total_purchases || c.total_spent || 0,
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartshop_customers_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    success('Customers exported to CSV');
  };

  // Download Sample Customers Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        Name: 'Ramesh Sharma',
        Phone: '+91 9876501234',
        Email: 'ramesh.sharma@example.com',
        Address: 'Flat 102, Gokul Dham, Malad West, Mumbai',
        GSTIN: '27AABCS1429B1ZB',
      },
      {
        Name: 'Priya Sundaram',
        Phone: '+91 9876502345',
        Email: 'priya.s@example.com',
        Address: 'B-14, Palm Heights, Malad West, Mumbai',
        GSTIN: '',
      },
    ];
    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartshop_customers_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Import CSV
  const handleImportCSV = async () => {
    if (!csvData || csvData.length === 0) return;
    setImporting(true);
    let count = 0;
    try {
      for (const row of csvData) {
        if (!row.name && !row.Name) continue;
        const payload = {
          name: row.name || row.Name,
          phone: row.phone || row.Phone || '',
          email: row.email || row.Email || '',
          address: row.address || row.Address || '',
          gstin: row.gstin || row.GSTIN || '',
        };
        await api.post('/customers', payload).catch(() => null);
        count++;
      }
      success(`Imported ${count} customers.`);
      setShowImportModal(false);
      setCsvData([]);
      fetchCustomers();
    } catch (err) {
      toastError(err.message || 'Error importing customers');
    } finally {
      setImporting(false);
    }
  };

  const columns = [
    {
      header: 'Customer Name',
      accessor: 'name',
      render: (row) => (
        <div>
          <span className="font-bold text-gray-100 block">{row.name}</span>
          {row.notes && <span className="text-[10px] text-gray-400">{row.notes}</span>}
        </div>
      ),
    },
    {
      header: 'Phone Number',
      accessor: 'phone',
      render: (row) => (
        <span className="font-mono text-xs text-gray-300">{row.phone || '—'}</span>
      ),
    },
    {
      header: 'Email Address',
      accessor: 'email',
      render: (row) => (
        <span className="text-xs text-gray-400">{row.email || '—'}</span>
      ),
    },
    {
      header: 'Customer GSTIN',
      accessor: 'gstin',
      render: (row) => (
        <span className="font-mono text-xs text-cyan-400">{row.gstin || 'Unregistered'}</span>
      ),
    },
    {
      header: 'Total Purchases',
      accessor: 'total_spent',
      render: (row) => (
        <span className="font-bold text-emerald-400 font-mono text-xs">
          {formatCurrency(row.total_purchases ?? row.total_spent ?? 0)}
        </span>
      ),
    },
    {
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleViewHistory(row)}
            title="View Purchase History"
            className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          >
            <Receipt className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenEdit(row)}
            title="Edit Customer"
            className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCustomerToDelete(row)}
            title="Delete Customer"
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-100 tracking-tight">
            {t('customers.title')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {t('customers.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={FileSpreadsheet}
            onClick={() => setShowImportModal(true)}
          >
            {t('common.import')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={handleExportCSV}
          >
            {t('common.export')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={UserPlus}
            onClick={handleOpenAdd}
          >
            {t('customers.addCustomer')}
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 rounded-2xl glass-card">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search customer by name, phone number or GSTIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-navy-900/60 border border-navy-700/80 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 text-gray-100"
          />
        </div>
      </div>

      {/* Customers Table */}
      <Table
        columns={columns}
        data={filteredCustomers}
        isLoading={loading}
        emptyTitle="No customers registered"
        emptyDescription="Add customers during POS billing or import your contact directory."
        pageSize={12}
      />

      {/* ADD / EDIT CUSTOMER MODAL */}
      <Modal
        isOpen={showAddEditModal}
        onClose={() => setShowAddEditModal(false)}
        title={editingCustomer ? t('customers.editCustomer') : t('customers.addCustomer')}
        subtitle="Manage customer contact, billing and tax details"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddEditModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveCustomer}
              isLoading={savingCustomer}
            >
              Save Customer
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveCustomer} className="space-y-3">
          <Input
            label="Full Name *"
            placeholder="e.g. Anand Sharma"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            autoFocus
          />
          <Input
            label="Phone Number *"
            placeholder="+91 98765 43210"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            required
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="customer@domain.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <Input
            label="Billing Address"
            placeholder="Flat 201, Green Valley, Pune"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
          <Input
            label="GSTIN (for B2B customers)"
            placeholder="27AAAAA0000A1Z5"
            value={formData.gstin}
            onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
          />
          <Input
            label="Notes"
            placeholder="Loyalty preferences, store credit terms..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </form>
      </Modal>

      {/* PURCHASE HISTORY MODAL */}
      {historyCustomer && (
        <Modal
          isOpen={!!historyCustomer}
          onClose={() => setHistoryCustomer(null)}
          title={`Purchase History: ${historyCustomer.name}`}
          subtitle={`Phone: ${historyCustomer.phone || 'N/A'}`}
          maxWidth="max-w-2xl"
          footer={
            <Button variant="secondary" onClick={() => setHistoryCustomer(null)}>
              Close
            </Button>
          }
        >
          {loadingHistory ? (
            <div className="py-8">
              <LoadingSpinner text="Fetching billing history..." />
            </div>
          ) : customerSales.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">
              No bills recorded for this customer yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-navy-700 text-gray-400 font-semibold">
                    <th className="py-2 px-2">Invoice #</th>
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Payment</th>
                    <th className="py-2 px-2 text-right">Total</th>
                    <th className="py-2 px-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {customerSales.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 px-2 font-mono font-bold text-violet-400">
                        {s.invoice_number || `INV-${s.id}`}
                      </td>
                      <td className="py-2 px-2 text-gray-300">
                        {formatDateTime(s.created_at)}
                      </td>
                      <td className="py-2 px-2 uppercase text-gray-400 font-medium">
                        {s.payment_method || 'CASH'}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-emerald-400 font-mono">
                        {formatCurrency(s.total_amount)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Badge
                          variant={s.status === 'cancelled' ? 'danger' : 'success'}
                          size="sm"
                        >
                          {s.status === 'cancelled' ? 'Cancelled' : 'Paid'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* CSV IMPORT MODAL */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Customers from CSV"
        subtitle="Expected columns: Name, Phone, Email, Address, GSTIN"
        footer={
          <>
            <Button variant="ghost" onClick={handleDownloadTemplate}>
              Download Sample Template
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleImportCSV}
              disabled={csvData.length === 0}
              isLoading={importing}
            >
              Import {csvData.length} Customers
            </Button>
          </>
        }
      >
        <FileUpload
          onDataParsed={(data) => setCsvData(data)}
          title="Upload Customers CSV"
          description="Drag and drop your contacts file"
        />
      </Modal>

      {/* DELETE CONFIRM */}
      <ConfirmDialog
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={handleDeleteCustomer}
        title="Delete Customer"
        message={`Are you sure you want to delete ${customerToDelete?.name}?`}
        isLoading={deleting}
      />
    </div>
  );
}
