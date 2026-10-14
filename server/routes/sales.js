// server/routes/sales.js
const express = require('express');
const router = express.Router();
const { stringify } = require('csv-stringify/sync');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { tenantContext, getShopFilter, checkOperatingHours } = require('../middleware/tenant');
const { getISTTimestamp, getISTDate, getISTCompactDate } = require('../utils/date');
const { logAudit } = require('../utils/audit');

router.use(verifyToken);
router.use(tenantContext);

/**
 * Generates next sequential invoice number for a shop
 * Format: {PREFIX}-{YYYYMMDD}-{NNNN}
 */
function generateInvoiceNumber(shopId, prefix) {
  const cleanPrefix = (prefix || 'INV').toUpperCase().trim();
  const dateCompact = getISTCompactDate();
  const pattern = `${cleanPrefix}-${dateCompact}-%`;

  const lastInvoice = db.prepare(`
    SELECT invoice_number 
    FROM sales 
    WHERE shop_id = ? AND invoice_number LIKE ?
    ORDER BY id DESC 
    LIMIT 1
  `).get(shopId, pattern);

  let seq = 1;
  if (lastInvoice && lastInvoice.invoice_number) {
    const parts = lastInvoice.invoice_number.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  const paddedSeq = String(seq).padStart(4, '0');
  return `${cleanPrefix}-${dateCompact}-${paddedSeq}`;
}

/**
 * Generates next sequential credit note number
 * Format: CN-{PREFIX}-{YYYYMMDD}-{NNNN}
 */
function generateCreditNoteNumber(shopId, prefix) {
  const cleanPrefix = (prefix || 'SOL').toUpperCase().trim();
  const dateCompact = getISTCompactDate();
  const pattern = `CN-${cleanPrefix}-${dateCompact}-%`;

  const lastCn = db.prepare(`
    SELECT credit_note_number 
    FROM credit_notes 
    WHERE shop_id = ? AND credit_note_number LIKE ?
    ORDER BY id DESC 
    LIMIT 1
  `).get(shopId, pattern);

  let seq = 1;
  if (lastCn && lastCn.credit_note_number) {
    const parts = lastCn.credit_note_number.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return `CN-${cleanPrefix}-${dateCompact}-${String(seq).padStart(4, '0')}`;
}

/**
 * GET /api/sales/export
 * Export sales list as CSV
 */
router.get('/export', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const { start_date, end_date, payment_method, status } = req.query;

    const conditions = [];
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
    if (payment_method) {
      conditions.push('s.payment_method = ?');
      params.push(payment_method.toUpperCase());
    }
    if (status) {
      conditions.push('s.status = ?');
      params.push(status.toUpperCase());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT s.invoice_number, s.transaction_date, c.name as customer_name, c.phone as customer_phone,
             s.subtotal_amount, s.discount_amount, s.taxable_amount, s.cgst_amount, s.sgst_amount,
             s.total_amount, s.payment_method, s.payment_status, s.status, u.full_name as billed_by,
             sh.name as shop_name, s.notes
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN shops sh ON s.shop_id = sh.id
      ${whereClause}
      ORDER BY s.id DESC
    `;

    const sales = db.prepare(query).all(...params);

    const records = sales.map(s => ({
      'Invoice Number': s.invoice_number,
      'Date': s.transaction_date,
      'Customer': s.customer_name || 'Walk-in Customer',
      'Phone': s.customer_phone || '',
      'Subtotal (₹)': s.subtotal_amount.toFixed(2),
      'Discount (₹)': s.discount_amount.toFixed(2),
      'Taxable Amount (₹)': s.taxable_amount.toFixed(2),
      'CGST (₹)': s.cgst_amount.toFixed(2),
      'SGST (₹)': s.sgst_amount.toFixed(2),
      'Total Amount (₹)': s.total_amount.toFixed(2),
      'Payment Method': s.payment_method,
      'Payment Status': s.payment_status,
      'Sale Status': s.status,
      'Billed By': s.billed_by || '',
      'Shop': s.shop_name || '',
      'Notes': s.notes || ''
    }));

    const csvData = stringify(records, { header: true });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="smartshop-sales.csv"');
    return res.send(csvData);
  } catch (err) {
    console.error('Sales export error:', err);
    return res.status(500).json({ error: 'Failed to export sales' });
  }
});

/**
 * POST /api/sales
 * Creates a complete sale with ACID transaction, inventory deduction, and GST calculations
 * Checks operating hours and idempotency key
 */
router.post('/', checkOperatingHours, (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID context required to process sale' });
    }

    const {
      customer_id = null,
      items,
      payment_method = 'CASH',
      payment_status = 'PAID',
      notes = null,
      idempotency_key = null,
      overall_discount = 0
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale must contain at least one item' });
    }

    // 1. Idempotency Check
    if (idempotency_key) {
      const existingSale = db.prepare(`
        SELECT * FROM sales WHERE shop_id = ? AND idempotency_key = ?
      `).get(shopId, idempotency_key);

      if (existingSale) {
        const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(existingSale.id);
        return res.json({
          message: 'Sale already processed (idempotent)',
          sale: existingSale,
          items: saleItems
        });
      }
    }

    // 2. Fetch Shop details for invoice prefix
    const shop = db.prepare('SELECT invoice_prefix, code FROM shops WHERE id = ?').get(shopId);
    const invoicePrefix = shop ? (shop.invoice_prefix || shop.code || 'INV') : 'INV';

    // 3. Execute Complete Sale Transaction
    const now = getISTTimestamp();
    const today = getISTDate();

    const saleTx = db.transaction(() => {
      // Generate invoice number inside transaction for row lock guarantee
      const invoiceNumber = generateInvoiceNumber(shopId, invoicePrefix);

      let subtotalAmount = 0;
      let itemsDiscount = 0;
      let taxableAmount = 0;
      let cgstAmount = 0;
      let sgstAmount = 0;
      let totalAmount = 0;

      const processedItems = [];

      // Validate products, check stock, calculate taxes
      for (const item of items) {
        const productId = parseInt(item.product_id, 10);
        const qty = parseFloat(item.quantity);

        if (isNaN(productId) || isNaN(qty) || qty <= 0) {
          throw new Error(`Invalid product ID (${item.product_id}) or quantity (${item.quantity})`);
        }

        // Lock product row for update
        const product = db.prepare(`
          SELECT id, shop_id, sku, name, purchase_cost, selling_price, gst_rate,
                 is_tax_inclusive, current_stock, is_archived
          FROM products
          WHERE id = ? AND shop_id = ?
        `).get(productId, shopId);

        if (!product) {
          throw new Error(`Product ID ${productId} not found in this shop`);
        }

        if (product.is_archived) {
          throw new Error(`Product "${product.name}" (${product.sku}) is archived and cannot be sold`);
        }

        if (product.current_stock < qty) {
          throw new Error(`Insufficient stock for "${product.name}". Available: ${product.current_stock}, Requested: ${qty}`);
        }

        const unitPrice = item.unit_price !== undefined ? parseFloat(item.unit_price) : product.selling_price;
        const lineDiscount = parseFloat(item.discount_amount) || 0;
        const gstRate = product.gst_rate || 0;
        const isTaxInclusive = product.is_tax_inclusive === 1;

        const lineGross = (unitPrice * qty) - lineDiscount;
        let itemTaxable = 0;
        let itemTax = 0;
        let itemTotal = 0;

        if (isTaxInclusive) {
          // Gross contains tax: Gross = Taxable * (1 + GST/100)
          itemTaxable = lineGross / (1 + (gstRate / 100));
          itemTax = lineGross - itemTaxable;
          itemTotal = lineGross;
        } else {
          // Exclusive tax: Tax = Taxable * (GST/100)
          itemTaxable = lineGross;
          itemTax = itemTaxable * (gstRate / 100);
          itemTotal = itemTaxable + itemTax;
        }

        const itemCgst = itemTax / 2;
        const itemSgst = itemTax / 2;

        subtotalAmount += (unitPrice * qty);
        itemsDiscount += lineDiscount;
        taxableAmount += itemTaxable;
        cgstAmount += itemCgst;
        sgstAmount += itemSgst;
        totalAmount += itemTotal;

        processedItems.push({
          product_id: product.id,
          product_name: product.name,
          product_sku: product.sku,
          unit_price: unitPrice,
          purchase_cost_snapshot: product.purchase_cost,
          quantity: qty,
          discount_amount: lineDiscount,
          gst_rate: gstRate,
          taxable_amount: Math.round(itemTaxable * 100) / 100,
          cgst_amount: Math.round(itemCgst * 100) / 100,
          sgst_amount: Math.round(itemSgst * 100) / 100,
          total_amount: Math.round(itemTotal * 100) / 100
        });

        // Deduct inventory
        db.prepare('UPDATE products SET current_stock = current_stock - ?, updated_at = ? WHERE id = ?').run(qty, now, product.id);
      }

      const totalDiscount = itemsDiscount + (parseFloat(overall_discount) || 0);
      const finalTotal = Math.round(totalAmount * 100) / 100;

      // Insert Sale
      const saleInsert = db.prepare(`
        INSERT INTO sales (
          shop_id, invoice_number, customer_id, transaction_date, subtotal_amount,
          discount_amount, taxable_amount, cgst_amount, sgst_amount, igst_amount,
          total_amount, payment_method, payment_status, status, idempotency_key,
          notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)
      `).run(
        shopId,
        invoiceNumber,
        customer_id ? parseInt(customer_id, 10) : null,
        today,
        Math.round(subtotalAmount * 100) / 100,
        Math.round(totalDiscount * 100) / 100,
        Math.round(taxableAmount * 100) / 100,
        Math.round(cgstAmount * 100) / 100,
        Math.round(sgstAmount * 100) / 100,
        finalTotal,
        (payment_method || 'CASH').toUpperCase(),
        (payment_status || 'PAID').toUpperCase(),
        idempotency_key || null,
        notes || null,
        req.user.id,
        now
      );

      const saleId = saleInsert.lastInsertRowid;

      // Insert Sale Items & Stock Movements
      const insertItemStmt = db.prepare(`
        INSERT INTO sale_items (
          sale_id, product_id, product_name, product_sku, unit_price,
          purchase_cost_snapshot, quantity, discount_amount, gst_rate,
          taxable_amount, cgst_amount, sgst_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMovementStmt = db.prepare(`
        INSERT INTO stock_movements (
          shop_id, product_id, movement_type, quantity, reference_id, notes, created_at
        ) VALUES (?, ?, 'SALE', ?, ?, ?, ?)
      `);

      for (const pi of processedItems) {
        insertItemStmt.run(
          saleId,
          pi.product_id,
          pi.product_name,
          pi.product_sku,
          pi.unit_price,
          pi.purchase_cost_snapshot,
          pi.quantity,
          pi.discount_amount,
          pi.gst_rate,
          pi.taxable_amount,
          pi.cgst_amount,
          pi.sgst_amount,
          pi.total_amount
        );

        insertMovementStmt.run(
          shopId,
          pi.product_id,
          -pi.quantity, // Negative quantity representing reduction
          saleId,
          `Sale Invoice ${invoiceNumber}`,
          now
        );
      }

      return { saleId, invoiceNumber };
    });

    const { saleId, invoiceNumber } = saleTx();

    const createdSale = db.prepare(`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, u.full_name as created_by_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?
    `).get(saleId);

    const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'CREATE_SALE',
      entity_name: 'sales',
      entity_id: saleId,
      new_values: { invoiceNumber, total_amount: createdSale.total_amount, items_count: saleItems.length }
    });

    return res.status(201).json({
      message: 'Sale completed successfully',
      sale: createdSale,
      items: saleItems
    });
  } catch (err) {
    console.error('Create sale error:', err);
    return res.status(400).json({ error: err.message || 'Failed to complete sale transaction' });
  }
});

