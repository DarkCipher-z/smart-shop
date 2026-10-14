// server/utils/audit.js
const { getISTTimestamp } = require('./date');

/**
 * Helper to record an audit log entry in the database.
 * Does not throw errors so core business logic isn't blocked by audit failures.
 */
function logAudit(db, { shop_id = null, user_id = null, action, entity_name = null, entity_id = null, old_values = null, new_values = null }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        shop_id, user_id, action, entity_name, entity_id, old_values, new_values, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const oldStr = old_values !== null && old_values !== undefined 
      ? (typeof old_values === 'string' ? old_values : JSON.stringify(old_values)) 
      : null;
      
    const newStr = new_values !== null && new_values !== undefined 
      ? (typeof new_values === 'string' ? new_values : JSON.stringify(new_values)) 
      : null;

    stmt.run(
      shop_id,
      user_id,
      action,
      entity_name,
      entity_id,
      oldStr,
      newStr,
      getISTTimestamp()
    );
  } catch (err) {
    console.error('[AuditLog] Error recording audit log:', err.message);
  }
}

module.exports = {
  logAudit
};
