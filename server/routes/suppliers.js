// server/routes/suppliers.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { tenantContext, getShopFilter } = require('../middleware/tenant');
const { getISTTimestamp } = require('../utils/date');
const { logAudit } = require('../utils/audit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(verifyToken);
router.use(tenantContext);

/**
 * GET /api/suppliers/export
 * Download suppliers directory as CSV
 */
router.get('/export', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'WHERE s.shop_id = ?' : '';
    const params = shopId ? [shopId] : [];

    const query = `
      SELECT s.name, s.phone, s.email, s.address, s.gstin, s.notes,
             sh.name as shop_name, s.created_at,
             COUNT(p.id) as total_purchases,
             COALESCE(SUM(p.total_amount), 0) as total_supplied_amount
      FROM suppliers s
      LEFT JOIN purchases p ON s.id = p.supplier_id
      LEFT JOIN shops sh ON s.shop_id = sh.id
      ${shopClause}
      GROUP BY s.id
      ORDER BY s.name ASC
    `;

    const suppliers = db.prepare(query).all(...params);

    const records = suppliers.map(s => ({
      'Supplier Name': s.name,
      'Phone': s.phone || '',
      'Email': s.email || '',
      'Address': s.address || '',
      'GSTIN': s.gstin || '',
      'Total Purchases': s.total_purchases,
      'Total Amount (₹)': s.total_supplied_amount.toFixed(2),
      'Notes': s.notes || '',
      'Shop': s.shop_name || '',
      'Created At': s.created_at
    }));

    const csvData = stringify(records, { header: true });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="smartshop-suppliers.csv"');
    return res.send(csvData);
  } catch (err) {
    console.error('Supplier export error:', err);
    return res.status(500).json({ error: 'Failed to export suppliers' });
  }
});

/**
 * POST /api/suppliers/import
 * CSV Import of suppliers with preview & execution
 */
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'A specific shop must be selected for supplier import' });
    }

    let csvContent = '';
    if (req.file) {
      csvContent = req.file.buffer.toString('utf-8');
    } else if (req.body.csvData) {
      csvContent = req.body.csvData;
    } else {
      return res.status(400).json({ error: 'No CSV file or data provided' });
    }

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file contains no valid supplier records' });
    }

    const isPreview = req.query.preview === 'true';

    const validRows = [];
    const errors = [];

    records.forEach((row, index) => {
      const rowNum = index + 2;
      const name = (row['Supplier Name'] || row['Name'] || row['name'] || '').trim();
      const phone = (row['Phone'] || row['phone'] || '').trim();
      const email = (row['Email'] || row['email'] || '').trim();
      const address = (row['Address'] || row['address'] || '').trim();
      const gstin = (row['GSTIN'] || row['gstin'] || '').trim();
      const notes = (row['Notes'] || row['notes'] || '').trim();

      if (!name) {
        errors.push({ row: rowNum, error: 'Supplier name is required' });
        return;
      }

      validRows.push({
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        gstin: gstin || null,
        notes: notes || null
      });
    });

    if (isPreview) {
      return res.json({
        preview: true,
        totalRows: records.length,
        validCount: validRows.length,
        errorCount: errors.length,
        errors,
        sample: validRows.slice(0, 5)
      });
    }

    const now = getISTTimestamp();
    let imported = 0;

    const importTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO suppliers (shop_id, name, phone, email, address, gstin, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of validRows) {
        stmt.run(shopId, row.name, row.phone, row.email, row.address, row.gstin, row.notes, now);
        imported++;
      }
    });

    importTx();

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'IMPORT_SUPPLIERS',
      entity_name: 'suppliers',
      new_values: { count: imported }
    });

    return res.json({
      message: `Successfully imported ${imported} suppliers.`,
      importedCount: imported,
      errorsCount: errors.length,
      errors
    });
  } catch (err) {
    console.error('Supplier import error:', err);
    return res.status(500).json({ error: `Supplier import failed: ${err.message}` });
  }
});

/**
 * GET /api/suppliers
 * List suppliers with search and metrics
 */
