// server/seed.js
const bcrypt = require('bcryptjs');
const db = require('./db');
const { getISTTimestamp, getISTDate } = require('./utils/date');

const DEFAULT_PASSWORD = process.env.INITIAL_SEED_PASSWORD || 'SmartShop@2026';

function seedDatabase(force = false) {
  const shopCount = db.prepare('SELECT COUNT(*) as count FROM shops').get().count;
  if (shopCount > 0 && !force) {
    console.log('[Seed] Database already contains shops. Skipping seed.');
    return;
  }

  console.log('[Seed] Starting database seeding...');

  const now = getISTTimestamp();
  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
  const seedTx = db.transaction(() => {
    if (force) {
      console.log('[Seed] Force mode: clearing existing data...');
      db.pragma('foreign_keys = OFF');
      db.prepare('DELETE FROM audit_logs').run();
      db.prepare('DELETE FROM credit_notes').run();
      db.prepare('DELETE FROM purchase_items').run();
      db.prepare('DELETE FROM purchases').run();
      db.prepare('DELETE FROM sale_items').run();
      db.prepare('DELETE FROM sales').run();
      db.prepare('DELETE FROM stock_movements').run();
      db.prepare('DELETE FROM products').run();
      db.prepare('DELETE FROM categories').run();
      db.prepare('DELETE FROM customers').run();
      db.prepare('DELETE FROM suppliers').run();
      db.prepare('DELETE FROM users').run();
      db.prepare('DELETE FROM shops').run();
      db.pragma('foreign_keys = ON');
    }

    // 1. Insert 3 Shops
    const insertShop = db.prepare(`
      INSERT INTO shops (id, name, code, invoice_prefix, phone, email, address, gstin, operating_start_time, operating_end_time, timezone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertShop.run(
      1,
      'Solanki Kirana Stores',
      'SOL',
      'SOL',
      '+91 9820123456',
      'solanki.kirana@smartshop.in',
      'Shop No. 4, Station Road, Malad West, Mumbai, Maharashtra 400064',
      '27AABCS1429B1Z1',
      '08:00',
      '22:00',
      'Asia/Kolkata',
      now
    );

    insertShop.run(
      2,
      'Dipesh Grocery Stores',
      'DIP',
      'DIP',
      '+91 9820654321',
      'dipeshstores85@gmail.com',
      'Gala No. 12, Market Yard, Gultekdi, Pune, Maharashtra 411037',
      '27AABCD8512D1Z5',
      '07:30',
      '22:30',
      'Asia/Kolkata',
      now
    );

    insertShop.run(
      3,
      'Mohan Stationary Shop',
      'MOH',
      'MOH',
      '+91 9820987654',
      'mohanjchaudhari54@gmail.com',
      'Plot 18, Opp. RYK College, College Road, Nashik, Maharashtra 422005',
      '27AABCM5421M1Z8',
      '09:00',
      '21:00',
      'Asia/Kolkata',
      now
    );

    console.log('[Seed] 3 Shops created successfully.');

    // 2. Insert 4 Users
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, shop_id, language, theme, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      1,
      'admin@smartshop.in',
      passwordHash,
      'Smart Shop Administrator',
      'ADMIN',
      null,
      'en',
      'dark',
      now
    );

    insertUser.run(
      2,
      'Kishoresolanki732@gmail.com',
      passwordHash,
      'Kishore Solanki',
      'SHOPKEEPER',
      1,
      'en',
      'dark',
      now
    );

    insertUser.run(
      3,
      'dipeshstores85@gmail.com',
      passwordHash,
      'Dipesh Patel',
      'SHOPKEEPER',
      2,
      'en',
      'dark',
      now
    );

    insertUser.run(
      4,
      'mohanjchaudhari54@gmail.com',
      passwordHash,
      'Mohan J Chaudhari',
      'SHOPKEEPER',
      3,
      'en',
      'dark',
      now
    );

    console.log('[Seed] 4 Users created with default password "SmartShop@2026".');

    // 3. Insert Default Categories
    const insertCategory = db.prepare(`
      INSERT INTO categories (shop_id, name, created_at)
      VALUES (?, ?, ?)
    `);

    const groceryCategories = ['Groceries', 'Dairy', 'Beverages', 'Snacks', 'Personal Care', 'Household'];
    const stationaryCategories = ['Notebooks', 'Pens & Pencils', 'Art Supplies', 'Office Supplies', 'Paper Products'];

    const catMap = {};

    for (const shopId of [1, 2]) {
      for (const catName of groceryCategories) {
        const info = insertCategory.run(shopId, catName, now);
        catMap[`${shopId}:${catName}`] = info.lastInsertRowid;
      }
    }

    for (const catName of stationaryCategories) {
      const info = insertCategory.run(3, catName, now);
      catMap[`3:${catName}`] = info.lastInsertRowid;
    }

    console.log('[Seed] Default categories created.');

    // 4. Honest Data Policy: 0 fake suppliers, 0 fake customers, 0 fake sales, 0 fake invoices
    console.log('[Seed] Honest Data Policy enforced: Zero fake customers, zero fake suppliers, zero fake sales.');

    // 5. Seed Core Product Catalog with Initial Stock
    const insertProduct = db.prepare(`
      INSERT INTO products (
        shop_id, category_id, sku, name, unit_of_measure, purchase_cost, selling_price, gst_rate,
        is_tax_inclusive, current_stock, min_stock_threshold, expiry_date, supplier_id, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    const insertStockMovement = db.prepare(`
      INSERT INTO stock_movements (shop_id, product_id, movement_type, quantity, reference_id, notes, created_at)
      VALUES (?, ?, 'INITIAL', ?, NULL, 'Initial inventory setup', ?)
    `);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 20);
    const expiringDateStr = futureDate.toISOString().split('T')[0];

    const farFutureDate = new Date();
    farFutureDate.setDate(farFutureDate.getDate() + 365);
    const farFutureStr = farFutureDate.toISOString().split('T')[0];

    const productsSeed = [
      // Shop 1: Solanki Kirana Stores
      { shop_id: 1, cat: 'Groceries', sku: 'SOL-GRO-001', name: 'Aashirvaad Shudh Chakki Atta 5kg', uom: 'kg', cost: 220, price: 265, gst: 0, inc: 1, stock: 45, min: 10, exp: farFutureStr, sup: null },
      { shop_id: 1, cat: 'Groceries', sku: 'SOL-GRO-002', name: 'Fortune Sunlite Refined Sunflower Oil 1L', uom: 'pcs', cost: 130, price: 155, gst: 5, inc: 1, stock: 35, min: 10, exp: farFutureStr, sup: null },
      { shop_id: 1, cat: 'Groceries', sku: 'SOL-GRO-003', name: 'Tata Salt Vacuum Evaporated Iodized 1kg', uom: 'pcs', cost: 22, price: 28, gst: 0, inc: 1, stock: 90, min: 20, exp: farFutureStr, sup: null },
      { shop_id: 1, cat: 'Dairy', sku: 'SOL-DAI-001', name: 'Amul Taaza Homogenised Toned Milk 1L', uom: 'pcs', cost: 65, price: 74, gst: 5, inc: 1, stock: 25, min: 10, exp: expiringDateStr, sup: null },
      { shop_id: 1, cat: 'Dairy', sku: 'SOL-DAI-002', name: 'Amul Butter Pasteurized 500g', uom: 'pcs', cost: 245, price: 280, gst: 12, inc: 1, stock: 18, min: 8, exp: farFutureStr, sup: null },
      { shop_id: 1, cat: 'Beverages', sku: 'SOL-BEV-001', name: 'Tata Tea Gold Leaf Tea 500g', uom: 'pcs', cost: 290, price: 345, gst: 5, inc: 1, stock: 24, min: 8, exp: farFutureStr, sup: null },
      { shop_id: 1, cat: 'Snacks', sku: 'SOL-SNK-001', name: 'Parle-G Original Gluco Biscuits 250g', uom: 'pcs', cost: 24, price: 30, gst: 18, inc: 1, stock: 50, min: 15, exp: farFutureStr, sup: null },
      { shop_id: 1, cat: 'Personal Care', sku: 'SOL-PC-001', name: 'Dettol Original Bathing Soap 75g', uom: 'pcs', cost: 32, price: 42, gst: 18, inc: 1, stock: 4, min: 12, exp: farFutureStr, sup: null },
      { shop_id: 1, cat: 'Household', sku: 'SOL-HOU-001', name: 'Surf Excel Quick Wash Detergent 1kg', uom: 'pcs', cost: 165, price: 199, gst: 18, inc: 1, stock: 22, min: 8, exp: farFutureStr, sup: null },

      // Shop 2: Dipesh Grocery Stores
      { shop_id: 2, cat: 'Groceries', sku: 'DIP-GRO-001', name: 'Fortune Premium Kachi Ghani Mustard Oil 1L', uom: 'pcs', cost: 145, price: 175, gst: 5, inc: 1, stock: 28, min: 8, exp: farFutureStr, sup: null },
      { shop_id: 2, cat: 'Groceries', sku: 'DIP-GRO-002', name: 'Madhur Pure & Hygienic Sugar 1kg', uom: 'kg', cost: 44, price: 52, gst: 5, inc: 1, stock: 75, min: 20, exp: farFutureStr, sup: null },
      { shop_id: 2, cat: 'Dairy', sku: 'DIP-DAI-001', name: 'Gowardhan Pure Cow Ghee 1L Tin', uom: 'pcs', cost: 620, price: 710, gst: 12, inc: 1, stock: 15, min: 5, exp: farFutureStr, sup: null },
      { shop_id: 2, cat: 'Snacks', sku: 'DIP-SNK-001', name: 'Haldirams Nagpur Aloo Bhujia 400g', uom: 'pcs', cost: 95, price: 120, gst: 12, inc: 1, stock: 3, min: 10, exp: expiringDateStr, sup: null },

      // Shop 3: Mohan Stationary Shop
      { shop_id: 3, cat: 'Notebooks', sku: 'MOH-NB-001', name: 'Classmate Long Book 172 Pages Ruled', uom: 'pcs', cost: 48, price: 70, gst: 12, inc: 1, stock: 150, min: 25, exp: null, sup: null },
      { shop_id: 3, cat: 'Notebooks', sku: 'MOH-NB-002', name: 'Navneet Youva Spiral Notebook A4 200 Pages', uom: 'pcs', cost: 85, price: 120, gst: 12, inc: 1, stock: 65, min: 15, exp: null, sup: null },
      { shop_id: 3, cat: 'Pens & Pencils', sku: 'MOH-PEN-001', name: 'Reynolds 045 Fine Carbure Ball Pen (Box of 20)', uom: 'box', cost: 140, price: 200, gst: 18, inc: 1, stock: 40, min: 10, exp: null, sup: null },
      { shop_id: 3, cat: 'Art Supplies', sku: 'MOH-ART-001', name: 'Camlin Kokuyo Oil Pastels 25 Shades Box', uom: 'box', cost: 115, price: 160, gst: 12, inc: 1, stock: 30, min: 8, exp: null, sup: null },
      { shop_id: 3, cat: 'Paper Products', sku: 'MOH-PPR-001', name: 'JK Copier A4 Paper 75 GSM (500 Sheets Ream)', uom: 'ream', cost: 290, price: 375, gst: 12, inc: 1, stock: 45, min: 12, exp: null, sup: null },
      { shop_id: 3, cat: 'Office Supplies', sku: 'MOH-OFF-001', name: 'Kangaro Stapler No. 10 with Pins Box', uom: 'set', cost: 65, price: 95, gst: 18, inc: 1, stock: 5, min: 15, exp: null, sup: null }
    ];

    for (const p of productsSeed) {
      const catId = catMap[`${p.shop_id}:${p.cat}`];
      const res = insertProduct.run(
        p.shop_id,
        catId,
        p.sku,
        p.name,
        p.uom,
        p.cost,
        p.price,
        p.gst,
        p.inc,
        p.stock,
        p.min,
        p.exp,
        p.sup,
        now,
        now
      );

      if (p.stock > 0) {
        insertStockMovement.run(p.shop_id, res.lastInsertRowid, p.stock, now);
      }
    }

  });

  try {
    seedTx();
    console.log('[Seed] Seeding completed successfully!');
  } catch (err) {
    console.error('[Seed] Error during seeding:', err);
    throw err;
  }
}

// Allow direct execution: node server/seed.js [--force]
if (require.main === module) {
  const isForce = process.argv.includes('--force');
  seedDatabase(isForce);
}

module.exports = seedDatabase;
