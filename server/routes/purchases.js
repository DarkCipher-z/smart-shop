// server/routes/purchases.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { tenantContext, getShopFilter } = require('../middleware/tenant');
const { getISTTimestamp, getISTDate, getISTCompactDate } = require('../utils/date');
const { logAudit } = require('../utils/audit');

router.use(verifyToken);
router.use(tenantContext);

/**
 * Generates next sequential purchase order number for a shop
 * Format: PO-{PREFIX}-{YYYYMMDD}-{NNNN}
 */
function generatePurchaseNumber(shopId, prefix) {
  const cleanPrefix = (prefix || 'PO').toUpperCase().trim();
  const dateCompact = getISTCompactDate();
  const pattern = `PO-${cleanPrefix}-${dateCompact}-%`;

  const lastPurchase = db.prepare(`
    SELECT purchase_number 
    FROM purchases 
    WHERE shop_id = ? AND purchase_number LIKE ?
    ORDER BY id DESC 
    LIMIT 1
  `).get(shopId, pattern);

  let seq = 1;
  if (lastPurchase && lastPurchase.purchase_number) {
    const parts = lastPurchase.purchase_number.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return `PO-${cleanPrefix}-${dateCompact}-${String(seq).padStart(4, '0')}`;
}

/**
 * POST /api/purchases
 * Records a supplier purchase order and immediately adds to product inventory
 */
router.post('/', (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID context required' });
    }

    const {
      supplier_id = null,
      items,
      payment_status = 'PAID',
      notes = null,
      transaction_date
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Purchase must contain at least one item' });
    }

    const shop = db.prepare('SELECT invoice_prefix, code FROM shops WHERE id = ?').get(shopId);
    const prefix = shop ? (shop.invoice_prefix || shop.code || 'PO') : 'PO';

    const now = getISTTimestamp();
    const purchaseDate = transaction_date || getISTDate();

    const purchaseTx = db.transaction(() => {
      const purchaseNumber = generatePurchaseNumber(shopId, prefix);

      let subtotal = 0;
      let totalTax = 0;
      let grandTotal = 0;

      const processedItems = [];

      for (const item of items) {
        const productId = parseInt(item.product_id, 10);
        const qty = parseFloat(item.quantity);
        const unitPrice = parseFloat(item.unit_price);
        const gstRate = parseFloat(item.gst_rate) || 0;

        if (isNaN(productId) || isNaN(qty) || qty <= 0 || isNaN(unitPrice) || unitPrice < 0) {
          throw new Error(`Invalid item entry: Product ID ${item.product_id}, Qty ${item.quantity}, Price ${item.unit_price}`);
        }

        const product = db.prepare('SELECT id, sku, name FROM products WHERE id = ? AND shop_id = ?').get(productId, shopId);
        if (!product) {
          throw new Error(`Product ID ${productId} not found in this shop`);
        }

        const itemSubtotal = unitPrice * qty;
        const itemTax = itemSubtotal * (gstRate / 100);
        const itemTotal = itemSubtotal + itemTax;

        subtotal += itemSubtotal;
        totalTax += itemTax;
        grandTotal += itemTotal;

        processedItems.push({
          product_id: product.id,
          product_name: product.name,
          product_sku: product.sku,
          unit_price: unitPrice,
          quantity: qty,
          gst_rate: gstRate,
          total_amount: Math.round(itemTotal * 100) / 100
        });

        // Increase inventory and optionally update purchase cost
        db.prepare(`
          UPDATE products 
          SET current_stock = current_stock + ?,
              purchase_cost = ?,
              updated_at = ?
          WHERE id = ?
        `).run(qty, unitPrice, now, product.id);
      }

      // Insert Purchase Header
      const purchaseInsert = db.prepare(`
        INSERT INTO purchases (
          shop_id, purchase_number, supplier_id, transaction_date, subtotal_amount,
          tax_amount, total_amount, payment_status, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        shopId,
        purchaseNumber,
        supplier_id ? parseInt(supplier_id, 10) : null,
        purchaseDate,
        Math.round(subtotal * 100) / 100,
        Math.round(totalTax * 100) / 100,
        Math.round(grandTotal * 100) / 100,
        (payment_status || 'PAID').toUpperCase(),
        notes || null,
        req.user.id,
        now
      );

      const purchaseId = purchaseInsert.lastInsertRowid;

      // Insert Purchase Items & Stock Movements
      const insertItemStmt = db.prepare(`
        INSERT INTO purchase_items (
          purchase_id, product_id, product_name, product_sku, unit_price, quantity, gst_rate, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMovementStmt = db.prepare(`
        INSERT INTO stock_movements (
          shop_id, product_id, movement_type, quantity, reference_id, notes, created_at
        ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?)
      `);

      for (const pi of processedItems) {
        insertItemStmt.run(
          purchaseId,
          pi.product_id,
          pi.product_name,
          pi.product_sku,
          pi.unit_price,
          pi.quantity,
          pi.gst_rate,
          pi.total_amount
        );

        insertMovementStmt.run(
          shopId,
          pi.product_id,
          pi.quantity,
          purchaseId,
          `Purchase Order ${purchaseNumber}`,
          now
        );
      }

      return { purchaseId, purchaseNumber };
    });

    const { purchaseId, purchaseNumber } = purchaseTx();

    const created = db.prepare(`
      SELECT p.*, s.name as supplier_name, u.full_name as created_by_name
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(purchaseId);

    const itemsRes = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(purchaseId);

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'CREATE_PURCHASE',
      entity_name: 'purchases',
      entity_id: purchaseId,
      new_values: { purchaseNumber, total_amount: created.total_amount }
    });

    return res.status(201).json({
      message: 'Purchase recorded and stock added successfully',
      purchase: created,
      items: itemsRes
    });
  } catch (err) {
    console.error('Create purchase error:', err);
    return res.status(400).json({ error: err.message || 'Failed to record purchase' });
  }
});

/**
 * GET /api/purchases
 * List purchases with filters and pagination
 */
router.get('/', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const {
      start_date,
      end_date,
      supplier_id,
      search,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (shopId) {
      conditions.push('p.shop_id = ?');
      params.push(shopId);
    }
    if (start_date) {
      conditions.push('p.transaction_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('p.transaction_date <= ?');
      params.push(end_date);
    }
    if (supplier_id) {
      conditions.push('p.supplier_id = ?');
      params.push(parseInt(supplier_id, 10));
    }
    if (search && search.trim()) {
      conditions.push('(p.purchase_number LIKE ? OR s.name LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(p.total_amount), 0) as total_spent
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ${whereClause}
    `).get(...params);

    const total = countRes ? countRes.total : 0;

    const query = `
      SELECT p.*, s.name as supplier_name, s.phone as supplier_phone,
             u.full_name as created_by_name, sh.name as shop_name,
             (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as item_count
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN shops sh ON p.shop_id = sh.id
      ${whereClause}
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `;

    const purchases = db.prepare(query).all(...params, limitNum, offset);

    return res.json({
      purchases,
      total_spent: countRes ? countRes.total_spent : 0,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('List purchases error:', err);
    return res.status(500).json({ error: 'Failed to retrieve purchases' });
  }
});

/**
 * GET /api/purchases/:id
 * Retrieve a single purchase record with items
 */
router.get('/:id', (req, res) => {
  try {
    const purchaseId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND p.shop_id = ?' : '';
    const params = [purchaseId];
    if (shopId) params.push(shopId);

    const query = `
      SELECT p.*, s.name as supplier_name, s.phone as supplier_phone, s.email as supplier_email,
             s.address as supplier_address, s.gstin as supplier_gstin,
             u.full_name as created_by_name, sh.name as shop_name
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN shops sh ON p.shop_id = sh.id
      WHERE p.id = ? ${shopClause}
    `;

    const purchase = db.prepare(query).get(...params);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }

    const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(purchaseId);

    return res.json({
      purchase,
      items
    });
  } catch (err) {
    console.error('Get purchase error:', err);
    return res.status(500).json({ error: 'Failed to retrieve purchase details' });
  }
});

module.exports = router;