router.get('/', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const {
      search = '',
      page = 1,
      limit = 20,
      sort_by = 'name',
      sort_order = 'ASC'
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

    if (search.trim()) {
      conditions.push('(s.name LIKE ? OR s.phone LIKE ? OR s.email LIKE ? OR s.gstin LIKE ?)');
      const q = `%${search.trim()}%`;
      params.push(q, q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = db.prepare(`
      SELECT COUNT(*) as total
      FROM suppliers s
      ${whereClause}
    `).get(...params);

    const total = countRes ? countRes.total : 0;

    const allowedSort = ['name', 'created_at', 'total_purchases', 'total_supplied'];
    const safeSort = allowedSort.includes(sort_by) ? sort_by : 'name';
    const safeOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = `
      SELECT s.*, sh.name as shop_name,
             COUNT(p.id) as total_purchases,
             COALESCE(SUM(p.total_amount), 0) as total_supplied,
             (SELECT COUNT(*) FROM products prod WHERE prod.supplier_id = s.id AND prod.is_archived = 0) as product_count
      FROM suppliers s
      LEFT JOIN purchases p ON s.id = p.supplier_id
      LEFT JOIN shops sh ON s.shop_id = sh.id
      ${whereClause}
      GROUP BY s.id
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const suppliers = db.prepare(query).all(...params, limitNum, offset);

    return res.json({
      suppliers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('List suppliers error:', err);
    return res.status(500).json({ error: 'Failed to retrieve suppliers' });
  }
});

/**
 * GET /api/suppliers/:id
 * Retrieve single supplier details and recent purchase history
 */
router.get('/:id', (req, res) => {
  try {
    const supplierId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND s.shop_id = ?' : '';
    const params = [supplierId];
    if (shopId) params.push(shopId);

    const query = `
      SELECT s.*, sh.name as shop_name,
             COUNT(p.id) as total_purchases,
             COALESCE(SUM(p.total_amount), 0) as total_supplied
      FROM suppliers s
      LEFT JOIN purchases p ON s.id = p.supplier_id
      LEFT JOIN shops sh ON s.shop_id = sh.id
      WHERE s.id = ? ${shopClause}
      GROUP BY s.id
    `;

    const supplier = db.prepare(query).get(...params);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const recentPurchases = db.prepare(`
      SELECT id, purchase_number, transaction_date, total_amount, payment_status
      FROM purchases
      WHERE supplier_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(supplierId);

    const suppliedProducts = db.prepare(`
      SELECT id, sku, name, current_stock, purchase_cost, selling_price
      FROM products
      WHERE supplier_id = ? AND is_archived = 0
      ORDER BY name ASC
    `).all(supplierId);

    return res.json({
      supplier,
      recent_purchases: recentPurchases,
      products: suppliedProducts
    });
  } catch (err) {
    console.error('Get supplier error:', err);
    return res.status(500).json({ error: 'Failed to retrieve supplier details' });
  }
});

/**
 * POST /api/suppliers
 * Create a new supplier
 */
router.post('/', (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID context required' });
    }

    const { name, phone, email, address, gstin, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const now = getISTTimestamp();

    const result = db.prepare(`
      INSERT INTO suppliers (shop_id, name, phone, email, address, gstin, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shopId,
      name.trim(),
      phone ? phone.trim() : null,
      email ? email.trim() : null,
      address ? address.trim() : null,
      gstin ? gstin.trim().toUpperCase() : null,
      notes ? notes.trim() : null,
      now
    );

    const newSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'CREATE_SUPPLIER',
      entity_name: 'suppliers',
      entity_id: newSupplier.id,
      new_values: newSupplier
    });

    return res.status(201).json(newSupplier);
  } catch (err) {
    console.error('Create supplier error:', err);
    return res.status(500).json({ error: 'Failed to create supplier' });
  }
});

/**
 * PUT /api/suppliers/:id
 * Update supplier details
 */
router.put('/:id', (req, res) => {
  try {
    const supplierId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [supplierId];
    if (shopId) params.push(shopId);

    const current = db.prepare(`SELECT * FROM suppliers WHERE id = ? ${shopClause}`).get(...params);
    if (!current) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const { name, phone, email, address, gstin, notes } = req.body;

    db.prepare(`
      UPDATE suppliers
      SET name = ?,
          phone = ?,
          email = ?,
          address = ?,
          gstin = ?,
          notes = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : current.name,
      phone !== undefined ? (phone ? phone.trim() : null) : current.phone,
      email !== undefined ? (email ? email.trim() : null) : current.email,
      address !== undefined ? (address ? address.trim() : null) : current.address,
      gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : current.gstin,
      notes !== undefined ? (notes ? notes.trim() : null) : current.notes,
      supplierId
    );

    const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);

    logAudit(db, {
      shop_id: current.shop_id,
      user_id: req.user.id,
      action: 'UPDATE_SUPPLIER',
      entity_name: 'suppliers',
      entity_id: supplierId,
      old_values: current,
      new_values: updated
    });

    return res.json(updated);
  } catch (err) {
    console.error('Update supplier error:', err);
    return res.status(500).json({ error: 'Failed to update supplier' });
  }
});

/**
 * DELETE /api/suppliers/:id
 * Delete supplier if no purchases or products are linked
 */
router.delete('/:id', (req, res) => {
  try {
    const supplierId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [supplierId];
    if (shopId) params.push(shopId);

    const current = db.prepare(`SELECT * FROM suppliers WHERE id = ? ${shopClause}`).get(...params);
    if (!current) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const purchasesCount = db.prepare('SELECT COUNT(*) as count FROM purchases WHERE supplier_id = ?').get(supplierId).count;
    if (purchasesCount > 0) {
      return res.status(400).json({
        error: `Cannot delete supplier "${current.name}". Associated with ${purchasesCount} purchase orders.`
      });
    }

    db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);

    logAudit(db, {
      shop_id: current.shop_id,
      user_id: req.user.id,
      action: 'DELETE_SUPPLIER',
      entity_name: 'suppliers',
      entity_id: supplierId,
      old_values: current
    });

    return res.json({ message: 'Supplier deleted successfully', supplierId });
  } catch (err) {
    console.error('Delete supplier error:', err);
    return res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

module.exports = router;
