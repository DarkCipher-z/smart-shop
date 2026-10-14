// server/routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { getISTTimestamp, getISTDate } = require('../utils/date');
const { logAudit } = require('../utils/audit');

// All admin routes strictly require ADMIN role
router.use(verifyToken);
router.use(requireAdmin);

const DEFAULT_RESET_PASSWORD = 'SmartShop@2026';

const SAFE_TABLES = [
  'shops',
  'users',
  'categories',
  'products',
  'customers',
  'suppliers',
  'sales',
  'sale_items',
  'stock_movements',
  'purchases',
  'purchase_items',
  'credit_notes',
  'audit_logs'
];

/**
 * GET /api/admin/dashboard
 * Cross-shop overview metrics and comparative shop data
 */
router.get('/dashboard', (req, res) => {
  try {
    const today = getISTDate();

    const shops = db.prepare('SELECT * FROM shops ORDER BY id ASC').all();

    const shopMetrics = shops.map(shop => {
      // Sales metrics
      const salesRes = db.prepare(`
        SELECT 
          COUNT(id) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_revenue
        FROM sales
        WHERE shop_id = ? AND status = 'COMPLETED'
      `).get(shop.id);

      const todayRes = db.prepare(`
        SELECT 
          COUNT(id) as today_orders,
          COALESCE(SUM(total_amount), 0) as today_revenue
        FROM sales
        WHERE shop_id = ? AND transaction_date = ? AND status = 'COMPLETED'
      `).get(shop.id, today);

      // Product metrics
      const productRes = db.prepare(`
        SELECT 
          COUNT(id) as total_products,
          COUNT(CASE WHEN current_stock <= min_stock_threshold THEN 1 END) as low_stock_count,
          COUNT(CASE WHEN current_stock <= 0 THEN 1 END) as out_of_stock_count,
          COALESCE(SUM(current_stock * purchase_cost), 0) as inventory_value,
          COALESCE(SUM(current_stock * selling_price), 0) as retail_value
        FROM products
        WHERE shop_id = ? AND is_archived = 0
      `).get(shop.id);

      // Shopkeeper info
      const users = db.prepare(`
        SELECT id, full_name, email, role
        FROM users
        WHERE shop_id = ?
      `).all(shop.id);

      return {
        shop: {
          id: shop.id,
          name: shop.name,
          code: shop.code,
          invoice_prefix: shop.invoice_prefix,
          phone: shop.phone,
          email: shop.email,
          address: shop.address,
          gstin: shop.gstin,
          operating_start_time: shop.operating_start_time,
          operating_end_time: shop.operating_end_time
        },
        metrics: {
          total_revenue: Math.round((salesRes ? salesRes.total_revenue : 0) * 100) / 100,
          total_orders: salesRes ? salesRes.total_orders : 0,
          today_revenue: Math.round((todayRes ? todayRes.today_revenue : 0) * 100) / 100,
          today_orders: todayRes ? todayRes.today_orders : 0,
          total_products: productRes ? productRes.total_products : 0,
          low_stock_count: productRes ? productRes.low_stock_count : 0,
          out_of_stock_count: productRes ? productRes.out_of_stock_count : 0,
          inventory_valuation: Math.round((productRes ? productRes.inventory_value : 0) * 100) / 100,
          retail_valuation: Math.round((productRes ? productRes.retail_value : 0) * 100) / 100
        },
        shopkeepers: users
      };
    });

    // Global aggregations
    const globalSales = db.prepare(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales
      WHERE status = 'COMPLETED'
    `).get();

    const globalTodaySales = db.prepare(`
      SELECT 
        COUNT(id) as today_orders,
        COALESCE(SUM(total_amount), 0) as today_revenue
      FROM sales
      WHERE transaction_date = ? AND status = 'COMPLETED'
    `).get(today);

    const globalInventory = db.prepare(`
      SELECT 
        COUNT(id) as total_products,
        COUNT(CASE WHEN current_stock <= min_stock_threshold THEN 1 END) as low_stock_count,
        COALESCE(SUM(current_stock * purchase_cost), 0) as inventory_value
      FROM products
      WHERE is_archived = 0
    `).get();

    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    return res.json({
      global_metrics: {
        total_shops: shops.length,
        total_users: totalUsers,
        total_revenue: Math.round((globalSales ? globalSales.total_revenue : 0) * 100) / 100,
        total_orders: globalSales ? globalSales.total_orders : 0,
        today_revenue: Math.round((globalTodaySales ? globalTodaySales.today_revenue : 0) * 100) / 100,
        today_orders: globalTodaySales ? globalTodaySales.today_orders : 0,
        total_products: globalInventory ? globalInventory.total_products : 0,
        total_low_stock: globalInventory ? globalInventory.low_stock_count : 0,
        total_inventory_valuation: Math.round((globalInventory ? globalInventory.inventory_value : 0) * 100) / 100
      },
      shops: shopMetrics
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    return res.status(500).json({ error: 'Failed to generate admin dashboard metrics' });
  }
});

/**
 * GET /api/admin/shops
 * List all shops with summary metrics
 */
router.get('/shops', (req, res) => {
  try {
    const shops = db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as user_count,
             (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.is_archived = 0) as product_count,
             (SELECT COUNT(*) FROM sales sl WHERE sl.shop_id = s.id AND sl.status = 'COMPLETED') as sale_count,
             COALESCE((SELECT SUM(sl.total_amount) FROM sales sl WHERE sl.shop_id = s.id AND sl.status = 'COMPLETED'), 0) as total_revenue
      FROM shops s
      ORDER BY s.id ASC
    `).all();

    return res.json(shops);
  } catch (err) {
    console.error('List shops error:', err);
    return res.status(500).json({ error: 'Failed to retrieve shops' });
  }
});

