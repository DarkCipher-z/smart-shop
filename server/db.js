// server/db.js
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'smartshop.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

class SqliteDatabase {
  constructor(filePath) {
    this.rawDb = new DatabaseSync(filePath);
  }

  prepare(sql) {
    return this.rawDb.prepare(sql);
  }

  exec(sql) {
    return this.rawDb.exec(sql);
  }

  pragma(str) {
    try {
      return this.rawDb.exec('PRAGMA ' + str + ';');
    } catch {
      return null;
    }
  }

  transaction(fn) {
    const self = this;
    return function(...args) {
      self.rawDb.exec('BEGIN IMMEDIATE;');
      try {
        const result = fn(...args);
        self.rawDb.exec('COMMIT;');
        return result;
      } catch (err) {
        try {
          self.rawDb.exec('ROLLBACK;');
        } catch {}
        throw err;
      }
    };
  }
}

const db = new SqliteDatabase(DB_PATH);

// Configure Pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');

// Initialize Schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      invoice_prefix TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      gstin TEXT,
      operating_start_time TEXT DEFAULT '08:00',
      operating_end_time TEXT DEFAULT '22:00',
      timezone TEXT DEFAULT 'Asia/Kolkata',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','SHOPKEEPER')),
      shop_id INTEGER REFERENCES shops(id),
      language TEXT DEFAULT 'en',
      theme TEXT DEFAULT 'dark',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      name TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      gstin TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      gstin TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      category_id INTEGER REFERENCES categories(id),
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      unit_of_measure TEXT DEFAULT 'pcs',
      purchase_cost REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      gst_rate REAL DEFAULT 0,
      is_tax_inclusive INTEGER DEFAULT 0,
      current_stock REAL DEFAULT 0,
      min_stock_threshold REAL DEFAULT 10,
      expiry_date TEXT,
      supplier_id INTEGER REFERENCES suppliers(id),
      is_archived INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(shop_id, sku)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      transaction_date TEXT NOT NULL,
      subtotal_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      taxable_amount REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'CASH',
      payment_status TEXT DEFAULT 'PAID',
      status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED','CANCELLED')),
      idempotency_key TEXT UNIQUE,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT,
      product_sku TEXT,
      unit_price REAL,
      purchase_cost_snapshot REAL,
      quantity REAL,
      discount_amount REAL DEFAULT 0,
      gst_rate REAL DEFAULT 0,
      taxable_amount REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      movement_type TEXT NOT NULL CHECK(movement_type IN ('INITIAL','SALE','PURCHASE','RETURN','ADJUSTMENT')),
      quantity REAL NOT NULL,
      reference_id INTEGER,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      purchase_number TEXT UNIQUE NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      transaction_date TEXT NOT NULL,
      subtotal_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'PAID',
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT,
      product_sku TEXT,
      unit_price REAL,
      quantity REAL,
      gst_rate REAL DEFAULT 0,
      total_amount REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS credit_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      credit_note_number TEXT UNIQUE NOT NULL,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      reason TEXT,
      total_amount REAL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_name TEXT,
      entity_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      created_at TEXT
    );

    -- Performance and Tenant Isolation Indexes
    CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id, is_archived);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(shop_id, sku);
    CREATE INDEX IF NOT EXISTS idx_sales_shop_date ON sales(shop_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_shop_prod ON stock_movements(shop_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_shop ON purchases(shop_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purch ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_shop ON audit_logs(shop_id, created_at);
  `);
}

initSchema();

module.exports = db;
