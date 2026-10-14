import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Mail, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { success, error: toastError } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setValidationError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setValidationError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const loggedUser = await login(cleanEmail, password);
      success(t('auth.loginSuccess'));
      if (loggedUser?.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      const msg = err.message || t('auth.invalidCredentials');
      setValidationError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background glowing ambient gradients */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-400 p-0.5 shadow-xl shadow-violet-500/20 mb-4 glow-accent">
            <div className="w-full h-full bg-navy-900 rounded-[14px] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-violet-400"
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {t('common.appName')}
          </h1>
          <p className="text-xs text-gray-400 mt-1.5 max-w-sm mx-auto">
            {t('common.tagline')}
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-navy-700/80">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-violet-400" />
              {t('auth.loginTitle')}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {t('auth.loginSubtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('auth.emailLabel')}
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            <div className="relative">
              <Input
                label={t('auth.passwordLabel')}
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.passwordPlaceholder')}
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-gray-400 hover:text-gray-200 transition-colors p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-navy-700 bg-navy-800 text-violet-600 focus:ring-violet-500 w-4 h-4"
                />
                Remember this device
              </label>
              <span className="text-gray-400 hover:text-violet-400 cursor-pointer transition-colors">
                Need access?
              </span>
            </div>

            {validationError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 font-medium">
                {validationError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={loading}
              icon={ArrowRight}
            >
              {loading ? t('auth.signingIn') : t('auth.signInButton')}
            </Button>
          </form>

          {/* Security & Access Info Footer */}
          <div className="mt-6 pt-5 border-t border-navy-800 text-center space-y-2">
            <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              256-bit Encrypted Session · Tenant-Isolated Portal
            </p>
            <p className="text-[11px] text-gray-500">
              Authorized personnel only. Contact shop admin for credentials.
            </p>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-gray-500 mt-6">
          © 2026 Smart Shop Technologies. Designed for India's retail economy.
        </p>
      </div>
    </div>
  );
}