/**
 * POST /api/admin/shops
 * Create a new shop
 */
router.post('/shops', (req, res) => {
  try {
    const {
      name,
      code,
      invoice_prefix,
      phone,
      email,
      address,
      gstin,
      operating_start_time = '08:00',
      operating_end_time = '22:00'
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Shop name is required' });
    }
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Shop unique code is required' });
    }

    const cleanCode = code.trim().toUpperCase();

    const dup = db.prepare('SELECT id FROM shops WHERE UPPER(code) = ?').get(cleanCode);
    if (dup) {
      return res.status(400).json({ error: `Shop with code "${cleanCode}" already exists` });
    }

    const now = getISTTimestamp();

    const insertRes = db.prepare(`
      INSERT INTO shops (name, code, invoice_prefix, phone, email, address, gstin, operating_start_time, operating_end_time, timezone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Asia/Kolkata', ?)
    `).run(
      name.trim(),
      cleanCode,
      (invoice_prefix || cleanCode).trim().toUpperCase(),
      phone ? phone.trim() : null,
      email ? email.trim() : null,
      address ? address.trim() : null,
      gstin ? gstin.trim().toUpperCase() : null,
      operating_start_time,
      operating_end_time,
      now
    );

    const newShop = db.prepare('SELECT * FROM shops WHERE id = ?').get(insertRes.lastInsertRowid);

    logAudit(db, {
      shop_id: newShop.id,
      user_id: req.user.id,
      action: 'CREATE_SHOP',
      entity_name: 'shops',
      entity_id: newShop.id,
      new_values: newShop
    });

    return res.status(201).json(newShop);
  } catch (err) {
    console.error('Create shop error:', err);
    return res.status(500).json({ error: `Failed to create shop: ${err.message}` });
  }
});

/**
 * PUT /api/admin/shops/:id
 * Update shop settings (including operating hours), log audit
 */
