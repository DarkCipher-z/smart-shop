// server/routes/products.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { tenantContext, getShopFilter } = require('../middleware/tenant');
const { getISTTimestamp, getISTDate } = require('../utils/date');
const { logAudit } = require('../utils/audit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(verifyToken);
router.use(tenantContext);

/**
 * GET /api/products/low-stock
 * Returns all active products where current_stock <= min_stock_threshold
 */
router.get('/low-stock', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND p.shop_id = ?' : '';
    const params = shopId ? [shopId] : [];

    const query = `
      SELECT p.*, c.name as category_name, s.name as supplier_name, sh.name as shop_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN shops sh ON p.shop_id = sh.id
      WHERE p.is_archived = 0 AND p.current_stock <= p.min_stock_threshold
      ${shopClause}
      ORDER BY p.current_stock ASC
    `;

    const products = db.prepare(query).all(...params);
    return res.json({ products, count: products.length });
  } catch (err) {
    console.error('Low stock error:', err);
    return res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

/**
 * GET /api/products/expiring
 * Returns products with expiry_date within the next 30 days
 */
router.get('/expiring', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const today = getISTDate();
    
    // Calculate 30 days ahead
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const maxExpiry = getISTDate(d);

    const shopClause = shopId ? 'AND p.shop_id = ?' : '';
    const params = [today, maxExpiry];
    if (shopId) params.push(shopId);

    const query = `
      SELECT p.*, c.name as category_name, s.name as supplier_name, sh.name as shop_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN shops sh ON p.shop_id = sh.id
      WHERE p.is_archived = 0 
        AND p.expiry_date IS NOT NULL 
        AND p.expiry_date != ''
        AND p.expiry_date BETWEEN ? AND ?
      ${shopClause}
      ORDER BY p.expiry_date ASC
    `;

    const products = db.prepare(query).all(...params);
    return res.json({ products, count: products.length });
  } catch (err) {
    console.error('Expiring products error:', err);
    return res.status(500).json({ error: 'Failed to fetch expiring products' });
  }
});

/**
 * GET /api/products/export
 * Exports products as a downloadable CSV
 */
router.get('/export', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'WHERE p.shop_id = ?' : '';
    const params = shopId ? [shopId] : [];

    const query = `
      SELECT p.sku, p.name, c.name as category, p.unit_of_measure,
             p.purchase_cost, p.selling_price, p.gst_rate, p.is_tax_inclusive,
             p.current_stock, p.min_stock_threshold, p.expiry_date,
             s.name as supplier_name, p.is_archived, sh.name as shop_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN shops sh ON p.shop_id = sh.id
      ${shopClause}
      ORDER BY p.name ASC
    `;

    const products = db.prepare(query).all(...params);

    const records = products.map(p => ({
      'SKU': p.sku,
      'Product Name': p.name,
      'Category': p.category || '',
      'Unit': p.unit_of_measure,
      'Purchase Cost': p.purchase_cost,
      'Selling Price': p.selling_price,
      'GST Rate (%)': p.gst_rate,
      'Tax Inclusive': p.is_tax_inclusive ? 'YES' : 'NO',
      'Current Stock': p.current_stock,
      'Min Stock Threshold': p.min_stock_threshold,
      'Expiry Date': p.expiry_date || '',
      'Supplier': p.supplier_name || '',
      'Status': p.is_archived ? 'Archived' : 'Active',
      'Shop': p.shop_name || ''
    }));

    const csvData = stringify(records, { header: true });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="smartshop-products.csv"');
    return res.send(csvData);
  } catch (err) {
    console.error('Products export error:', err);
    return res.status(500).json({ error: 'Failed to export products' });
  }
});

/**
 * POST /api/products/import
 * CSV Import supporting preview and execution
 * Accepts either multipart file or raw CSV in req.body.csvData
 */
