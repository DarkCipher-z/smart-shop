import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Store,
  User,
  Sliders,
  ShieldCheck,
  Save,
  CheckCircle,
  Sun,
  Moon,
  Languages,
} from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState('shop');

  // Shop Settings State
  const [shopForm, setShopForm] = useState({
    name: user?.shopName || 'Shree Ganesh Supermarket',
    phone: '+91 98765 43210',
    address: 'Commercial Center, Market Road, Mumbai, Maharashtra 400001',
    email: 'contact@smartshop.local',
    gstin: '27AAAAA0000A1Z5',
    invoice_prefix: 'INV-',
    operating_hours: '08:00 AM - 10:30 PM',
  });
  const [savingShop, setSavingShop] = useState(false);

  // Profile Settings State
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Fetch shop details on mount
  useEffect(() => {
    const fetchShopDetails = async () => {
      try {
        const res = await api.get('/settings/shop').catch(() => null);
        if (res?.data || res) {
          const data = res.data || res;
          setShopForm((prev) => ({
            ...prev,
            ...data,
          }));
        }
      } catch {
        // use default
      }
    };
    fetchShopDetails();
  }, []);

  // Save Shop Settings
  const handleSaveShop = async (e) => {
    e.preventDefault();
    setSavingShop(true);
    try {
      await api.put('/settings/shop', shopForm).catch(async () => {
        return await api.put(`/shops/${user?.shopId || 1}`, shopForm);
      });
      updateUser({ shopName: shopForm.name });
      success(t('settings.settingsSaved'));
    } catch (err) {
      toastError(err.message || 'Failed to update shop details');
    } finally {
      setSavingShop(false);
    }
  };

  // Save Profile Settings
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
      toastError('New password and confirmation do not match.');
      return;
    }

    setSavingProfile(true);
    try {
      const payload = {
        full_name: profileForm.fullName,
        current_password: profileForm.currentPassword,
        new_password: profileForm.newPassword || undefined,
      };

      await api.put('/auth/profile', payload).catch(async () => {
        return await api.put(`/users/${user?.id}`, { full_name: profileForm.fullName });
      });

      updateUser({ fullName: profileForm.fullName });
      success('User profile updated successfully.');
      setProfileForm((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
    } catch (err) {
      toastError(err.message || 'Failed to update user profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLanguageChange = (langCode) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('smartshop_lang', langCode);
    success(`Language changed to ${langCode.toUpperCase()}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-gray-100 tracking-tight">
          {t('settings.title')}
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          {t('settings.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-navy-800 pb-2">
        <button
          onClick={() => setActiveTab('shop')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'shop'
              ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
              : 'text-gray-400 hover:text-white hover:bg-navy-800'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>{t('settings.shopSettings')}</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'profile'
              ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
              : 'text-gray-400 hover:text-white hover:bg-navy-800'
          }`}
        >
          <User className="w-4 h-4" />
          <span>{t('settings.profileSettings')}</span>
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'preferences'
              ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
              : 'text-gray-400 hover:text-white hover:bg-navy-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>{t('settings.preferences')}</span>
        </button>
      </div>

      {/* TAB 1: SHOP SETTINGS */}
      {activeTab === 'shop' && (
        <Card
          title={t('settings.shopSettings')}
          subtitle="This information appears directly on printed tax invoices & PDF bills"
        >
          <form onSubmit={handleSaveShop} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('settings.shopName') + ' *'}
                value={shopForm.name}
                onChange={(e) => setShopForm({ ...shopForm, name: e.target.value })}
                required
              />
              <Input
                label={t('settings.shopPhone') + ' *'}
                value={shopForm.phone}
                onChange={(e) => setShopForm({ ...shopForm, phone: e.target.value })}
                required
              />
              <Input
                label={t('settings.shopEmail')}
                type="email"
                value={shopForm.email}
                onChange={(e) => setShopForm({ ...shopForm, email: e.target.value })}
              />
              <Input
                label={t('settings.gstin') + ' *'}
                value={shopForm.gstin}
                onChange={(e) => setShopForm({ ...shopForm, gstin: e.target.value })}
                required
              />
              <Input
                label={t('settings.invoicePrefix')}
                placeholder="e.g. INV-"
                value={shopForm.invoice_prefix}
                onChange={(e) => setShopForm({ ...shopForm, invoice_prefix: e.target.value })}
              />
              <Input
                label={t('settings.operatingHours')}
                placeholder="e.g. 08:00 AM - 10:00 PM"
                value={shopForm.operating_hours}
                onChange={(e) => setShopForm({ ...shopForm, operating_hours: e.target.value })}
              />
              <Input
                label={t('settings.shopAddress') + ' *'}
                value={shopForm.address}
                onChange={(e) => setShopForm({ ...shopForm, address: e.target.value })}
                containerClassName="md:col-span-2"
                required
              />
            </div>

            <div className="pt-4 border-t border-navy-700/80 flex justify-end">
              <Button
                type="submit"
                variant="primary"
                isLoading={savingShop}
                icon={Save}
              >
                {t('common.saveChanges')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 2: PROFILE SETTINGS */}
      {activeTab === 'profile' && (
        <Card
          title={t('settings.profileSettings')}
          subtitle="Update your full name and credentials"
        >
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Full Name *"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                required
              />
              <Input
                label="Email Address"
                value={profileForm.email}
                disabled
                helperText="Email cannot be changed directly"
              />
            </div>

            <div className="pt-4 border-t border-navy-700/80">
              <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider mb-3">
                Change Security Password
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label={t('settings.currentPassword')}
                  type="password"
                  value={profileForm.currentPassword}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, currentPassword: e.target.value })
                  }
                />
                <Input
                  label={t('settings.newPassword')}
                  type="password"
                  value={profileForm.newPassword}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, newPassword: e.target.value })
                  }
                />
                <Input
                  label={t('settings.confirmPassword')}
                  type="password"
                  value={profileForm.confirmPassword}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, confirmPassword: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="pt-4 border-t border-navy-700/80 flex justify-end">
              <Button
                type="submit"
                variant="primary"
                isLoading={savingProfile}
                icon={Save}
              >
                {t('common.saveChanges')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 3: PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="space-y-4">
          <Card title="Interface Display & Theme">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-semibold text-gray-200">
                  {isDark ? t('settings.darkTheme') : t('settings.lightTheme')}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Dark theme uses high-contrast navy `#0B0F19` with violet accents.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="px-4 py-2 rounded-xl border border-navy-700 bg-navy-800 text-xs font-semibold text-gray-200 flex items-center gap-2 hover:bg-navy-700 transition-colors"
              >
                {isDark ? (
                  <>
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span>Switch to Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-violet-400" />
                    <span>Switch to Dark</span>
                  </>
                )}
              </button>
            </div>
          </Card>

          <Card title={t('settings.language')}>
            <p className="text-xs text-gray-400 mb-4">
              Select your preferred language. All buttons, tables and billing labels will translate dynamically.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { code: 'en', label: 'English', native: 'English' },
                { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
                { code: 'mr', label: 'Marathi', native: 'मराठी' },
                { code: 'te', label: 'Telugu', native: 'తెలుగు' },
              ].map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`p-3.5 rounded-2xl border text-center transition-all ${
                    i18n.language === lang.code
                      ? 'bg-violet-600/20 border-violet-500 text-white shadow-md'
                      : 'bg-navy-800/80 border-navy-700 text-gray-400 hover:text-white hover:bg-navy-700'
                  }`}
                >
                  <span className="text-sm font-bold block">{lang.native}</span>
                  <span className="text-[11px] text-gray-400 mt-0.5">{lang.label}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
