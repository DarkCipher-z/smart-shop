# Smart Shop — Smart Inventory & Billing for Local Shops

A modern, production-ready, multi-tenant online web application built for local retail shops in India. Built with a full-stack architecture featuring a persistent relational SQLite database (`Asia/Kolkata` IST timezone), strict server-side tenant isolation, ACID transactional billing/POS, inventory management, honest database-driven reports, and multi-language support.

---

## 🚀 Live Application Access

| Component | URL | Notes |
| :--- | :--- | :--- |
| **Live Internet Web App (HTTPS)** | **[https://b1fd85021e8278.lhr.life](https://b1fd85021e8278.lhr.life)** | Public HTTPS live deployment with full TLS termination |
| **Frontend Web Portal (Local)** | [http://localhost:5173](http://localhost:5173) | Vite development server with `/api` reverse proxy |
| **Production Server (Local)** | [http://localhost:3001](http://localhost:3001) | Express API + SPA production static server |
| **API Health Check** | [https://b1fd85021e8278.lhr.life/api/health](https://b1fd85021e8278.lhr.life/api/health) | Status check with system uptime and `Asia/Kolkata` timezone |

---

## 🔐 Authorized Initial Accounts (Private Reference)

> **Security Notice:** Public self-registration is permanently disabled. In compliance with enterprise security standards, credentials are **not** displayed on the public login page. Store these credentials securely and do not share administrative access publicly.

All initial accounts are configured with the initial password: `SmartShop@2026` (configurable via `.env`):

| Role | Full Name | Authorized Work Email | Assigned Tenant | Scope & Access |
| :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | `Smart Shop Administrator` | `admin@smartshop.in` | Global (All Shops) | Full cross-shop comparison, raw Data Explorer across 10 tables, user management, audit trail inspection |
| **SHOPKEEPER** | `Kishore Solanki` | `Kishoresolanki732@gmail.com` | **Solanki Kirana Stores** (`SOL`) | Strictly isolated to Solanki Kirana Stores data |
| **SHOPKEEPER** | `Dipesh Patel` | `dipeshstores85@gmail.com` | **Dipesh Grocery Stores** (`DIP`) | Strictly isolated to Dipesh Grocery Stores data |
| **SHOPKEEPER** | `Mohan J Chaudhari` | `mohanjchaudhari54@gmail.com` | **Mohan Stationary Shop** (`MOH`) | Strictly isolated to Mohan Stationary Shop data |

---

## 🌐 Deploying to GitHub & Live on the Internet

This repository is structured for seamless version control on GitHub and 1-click cloud hosting on platforms like **Render**, **Railway**, **Fly.io**, **AWS**, or any **Docker VPS**.

### 1. Push to GitHub

```bash
# Initialize git repository (if not already initialized)
git init

# Add all files (respects .gitignore: keeps DB, logs, and node_modules private)
git add .

# Commit
git commit -m "feat: complete production-ready Smart Shop multi-tenant application"

# Link to your GitHub repository and push
git remote add origin https://github.com/YOUR_USERNAME/smart-shop.git
git branch -M main
git push -u origin main
```

### 2. Deploy Live with Docker (Recommended)

A multi-stage `Dockerfile` and `docker-compose.yml` are included in the repository root:

```bash
# Build and run container in detached mode
docker-compose up -d --build
```
Your application will be live at `http://your-server-ip:3001` with persistent volume storage for the SQLite database.

### 1-Click Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/DarkCipher-z/smart-shop)

Click the button above or open this URL directly in your browser:
👉 **[https://render.com/deploy?repo=https://github.com/DarkCipher-z/smart-shop](https://render.com/deploy?repo=https://github.com/DarkCipher-z/smart-shop)**

Render will automatically parse `render.yaml`, configure the Web Service, install dependencies, compile the production React bundle, and start your multi-tenant shop with persistent SQLite and SSL!

### Manual Render Setup (If preferred)
1. In [Render Dashboard](https://dashboard.render.com/), click **New +** > **Web Service**.
2. Select **DarkCipher-z/smart-shop** from your connected GitHub repos.
3. Configure the service:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node server/index.js`
   - **Plan:** `Free`
4. Set Environment Variables:
   - `NODE_ENV` = `production`
   - `PORT` = `10000`
   - `JWT_SECRET` = `(click generate or provide 32+ character key)`
   - `TIMEZONE` = `Asia/Kolkata`
   - `DATABASE_PATH` = `/var/data/smartshop.db` (or mount a persistent disk)
   - `INITIAL_SEED_PASSWORD` = `<your-custom-seed-password>`

---

## 🛠️ Local Development Setup

```bash
# 1. Clone your repository
git clone https://github.com/YOUR_USERNAME/smart-shop.git
cd smart-shop

# 2. Copy environment template
cp .env.example .env

# 3. Install dependencies
npm install
cd client && npm install && cd ..

# 4. Start both Backend API and Vite Frontend together:
npm run dev
```

---

## 🌟 Architecture & Features

### 1. Authentic Production Authentication
- Clean, high-contrast dark theme login page (`#0B0F19` background, glassmorphism card, `#8B5CF6` violet and `#06B6D4` cyan accents).
- Show/hide password toggle with eye indicator.
- Case-insensitive email normalization.
- 256-bit encrypted JWT sessions (stored securely in `localStorage`).
- Automatic session restoration with 401 interceptor.

### 2. Strict Server-Side Multi-Tenancy
- Exactly 3 shop tenants: **Solanki Kirana Stores (SOL)**, **Dipesh Grocery Stores (DIP)**, and **Mohan Stationary Shop (MOH)**.
- Shopkeepers cannot modify shop names or create additional shops.
- Server-side `shop_id` scoping on all SQL queries ensures strict isolation.
- Unauthorized cross-tenant or admin endpoint access immediately returns `HTTP 403 Forbidden`.

### 3. ACID Point of Sale & Billing
- Real-time product search by barcode, SKU, or name.
- Visual cart with line-item and overall discount calculations.
- Automatic tax engine: supports both GST-inclusive and GST-exclusive pricing, computing 50% CGST + 50% SGST intra-state tax splits.
- Row-level transactional integrity: sale, item cost snapshots, inventory deduction, and stock movement logs are written atomically inside a single database transaction.
- Sequential invoice numbering: `{PREFIX}-{YYYYMMDD}-{NNNN}` (e.g. `SOL-20261015-0001`).
- Print layout with browser print stylesheet and instant GST tax invoice PDF download via `jsPDF`.

### 4. Honest Data Policy
- Zero dummy sales, zero fake customers, zero fake suppliers, and zero fabricated invoices.
- All dashboard charts, summary metrics, and report figures derive purely from real database records using SQL aggregations (`SUM`, `COUNT`, `AVG`).
- Clean empty states with `₹0.00` metrics.
- CSV Bulk Import for Products, Customers, and Suppliers with downloadable templates, duplicate SKU detection, and pre-commit previews.

### 5. Operating Hours & Timezone Enforcement
- Anchored to **`Asia/Kolkata` (IST, UTC+05:30)**.
- Operating hours enforced (`08:00 - 22:00 IST`). Out-of-hours live sales are blocked with `HTTP 403`:
  > *"Sales operations are restricted outside shop operating hours: 08:00 - 22:00 IST"*
- Administrators can adjust operating hours per shop (logged in `audit_logs`).

### 6. Dynamic Localization (i18n)
- Seamless dynamic language switching across:
  - 🇬🇧 English (`en`)
  - 🇮🇳 Hindi - हिन्दी (`hi`)
  - 🇮🇳 Marathi - मराठी (`mr`)
  - 🇮🇳 Telugu - తెలుగు (`te`)
- Translates navigation, tables, buttons, invoice headers, and reports with `localStorage` persistence.

---

## 📂 Project Directory Structure

```
smart-shop/
├── .env.example               # Production environment variable template
├── .gitignore                 # Git ignore rules (protects DB, logs, node_modules)
├── Dockerfile                 # Multi-stage production container build
├── docker-compose.yml         # Container orchestration with volume persistence
├── package.json               # Server scripts and dependencies
├── README.md                  # Comprehensive documentation
├── server/
│   ├── index.js               # Express application entry point (port 3001)
│   ├── db.js                  # Persistent SQLite database & schema (WAL mode)
│   ├── seed.js                # Initial database seeder
│   ├── middleware/
│   │   ├── auth.js            # JWT verification & role authorization
│   │   └── tenant.js          # Tenant isolation & operating hours checks
│   ├── routes/                # 11 Modular RESTful API route files
│   │   ├── admin.js           # Multi-shop comparison, Data Explorer, user management
│   │   ├── auth.js            # Authentication & profile endpoints
│   │   ├── categories.js      # Category management
│   │   ├── customers.js       # Customer directory & CSV import/export
│   │   ├── products.js        # Products catalog, stock alerts, CSV import/export
│   │   ├── purchases.js       # Purchase orders & stock inward ledger
│   │   ├── reports.js         # SQL aggregate reporting endpoints
│   │   ├── sales.js           # POS checkout, credit notes, invoice lookup
│   │   ├── settings.js        # Shop & user configuration
│   │   ├── stockMovements.js  # Inventory movement audit trail & manual adjustments
│   │   └── suppliers.js       # Supplier management & CSV import/export
│   └── utils/
│       ├── audit.js           # Centralized audit logging helper
│       └── date.js            # Asia/Kolkata timezone & Indian currency formatting
└── client/
    ├── index.html             # HTML entry point
    ├── vite.config.js         # Vite configuration with /api reverse proxy
    ├── tailwind.config.js     # Tailwind CSS theme (Dark Navy, Violet, Cyan)
    ├── package.json           # Frontend dependencies
    └── src/
        ├── main.jsx           # React app entry point
        ├── App.jsx            # Router hierarchy & route protection guards
        ├── index.css          # Glassmorphism, animations & print styles
        ├── context/           # AuthContext, ThemeContext, ToastContext
        ├── i18n/              # Translations for en, hi, mr, te
        ├── components/        # Layout (Sidebar, Topbar) & UI components
        ├── pages/             # Login, Dashboard, POS, Inventory, Sales, Reports, etc.
        └── utils/             # api.js, format.js, pdf.js
```
