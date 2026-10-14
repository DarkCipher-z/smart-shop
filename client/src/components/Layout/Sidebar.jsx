import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Receipt,
  Truck,
  Users,
  Building2,
  BarChart3,
  ShieldCheck,
  Database,
  UserCog,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ isOpen, onClose }) {
  const { t } = useTranslation();
  const { user, logout, isAdmin } = useAuth();

  const mainNavItems = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: '/pos', label: t('nav.pos'), icon: ShoppingCart },
    { to: '/inventory', label: t('nav.inventory'), icon: Boxes },
    { to: '/sales', label: t('nav.sales'), icon: Receipt },
    { to: '/purchases', label: t('nav.purchases'), icon: Truck },
    { to: '/customers', label: t('nav.customers'), icon: Users },
    { to: '/suppliers', label: t('nav.suppliers'), icon: Building2 },
    { to: '/reports', label: t('nav.reports'), icon: BarChart3 },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  const adminNavItems = [
    { to: '/admin', label: t('nav.admin'), icon: ShieldCheck },
    { to: '/admin/data-explorer', label: t('nav.dataExplorer'), icon: Database },
    { to: '/admin/users', label: t('nav.userManagement'), icon: UserCog },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-navy-900/95 dark:bg-navy-900/95 light:bg-white border-r border-navy-800 dark:border-navy-800 light:border-gray-200 backdrop-blur-xl flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-navy-800 dark:border-navy-800 light:border-gray-200">
          <div className="flex items-center gap-3">
            {/* SVG Logo: Shopping bag with lightning bolt */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-400 p-0.5 shadow-md shadow-violet-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-navy-900 rounded-[10px] flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-violet-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                  <polygon
                    points="12 2 8 13 14 13 10 22"
                    className="fill-cyan-400 stroke-none"
                  />
                </svg>
              </div>
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white dark:text-white light:text-gray-900 block leading-tight">
                Smart Shop
              </span>
              <span className="text-[10px] font-semibold text-cyan-400 tracking-wider uppercase">
                {user?.shopName || 'Retail ERP'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6">
          {/* Main Menu */}
          <div>
            <div className="px-2.5 mb-2 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
              Main Operations
            </div>
            <nav className="space-y-1">
              {mainNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => onClose?.()}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                        : 'text-gray-400 dark:text-gray-400 light:text-gray-600 hover:text-gray-100 dark:hover:text-gray-100 light:hover:text-gray-900 hover:bg-navy-800/60 dark:hover:bg-navy-800/60 light:hover:bg-gray-100'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Admin Menu (Admin only) */}
          {isAdmin && (
            <div>
              <div className="px-2.5 mb-2 text-[10px] font-bold tracking-wider text-violet-400 uppercase">
                Super Admin
              </div>
              <nav className="space-y-1">
                {adminNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin'}
                    onClick={() => onClose?.()}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                          : 'text-gray-400 dark:text-gray-400 light:text-gray-600 hover:text-gray-100 dark:hover:text-gray-100 light:hover:text-gray-900 hover:bg-navy-800/60 dark:hover:bg-navy-800/60 light:hover:bg-gray-100'
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          )}
        </div>

        {/* Bottom User Area */}
        <div className="p-3 border-t border-navy-800 dark:border-navy-800 light:border-gray-200 bg-navy-950/40">
          <div className="flex items-center justify-between p-2 rounded-xl bg-navy-800/60 dark:bg-navy-800/60 light:bg-gray-50 border border-navy-700/50 dark:border-navy-700/50 light:border-gray-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-cyan-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-200 dark:text-gray-200 light:text-gray-800 truncate">
                  {user?.fullName || 'Shopkeeper'}
                </p>
                <p className="text-[10px] text-gray-400 capitalize truncate">
                  {user?.role || 'User'}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title={t('nav.logout')}
              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
