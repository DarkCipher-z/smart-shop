// server/routes/settings.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { tenantContext, getShopFilter } = require('../middleware/tenant');
const { logAudit } = require('../utils/audit');

router.use(verifyToken);
router.use(tenantContext);

/**
 * GET /api/settings/shop
 * Get current shop settings (operating hours, invoice prefix, contact details, etc.)
 */
router.get('/shop', (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;

    if (!shopId) {
      if (req.user.role === 'ADMIN') {
        // Return first shop or all shops summary if admin hasn't selected one
        const allShops = db.prepare('SELECT * FROM shops ORDER BY id ASC').all();
        return res.json({ shops: allShops, current_shop: allShops[0] || null });
      }
      return res.status(400).json({ error: 'No shop associated with this user' });
    }

    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    return res.json(shop);
  } catch (err) {
    console.error('Get shop settings error:', err);
    return res.status(500).json({ error: 'Failed to retrieve shop settings' });
  }
});

/**
 * PUT /api/settings/shop
 * Updates shop profile and operating hours
 */
router.put('/shop', (req, res) => {
  try {
    const shopId = req.shopId || req.user.shop_id;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID context required' });
    }

    const current = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);
    if (!current) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const {
      name,
      invoice_prefix,
      phone,
      email,
      address,
      gstin,
      operating_start_time,
      operating_end_time
    } = req.body;

    db.prepare(`
      UPDATE shops
      SET name = ?,
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
      action: 'UPDATE_SHOP_PROFILE',
      entity_name: 'shops',
      entity_id: shopId,
      old_values: current,
      new_values: updated
    });

    return res.json({
      message: 'Shop settings updated successfully',
      shop: updated
    });
  } catch (err) {
    console.error('Update shop settings error:', err);
    return res.status(500).json({ error: 'Failed to update shop settings' });
  }
});

module.exports = router;
