// server/routes/reports.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { tenantContext, getShopFilter } = require('../middleware/tenant');

router.use(verifyToken);
router.use(tenantContext);

/**
 * GET /api/reports/sales-summary
 * Summary metrics: revenue, order count, average order value, tax, discounts
 */
router.get('/sales-summary', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { start_date, end_date } = req.query;

    const conditions = ["s.status = 'COMPLETED'"];
    const params = [];

    if (shopId) {
      conditions.push('s.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('s.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('s.transaction_date <= ?');
      params.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        COUNT(s.id) as total_orders,
        COALESCE(SUM(s.total_amount), 0) as total_revenue,
        COALESCE(SUM(s.subtotal_amount), 0) as subtotal_amount,
        COALESCE(SUM(s.discount_amount), 0) as total_discounts,
        COALESCE(SUM(s.taxable_amount), 0) as total_taxable,
        COALESCE(SUM(s.cgst_amount), 0) as total_cgst,
        COALESCE(SUM(s.sgst_amount), 0) as total_sgst,
        COALESCE(SUM(s.igst_amount), 0) as total_igst,
        COALESCE(SUM(s.cgst_amount + s.sgst_amount + s.igst_amount), 0) as total_tax
      FROM sales s
      ${whereClause}
    `;

    const summary = db.prepare(query).get(...params);

    const totalOrders = summary.total_orders || 0;
    const totalRevenue = summary.total_revenue || 0;
    const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

    // Also get cancelled count
    const cancelConditions = ["s.status = 'CANCELLED'"];
    const cancelParams = [];
    if (shopId) {
      cancelConditions.push('s.shop_id = ?');
      cancelParams.push(shopId);
    }
    if (start_date) {
      cancelConditions.push('s.transaction_date >= ?');
      cancelParams.push(start_date);
    }
    if (end_date) {
      cancelConditions.push('s.transaction_date <= ?');
      cancelParams.push(end_date);
    }

    const cancelledRes = db.prepare(`
      SELECT COUNT(*) as cancelled_count, COALESCE(SUM(total_amount), 0) as cancelled_amount
      FROM sales s
      WHERE ${cancelConditions.join(' AND ')}
    `).get(...cancelParams);

    return res.json({
      total_orders: totalOrders,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      subtotal_amount: Math.round(summary.subtotal_amount * 100) / 100,
      avg_order_value: Math.round(avgOrderValue * 100) / 100,
      total_discounts: Math.round(summary.total_discounts * 100) / 100,
      total_taxable: Math.round(summary.total_taxable * 100) / 100,
      total_tax: Math.round(summary.total_tax * 100) / 100,
      total_cgst: Math.round(summary.total_cgst * 100) / 100,
      total_sgst: Math.round(summary.total_sgst * 100) / 100,
      total_igst: Math.round(summary.total_igst * 100) / 100,
      cancelled_orders: cancelledRes ? cancelledRes.cancelled_count : 0,
      cancelled_amount: cancelledRes ? Math.round(cancelledRes.cancelled_amount * 100) / 100 : 0
    });
  } catch (err) {
    console.error('Sales summary report error:', err);
    return res.status(500).json({ error: 'Failed to generate sales summary report' });
  }
});

/**
 * GET /api/reports/profit
 * Gross profit = SUM(sale_items.total_amount) - SUM(sale_items.purchase_cost_snapshot * sale_items.quantity)
 */
router.get('/profit', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { start_date, end_date } = req.query;

    const conditions = ["s.status = 'COMPLETED'"];
    const params = [];

    if (shopId) {
      conditions.push('s.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('s.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('s.transaction_date <= ?');
      params.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        COALESCE(SUM(si.total_amount), 0) as total_sales,
        COALESCE(SUM(COALESCE(si.purchase_cost_snapshot, 0) * si.quantity), 0) as total_cogs,
        COALESCE(SUM(si.quantity), 0) as total_quantity_sold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${whereClause}
    `;

    const result = db.prepare(query).get(...params);

    const totalSales = result.total_sales || 0;
    const totalCogs = result.total_cogs || 0;
    const grossProfit = totalSales - totalCogs;
    const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    return res.json({
      total_sales: Math.round(totalSales * 100) / 100,
      total_cogs: Math.round(totalCogs * 100) / 100,
      gross_profit: Math.round(grossProfit * 100) / 100,
      profit_margin_pct: Math.round(profitMargin * 100) / 100,
      total_quantity_sold: result.total_quantity_sold || 0
    });
  } catch (err) {
    console.error('Profit report error:', err);
    return res.status(500).json({ error: 'Failed to generate profit report' });
  }
});

/**
 * GET /api/reports/product-wise
 * Product-level sales breakdown, volume, revenue, profit
 */