/**
 * GET /api/sales
 * List sales with filters and pagination
 */
router.get('/', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const {
      start_date,
      end_date,
      payment_method,
      status,
      customer_id,
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
    if (payment_method) {
      conditions.push('s.payment_method = ?');
      params.push(payment_method.toUpperCase());
    }
    if (status) {
      conditions.push('s.status = ?');
      params.push(status.toUpperCase());
    }
    if (customer_id) {
      conditions.push('s.customer_id = ?');
      params.push(parseInt(customer_id, 10));
    }
    if (search && search.trim()) {
      conditions.push('(s.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(s.total_amount), 0) as total_revenue
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      ${whereClause}
    `).get(...params);

    const total = countRes ? countRes.total : 0;
    const totalRevenue = countRes ? countRes.total_revenue : 0;

    const query = `
      SELECT s.*, c.name as customer_name, c.phone as customer_phone,
             u.full_name as created_by_name, sh.name as shop_name,
             (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN shops sh ON s.shop_id = sh.id
      ${whereClause}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `;

    const sales = db.prepare(query).all(...params, limitNum, offset);

    return res.json({
      sales,
      metrics: {
        total_sales_count: total,
        total_revenue: totalRevenue
      },
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('List sales error:', err);
    return res.status(500).json({ error: 'Failed to retrieve sales' });
  }
});

/**
 * GET /api/sales/:id
 * Retrieve single sale with full items list
 */
router.get('/:id', (req, res) => {
  try {
    const saleId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND s.shop_id = ?' : '';
    const params = [saleId];
    if (shopId) params.push(shopId);

    const query = `
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
             c.address as customer_address, c.gstin as customer_gstin,
             u.full_name as created_by_name, sh.name as shop_name, sh.address as shop_address,
             sh.phone as shop_phone, sh.email as shop_email, sh.gstin as shop_gstin
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN shops sh ON s.shop_id = sh.id
      WHERE s.id = ? ${shopClause}
    `;

    const sale = db.prepare(query).get(...params);
    if (!sale) {
      return res.status(404).json({ error: 'Sale record not found' });
    }

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
    const creditNotes = db.prepare('SELECT * FROM credit_notes WHERE sale_id = ?').all(saleId);

    return res.json({
      sale,
      items,
      credit_notes: creditNotes
    });
  } catch (err) {
    console.error('Get sale error:', err);
    return res.status(500).json({ error: 'Failed to retrieve sale details' });
  }
});

/**
 * POST /api/sales/:id/cancel
 * Cancels a completed sale, issues a credit note, and restores product stock
 */
router.post('/:id/cancel', (req, res) => {
  try {
    const saleId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [saleId];
    if (shopId) params.push(shopId);

    const sale = db.prepare(`SELECT * FROM sales WHERE id = ? ${shopClause}`).get(...params);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Sale has already been cancelled' });
    }

    const { reason = 'Customer return / cancellation' } = req.body;
    const now = getISTTimestamp();

    // Get shop details for credit note prefix
    const shop = db.prepare('SELECT invoice_prefix, code FROM shops WHERE id = ?').get(sale.shop_id);
    const prefix = shop ? (shop.invoice_prefix || shop.code || 'CN') : 'CN';

    const cancelTx = db.transaction(() => {
      // 1. Generate credit note number
      const cnNumber = generateCreditNoteNumber(sale.shop_id, prefix);

      // 2. Insert Credit Note
      const cnInsert = db.prepare(`
        INSERT INTO credit_notes (shop_id, credit_note_number, sale_id, reason, total_amount, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sale.shop_id, cnNumber, sale.id, reason, sale.total_amount, req.user.id, now);

      const cnId = cnInsert.lastInsertRowid;

      // 3. Mark sale as CANCELLED
      db.prepare("UPDATE sales SET status = 'CANCELLED' WHERE id = ?").run(sale.id);

      // 4. Restore inventory for all items
      const items = db.prepare('SELECT product_id, quantity FROM sale_items WHERE sale_id = ?').all(sale.id);

      const updateStockStmt = db.prepare('UPDATE products SET current_stock = current_stock + ?, updated_at = ? WHERE id = ?');
      const insertMovementStmt = db.prepare(`
        INSERT INTO stock_movements (shop_id, product_id, movement_type, quantity, reference_id, notes, created_at)
        VALUES (?, ?, 'RETURN', ?, ?, ?, ?)
      `);

      for (const item of items) {
        if (item.product_id) {
          updateStockStmt.run(item.quantity, now, item.product_id);
          insertMovementStmt.run(
            sale.shop_id,
            item.product_id,
            item.quantity,
            cnId,
            `Cancellation of sale ${sale.invoice_number}`,
            now
          );
        }
      }

      return { cnNumber, cnId };
    });

    const { cnNumber, cnId } = cancelTx();

    logAudit(db, {
      shop_id: sale.shop_id,
      user_id: req.user.id,
      action: 'CANCEL_SALE',
      entity_name: 'sales',
      entity_id: sale.id,
      old_values: { status: 'COMPLETED' },
      new_values: { status: 'CANCELLED', credit_note_number: cnNumber, credit_note_id: cnId }
    });

    return res.json({
      message: 'Sale cancelled successfully. Stock restored and credit note generated.',
      credit_note_number: cnNumber,
      credit_note_id: cnId,
      sale_id: sale.id
    });
  } catch (err) {
    console.error('Cancel sale error:', err);
    return res.status(500).json({ error: `Failed to cancel sale: ${err.message}` });
  }
});

module.exports = router;
