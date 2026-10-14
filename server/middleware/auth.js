// server/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'smartshop-super-secret-jwt-key-2026';

/**
 * Verifies JWT token in Authorization: Bearer <token>
 * Attaches user record to req.user
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication token is required' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid token format. Expected Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch latest user info from DB
    const user = db.prepare(`
      SELECT id, email, full_name, role, shop_id, language, theme, created_at
      FROM users
      WHERE id = ?
    `).get(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User associated with token no longer exists' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again' });
    }
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

/**
 * Requires the authenticated user to have the ADMIN role
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required' });
  }
  next();
}

/**
 * For shopkeepers, verifies that the target shop_id matches their assigned shop.
 * Admin role is permitted to access any shop.
 */
function requireShopAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admin has access to all shops
  if (req.user.role === 'ADMIN') {
    return next();
  }

  // Shopkeeper must belong to a shop
  if (!req.user.shop_id) {
    return res.status(403).json({ error: 'Shopkeeper account is not assigned to any shop' });
  }

  // Extract target shop_id from params, query, or body
  const targetShopId = req.params.shopId || req.query.shop_id || req.body.shop_id;

  if (targetShopId !== undefined && targetShopId !== null) {
    const targetIdNum = parseInt(targetShopId, 10);
    if (targetIdNum !== req.user.shop_id) {
      return res.status(403).json({
        error: `Access denied. You do not have permission to access shop ID ${targetIdNum}`
      });
    }
  }

  next();
}

module.exports = {
  JWT_SECRET,
  verifyToken,
  requireAdmin,
  requireShopAccess
};
