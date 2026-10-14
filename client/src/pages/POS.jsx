import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  Printer,
  Download,
  UserPlus,
  CreditCard,
  QrCode,
  Banknote,
  Receipt,
  X,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import api from '../utils/api';
import { formatCurrency, getStockStatus } from '../utils/format';
import { generateInvoicePDF } from '../utils/pdf';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function POS() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { success, error: toastError, warning } = useToast();

  // Catalog state
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Customers state
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', gstin: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState([]);
  const [billDiscountType, setBillDiscountType] = useState('fixed'); // 'fixed' | 'percent'
  const [billDiscountValue, setBillDiscountValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'upi' | 'card'
  const [amountReceived, setAmountReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4());

  // Post-sale / completion modal state
  const [processingSale, setProcessingSale] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const searchInputRef = useRef(null);

  // Fetch products and customers
  useEffect(() => {
    const fetchData = async () => {
      setLoadingProducts(true);
      try {
        const [prodRes, custRes] = await Promise.all([
          api.get('/products').catch(() => []),
          api.get('/customers').catch(() => []),
        ]);

        const prodList = prodRes?.data || prodRes?.products || (Array.isArray(prodRes) ? prodRes : []);
        const custList = custRes?.data || custRes?.customers || (Array.isArray(custRes) ? custRes : []);

        setProducts(prodList);
        setCustomers(custList);

        // Extract distinct categories
        const cats = ['All', ...new Set(prodList.map((p) => p.category).filter(Boolean))];
        setCategories(cats);
      } catch (err) {
        toastError('Failed to load catalog data');
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchData();
  }, [toastError]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q));
      return matchesCat && matchesQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  // Add product to cart
  const addToCart = (product) => {
    const status = getStockStatus(product);
    if (status === 'out_of_stock' || Number(product.stock_quantity ?? product.stock ?? 0) <= 0) {
      warning(`${product.name} is currently out of stock!`);
      return;
    }

    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product_id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const currentQty = updated[existingIndex].quantity;
        const availableStock = Number(product.stock_quantity ?? product.stock ?? 9999);
        if (currentQty + 1 > availableStock) {
          warning(`Only ${availableStock} units available in stock!`);
          return prev;
        }
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: currentQty + 1,
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            product_id: product.id,
            sku: product.sku || '',
            name: product.name,
            unit_price: Number(product.selling_price || product.price || 0),
            quantity: 1,
            line_discount: 0,
            gst_rate: Number(product.gst_rate || product.gst_percentage || 0),
            max_stock: Number(product.stock_quantity ?? product.stock ?? 9999),
          },
        ];
      }
    });
  };

  // Update item quantity
  const updateQuantity = (productId, delta) => {
    setCartItems((prev) => {
      return prev
        .map((item) => {
          if (item.product_id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > item.max_stock) {
              warning(`Max stock reached (${item.max_stock})`);
              return item;
            }
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  // Update line item discount
  const updateLineDiscount = (productId, discount) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, line_discount: Math.max(0, Number(discount) || 0) }
          : item
      )
    );
  };

  // Remove from cart
  const removeFromCart = (productId) => {
    setCartItems((prev) => prev.filter((item) => item.product_id !== productId));
  };

  // Clear bill
  const clearCart = () => {
    setCartItems([]);
    setBillDiscountValue(0);
    setAmountReceived('');
    setNotes('');
    setSelectedCustomer(null);
    setIdempotencyKey(uuidv4());
  };

  // Calculation Breakdown
  const calculations = useMemo(() => {
    let rawSubtotal = 0;
    let totalLineDiscounts = 0;
    let taxableAmount = 0;
    let totalGstAmount = 0;

    cartItems.forEach((item) => {
      const lineBase = item.quantity * item.unit_price;
      const lineDisc = Math.min(item.line_discount, lineBase);
      const lineTaxable = lineBase - lineDisc;
      const lineTax = (lineTaxable * item.gst_rate) / 100;

      rawSubtotal += lineBase;
      totalLineDiscounts += lineDisc;
      taxableAmount += lineTaxable;
      totalGstAmount += lineTax;
    });

    // Apply bill-level discount proportionally or deduct from taxable
    let invoiceDiscount = 0;
    if (billDiscountType === 'percent') {
      invoiceDiscount = (taxableAmount * (Number(billDiscountValue) || 0)) / 100;
    } else {
      invoiceDiscount = Math.min(Number(billDiscountValue) || 0, taxableAmount);
    }

    const netTaxable = Math.max(0, taxableAmount - invoiceDiscount);
    // Recalculate GST proportional to bill discount if applied
    const discountRatio = taxableAmount > 0 ? netTaxable / taxableAmount : 1;
    const finalGst = totalGstAmount * discountRatio;
    const cgst = finalGst / 2;
    const sgst = finalGst / 2;

    const grandTotal = Math.round((netTaxable + finalGst) * 100) / 100;
    const totalSavings = totalLineDiscounts + invoiceDiscount;

    return {
      subtotal: rawSubtotal,
      totalLineDiscounts,
      invoiceDiscount,
      netTaxable,
      cgst,
      sgst,
      totalGst: finalGst,
      grandTotal,
      totalSavings,
    };
  }, [cartItems, billDiscountType, billDiscountValue]);

  // Handle Quick Add Customer
  const handleQuickAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.phone) {
      toastError('Name and Phone number are required.');
      return;
    }

    setSavingCustomer(true);
    try {
      const res = await api.post('/customers', newCustomer);
      const created = res.data || res.customer || res;
      setCustomers((prev) => [created, ...prev]);
      setSelectedCustomer(created);
      setShowQuickAddCustomer(false);
      setNewCustomer({ name: '', phone: '', email: '', gstin: '' });
      success('Customer added successfully!');
    } catch (err) {
      toastError(err.message || 'Failed to add customer');
    } finally {
      setSavingCustomer(false);
    }
  };

  // Submit Sale
  const handleCompleteSale = async () => {
    if (cartItems.length === 0) {
      toastError('Cannot complete sale: Cart is empty.');
      return;
    }

    setProcessingSale(true);
    try {
      const payload = {
        idempotency_key: idempotencyKey,
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer?.name || 'Walk-in Customer',
        customer_phone: selectedCustomer?.phone || null,
        payment_method: paymentMethod,
        items: cartItems.map((item) => ({
          product_id: item.product_id,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.line_discount,
          gst_rate: item.gst_rate,
        })),
        subtotal_amount: calculations.subtotal,
        discount_amount: calculations.totalSavings,
        tax_amount: calculations.totalGst,
        total_amount: calculations.grandTotal,
        amount_received: Number(amountReceived) || calculations.grandTotal,
        notes: notes.trim(),
      };

      const res = await api.post('/sales', payload);
      const saleRecord = res.data || res.sale || res;

      // Attach items & customer details for the preview
      saleRecord.items = payload.items;
      saleRecord.customer_name = payload.customer_name;
      saleRecord.customer_phone = payload.customer_phone;
      saleRecord.subtotal_amount = payload.subtotal_amount;
      saleRecord.discount_amount = payload.discount_amount;
      saleRecord.tax_amount = payload.tax_amount;
      saleRecord.total_amount = payload.total_amount;
      saleRecord.payment_method = payload.payment_method;

      setCompletedSale(saleRecord);
      setShowConfirmModal(false);
      success(t('pos.saleSuccess'));

      // Deduct local product stock immediately for seamless UX
      setProducts((prev) =>
        prev.map((p) => {
          const inCart = cartItems.find((c) => c.product_id === p.id);
          if (inCart) {
            const currentStock = Number(p.stock_quantity ?? p.stock ?? 0);
            return {
              ...p,
              stock_quantity: Math.max(0, currentStock - inCart.quantity),
            };
          }
          return p;
        })
      );

      // Reset cart and generate new idempotency key
      setCartItems([]);
      setBillDiscountValue(0);
      setAmountReceived('');
      setNotes('');
      setSelectedCustomer(null);
      setIdempotencyKey(uuidv4());
    } catch (err) {
      toastError(err.message || 'Error completing transaction');
    } finally {
      setProcessingSale(false);
    }
  };

  const changeDue = Math.max(
    0,
    (Number(amountReceived) || 0) - calculations.grandTotal
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-6rem)]">
      {/* LEFT PANEL: Products Catalog (7 cols) */}
      <div className="lg:col-span-7 flex flex-col h-full overflow-hidden rounded-3xl glass-card p-5">
        {/* Search & Categories Bar */}
        <div className="space-y-3.5 mb-4 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('pos.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-navy-900/60 dark:bg-navy-900/60 light:bg-gray-100 border border-navy-700/80 dark:border-navy-700/80 light:border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-gray-100"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                    : 'bg-navy-800/80 hover:bg-navy-700 text-gray-400 hover:text-white border border-navy-700'
                }`}
              >
                {cat === 'All' ? t('pos.allCategories') : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loadingProducts ? (
            <div className="h-full flex items-center justify-center">
              <LoadingSpinner text="Loading products catalog..." />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="p-4 rounded-2xl bg-navy-800 border border-navy-700 text-gray-400 mb-3">
                <Search className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-semibold text-gray-200">No matching products</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                Try searching by different name or barcode, or select "All Categories".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((p) => {
                const stock = Number(p.stock_quantity ?? p.stock ?? 0);
                const isOutOfStock = stock <= 0;
                const inCart = cartItems.find((c) => c.product_id === p.id);

                return (
                  <div
                    key={p.id}
                    onClick={() => !isOutOfStock && addToCart(p)}
                    className={`group relative p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                      isOutOfStock
                        ? 'opacity-50 cursor-not-allowed bg-navy-900/40 border-navy-800'
                        : 'cursor-pointer bg-navy-800/70 hover:bg-navy-800 hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-600/10 border-navy-700'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono text-gray-400 truncate max-w-[80px]">
                          {p.sku || 'SKU'}
                        </span>
                        <Badge
                          variant={isOutOfStock ? 'danger' : stock < 10 ? 'warning' : 'success'}
                          size="sm"
                        >
                          {isOutOfStock ? 'Out' : `${stock} left`}
                        </Badge>
                      </div>

                      {/* Product Name */}
                      <h4 className="text-xs font-bold text-gray-100 group-hover:text-violet-400 transition-colors line-clamp-2 leading-snug">
                        {p.name}
                      </h4>

                      {p.category && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{p.category}</p>
                      )}
                    </div>

                    {/* Bottom Price & Add Indicator */}
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-navy-700/60">
                      <div>
                        <span className="text-xs font-black text-white">
                          {formatCurrency(p.selling_price || p.price)}
                        </span>
                        {p.gst_rate > 0 && (
                          <span className="text-[9px] text-gray-400 block">
                            +{p.gst_rate}% GST
                          </span>
                        )}
                      </div>

                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          inCart
                            ? 'bg-violet-600 text-white font-bold text-xs'
                            : 'bg-navy-700 text-gray-300 group-hover:bg-violet-600 group-hover:text-white'
                        }`}
                      >
                        {inCart ? inCart.quantity : <Plus className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Cart & Billing Breakdown (5 cols) */}
      <div className="lg:col-span-5 flex flex-col h-full overflow-hidden rounded-3xl glass-card border border-navy-700/90 p-5 bg-navy-850">
        {/* Header with Customer Selector & Clear Bill */}
        <div className="pb-3 border-b border-navy-700/80 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-violet-400" />
              <h3 className="font-bold text-base text-white">{t('pos.cart')}</h3>
              <Badge variant="violet" size="sm">
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)} items
              </Badge>
            </div>
            {cartItems.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('pos.clearCart')}
              </button>
            )}
          </div>

          {/* Customer Selection Row */}
          <div className="flex items-center gap-2">
            <select
              value={selectedCustomer?.id || ''}
              onChange={(e) => {
                const found = customers.find((c) => String(c.id) === e.target.value);
                setSelectedCustomer(found || null);
              }}
              className="flex-1 py-1.5 px-3 rounded-xl bg-navy-900 border border-navy-700 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="">{t('pos.walkInCustomer')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone || 'No phone'})
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              icon={UserPlus}
              onClick={() => setShowQuickAddCustomer(true)}
              title="Add Customer"
            />
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
              <div className="p-3 rounded-2xl bg-navy-900 border border-navy-800 text-gray-500 mb-2">
                <Receipt className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-gray-300">{t('pos.emptyCart')}</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                {t('pos.cartEmptyDesc')}
              </p>
            </div>
          ) : (
            cartItems.map((item) => {
              const lineTotal = item.quantity * item.unit_price - item.line_discount;
              return (
                <div
                  key={item.product_id}
                  className="p-3 rounded-xl bg-navy-900/80 border border-navy-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-100 truncate">{item.name}</p>
                    <div className="flex items-center gap-2 text-gray-400 mt-0.5">
                      <span>{formatCurrency(item.unit_price)} each</span>
                      <span>·</span>
                      <span className="text-cyan-400">{item.gst_rate}% GST</span>
                    </div>
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-1.5 bg-navy-800 p-1 rounded-lg border border-navy-700 shrink-0">
                    <button
                      onClick={() => updateQuantity(item.product_id, -1)}
                      className="p-1 hover:bg-navy-700 rounded text-gray-300 hover:text-white"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center font-bold text-white text-xs">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product_id, 1)}
                      className="p-1 hover:bg-navy-700 rounded text-gray-300 hover:text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Item Total & Delete */}
                  <div className="text-right shrink-0 min-w-[70px]">
                    <p className="font-bold text-gray-100">
                      {formatCurrency(lineTotal)}
                    </p>
                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-[10px] text-rose-400 hover:text-rose-300 mt-0.5"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Calculation & Checkout Footer */}
        <div className="pt-3 border-t border-navy-700/80 shrink-0 space-y-3">
          {/* Bill-level discount toggle */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-400">{t('pos.billDiscount')}:</span>
            <div className="flex items-center gap-1">
              <select
                value={billDiscountType}
                onChange={(e) => setBillDiscountType(e.target.value)}
                className="py-1 px-2 rounded-lg bg-navy-900 border border-navy-700 text-xs text-gray-300"
              >
                <option value="fixed">₹ Fixed</option>
                <option value="percent">% Off</option>
              </select>
              <input
                type="number"
                min="0"
                value={billDiscountValue}
                onChange={(e) => setBillDiscountValue(e.target.value)}
                className="w-20 py-1 px-2 rounded-lg bg-navy-900 border border-navy-700 text-xs text-right text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                placeholder="0"
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'cash', label: t('common.cash'), icon: Banknote },
              { id: 'upi', label: t('common.upi'), icon: QrCode },
              { id: 'card', label: t('common.card'), icon: CreditCard },
            ].map((pm) => (
              <button
                key={pm.id}
                type="button"
                onClick={() => setPaymentMethod(pm.id)}
                className={`py-2 px-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  paymentMethod === pm.id
                    ? 'bg-violet-600/20 border-violet-500 text-white shadow-sm'
                    : 'bg-navy-900/60 border-navy-700 text-gray-400 hover:bg-navy-800'
                }`}
              >
                <pm.icon className="w-4 h-4 text-violet-400" />
                <span className="text-[10px] font-semibold">{pm.label}</span>
              </button>
            ))}
          </div>

          {/* Totals Summary */}
          <div className="space-y-1.5 text-xs text-gray-400 bg-navy-900/60 p-3 rounded-2xl border border-navy-800">
            <div className="flex justify-between">
              <span>{t('common.subtotal')}:</span>
              <span className="text-gray-200 font-mono">
                {formatCurrency(calculations.subtotal)}
              </span>
            </div>
            {calculations.totalSavings > 0 && (
              <div className="flex justify-between text-rose-400">
                <span>{t('common.discount')}:</span>
                <span className="font-mono">
                  -{formatCurrency(calculations.totalSavings)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>{t('pos.taxableAmount')}:</span>
              <span className="text-gray-200 font-mono">
                {formatCurrency(calculations.netTaxable)}
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-400">
              <span>CGST / SGST (50:50):</span>
              <span className="font-mono">
                {formatCurrency(calculations.cgst)} + {formatCurrency(calculations.sgst)}
              </span>
            </div>
            <div className="pt-2 border-t border-navy-700 flex justify-between items-center text-sm font-bold text-white">
              <span>{t('pos.grandTotal')}:</span>
              <span className="text-lg text-emerald-400 font-black font-mono">
                {formatCurrency(calculations.grandTotal)}
              </span>
            </div>
          </div>

          {/* Complete Sale Button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full text-base font-bold shadow-xl shadow-violet-600/30"
            disabled={cartItems.length === 0}
            onClick={() => setShowConfirmModal(true)}
          >
            {t('pos.completeSale')} ({formatCurrency(calculations.grandTotal)})
          </Button>
        </div>
      </div>

      {/* CONFIRMATION / CASH RETURN MODAL */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Complete Transaction"
        subtitle={`Total bill payable: ${formatCurrency(calculations.grandTotal)}`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowConfirmModal(false)}
              disabled={processingSale}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCompleteSale}
              isLoading={processingSale}
              icon={CheckCircle}
            >
              Confirm &amp; Issue Invoice
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="p-3 rounded-xl bg-violet-600/10 border border-violet-500/20 text-xs text-violet-300 flex items-center justify-between">
            <span>Payment Method:</span>
            <span className="font-bold uppercase text-white">{paymentMethod}</span>
          </div>

          {paymentMethod === 'cash' && (
            <div className="space-y-3">
              <Input
                label={t('pos.amountReceived')}
                type="number"
                placeholder="Enter cash tendered (₹)"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                autoFocus
              />
              {Number(amountReceived) > 0 && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-300">
                    {t('pos.changeDue')}:
                  </span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    {formatCurrency(changeDue)}
                  </span>
                </div>
              )}
            </div>
          )}

          <Input
            label="Invoice Notes (Optional)"
            placeholder="Warranty notes, PO number or remarks..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Modal>

      {/* QUICK ADD CUSTOMER MODAL */}
      <Modal
        isOpen={showQuickAddCustomer}
        onClose={() => setShowQuickAddCustomer(false)}
        title="Quick Add Customer"
        subtitle="Save customer details for billing & loyalty"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowQuickAddCustomer(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleQuickAddCustomer}
              isLoading={savingCustomer}
            >
              Save Customer
            </Button>
          </>
        }
      >
        <form onSubmit={handleQuickAddCustomer} className="space-y-3">
          <Input
            label="Customer Full Name *"
            placeholder="e.g. Ramesh Patel"
            value={newCustomer.name}
            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            required
            autoFocus
          />
          <Input
            label="Phone Number *"
            placeholder="+91 98765 43210"
            value={newCustomer.phone}
            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            required
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="customer@example.com"
            value={newCustomer.email}
            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
          />
          <Input
            label="GSTIN (Optional)"
            placeholder="27AAAAA0000A1Z5"
            value={newCustomer.gstin}
            onChange={(e) => setNewCustomer({ ...newCustomer, gstin: e.target.value })}
          />
        </form>
      </Modal>

      {/* POST-SALE INVOICE PREVIEW MODAL */}
      {completedSale && (
        <Modal
          isOpen={!!completedSale}
          onClose={() => setCompletedSale(null)}
          title="Tax Invoice Generated"
          subtitle={`Invoice #${completedSale.invoice_number || completedSale.id}`}
          maxWidth="max-w-2xl"
          footer={
            <>
              <Button
                variant="secondary"
                icon={Printer}
                onClick={() => window.print()}
              >
                Print Invoice
              </Button>
              <Button
                variant="secondary"
                icon={Download}
                onClick={() => generateInvoicePDF(completedSale, user)}
              >
                Download PDF
              </Button>
              <Button
                variant="primary"
                onClick={() => setCompletedSale(null)}
              >
                Next Customer &rarr;
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-sm invoice-printable p-2">
            <div className="flex items-center justify-between pb-3 border-b border-navy-700">
              <div>
                <h4 className="font-bold text-white text-base">
                  {user?.shopName || 'Smart Shop Store'}
                </h4>
                <p className="text-xs text-gray-400">
                  Customer: {completedSale.customer_name || 'Walk-in Customer'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-cyan-400 block font-semibold">
                  {completedSale.invoice_number || `INV-${completedSale.id}`}
                </span>
                <span className="text-[11px] text-gray-400 uppercase">
                  Payment: {completedSale.payment_method || 'CASH'}
                </span>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-navy-700 text-gray-400 font-semibold">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">GST</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {(completedSale.items || []).map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-2 text-gray-200">{it.name}</td>
                    <td className="py-2 text-center text-gray-300">{it.quantity}</td>
                    <td className="py-2 text-right text-gray-300">
                      {formatCurrency(it.unit_price)}
                    </td>
                    <td className="py-2 text-right text-gray-400">{it.gst_rate}%</td>
                    <td className="py-2 text-right text-white font-semibold">
                      {formatCurrency(it.quantity * it.unit_price - (it.discount || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pt-3 border-t border-navy-700 space-y-1 text-xs text-right">
              <div className="text-gray-400">
                Subtotal: {formatCurrency(completedSale.subtotal_amount)}
              </div>
              {completedSale.discount_amount > 0 && (
                <div className="text-rose-400">
                  Discount: -{formatCurrency(completedSale.discount_amount)}
                </div>
              )}
              <div className="text-gray-400">
                GST Tax: {formatCurrency(completedSale.tax_amount)}
              </div>
              <div className="text-base font-black text-emerald-400 pt-1 font-mono">
                Total Paid: {formatCurrency(completedSale.total_amount)}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