router.post('/import', upload.single('file'), (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'A specific shop must be selected for importing products' });
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
      return res.status(400).json({ error: 'CSV file contains no valid rows' });
    }

    const isPreview = req.query.preview === 'true';

    // Existing SKUs for duplicate detection
    const existingProducts = db.prepare('SELECT sku, name FROM products WHERE shop_id = ?').all(shopId);
    const existingSkuMap = new Set(existingProducts.map(p => p.sku.toUpperCase()));

    // Existing Categories
    const existingCats = db.prepare('SELECT id, name FROM categories WHERE shop_id = ?').all(shopId);
    const catMap = new Map();
    existingCats.forEach(c => catMap.set(c.name.toLowerCase(), c.id));

    const validRows = [];
    const duplicates = [];
    const errors = [];
    const seenInFile = new Set();

    records.forEach((row, index) => {
      const rowNum = index + 2; // header is line 1
      const sku = (row['SKU'] || row['sku'] || '').trim();
      const name = (row['Product Name'] || row['Name'] || row['name'] || '').trim();
      const categoryName = (row['Category'] || row['category'] || '').trim();
      const uom = (row['Unit'] || row['unit'] || row['unit_of_measure'] || 'pcs').trim();
      const purchaseCost = parseFloat(row['Purchase Cost'] || row['purchase_cost'] || 0) || 0;
      const sellingPrice = parseFloat(row['Selling Price'] || row['selling_price'] || 0) || 0;
      const gstRate = parseFloat(row['GST Rate (%)'] || row['gst_rate'] || 0) || 0;
      const taxIncStr = String(row['Tax Inclusive'] || row['is_tax_inclusive'] || '').toUpperCase();
      const isTaxInclusive = taxIncStr === 'YES' || taxIncStr === '1' || taxIncStr === 'TRUE' ? 1 : 0;
      const stock = parseFloat(row['Current Stock'] || row['stock'] || 0) || 0;
      const minStock = parseFloat(row['Min Stock Threshold'] || row['min_stock'] || 10) || 10;
      const expiry = (row['Expiry Date'] || row['expiry_date'] || '').trim();

      if (!sku) {
        errors.push({ row: rowNum, error: 'SKU is required' });
        return;
      }
      if (!name) {
        errors.push({ row: rowNum, error: 'Product name is required' });
        return;
      }

      if (seenInFile.has(sku.toUpperCase())) {
        errors.push({ row: rowNum, error: `Duplicate SKU "${sku}" found within the CSV file` });
        return;
      }
      seenInFile.add(sku.toUpperCase());

      if (existingSkuMap.has(sku.toUpperCase())) {
        duplicates.push({ row: rowNum, sku, name });
        return;
      }

      validRows.push({
        sku,
        name,
        categoryName,
        uom,
        purchaseCost,
        sellingPrice,
        gstRate,
        isTaxInclusive,
        stock,
        minStock,
        expiry: expiry || null
      });
    });

    if (isPreview) {
      return res.json({
        preview: true,
        totalRows: records.length,
        validCount: validRows.length,
        duplicateCount: duplicates.length,
        errorCount: errors.length,
        duplicates,
        errors,
        sampleValid: validRows.slice(0, 5)
      });
    }

    // Execute import in transaction
    const now = getISTTimestamp();
    let importedCount = 0;

    const importTransaction = db.transaction(() => {
      const insertCatStmt = db.prepare('INSERT INTO categories (shop_id, name, created_at) VALUES (?, ?, ?)');
      const insertProdStmt = db.prepare(`
        INSERT INTO products (
          shop_id, category_id, sku, name, unit_of_measure, purchase_cost, selling_price,
          gst_rate, is_tax_inclusive, current_stock, min_stock_threshold, expiry_date,
          is_archived, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);
      const insertMoveStmt = db.prepare(`
        INSERT INTO stock_movements (shop_id, product_id, movement_type, quantity, reference_id, notes, created_at)
        VALUES (?, ?, 'INITIAL', ?, NULL, 'Imported from CSV', ?)
      `);

      for (const row of validRows) {
        let catId = null;
        if (row.categoryName) {
          const lowerCat = row.categoryName.toLowerCase();
          if (catMap.has(lowerCat)) {
            catId = catMap.get(lowerCat);
          } else {
            const catRes = insertCatStmt.run(shopId, row.categoryName, now);
            catId = catRes.lastInsertRowid;
            catMap.set(lowerCat, catId);
          }
        }

        const prodRes = insertProdStmt.run(
          shopId,
          catId,
          row.sku,
          row.name,
          row.uom,
          row.purchaseCost,
          row.sellingPrice,
          row.gstRate,
          row.isTaxInclusive,
          row.stock,
          row.minStock,
          row.expiry,
          now,
          now
        );

        if (row.stock > 0) {
          insertMoveStmt.run(shopId, prodRes.lastInsertRowid, row.stock, now);
        }

        importedCount++;
      }
    });

    importTransaction();

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'IMPORT_PRODUCTS',
      entity_name: 'products',
      new_values: { count: importedCount, duplicatesSkipped: duplicates.length }
    });

    return res.json({
      message: `Import completed successfully. ${importedCount} products added.`,
      importedCount,
      duplicatesSkipped: duplicates.length,
      errorsCount: errors.length,
      duplicates,
      errors
    });
  } catch (err) {
    console.error('Import error:', err);
    return res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

/**
 * GET /api/products
 * List products with search, category, stock status, pagination
 */
router.get('/', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const {
      search = '',
      category_id,
      stock_status, // 'in_stock', 'low_stock', 'out_of_stock'
      archived = '0',
      page = 1,
      limit = 50,
      sort_by = 'name',
      sort_order = 'ASC'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (shopId) {
      conditions.push('p.shop_id = ?');
      params.push(shopId);
    }

    if (archived === '0') {
      conditions.push('p.is_archived = 0');
    } else if (archived === '1') {
      conditions.push('p.is_archived = 1');
    }

    if (search.trim()) {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (category_id) {
      conditions.push('p.category_id = ?');
      params.push(parseInt(category_id, 10));
    }

    if (stock_status === 'out_of_stock') {
      conditions.push('p.current_stock <= 0');
    } else if (stock_status === 'low_stock') {
      conditions.push('p.current_stock > 0 AND p.current_stock <= p.min_stock_threshold');
    } else if (stock_status === 'in_stock') {
      conditions.push('p.current_stock > p.min_stock_threshold');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSortFields = ['name', 'sku', 'selling_price', 'current_stock', 'created_at'];
    const safeSortBy = allowedSortFields.includes(sort_by) ? `p.${sort_by}` : 'p.name';
    const safeSortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      ${whereClause}
    `;
    const countRes = db.prepare(countQuery).get(...params);
    const total = countRes ? countRes.total : 0;

    const listQuery = `
      SELECT p.*, c.name as category_name, s.name as supplier_name, sh.name as shop_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN shops sh ON p.shop_id = sh.id
      ${whereClause}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `;

    const products = db.prepare(listQuery).all(...params, limitNum, offset);

    return res.json({
      products,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('List products error:', err);
    return res.status(500).json({ error: 'Failed to retrieve products' });
  }
});

/**
 * GET /api/products/:id
 * Retrieve a single product
 */
router.get('/:id', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND p.shop_id = ?' : '';
    const params = [parseInt(req.params.id, 10)];
    if (shopId) params.push(shopId);

    const query = `
      SELECT p.*, c.name as category_name, s.name as supplier_name, sh.name as shop_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN shops sh ON p.shop_id = sh.id
      WHERE p.id = ? ${shopClause}
    `;

    const product = db.prepare(query).get(...params);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json(product);
  } catch (err) {
    console.error('Get product error:', err);
    return res.status(500).json({ error: 'Failed to retrieve product details' });
  }
});