router.get('/product-wise', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { start_date, end_date, limit = 50, sort_by = 'revenue' } = req.query;

    const conditions = ["s.status = 'COMPLETED'"];
    const params = [];

    if (shopId) {
      conditions.push('s.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('s.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('s.transaction_date <= ?');
      params.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10)));

    let orderByClause = 'total_revenue DESC';
    if (sort_by === 'quantity') orderByClause = 'total_quantity DESC';
    if (sort_by === 'profit') orderByClause = 'gross_profit DESC';
    if (sort_by === 'name') orderByClause = 'product_name ASC';

    const query = `
      SELECT 
        si.product_id,
        si.product_name,
        si.product_sku,
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(si.quantity) as total_quantity,
        SUM(si.total_amount) as total_revenue,
        SUM(COALESCE(si.purchase_cost_snapshot, 0) * si.quantity) as total_cogs,
        SUM(si.total_amount - (COALESCE(si.purchase_cost_snapshot, 0) * si.quantity)) as gross_profit,
        AVG(si.unit_price) as avg_selling_price
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      GROUP BY si.product_id, si.product_name, si.product_sku
      ORDER BY ${orderByClause}
      LIMIT ?
    `;

    const products = db.prepare(query).all(...params, limitNum);

    return res.json({
      products: products.map(p => ({
        ...p,
        total_revenue: Math.round(p.total_revenue * 100) / 100,
        total_cogs: Math.round(p.total_cogs * 100) / 100,
        gross_profit: Math.round(p.gross_profit * 100) / 100,
        profit_margin_pct: p.total_revenue > 0 ? Math.round(((p.gross_profit / p.total_revenue) * 100) * 100) / 100 : 0
      }))
    });
  } catch (err) {
    console.error('Product-wise report error:', err);
    return res.status(500).json({ error: 'Failed to generate product-wise report' });
  }
});

/**
 * GET /api/reports/category-wise
 * Category-level sales and profit aggregation
 */
