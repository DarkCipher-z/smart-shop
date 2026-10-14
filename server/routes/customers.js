// server/routes/customers.js
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
 * GET /api/customers/export
 * Download customer directory as CSV
 */
router.get('/export', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'WHERE c.shop_id = ?' : '';
    const params = shopId ? [shopId] : [];

    const query = `
      SELECT c.name, c.phone, c.email, c.address, c.gstin, c.notes,
             sh.name as shop_name, c.created_at,
             COUNT(s.id) as total_orders,
             COALESCE(SUM(s.total_amount), 0) as total_spent
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id AND s.status = 'COMPLETED'
      LEFT JOIN shops sh ON c.shop_id = sh.id
      ${shopClause}
      GROUP BY c.id
      ORDER BY c.name ASC
    `;

    const customers = db.prepare(query).all(...params);

    const records = customers.map(c => ({
      'Name': c.name,
      'Phone': c.phone || '',
      'Email': c.email || '',
      'Address': c.address || '',
      'GSTIN': c.gstin || '',
      'Total Orders': c.total_orders,
      'Total Spent (₹)': c.total_spent.toFixed(2),
      'Notes': c.notes || '',
      'Shop': c.shop_name || '',
      'Created At': c.created_at
    }));

    const csvData = stringify(records, { header: true });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="smartshop-customers.csv"');
    return res.send(csvData);
  } catch (err) {
    console.error('Customer export error:', err);
    return res.status(500).json({ error: 'Failed to export customers' });
  }
});

/**
 * POST /api/customers/import
 * CSV Import of customers with preview & execution
 */
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'A specific shop must be selected for customer import' });
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
      return res.status(400).json({ error: 'CSV file contains no valid customer records' });
    }

    const isPreview = req.query.preview === 'true';

    const validRows = [];
    const errors = [];

    records.forEach((row, index) => {
      const rowNum = index + 2;
      const name = (row['Name'] || row['name'] || '').trim();
      const phone = (row['Phone'] || row['phone'] || '').trim();
      const email = (row['Email'] || row['email'] || '').trim();
      const address = (row['Address'] || row['address'] || '').trim();
      const gstin = (row['GSTIN'] || row['gstin'] || '').trim();
      const notes = (row['Notes'] || row['notes'] || '').trim();

      if (!name) {
        errors.push({ row: rowNum, error: 'Customer name is required' });
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
        INSERT INTO customers (shop_id, name, phone, email, address, gstin, notes, created_at)
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
      action: 'IMPORT_CUSTOMERS',
      entity_name: 'customers',
      new_values: { count: imported }
    });

    return res.json({
      message: `Successfully imported ${imported} customers.`,
      importedCount: imported,
      errorsCount: errors.length,
      errors
    });
  } catch (err) {
    console.error('Customer import error:', err);
    return res.status(500).json({ error: `Customer import failed: ${err.message}` });
  }
});

/**
 * GET /api/customers
 * List customers with search, order stats, pagination
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
      conditions.push('c.shop_id = ?');
      params.push(shopId);
    }

    if (search.trim()) {
      conditions.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.gstin LIKE ?)');
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = db.prepare(`
      SELECT COUNT(*) as total
      FROM customers c
      ${whereClause}
    `).get(...params);

    const total = countRes ? countRes.total : 0;

    const allowedSort = ['name', 'created_at', 'total_orders', 'total_spent'];
    const safeSort = allowedSort.includes(sort_by) ? sort_by : 'name';
    const safeOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = `
      SELECT c.*, sh.name as shop_name,
             COUNT(s.id) as total_orders,
             COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total_amount ELSE 0 END), 0) as total_spent,
             MAX(s.transaction_date) as last_order_date
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id
      LEFT JOIN shops sh ON c.shop_id = sh.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const customers = db.prepare(query).all(...params, limitNum, offset);

    return res.json({
      customers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('List customers error:', err);
    return res.status(500).json({ error: 'Failed to retrieve customers' });
  }
});

/**
 * GET /api/customers/:id
 * Retrieve customer details with recent sales orders
 */
router.get('/:id', (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND c.shop_id = ?' : '';
    const params = [customerId];
    if (shopId) params.push(shopId);

    const customer = db.prepare(`
      SELECT c.*, sh.name as shop_name,
             COUNT(s.id) as total_orders,
             COALESCE(SUM(CASE WHEN s.status = 'COMPLETED' THEN s.total_amount ELSE 0 END), 0) as total_spent
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id
      LEFT JOIN shops sh ON c.shop_id = sh.id
      WHERE c.id = ? ${shopClause}
      GROUP BY c.id
    `).get(...params);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const recentSales = db.prepare(`
      SELECT id, invoice_number, transaction_date, total_amount, payment_method, payment_status, status
      FROM sales
      WHERE customer_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(customerId);

    return res.json({
      customer,
      recent_sales: recentSales
    });
  } catch (err) {
    console.error('Get customer error:', err);
    return res.status(500).json({ error: 'Failed to retrieve customer details' });
  }
});

/**
 * POST /api/customers
 * Create a new customer record
 */
router.post('/', (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID context required' });
    }

    const { name, phone, email, address, gstin, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const now = getISTTimestamp();

    const result = db.prepare(`
      INSERT INTO customers (shop_id, name, phone, email, address, gstin, notes, created_at)
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

    const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'CREATE_CUSTOMER',
      entity_name: 'customers',
      entity_id: newCustomer.id,
      new_values: newCustomer
    });

    return res.status(201).json(newCustomer);
  } catch (err) {
    console.error('Create customer error:', err);
    return res.status(500).json({ error: 'Failed to create customer' });
  }
});

/**
 * PUT /api/customers/:id
 * Update customer details
 */
router.put('/:id', (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [customerId];
    if (shopId) params.push(shopId);

    const current = db.prepare(`SELECT * FROM customers WHERE id = ? ${shopClause}`).get(...params);
    if (!current) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { name, phone, email, address, gstin, notes } = req.body;

    db.prepare(`
      UPDATE customers
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
      customerId
    );

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

    logAudit(db, {
      shop_id: current.shop_id,
      user_id: req.user.id,
      action: 'UPDATE_CUSTOMER',
      entity_name: 'customers',
      entity_id: customerId,
      old_values: current,
      new_values: updated
    });

    return res.json(updated);
  } catch (err) {
    console.error('Update customer error:', err);
    return res.status(500).json({ error: 'Failed to update customer' });
  }
});

/**
 * DELETE /api/customers/:id
 * Remove customer record if no sales references exist
 */
router.delete('/:id', (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [customerId];
    if (shopId) params.push(shopId);

    const current = db.prepare(`SELECT * FROM customers WHERE id = ? ${shopClause}`).get(...params);
    if (!current) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const salesCount = db.prepare('SELECT COUNT(*) as count FROM sales WHERE customer_id = ?').get(customerId).count;
    if (salesCount > 0) {
      return res.status(400).json({
        error: `Cannot delete customer "${current.name}". ${salesCount} sale invoice(s) are associated with this customer.`
      });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);

    logAudit(db, {
      shop_id: current.shop_id,
      user_id: req.user.id,
      action: 'DELETE_CUSTOMER',
      entity_name: 'customers',
      entity_id: customerId,
      old_values: current
    });

    return res.json({ message: 'Customer deleted successfully', customerId });
  } catch (err) {
    console.error('Delete customer error:', err);
    return res.status(500).json({ error: 'Failed to delete customer' });
  }
});

module.exports = router;
