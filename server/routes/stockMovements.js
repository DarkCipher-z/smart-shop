// server/routes/stockMovements.js
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
 * GET /api/stock-movements
 * List stock movements journal with filters and pagination
 */
router.get('/', (req, res) => {
  try {
    const shopId = getShopFilter(req);
    const {
      product_id,
      movement_type,
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
    console.error('List stock movements error:', err);
    return res.status(500).json({ error: 'Failed to retrieve stock movements' });
  }
});

/**
 * POST /api/stock-movements/adjust
 * Manual stock adjustment (ADD, SUBTRACT, SET)
 */
router.post('/adjust', (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID context required' });
    }

    const { product_id, adjustment_type, quantity, notes } = req.body;

    const prodIdNum = parseInt(product_id, 10);
    const qtyNum = parseFloat(quantity);
    const adjType = (adjustment_type || 'ADD').toUpperCase();

    if (isNaN(prodIdNum)) {
      return res.status(400).json({ error: 'Valid product ID is required' });
    }

    if (isNaN(qtyNum) || qtyNum < 0) {
      return res.status(400).json({ error: 'Quantity must be a non-negative number' });
    }

    if (!['ADD', 'SUBTRACT', 'SET'].includes(adjType)) {
      return res.status(400).json({ error: 'Adjustment type must be one of ADD, SUBTRACT, SET' });
    }

    const now = getISTTimestamp();

    const adjustTx = db.transaction(() => {
      const product = db.prepare(`
        SELECT id, sku, name, current_stock, is_archived
        FROM products
        WHERE id = ? AND shop_id = ?
      `).get(prodIdNum, shopId);

      if (!product) {
        throw new Error(`Product not found in this shop`);
      }

      if (product.is_archived) {
        throw new Error(`Cannot adjust stock for archived product "${product.name}"`);
      }

      let newStock = product.current_stock;
      let movementDelta = 0;

      if (adjType === 'ADD') {
        newStock = product.current_stock + qtyNum;
        movementDelta = qtyNum;
      } else if (adjType === 'SUBTRACT') {
        if (product.current_stock < qtyNum) {
          throw new Error(`Cannot subtract ${qtyNum}. Current stock is only ${product.current_stock}`);
        }
        newStock = product.current_stock - qtyNum;
        movementDelta = -qtyNum;
      } else if (adjType === 'SET') {
        newStock = qtyNum;
        movementDelta = qtyNum - product.current_stock;
      }

      // Update product stock
      db.prepare(`
        UPDATE products 
        SET current_stock = ?, updated_at = ?
        WHERE id = ?
      `).run(newStock, now, product.id);

      // Record adjustment movement
      const moveRes = db.prepare(`
        INSERT INTO stock_movements (shop_id, product_id, movement_type, quantity, reference_id, notes, created_at)
        VALUES (?, ?, 'ADJUSTMENT', ?, NULL, ?, ?)
      `).run(
        shopId,
        product.id,
        movementDelta,
        notes ? notes.trim() : `Manual stock adjustment (${adjType})`,
        now
      );

      return {
        product,
        previous_stock: product.current_stock,
        new_stock: newStock,
        movement_id: moveRes.lastInsertRowid,
        movement_delta: movementDelta
      };
    });

    const result = adjustTx();

    logAudit(db, {
      shop_id: shopId,
      user_id: req.user.id,
      action: 'STOCK_ADJUSTMENT',
      entity_name: 'products',
      entity_id: result.product.id,
      old_values: { stock: result.previous_stock },
      new_values: { stock: result.new_stock, type: adjType, delta: result.movement_delta }
    });

    return res.json({
      message: 'Stock adjusted successfully',
      product_id: result.product.id,
      product_name: result.product.name,
      previous_stock: result.previous_stock,
      new_stock: result.new_stock,
      adjustment_type: adjType,
      delta: result.movement_delta
    });
  } catch (err) {
    console.error('Stock adjustment error:', err);
    return res.status(400).json({ error: err.message || 'Failed to adjust stock' });
  }
});

module.exports = router;
