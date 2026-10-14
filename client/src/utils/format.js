/**
 * Format numbers into Indian Rupee currency string: ₹1,23,456.78
 */
export function formatCurrency(amount) {
  const num = Number(amount);
  if (isNaN(num)) return '₹0.00';

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const parts = absNum.toFixed(2).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  // Indian numbering: last 3 digits, then groups of 2 digits
  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);

  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  return `${isNegative ? '-' : ''}₹${formattedInt}.${decimalPart}`;
}

/**
 * Format date to DD/MM/YYYY
 */
export function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '—';
  }
}

/**
 * Format date and time to DD/MM/YYYY HH:mm
 */
export function formatDateTime(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return '—';
  }
}

/**
 * Get product stock status: 'expired', 'expiring_soon', 'out_of_stock', 'low_stock', 'in_stock'
 */
export function getStockStatus(product) {
  if (!product) return 'in_stock';

  const stock = Number(product.stock_quantity ?? product.stock ?? 0);
  const minStock = Number(product.min_stock_level ?? product.min_stock ?? 5);

  // Check expiry first
  if (product.expiry_date) {
    const expiry = new Date(product.expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'expiring_soon';
  }

  if (stock <= 0) return 'out_of_stock';
  if (stock <= minStock) return 'low_stock';
  return 'in_stock';
}

/**
 * Get styling classes for stock status
 */
export function getStockStatusColor(status) {
  switch (status) {
    case 'expired':
      return {
        bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        badge: 'bg-rose-900/40 text-rose-300 border-rose-700/50',
        dot: 'bg-rose-500',
        label: 'Expired',
      };
    case 'expiring_soon':
      return {
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        badge: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
        dot: 'bg-amber-500',
        label: 'Expiring Soon',
      };
    case 'out_of_stock':
      return {
        bg: 'bg-red-500/10 text-red-400 border-red-500/20',
        badge: 'bg-red-900/40 text-red-300 border-red-700/50',
        dot: 'bg-red-500',
        label: 'Out of Stock',
      };
    case 'low_stock':
      return {
        bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
        dot: 'bg-yellow-500',
        label: 'Low Stock',
      };
    case 'in_stock':
    default:
      return {
        bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        badge: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
        dot: 'bg-emerald-500',
        label: 'In Stock',
      };
  }
}
