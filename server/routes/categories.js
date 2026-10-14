// server/routes/categories.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { tenantContext, getShopFilter } = require('../middleware/tenant');
const { getISTTimestamp } = require('../utils/date');
const { logAudit } = require('../utils/audit');

router.use(verifyToken);
router.use(tenantContext);

/**
 * GET /api/categories
 * Lists categories for shop along with active product counts
 */
router.get('/', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'WHERE c.shop_id = ?' : '';
    const params = shopId ? [shopId] : [];

    const query = `
      SELECT c.*, sh.name as shop_name,
             COUNT(p.id) as product_count,
             COALESCE(SUM(CASE WHEN p.is_archived = 0 THEN p.current_stock ELSE 0 END), 0) as total_stock
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_archived = 0
      LEFT JOIN shops sh ON c.shop_id = sh.id
      ${shopClause}
      GROUP BY c.id
      ORDER BY c.name ASC
    `;

    const categories = db.prepare(query).all(...params);
    return res.json(categories);
  } catch (err) {
    console.error('List categories error:', err);
    return res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

/**
 * POST /api/categories
 * Creates a new category
 */
router.post('/', (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID context required' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const cleanName = name.trim();

    // Check duplicate category name within shop
    const existing = db.prepare('SELECT id FROM categories WHERE shop_id = ? AND LOWER(name) = LOWER(?)').get(shopId, cleanName);
    if (existing) {
      return res.status(400).json({ error: `Category "${cleanName}" already exists in this shop` });
    }

    const now = getISTTimestamp();
    const result = db.prepare(`
      INSERT INTO categories (shop_id, name, created_at)
      VALUES (?, ?, ?)
    `).run(shopId, cleanName, now);

    const newCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'CREATE_CATEGORY',
      entity_name: 'categories',
      entity_id: newCategory.id,
      new_values: newCategory
    });

    return res.status(201).json(newCategory);
  } catch (err) {
    console.error('Create category error:', err);
    return res.status(500).json({ error: 'Failed to create category' });
  }
});

/**
 * PUT /api/categories/:id
 * Updates an existing category name
 */
router.put('/:id', (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [categoryId];
    if (shopId) params.push(shopId);

    const current = db.prepare(`SELECT * FROM categories WHERE id = ? ${shopClause}`).get(...params);
    if (!current) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name cannot be empty' });
    }

    const cleanName = name.trim();

    // Duplicate check within same shop
    const dup = db.prepare('SELECT id FROM categories WHERE shop_id = ? AND LOWER(name) = LOWER(?) AND id != ?').get(current.shop_id, cleanName, categoryId);
    if (dup) {
      return res.status(400).json({ error: `Category "${cleanName}" already exists in this shop` });
    }

    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(cleanName, categoryId);
    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);

    logAudit(db, {
      shop_id: current.shop_id,
      user_id: req.user.id,
      action: 'UPDATE_CATEGORY',
      entity_name: 'categories',
      entity_id: categoryId,
      old_values: current,
      new_values: updated
    });

    return res.json(updated);
  } catch (err) {
    console.error('Update category error:', err);
    return res.status(500).json({ error: 'Failed to update category' });
  }
});

/**
 * DELETE /api/categories/:id
 * Deletes category only if no products are associated with it
 */
router.delete('/:id', (req, res) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const shopId = getShopFilter(req);
    const shopClause = shopId ? 'AND shop_id = ?' : '';
    const params = [categoryId];
    if (shopId) params.push(shopId);

    const current = db.prepare(`SELECT * FROM categories WHERE id = ? ${shopClause}`).get(...params);
    if (!current) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if any product references this category
    const prodCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(categoryId).count;
    if (prodCount > 0) {
      return res.status(400).json({
        error: `Cannot delete category "${current.name}". It is assigned to ${prodCount} product(s). Reassign products before deleting.`
      });
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);

    logAudit(db, {
      shop_id: current.shop_id,
      user_id: req.user.id,
      action: 'DELETE_CATEGORY',
      entity_name: 'categories',
      entity_id: categoryId,
      old_values: current
    });

    return res.json({ message: 'Category deleted successfully', categoryId });
  } catch (err) {
    console.error('Delete category error:', err);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