router.put('/shops/:id', (req, res) => {
  try {
    const shopId = parseInt(req.params.id, 10);
    const current = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);

    if (!current) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const {
      name,
      code,
      invoice_prefix,
      phone,
      email,
      address,
      gstin,
      operating_start_time,
      operating_end_time
    } = req.body;

    const newCode = code !== undefined ? code.trim().toUpperCase() : current.code;

    if (newCode !== current.code) {
      const dup = db.prepare('SELECT id FROM shops WHERE UPPER(code) = ? AND id != ?').get(newCode, shopId);
      if (dup) {
        return res.status(400).json({ error: `Shop code "${newCode}" already in use` });
      }
    }

    db.prepare(`
      UPDATE shops
      SET name = ?,
          code = ?,
          invoice_prefix = ?,
          phone = ?,
          email = ?,
          address = ?,
          gstin = ?,
          operating_start_time = ?,
          operating_end_time = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : current.name,
      newCode,
      invoice_prefix !== undefined ? invoice_prefix.trim().toUpperCase() : current.invoice_prefix,
      phone !== undefined ? (phone ? phone.trim() : null) : current.phone,
      email !== undefined ? (email ? email.trim() : null) : current.email,
      address !== undefined ? (address ? address.trim() : null) : current.address,
      gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : current.gstin,
      operating_start_time !== undefined ? operating_start_time : current.operating_start_time,
      operating_end_time !== undefined ? operating_end_time : current.operating_end_time,
      shopId
    );

    const updated = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'UPDATE_SHOP_SETTINGS',
      entity_name: 'shops',
      entity_id: shopId,
      old_values: current,
      new_values: updated
    });

    return res.json({
      message: 'Shop updated successfully',
      shop: updated
    });
  } catch (err) {
    console.error('Update shop error:', err);
    return res.status(500).json({ error: `Failed to update shop: ${err.message}` });
  }
});

/**
 * GET /api/admin/users
 * List all users with shop names and roles
 */
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.role, u.shop_id, u.language, u.theme, u.created_at,
             s.name as shop_name, s.code as shop_code
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      ORDER BY u.id ASC
    `).all();

    return res.json(users);
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

/**
 * POST /api/admin/users
 * Create a new user (Admin or Shopkeeper)
 */
router.post('/users', (req, res) => {
  try {
    const { email, password, full_name, role, shop_id } = req.body;

    if (!email || !full_name || !role) {
      return res.status(400).json({ error: 'Email, full name, and role are required' });
    }

    if (!['ADMIN', 'SHOPKEEPER'].includes(role)) {
      return res.status(400).json({ error: 'Role must be either ADMIN or SHOPKEEPER' });
    }

    if (role === 'SHOPKEEPER' && !shop_id) {
      return res.status(400).json({ error: 'Shop ID is required for SHOPKEEPER role' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = bcrypt.hashSync(password || DEFAULT_RESET_PASSWORD, 10);
    const now = getISTTimestamp();

    const insertRes = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, role, shop_id, language, theme, created_at)
      VALUES (?, ?, ?, ?, ?, 'en', 'dark', ?)
    `).run(
      cleanEmail,
      passwordHash,
      full_name.trim(),
      role,
      role === 'SHOPKEEPER' ? parseInt(shop_id, 10) : null,
      now
    );

    const newUser = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.role, u.shop_id, u.created_at, s.name as shop_name
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE u.id = ?
    `).get(insertRes.lastInsertRowid);

    logAudit(db, {
      shop_id: newUser.shop_id,
      user_id: req.user.id,
      action: 'CREATE_USER',
      entity_name: 'users',
      entity_id: newUser.id,
      new_values: newUser
    });

    return res.status(201).json(newUser);
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ error: `Failed to create user: ${err.message}` });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update user details or reset password to SmartShop@2026
 */
router.put('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const current = db.prepare('SELECT id, email, full_name, role, shop_id FROM users WHERE id = ?').get(userId);

    if (!current) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { email, full_name, role, shop_id, reset_password, new_password } = req.body;

    const newEmail = email !== undefined ? email.trim().toLowerCase() : current.email;

    if (newEmail !== current.email) {
      const dup = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(newEmail, userId);
      if (dup) {
        return res.status(400).json({ error: 'Email address already in use' });
      }
    }

    const newRole = role !== undefined ? role : current.role;
    if (!['ADMIN', 'SHOPKEEPER'].includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const newShopId = newRole === 'ADMIN' ? null : (shop_id !== undefined ? (shop_id ? parseInt(shop_id, 10) : null) : current.shop_id);

    let passwordHashToSet = null;
    if (reset_password === true) {
      passwordHashToSet = bcrypt.hashSync(DEFAULT_RESET_PASSWORD, 10);
    } else if (new_password) {
      passwordHashToSet = bcrypt.hashSync(new_password, 10);
    }

    if (passwordHashToSet) {
      db.prepare(`
        UPDATE users
        SET email = ?, full_name = ?, role = ?, shop_id = ?, password_hash = ?
        WHERE id = ?
      `).run(newEmail, full_name !== undefined ? full_name.trim() : current.full_name, newRole, newShopId, passwordHashToSet, userId);
    } else {
      db.prepare(`
        UPDATE users
        SET email = ?, full_name = ?, role = ?, shop_id = ?
        WHERE id = ?
      `).run(newEmail, full_name !== undefined ? full_name.trim() : current.full_name, newRole, newShopId, userId);
    }

    const updated = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.role, u.shop_id, u.language, u.theme, u.created_at, s.name as shop_name
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE u.id = ?
    `).get(userId);

    logAudit(db, {
      shop_id: updated.shop_id,
      user_id: req.user.id,
      action: 'UPDATE_USER',
      entity_name: 'users',
      entity_id: userId,
      old_values: current,
      new_values: updated
    });

    return res.json({
      message: 'User updated successfully' + (passwordHashToSet ? ' (password was reset)' : ''),
      user: updated
    });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ error: `Failed to update user: ${err.message}` });
  }
});

/**
 * GET /api/admin/audit-logs
 * Paginated audit log viewer with extensive filtering
 */
router.get('/audit-logs', (req, res) => {
  try {
    const {
      shop_id,
      action,
      entity_name,
      user_id,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (shop_id) {
      conditions.push('a.shop_id = ?');
      params.push(parseInt(shop_id, 10));
    }
    if (action) {
      conditions.push('a.action = ?');
      params.push(action);
    }
    if (entity_name) {
      conditions.push('a.entity_name = ?');
      params.push(entity_name);
    }
    if (user_id) {
      conditions.push('a.user_id = ?');
      params.push(parseInt(user_id, 10));
    }
    if (start_date) {
      conditions.push('a.created_at >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('a.created_at <= ?');
      params.push(end_date + 'T23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = db.prepare(`SELECT COUNT(*) as total FROM audit_logs a ${whereClause}`).get(...params);
    const total = countRes ? countRes.total : 0;

    const query = `
      SELECT a.*, u.full_name as user_name, u.email as user_email, sh.name as shop_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN shops sh ON a.shop_id = sh.id
      ${whereClause}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `;

    const logs = db.prepare(query).all(...params, limitNum, offset);

    return res.json({
      logs: logs.map(l => ({
        ...l,
        old_values: l.old_values ? safeJsonParse(l.old_values) : null,
        new_values: l.new_values ? safeJsonParse(l.new_values) : null
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Audit logs error:', err);
    return res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

/**
 * Helper to parse JSON safely
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * GET /api/admin/data-explorer/:table
 * Safe table viewer with shop tags, sorting, filtering, and pagination
 */
router.get('/data-explorer/:table', (req, res) => {
  try {
    const table = req.params.table.toLowerCase();

    if (!SAFE_TABLES.includes(table)) {
      return res.status(400).json({
        error: `Access denied to table "${table}". Allowed tables are: ${SAFE_TABLES.join(', ')}`
      });
    }

    const {
      shop_id,
      search,
      page = 1,
      limit = 50,
      sort_by = 'id',
      sort_order = 'DESC'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    // Check table columns
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const columnNames = columns.map(c => c.name);
    const hasShopId = columnNames.includes('shop_id');

    const conditions = [];
    const params = [];

    if (hasShopId && shop_id) {
      conditions.push(`t.shop_id = ?`);
      params.push(parseInt(shop_id, 10));
    }

    if (search && search.trim()) {
      const textColumns = columns.filter(c => ['TEXT', 'VARCHAR'].includes(c.type.toUpperCase())).map(c => `t.${c.name} LIKE ?`);
      if (textColumns.length > 0) {
        conditions.push(`(${textColumns.join(' OR ')})`);
        const q = `%${search.trim()}%`;
        textColumns.forEach(() => params.push(q));
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = db.prepare(`SELECT COUNT(*) as total FROM ${table} t ${whereClause}`).get(...params);
    const total = countRes ? countRes.total : 0;

    const safeSort = columnNames.includes(sort_by) ? `t.${sort_by}` : 't.id';
    const safeOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build SELECT clause (omit password_hash for users table)
    let selectFields = '';
    if (table === 'users') {
      selectFields = columnNames.filter(c => c !== 'password_hash').map(c => `t.${c}`).join(', ');
    } else {
      selectFields = 't.*';
    }

    let joinShop = '';
    if (hasShopId && table !== 'shops') {
      selectFields += ', sh.name as _shop_name, sh.code as _shop_code';
      joinShop = 'LEFT JOIN shops sh ON t.shop_id = sh.id';
    }

    const query = `
      SELECT ${selectFields}
      FROM ${table} t
      ${joinShop}
      ${whereClause}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(query).all(...params, limitNum, offset);

    return res.json({
      table,
      columns: columns.filter(c => !(table === 'users' && c.name === 'password_hash')),
      rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Data explorer error:', err);
    return res.status(500).json({ error: `Failed to explore table data: ${err.message}` });
  }
});

module.exports = router;