router.get('/category-wise', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { start_date, end_date } = req.query;

    const conditions = ["s.status = 'COMPLETED'"];
    const params = [];

    if (shopId) {
      conditions.push('s.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('s.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('s.transaction_date <= ?');
      params.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        COALESCE(c.id, 0) as category_id,
        COALESCE(c.name, 'Uncategorized') as category_name,
        COUNT(DISTINCT si.sale_id) as orders_count,
        SUM(si.quantity) as total_quantity,
        SUM(si.total_amount) as total_revenue,
        SUM(COALESCE(si.purchase_cost_snapshot, 0) * si.quantity) as total_cogs,
        SUM(si.total_amount - (COALESCE(si.purchase_cost_snapshot, 0) * si.quantity)) as gross_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      GROUP BY category_id, category_name
      ORDER BY total_revenue DESC
    `;

    const categories = db.prepare(query).all(...params);

    return res.json({
      categories: categories.map(cat => ({
        ...cat,
        total_revenue: Math.round(cat.total_revenue * 100) / 100,
        total_cogs: Math.round(cat.total_cogs * 100) / 100,
        gross_profit: Math.round(cat.gross_profit * 100) / 100,
        margin_pct: cat.total_revenue > 0 ? Math.round(((cat.gross_profit / cat.total_revenue) * 100) * 100) / 100 : 0
      }))
    });
  } catch (err) {
    console.error('Category-wise report error:', err);
    return res.status(500).json({ error: 'Failed to generate category-wise report' });
  }
});

/**
 * GET /api/reports/stock-movement
 * Complete stock movements journal with filters
 */
router.get('/stock-movement', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { product_id, movement_type, start_date, end_date, page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (shopId) {
      conditions.push('sm.shop_id = ?');
      params.push(shopId);
    }
    if (product_id) {
      conditions.push('sm.product_id = ?');
      params.push(parseInt(product_id, 10));
    }
    if (movement_type) {
      conditions.push('sm.movement_type = ?');
      params.push(movement_type.toUpperCase());
    }
    if (start_date) {
      conditions.push('sm.created_at >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('sm.created_at <= ?');
      params.push(end_date + 'T23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = db.prepare(`SELECT COUNT(*) as total FROM stock_movements sm ${whereClause}`).get(...params);
    const total = countRes ? countRes.total : 0;

    const query = `
      SELECT sm.*, p.name as product_name, p.sku as product_sku, p.unit_of_measure,
             sh.name as shop_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN shops sh ON sm.shop_id = sh.id
      ${whereClause}
      ORDER BY sm.id DESC
      LIMIT ? OFFSET ?
    `;

    const movements = db.prepare(query).all(...params, limitNum, offset);

    return res.json({
      movements,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Stock movement report error:', err);
    return res.status(500).json({ error: 'Failed to generate stock movement report' });
  }
});

/**
 * GET /api/reports/inventory-valuation
 * Total stock * purchase cost and selling price valuations
 */
router.get('/inventory-valuation', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND p.shop_id = ?' : '';
    const params = shopId ? [shopId] : [];

    const summaryQuery = `
      SELECT 
        COUNT(p.id) as total_products,
        COALESCE(SUM(p.current_stock), 0) as total_stock_units,
        COALESCE(SUM(p.current_stock * p.purchase_cost), 0) as total_purchase_value,
        COALESCE(SUM(p.current_stock * p.selling_price), 0) as total_retail_value,
        COUNT(CASE WHEN p.current_stock <= p.min_stock_threshold THEN 1 END) as low_stock_items,
        COUNT(CASE WHEN p.current_stock <= 0 THEN 1 END) as out_of_stock_items
      FROM products p
      WHERE p.is_archived = 0 ${shopClause}
    `;

    const summary = db.prepare(summaryQuery).get(...params);

    const purchaseVal = summary.total_purchase_value || 0;
    const retailVal = summary.total_retail_value || 0;
    const potentialProfit = retailVal - purchaseVal;

    // Detailed inventory by category
    const categoryBreakdown = db.prepare(`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category_name,
        COUNT(p.id) as product_count,
        SUM(p.current_stock) as stock_quantity,
        SUM(p.current_stock * p.purchase_cost) as purchase_value,
        SUM(p.current_stock * p.selling_price) as retail_value
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_archived = 0 ${shopClause}
      GROUP BY category_name
      ORDER BY purchase_value DESC
    `).all(...params);

    return res.json({
      summary: {
        total_products: summary.total_products,
        total_stock_units: summary.total_stock_units,
        total_purchase_valuation: Math.round(purchaseVal * 100) / 100,
        total_retail_valuation: Math.round(retailVal * 100) / 100,
        potential_profit: Math.round(potentialProfit * 100) / 100,
        potential_margin_pct: retailVal > 0 ? Math.round(((potentialProfit / retailVal) * 100) * 100) / 100 : 0,
        low_stock_items: summary.low_stock_items,
        out_of_stock_items: summary.out_of_stock_items
      },
      category_breakdown: categoryBreakdown.map(c => ({
        ...c,
        purchase_value: Math.round(c.purchase_value * 100) / 100,
        retail_value: Math.round(c.retail_value * 100) / 100
      }))
    });
  } catch (err) {
    console.error('Inventory valuation report error:', err);
    return res.status(500).json({ error: 'Failed to generate inventory valuation report' });
  }
});

/**
 * GET /api/reports/tax-ledger
 * GST breakdown by tax slab (0%, 5%, 12%, 18%, 28%)
 */
router.get('/tax-ledger', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { start_date, end_date } = req.query;

    const conditions = ["s.status = 'COMPLETED'"];
    const params = [];

    if (shopId) {
      conditions.push('s.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('s.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('s.transaction_date <= ?');
      params.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        si.gst_rate,
        COUNT(DISTINCT si.sale_id) as transaction_count,
        COALESCE(SUM(si.taxable_amount), 0) as total_taxable,
        COALESCE(SUM(si.cgst_amount), 0) as total_cgst,
        COALESCE(SUM(si.sgst_amount), 0) as total_sgst,
        COALESCE(SUM(si.cgst_amount + si.sgst_amount), 0) as total_tax,
        COALESCE(SUM(si.total_amount), 0) as total_gross
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${whereClause}
      GROUP BY si.gst_rate
      ORDER BY si.gst_rate ASC
    `;

    const slabs = db.prepare(query).all(...params);

    let sumTaxable = 0;
    let sumCgst = 0;
    let sumSgst = 0;
    let sumTax = 0;
    let sumGross = 0;

    slabs.forEach(slab => {
      sumTaxable += slab.total_taxable;
      sumCgst += slab.total_cgst;
      sumSgst += slab.total_sgst;
      sumTax += slab.total_tax;
      sumGross += slab.total_gross;
    });

    return res.json({
      slabs: slabs.map(s => ({
        ...s,
        total_taxable: Math.round(s.total_taxable * 100) / 100,
        total_cgst: Math.round(s.total_cgst * 100) / 100,
        total_sgst: Math.round(s.total_sgst * 100) / 100,
        total_tax: Math.round(s.total_tax * 100) / 100,
        total_gross: Math.round(s.total_gross * 100) / 100
      })),
      totals: {
        total_taxable: Math.round(sumTaxable * 100) / 100,
        total_cgst: Math.round(sumCgst * 100) / 100,
        total_sgst: Math.round(sumSgst * 100) / 100,
        total_igst: 0,
        total_tax: Math.round(sumTax * 100) / 100,
        total_gross: Math.round(sumGross * 100) / 100
      }
    });
  } catch (err) {
    console.error('Tax ledger report error:', err);
    return res.status(500).json({ error: 'Failed to generate tax ledger' });
  }
});

