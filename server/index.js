// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const seedDatabase = require('./seed');

// Import Route Handlers
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const salesRoutes = require('./routes/sales');
const purchasesRoutes = require('./routes/purchases');
const customersRoutes = require('./routes/customers');
const suppliersRoutes = require('./routes/suppliers');
const reportsRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const stockMovementsRoutes = require('./routes/stockMovements');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Security Headers via Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 2. CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:3001'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(null, true); // Dev-friendly fallback
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-shop-id']
}));

// 3. Body Parsers with 10MB limit for CSV / image imports
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 login attempts per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again after 15 minutes' }
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);

// 5. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Smart Shop Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    timezone: 'Asia/Kolkata'
  });
});

// 6. Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stock-movements', stockMovementsRoutes);

// 7. Static File Serving for Production Frontend
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 8. 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// 9. Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('[ServerError]', err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    status
  });
});

// 10. Auto-run Seed on First Start & Start Server
function startServer() {
  try {
    const shopCount = db.prepare('SELECT COUNT(*) as count FROM shops').get().count;
    if (shopCount === 0) {
      console.log('[Startup] No shops detected. Running initial database seed...');
      seedDatabase(false);
    } else {
      console.log(`[Startup] Database initialized with ${shopCount} shop(s).`);
    }
  } catch (seedErr) {
    console.error('[Startup] Seed verification error:', seedErr.message);
  }

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  Smart Shop Backend API running on port ${PORT}`);
    console.log(`  URL: http://localhost:${PORT}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Timezone: Asia/Kolkata (IST, UTC+05:30)`);
    console.log(`====================================================`);
  });
}

startServer();

module.exports = app;
