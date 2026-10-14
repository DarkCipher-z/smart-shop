// server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, verifyToken } = require('../middleware/auth');
const { getISTTimestamp } = require('../utils/date');
const { logAudit } = require('../utils/audit');

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns JWT token and user profile
 */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare(`
      SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.shop_id, u.language, u.theme,
             s.name as shop_name, s.code as shop_code, s.invoice_prefix, s.operating_start_time, s.operating_end_time
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE LOWER(u.email) = LOWER(?)
    `).get(email.trim());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      shopId: user.shop_id,
      fullName: user.full_name
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    logAudit(db, {
      shop_id: user.shop_id,
      user_id: user.id,
      action: 'LOGIN',
      entity_name: 'users',
      entity_id: user.id,
      new_values: { email: user.email, role: user.role }
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        shop_id: user.shop_id,
        language: user.language || 'en',
        theme: user.theme || 'dark',
        shop: user.shop_id ? {
          id: user.shop_id,
          name: user.shop_name,
          code: user.shop_code,
          invoice_prefix: user.invoice_prefix,
          operating_start_time: user.operating_start_time,
          operating_end_time: user.operating_end_time
        } : null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
});

/**
 * GET /api/auth/me
 * Returns currently authenticated user and shop metadata
 */
router.get('/me', verifyToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.role, u.shop_id, u.language, u.theme, u.created_at,
             s.name as shop_name, s.code as shop_code, s.invoice_prefix, s.phone as shop_phone,
             s.email as shop_email, s.address as shop_address, s.gstin as shop_gstin,
             s.operating_start_time, s.operating_end_time
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE u.id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      shop_id: user.shop_id,
      language: user.language || 'en',
      theme: user.theme || 'dark',
      created_at: user.created_at,
      shop: user.shop_id ? {
        id: user.shop_id,
        name: user.shop_name,
        code: user.shop_code,
        invoice_prefix: user.invoice_prefix,
        phone: user.shop_phone,
        email: user.shop_email,
        address: user.shop_address,
        gstin: user.shop_gstin,
        operating_start_time: user.operating_start_time,
        operating_end_time: user.operating_end_time
      } : null
    });
  } catch (err) {
    console.error('Auth /me error:', err);
    return res.status(500).json({ error: 'Failed to retrieve user profile' });
  }
});

/**
 * PUT /api/auth/profile
 * Updates user full_name, language preference, theme
 */
router.put('/profile', verifyToken, (req, res) => {
  try {
    const { full_name, language, theme } = req.body;

    const current = db.prepare('SELECT id, full_name, language, theme FROM users WHERE id = ?').get(req.user.id);
    if (!current) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedName = full_name !== undefined ? full_name.trim() : current.full_name;
    const updatedLang = language !== undefined ? language : current.language;
    const updatedTheme = theme !== undefined ? theme : current.theme;

    if (!updatedName) {
      return res.status(400).json({ error: 'Full name cannot be empty' });
    }

    db.prepare(`
      UPDATE users
      SET full_name = ?, language = ?, theme = ?
      WHERE id = ?
    `).run(updatedName, updatedLang, updatedTheme, req.user.id);

    logAudit(db, {
      shop_id: req.user.shop_id,
      user_id: req.user.id,
      action: 'UPDATE_PROFILE',
      entity_name: 'users',
      entity_id: req.user.id,
      old_values: { full_name: current.full_name, language: current.language, theme: current.theme },
      new_values: { full_name: updatedName, language: updatedLang, theme: updatedTheme }
    });

    return res.json({
      message: 'Profile updated successfully',
      user: {
        id: req.user.id,
        email: req.user.email,
        full_name: updatedName,
        language: updatedLang,
        theme: updatedTheme,
        role: req.user.role,
        shop_id: req.user.shop_id
      }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * PUT /api/auth/password
 * Changes password with current password verification
 */
router.put('/password', verifyToken, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    logAudit(db, {
      shop_id: req.user.shop_id,
      user_id: req.user.id,
      action: 'CHANGE_PASSWORD',
      entity_name: 'users',
      entity_id: req.user.id
    });

    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
