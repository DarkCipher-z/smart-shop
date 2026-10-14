// server/middleware/tenant.js
const db = require('../db');
const { getISTTime } = require('../utils/date');

/**
 * Helper to determine the effective shop_id for query filters.
 * Returns:
 * - number: when filtering by a specific shop
 * - null: when admin requests all shops (or doesn't specify one)
 */
function getShopFilter(req) {
  if (!req.user) return null;

  if (req.user.role === 'ADMIN') {
    const q = req.query.shop_id || req.headers['x-shop-id'] || req.body.shop_id;
    return q ? parseInt(q, 10) : null;
  }

  // Shopkeeper is always scoped strictly to their own shop
  return req.user.shop_id;
}

/**
 * Middleware that attaches req.shopId for the current request.
 * If shopkeeper, req.shopId = req.user.shop_id.
 * If admin, req.shopId = query/header/body shop_id or null.
 */
function tenantContext(req, res, next) {
  if (!req.user) {
    return next();
  }

  if (req.user.role === 'ADMIN') {
    const requestedShopId = req.query.shop_id || req.headers['x-shop-id'] || req.body.shop_id;
    req.shopId = requestedShopId ? parseInt(requestedShopId, 10) : null;
  } else {
    req.shopId = req.user.shop_id;
  }

  next();
}

/**
 * Middleware: Verify current IST time is within shop's operating hours.
 * Rejects with 403 if outside operating hours.
 * Note: ADMIN role bypasses operating hours checks.
 */
function checkOperatingHours(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Administrators are exempt from operating hours restrictions
  if (req.user.role === 'ADMIN') {
    return next();
  }

  const shopId = req.shopId || req.user.shop_id;
  if (!shopId) {
    return res.status(400).json({ error: 'Shop ID context missing' });
  }

  const shop = db.prepare(`
    SELECT id, name, operating_start_time, operating_end_time
    FROM shops
    WHERE id = ?
  `).get(shopId);

  if (!shop) {
    return res.status(404).json({ error: 'Shop not found' });
  }

  const startTime = shop.operating_start_time || '08:00';
  const endTime = shop.operating_end_time || '22:00';
  const currentTime = getISTTime();

  // Handle standard operating hours (e.g., 08:00 to 22:00)
  // or overnight shifts (e.g., 20:00 to 04:00)
  let isOpen = false;
  if (startTime <= endTime) {
    isOpen = currentTime >= startTime && currentTime <= endTime;
  } else {
    // Overnight: e.g. 21:00 to 05:00
    isOpen = currentTime >= startTime || currentTime <= endTime;
  }

  if (!isOpen) {
    return res.status(403).json({
      error: `Sales operations are restricted outside shop operating hours: ${startTime} - ${endTime} IST. Current IST time is ${currentTime}.`,
      operating_start_time: startTime,
      operating_end_time: endTime,
      current_time: currentTime
    });
  }

  next();
}

module.exports = {
  getShopFilter,
  tenantContext,
  checkOperatingHours
};
