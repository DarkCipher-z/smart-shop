import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';

// Layout
import Layout from './components/Layout/Layout';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ui/ErrorBoundary';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import SaleDetail from './pages/SaleDetail';
import Purchases from './pages/Purchases';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Reports from './pages/Reports';
import AdminDashboard from './pages/admin/AdminDashboard';
import DataExplorer from './pages/admin/DataExplorer';
import UserManagement from './pages/admin/UserManagement';
import Settings from './pages/Settings';

// Protected Route Component
function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Authenticating session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// Public Route (redirects to / if already logged in)
function PublicRoute({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading Smart Shop..." />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/admin' : '/'} replace />;
  }

  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
          <Routes>
            {/* Public Auth Route */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />

            {/* Protected App Layout Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard */}
              <Route index element={<Dashboard />} />

              {/* Point of Sale */}
              <Route path="pos" element={<POS />} />

              {/* Inventory Management */}
              <Route path="inventory" element={<Inventory />} />
              <Route path="inventory/:id" element={<Inventory />} />

              {/* Sales Ledger & Invoice Detail */}
              <Route path="sales" element={<Sales />} />
              <Route path="sales/:id" element={<SaleDetail />} />

              {/* Purchases */}
              <Route path="purchases" element={<Purchases />} />

              {/* Customers & Suppliers */}
              <Route path="customers" element={<Customers />} />
              <Route path="suppliers" element={<Suppliers />} />

              {/* Reports & Analytics */}
              <Route path="reports" element={<Reports />} />

              {/* Admin Only Routes */}
              <Route
                path="admin"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/data-explorer"
                element={
                  <ProtectedRoute adminOnly>
                    <DataExplorer />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/users"
                element={
                  <ProtectedRoute adminOnly>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />

              {/* Settings */}
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Fallback Catch-all Route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
