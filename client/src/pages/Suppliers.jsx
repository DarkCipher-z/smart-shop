import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Plus,
  Search,
  Download,
  Upload,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  FileSpreadsheet,
} from 'lucide-react';
import Papa from 'papaparse';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FileUpload from '../components/ui/FileUpload';

const INITIAL_FORM = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  gstin: '',
  payment_terms: 'Net 30',
};

export default function Suppliers() {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add/Edit modal state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Delete state
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvData, setCsvData] = useState([]);
  const [importing, setImporting] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/suppliers');
      const list = res?.data || res?.suppliers || (Array.isArray(res) ? res : []);
      setSuppliers(list);
    } catch (err) {
      toastError(err.message || 'Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  }, [suppliers, searchQuery]);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormData(INITIAL_FORM);
    setShowAddEditModal(true);
  };

  const handleOpenEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      gstin: supplier.gstin || '',
      payment_terms: supplier.payment_terms || 'Net 30',
    });
    setShowAddEditModal(true);
  };

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toastError('Supplier Name and Phone are required.');
      return;
    }

    setSavingSupplier(true);
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, formData);
        success('Supplier details updated successfully');
      } else {
        await api.post('/suppliers', formData);
        success('Supplier registered successfully');
      }
      setShowAddEditModal(false);
      fetchSuppliers();
    } catch (err) {
      toastError(err.message || 'Failed to save supplier');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/suppliers/${supplierToDelete.id}`);
      success('Supplier removed');
      setSupplierToDelete(null);
      fetchSuppliers();
    } catch (err) {
      toastError(err.message || 'Failed to delete supplier');
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCSV = () => {
    if (suppliers.length === 0) {
      toastError('No suppliers to export.');
      return;
    }

    const rows = suppliers.map((s) => ({
      'Supplier Name': s.name || '',
      'Contact Person': s.contact_person || '',
      Phone: s.phone || '',
      Email: s.email || '',
      Address: s.address || '',
      GSTIN: s.gstin || '',
      'Payment Terms': s.payment_terms || '',
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartshop_suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    success('Suppliers exported to CSV');
  };

  // Download Sample Suppliers Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Supplier Name': 'Metro Cash & Carry India',
        'Contact Person': 'Rajesh Gupta',
        Phone: '+91 9811223344',
        Email: 'sales@metroindia.com',
        Address: 'Bhandup Industrial Estate, Mumbai',
        GSTIN: '27AABCM1122A1Z3',
      },
      {
        'Supplier Name': 'Amul Dairy Distributors',
        'Contact Person': 'Suresh Patel',
        Phone: '+91 9822334455',
        Email: 'order@amuldist.in',
        Address: 'Andheri East, Mumbai',
        GSTIN: '27AABCA3344B1Z2',
      },
    ];
    const csv = Papa.unparse(templateData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartshop_suppliers_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportCSV = async () => {
    if (!csvData || csvData.length === 0) return;
    setImporting(true);
    let count = 0;
    try {
      for (const row of csvData) {
        if (!row['Supplier Name'] && !row.name) continue;
        const payload = {
          name: row['Supplier Name'] || row.name,
          contact_person: row['Contact Person'] || row.contact_person || '',
          phone: row.Phone || row.phone || '',
          email: row.Email || row.email || '',
          address: row.Address || row.address || '',
          gstin: row.GSTIN || row.gstin || '',
          payment_terms: row['Payment Terms'] || row.payment_terms || 'Net 30',
        };
        await api.post('/suppliers', payload).catch(() => null);
        count++;
      }
      success(`Imported ${count} suppliers.`);
      setShowImportModal(false);
      setCsvData([]);
      fetchSuppliers();
    } catch (err) {
      toastError(err.message || 'Error importing suppliers');
    } finally {
      setImporting(false);
    }
  };

  const columns = [
    {
      header: 'Supplier / Vendor',
      accessor: 'name',
      render: (row) => (
        <div>
          <span className="font-bold text-gray-100 block">{row.name}</span>
          {row.contact_person && (
            <span className="text-[10px] text-gray-400">
              Contact: {row.contact_person}
            </span>
          )}
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
      header: 'Official Email',
      accessor: 'email',
      render: (row) => (
        <span className="text-xs text-gray-400">{row.email || '—'}</span>
      ),
    },
    {
      header: 'Vendor GSTIN',
      accessor: 'gstin',
      render: (row) => (
        <span className="font-mono text-xs text-cyan-400">{row.gstin || '—'}</span>
      ),
    },
    {
      header: 'Payment Terms',
      accessor: 'payment_terms',
      render: (row) => (
        <span className="text-xs text-violet-400 font-medium">
          {row.payment_terms || 'Immediate'}
        </span>
      ),
    },
    {
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleOpenEdit(row)}
            title="Edit Supplier"
            className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSupplierToDelete(row)}
            title="Delete Supplier"
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
            {t('suppliers.title')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {t('suppliers.subtitle')}
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
            icon={Plus}
            onClick={handleOpenAdd}
          >
            {t('suppliers.addSupplier')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 rounded-2xl glass-card">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search suppliers by business name, contact person or GSTIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-navy-900/60 border border-navy-700/80 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 text-gray-100"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <Table
        columns={columns}
        data={filteredSuppliers}
        isLoading={loading}
        emptyTitle="No suppliers registered"
        emptyDescription="Add wholesale distributors and vendors to record inward purchase bills."
        pageSize={12}
      />

      {/* ADD / EDIT MODAL */}
      <Modal
        isOpen={showAddEditModal}
        onClose={() => setShowAddEditModal(false)}
        title={editingSupplier ? t('suppliers.editSupplier') : t('suppliers.addSupplier')}
        subtitle="Maintain distributor terms, contacts and taxation numbers"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddEditModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveSupplier}
              isLoading={savingSupplier}
            >
              Save Supplier
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveSupplier} className="space-y-3">
          <Input
            label="Supplier / Business Name *"
            placeholder="e.g. Parle Agro Distributors Ltd"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            autoFocus
          />
          <Input
            label="Contact Person Name"
            placeholder="e.g. Sanjay Verma"
            value={formData.contact_person}
            onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
          />
          <Input
            label="Contact Phone Number *"
            placeholder="+91 98765 00000"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            required
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="orders@parleagro.local"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <Input
            label="Warehouse / Business Address"
            placeholder="Gala No 14, APMC Market, Vashi, Navi Mumbai"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
          <Input
            label="Supplier GSTIN"
            placeholder="27AAACP1234F1Z5"
            value={formData.gstin}
            onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
          />
          <Input
            label="Credit / Payment Terms"
            placeholder="e.g. Net 15, Net 30, COD"
            value={formData.payment_terms}
            onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
          />
        </form>
      </Modal>

      {/* CSV IMPORT MODAL */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Suppliers via CSV"
        subtitle="Expected columns: Supplier Name, Contact Person, Phone, Email, Address, GSTIN, Payment Terms"
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
              Import {csvData.length} Suppliers
            </Button>
          </>
        }
      >
        <FileUpload
          onDataParsed={(data) => setCsvData(data)}
          title="Upload Suppliers CSV"
          description="Drag and drop your vendors contact sheet"
        />
      </Modal>

      {/* DELETE CONFIRM */}
      <ConfirmDialog
        isOpen={!!supplierToDelete}
        onClose={() => setSupplierToDelete(null)}
        onConfirm={handleDeleteSupplier}
        title="Delete Supplier"
        message={`Are you sure you want to remove ${supplierToDelete?.name}?`}
        isLoading={deleting}
      />
    </div>
  );
}
