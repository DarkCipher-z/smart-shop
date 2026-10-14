import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Menu,
  Sun,
  Moon,
  Languages,
  Bell,
  Search,
  Check,
  Store,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function Topbar({ onMenuClick }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const languages = [
    { code: 'en', label: 'English', native: 'English' },
    { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
    { code: 'mr', label: 'Marathi', native: 'मराठी' },
    { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  ];

  const changeLanguage = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('smartshop_lang', code);
    setLangMenuOpen(false);
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return t('nav.dashboard');
    if (path.startsWith('/pos')) return t('nav.pos');
    if (path.startsWith('/inventory')) return t('nav.inventory');
    if (path.startsWith('/sales')) return t('nav.sales');
    if (path.startsWith('/purchases')) return t('nav.purchases');
    if (path.startsWith('/customers')) return t('nav.customers');
    if (path.startsWith('/suppliers')) return t('nav.suppliers');
    if (path.startsWith('/reports')) return t('nav.reports');
    if (path.startsWith('/admin/data-explorer')) return t('nav.dataExplorer');
    if (path.startsWith('/admin/users')) return t('nav.userManagement');
    if (path.startsWith('/admin')) return t('nav.admin');
    if (path.startsWith('/settings')) return t('nav.settings');
    return t('common.appName');
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-navy-900/80 dark:bg-navy-900/80 light:bg-white/80 backdrop-blur-xl border-b border-navy-800 dark:border-navy-800 light:border-gray-200 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-navy-800 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-gray-100 dark:text-gray-100 light:text-gray-900 tracking-tight">
            {getPageTitle()}
          </h1>
          <p className="text-[11px] text-gray-400 hidden sm:block">
            {user?.shopName ? `${user.shopName} · POS Portal` : 'Smart Inventory & Billing'}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Current Active Shop Tag */}
        {user?.shopName && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/10 text-violet-400 border border-violet-500/20 text-xs font-semibold">
            <Store className="w-3.5 h-3.5" />
            <span className="truncate max-w-[150px]">{user.shopName}</span>
          </div>
        )}

        {/* Language Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setLangMenuOpen(!langMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-navy-700 dark:border-navy-700 light:border-gray-200 hover:bg-navy-800/80 dark:hover:bg-navy-800/80 light:hover:bg-gray-100 text-gray-300 dark:text-gray-300 light:text-gray-700 text-xs font-semibold transition-colors"
            title="Change Language"
          >
            <Languages className="w-4 h-4 text-cyan-400" />
            <span className="uppercase">{i18n.language}</span>
          </button>

          {langMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setLangMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-44 rounded-2xl glass-panel py-1.5 z-50 border border-navy-700 shadow-2xl">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-violet-600/20 text-gray-200 transition-colors"
                  >
                    <span>
                      {lang.native} <span className="text-gray-400">({lang.label})</span>
                    </span>
                    {i18n.language === lang.code && (
                      <Check className="w-3.5 h-3.5 text-violet-400" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl border border-navy-700 dark:border-navy-700 light:border-gray-200 hover:bg-navy-800/80 dark:hover:bg-navy-800/80 light:hover:bg-gray-100 text-gray-300 dark:text-gray-300 light:text-gray-700 transition-colors"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-violet-500" />
          )}
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 rounded-xl border border-navy-700 dark:border-navy-700 light:border-gray-200 hover:bg-navy-800/80 text-gray-300 relative transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-navy-900" />
          </button>

          {notificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-72 rounded-2xl glass-panel p-3.5 z-50 border border-navy-700 shadow-2xl">
                <div className="flex items-center justify-between pb-2 border-b border-navy-700/80 mb-2">
                  <span className="text-xs font-bold text-gray-200">Alerts &amp; Notifications</span>
                  <span className="text-[10px] text-cyan-400 font-semibold">Live</span>
                </div>
                <div className="space-y-2 text-xs text-gray-300">
                  <div className="p-2 rounded-lg bg-navy-800/80 border border-navy-700">
                    <p className="font-semibold text-gray-200">GST Compliance Active</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">CGST &amp; SGST are automatically split on invoices.</p>
                  </div>
                  <div className="p-2 rounded-lg bg-navy-800/80 border border-navy-700">
                    <p className="font-semibold text-emerald-400">Offline Sync Ready</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Idempotency keys ensure zero duplicate bills.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