/**
 * POST /api/products
 * Create product with unique SKU verification
 */
router.post('/', (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID context required to create product' });
    }

    const {
      sku,
      name,
      category_id,
      unit_of_measure = 'pcs',
      purchase_cost = 0,
      selling_price = 0,
      gst_rate = 0,
      is_tax_inclusive = 0,
      current_stock = 0,
      min_stock_threshold = 10,
      expiry_date,
      supplier_id
    } = req.body;

    if (!sku || !sku.trim()) {
      return res.status(400).json({ error: 'Product SKU is required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const cleanSku = sku.trim().toUpperCase();

    // Check SKU uniqueness within shop
    const existing = db.prepare('SELECT id FROM products WHERE shop_id = ? AND sku = ?').get(shopId, cleanSku);
    if (existing) {
      return res.status(400).json({ error: `SKU "${cleanSku}" already exists in this shop` });
    }

    const now = getISTTimestamp();

    const insertTx = db.transaction(() => {
      const prodRes = db.prepare(`
        INSERT INTO products (
          shop_id, category_id, sku, name, unit_of_measure, purchase_cost, selling_price,
          gst_rate, is_tax_inclusive, current_stock, min_stock_threshold, expiry_date,
          supplier_id, is_archived, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        shopId,
        category_id ? parseInt(category_id, 10) : null,
        cleanSku,
        name.trim(),
        unit_of_measure || 'pcs',
        Number(purchase_cost) || 0,
        Number(selling_price) || 0,
        Number(gst_rate) || 0,
        is_tax_inclusive ? 1 : 0,
        Number(current_stock) || 0,
        Number(min_stock_threshold) || 10,
        expiry_date ? expiry_date.trim() : null,
        supplier_id ? parseInt(supplier_id, 10) : null,
        now,
        now
      );

      const productId = prodRes.lastInsertRowid;

      if (Number(current_stock) > 0) {
        db.prepare(`
          INSERT INTO stock_movements (shop_id, product_id, movement_type, quantity, reference_id, notes, created_at)
          VALUES (?, ?, 'INITIAL', ?, NULL, 'Initial stock on creation', ?)
        `).run(shopId, productId, Number(current_stock), now);
      }

      return productId;
    });

    const newId = insertTx();

    const createdProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(newId);

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'CREATE_PRODUCT',
      entity_name: 'products',
      entity_id: newId,
      new_values: createdProduct
    });

    return res.status(201).json(createdProduct);
  } catch (err) {
    console.error('Create product error:', err);
    return res.status(500).json({ error: `Failed to create product: ${err.message}` });
  }
});

/**
 * PUT /api/products/:id
 * Update product details with audit logging
 */
router.put('/:id', (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [productId];
    if (shopId) params.push(shopId);

    const oldProduct = db.prepare(`SELECT * FROM products WHERE id = ? ${shopClause}`).get(...params);
    if (!oldProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const {
      sku,
      name,
      category_id,
      unit_of_measure,
      purchase_cost,
      selling_price,
      gst_rate,
      is_tax_inclusive,
      min_stock_threshold,
      expiry_date,
      supplier_id
    } = req.body;

    const newSku = sku !== undefined ? sku.trim().toUpperCase() : oldProduct.sku;

    // Check SKU uniqueness if changed
    if (newSku !== oldProduct.sku) {
      const dup = db.prepare('SELECT id FROM products WHERE shop_id = ? AND sku = ? AND id != ?').get(oldProduct.shop_id, newSku, productId);
      if (dup) {
        return res.status(400).json({ error: `SKU "${newSku}" is already taken by another product` });
      }
    }

    const now = getISTTimestamp();

    db.prepare(`
      UPDATE products
      SET sku = ?,
          name = ?,
          category_id = ?,
          unit_of_measure = ?,
          purchase_cost = ?,
          selling_price = ?,
          gst_rate = ?,
          is_tax_inclusive = ?,
          min_stock_threshold = ?,
          expiry_date = ?,
          supplier_id = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      newSku,
      name !== undefined ? name.trim() : oldProduct.name,
      category_id !== undefined ? (category_id ? parseInt(category_id, 10) : null) : oldProduct.category_id,
      unit_of_measure !== undefined ? unit_of_measure : oldProduct.unit_of_measure,
      purchase_cost !== undefined ? Number(purchase_cost) : oldProduct.purchase_cost,
      selling_price !== undefined ? Number(selling_price) : oldProduct.selling_price,
      gst_rate !== undefined ? Number(gst_rate) : oldProduct.gst_rate,
      is_tax_inclusive !== undefined ? (is_tax_inclusive ? 1 : 0) : oldProduct.is_tax_inclusive,
      min_stock_threshold !== undefined ? Number(min_stock_threshold) : oldProduct.min_stock_threshold,
      expiry_date !== undefined ? (expiry_date ? expiry_date.trim() : null) : oldProduct.expiry_date,
      supplier_id !== undefined ? (supplier_id ? parseInt(supplier_id, 10) : null) : oldProduct.supplier_id,
      now,
      productId
    );

    const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

    logAudit(db, {
      shop_id: oldProduct.shop_id,
      user_id: req.user.id,
      action: 'UPDATE_PRODUCT',
      entity_name: 'products',
      entity_id: productId,
      old_values: oldProduct,
      new_values: updatedProduct
    });

    return res.json(updatedProduct);
  } catch (err) {
    console.error('Update product error:', err);
    return res.status(500).json({ error: `Failed to update product: ${err.message}` });
  }
});

/**
 * DELETE /api/products/:id
 * Soft delete (archive) product
 */
router.delete('/:id', (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [productId];
    if (shopId) params.push(shopId);

    const product = db.prepare(`SELECT * FROM products WHERE id = ? ${shopClause}`).get(...params);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const now = getISTTimestamp();
    db.prepare('UPDATE products SET is_archived = 1, updated_at = ? WHERE id = ?').run(now, productId);

    logAudit(db, {
      shop_id: product.shop_id,
      user_id: req.user.id,
      action: 'ARCHIVE_PRODUCT',
      entity_name: 'products',
      entity_id: productId,
      old_values: { is_archived: 0 },
      new_values: { is_archived: 1 }
    });

    return res.json({ message: 'Product archived successfully', productId });
  } catch (err) {
    console.error('Archive product error:', err);
    return res.status(500).json({ error: 'Failed to archive product' });
  }
});

module.exports = router;
