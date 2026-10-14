import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Printer,
  Download,
  Ban,
  Receipt,
  Store,
  User,
  Calendar,
  CreditCard,
  FileCheck,
} from 'lucide-react';
import api from '../utils/api';
import { formatCurrency, formatDateTime } from '../utils/format';
import { generateInvoicePDF } from '../utils/pdf';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function SaleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchSaleDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/sales/${id}`);
      const data = res?.data || res?.sale || res;
      setSale(data);
    } catch (err) {
      toastError(err.message || 'Failed to fetch invoice details');
    } finally {
      setLoading(false);
    }
  }, [id, toastError]);

  useEffect(() => {
    fetchSaleDetail();
  }, [fetchSaleDetail]);

  const handleCancelSale = async () => {
    setCancelling(true);
    try {
      await api.post(`/sales/${id}/cancel`);
      success('Sale cancelled and inventory restored.');
      setShowCancelDialog(false);
      fetchSaleDetail();
    } catch (err) {
      toastError(err.message || 'Failed to cancel invoice');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading invoice record..." />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="text-center py-16 space-y-4">
        <Receipt className="w-12 h-12 text-gray-500 mx-auto" />
        <h3 className="text-lg font-bold text-gray-200">Invoice not found</h3>
        <Button variant="secondary" onClick={() => navigate('/sales')}>
          &larr; Back to Sales Ledger
        </Button>
      </div>
    );
  }

  const items = sale.items || sale.sale_items || [];
  const isCancelled = sale.status === 'cancelled';
  const subtotal = Number(sale.subtotal_amount || 0);
  const discount = Number(sale.discount_amount || 0);
  const tax = Number(sale.tax_amount || 0);
  const total = Number(sale.total_amount || 0);
  const cgst = tax / 2;
  const sgst = tax / 2;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Action Bar */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowLeft}
          onClick={() => navigate('/sales')}
        >
          {t('common.back')}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {!isCancelled && (
            <Button
              variant="danger"
              size="sm"
              icon={Ban}
              onClick={() => setShowCancelDialog(true)}
            >
              Cancel &amp; Issue Credit Note
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={Printer}
            onClick={() => window.print()}
          >
            {t('common.print')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Download}
            onClick={() => generateInvoicePDF(sale, user)}
          >
            {t('common.downloadPdf')}
          </Button>
        </div>
      </div>

      {/* Invoice Card / Printable View */}
      <div className="invoice-printable rounded-3xl glass-card p-6 sm:p-10 border border-navy-700 space-y-8 bg-navy-850">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pb-6 border-b border-navy-700">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <Store className="w-6 h-6 text-violet-400" />
              <h2 className="text-2xl font-black text-white tracking-tight">
                {sale.shop_name || user?.shopName || 'Smart Shop'}
              </h2>
            </div>
            <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
              {sale.shop_address || 'Commercial Center, Market Road, Mumbai, Maharashtra 400001'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Ph: {sale.shop_phone || '+91 98765 43210'} | GSTIN:{' '}
              <strong className="text-gray-200">
                {sale.shop_gstin || '27AAAAA0000A1Z5'}
              </strong>
            </p>
          </div>

          <div className="text-left sm:text-right space-y-1">
            <Badge
              variant={isCancelled ? 'danger' : 'success'}
              size="lg"
              dot
              className="uppercase font-bold tracking-wider mb-2"
            >
              {isCancelled ? 'CANCELLED / CREDIT NOTE' : 'TAX INVOICE'}
            </Badge>
            <p className="text-sm font-mono font-bold text-violet-400">
              {sale.invoice_number || `INV-${sale.id}`}
            </p>
            <p className="text-xs text-gray-400">
              Date: {formatDateTime(sale.created_at)}
            </p>
            <p className="text-xs text-gray-400 uppercase">
              Mode: {sale.payment_method || 'CASH'}
            </p>
          </div>
        </div>

        {/* Customer Information Box */}
        <div className="p-4 rounded-2xl bg-navy-900/60 border border-navy-700/80 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-gray-400 block font-semibold uppercase text-[10px] tracking-wider mb-1">
              Billed To
            </span>
            <p className="text-sm font-bold text-gray-100">
              {sale.customer_name || 'Walk-in Customer'}
            </p>
            {sale.customer_phone && (
              <p className="text-gray-400 mt-0.5">Phone: {sale.customer_phone}</p>
            )}
            {sale.customer_address && (
              <p className="text-gray-400 mt-0.5">Address: {sale.customer_address}</p>
            )}
          </div>
          <div className="sm:text-right">
            <span className="text-gray-400 block font-semibold uppercase text-[10px] tracking-wider mb-1">
              Customer Tax Details
            </span>
            <p className="text-gray-300">
              GSTIN: {sale.customer_gstin || 'Unregistered Consumer'}
            </p>
            <p className="text-gray-400 mt-0.5">
              Place of Supply: Maharashtra (27)
            </p>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-navy-700 text-gray-400 font-semibold uppercase">
                <th className="py-3 px-2">#</th>
                <th className="py-3 px-2">SKU</th>
                <th className="py-3 px-2">Item Description</th>
                <th className="py-3 px-2 text-center">Qty</th>
                <th className="py-3 px-2 text-right">Rate</th>
                <th className="py-3 px-2 text-right">Disc</th>
                <th className="py-3 px-2 text-right">GST %</th>
                <th className="py-3 px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/50">
              {items.map((it, idx) => {
                const qty = Number(it.quantity || 1);
                const rate = Number(it.unit_price || 0);
                const disc = Number(it.discount || 0);
                const lineTotal = qty * rate - disc;

                return (
                  <tr key={idx} className="hover:bg-navy-800/30">
                    <td className="py-3 px-2 text-gray-500">{idx + 1}</td>
                    <td className="py-3 px-2 font-mono text-gray-400">{it.sku || '—'}</td>
                    <td className="py-3 px-2 font-semibold text-gray-100">
                      {it.name || it.product_name}
                    </td>
                    <td className="py-3 px-2 text-center font-bold text-gray-200">{qty}</td>
                    <td className="py-3 px-2 text-right font-mono text-gray-300">
                      {formatCurrency(rate)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-rose-400">
                      {disc > 0 ? `-${formatCurrency(disc)}` : '₹0.00'}
                    </td>
                    <td className="py-3 px-2 text-right text-cyan-400">
                      {it.gst_rate || 0}%
                    </td>
                    <td className="py-3 px-2 text-right font-mono font-bold text-white">
                      {formatCurrency(lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Calculation & Tax Summary */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-6 border-t border-navy-700">
          <div className="text-xs text-gray-400 space-y-1.5 max-w-sm">
            <p className="font-semibold text-gray-300">GST Compliance Summary:</p>
            <p>1. CGST (Central Tax 50%) &amp; SGST (State Tax 50%) applied.</p>
            <p>2. Goods once sold can be returned within 7 days against credit note.</p>
            {sale.notes && (
              <p className="mt-2 text-violet-400 font-medium">Notes: {sale.notes}</p>
            )}
          </div>

          <div className="w-full sm:w-72 space-y-2 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>Subtotal:</span>
              <span className="font-mono text-gray-200">{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-rose-400">
                <span>Discount:</span>
                <span className="font-mono">-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-400">
              <span>CGST (Central):</span>
              <span className="font-mono text-gray-200">{formatCurrency(cgst)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>SGST (State):</span>
              <span className="font-mono text-gray-200">{formatCurrency(sgst)}</span>
            </div>
            <div className="pt-2 border-t border-navy-700 flex justify-between items-center text-sm font-bold text-white">
              <span>Grand Total:</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRM CANCEL DIALOG */}
      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancelSale}
        title="Cancel Invoice &amp; Restore Stock"
        message={`Are you sure you want to cancel invoice #${sale.invoice_number || sale.id}? A credit note will be issued and inventory items will be returned to stock.`}
        confirmText="Confirm Cancellation"
        isLoading={cancelling}
      />
    </div>
  );
}