/**
 * GET /api/reports/daily-sales
 * Daily sales trends for charts and analytics
 */
router.get('/daily-sales', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { start_date, end_date, limit = 30 } = req.query;

    const conditions = ["s.status = 'COMPLETED'"];
    const params = [];

    if (shopId) {
      conditions.push('s.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('s.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('s.transaction_date <= ?');
      params.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limitNum = Math.max(1, Math.min(180, parseInt(limit, 10)));

    const query = `
      SELECT 
        s.transaction_date as date,
        COUNT(s.id) as order_count,
        COALESCE(SUM(s.total_amount), 0) as total_sales,
        COALESCE(SUM(s.subtotal_amount), 0) as subtotal,
        COALESCE(SUM(s.discount_amount), 0) as discount,
        COALESCE(SUM(s.cgst_amount + s.sgst_amount), 0) as total_tax,
        COALESCE(SUM(
          (SELECT SUM(si.total_amount - (COALESCE(si.purchase_cost_snapshot, 0) * si.quantity))
           FROM sale_items si WHERE si.sale_id = s.id)
        ), 0) as estimated_profit
      FROM sales s
      ${whereClause}
      GROUP BY s.transaction_date
      ORDER BY s.transaction_date ASC
      LIMIT ?
    `;

    const days = db.prepare(query).all(...params, limitNum);

    return res.json({
      daily_sales: days.map(d => ({
        ...d,
        total_sales: Math.round(d.total_sales * 100) / 100,
        subtotal: Math.round(d.subtotal * 100) / 100,
        discount: Math.round(d.discount * 100) / 100,
        total_tax: Math.round(d.total_tax * 100) / 100,
        estimated_profit: Math.round(d.estimated_profit * 100) / 100
      }))
    });
  } catch (err) {
    console.error('Daily sales report error:', err);
    return res.status(500).json({ error: 'Failed to generate daily sales report' });
  }
});

/**
 * GET /api/reports/top-products
 * Top selling products by volume or revenue
 */
router.get('/top-products', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { limit = 10, metric = 'revenue', start_date, end_date } = req.query;

    const conditions = ["s.status = 'COMPLETED'"];
    const params = [];

    if (shopId) {
      conditions.push('s.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('s.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('s.transaction_date <= ?');
      params.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10)));
    const sortField = metric === 'quantity' ? 'total_quantity DESC' : 'total_revenue DESC';

    const query = `
      SELECT 
        si.product_id,
        si.product_name,
        si.product_sku,
        SUM(si.quantity) as total_quantity,
        SUM(si.total_amount) as total_revenue,
        SUM(si.total_amount - (COALESCE(si.purchase_cost_snapshot, 0) * si.quantity)) as gross_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${whereClause}
      GROUP BY si.product_id, si.product_name, si.product_sku
      ORDER BY ${sortField}
      LIMIT ?
    `;

    const top = db.prepare(query).all(...params, limitNum);

    return res.json({
      top_products: top.map(p => ({
        ...p,
        total_revenue: Math.round(p.total_revenue * 100) / 100,
        gross_profit: Math.round(p.gross_profit * 100) / 100
      }))
    });
  } catch (err) {
    console.error('Top products report error:', err);
    return res.status(500).json({ error: 'Failed to generate top products report' });
  }
});

/**
 * GET /api/reports/payment-methods
 * Payment method breakdown with transaction counts and percentages
 */
router.get('/payment-methods', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { start_date, end_date } = req.query;

    const conditions = ["s.status = 'COMPLETED'"];
    const params = [];

    if (shopId) {
      conditions.push('s.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('s.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('s.transaction_date <= ?');
      params.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        s.payment_method,
        COUNT(s.id) as order_count,
        COALESCE(SUM(s.total_amount), 0) as total_amount
      FROM sales s
      ${whereClause}
      GROUP BY s.payment_method
      ORDER BY total_amount DESC
    `;

    const methods = db.prepare(query).all(...params);
    const overallRevenue = methods.reduce((acc, m) => acc + m.total_amount, 0);

    return res.json({
      total_revenue: Math.round(overallRevenue * 100) / 100,
      payment_methods: methods.map(m => ({
        payment_method: m.payment_method,
        order_count: m.order_count,
        total_amount: Math.round(m.total_amount * 100) / 100,
        percentage: overallRevenue > 0 ? Math.round(((m.total_amount / overallRevenue) * 100) * 10) / 10 : 0
      }))
    });
  } catch (err) {
    console.error('Payment methods report error:', err);
    return res.status(500).json({ error: 'Failed to generate payment methods report' });
  }
});

module.exports = router;
