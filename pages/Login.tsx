import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import { useQueue } from '../context/QueueContext';
import { useI18n } from '../context/I18nContext';

const Login: React.FC = () => {
  const { login, user } = useAuth();
  const { branding } = useQueue();
  const { t, language, setLanguage } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authProviders, setAuthProviders] = useState({ local: true, google: false, oidc: false });

  // Fetch available auth providers
  useEffect(() => {
    fetch('/api/auth/providers')
      .then(res => res.json())
      .then(data => setAuthProviders(data))
      .catch(err => console.error('Failed to fetch auth providers:', err));
  }, []);

  // Handle OAuth callback with token
  useEffect(() => {
    const token = searchParams.get('token');
    const errorParam = searchParams.get('error');
    
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // Clear the error from URL
      window.history.replaceState({}, document.title, '/login');
    }
    
    if (token) {
      // Store token and refresh page to let AuthContext pick it up
      localStorage.setItem('qflow_token', token);
      window.dispatchEvent(new CustomEvent('qflow-auth-changed', { detail: { token } }));
      navigate('/', { replace: true });
    }
  }, [searchParams, navigate]);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = '/auth/google';
  };

  const handleOIDCLogin = () => {
    window.location.href = '/auth/oidc';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white shadow-lg border border-gray-100 rounded-2xl p-8 w-full max-w-md">
        <div className="flex items-center justify-end mb-2 gap-2">
          <button
            type="button"
            onClick={() => setLanguage('no')}
            className={`text-xs font-semibold px-3 py-1 rounded-full border ${language === 'no' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-600 border-gray-200 hover:border-indigo-200 hover:text-indigo-700'}`}
          >
            Norsk
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`text-xs font-semibold px-3 py-1 rounded-full border ${language === 'en' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-600 border-gray-200 hover:border-indigo-200 hover:text-indigo-700'}`}
          >
            English
          </button>
        </div>
        <div className="flex flex-col items-center mb-8">
          <Logo className="h-12 w-12" textClass="text-3xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{t('login.title')}</h1>
          <p className="text-gray-500 text-sm text-center">{t('login.subtitle')}</p>
        </div>

        {/* OAuth Buttons */}
        {(authProviders.google || authProviders.oidc) && (
          <div className="space-y-3 mb-6">
            {authProviders.google && (
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full bg-white border-2 border-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg shadow hover:bg-gray-50 transition flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {language === 'no' ? 'Fortsett med Google' : 'Continue with Google'}
              </button>
            )}
            
            {authProviders.oidc && (
              <button
                type="button"
                onClick={handleOIDCLogin}
                className="w-full bg-white border-2 border-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg shadow hover:bg-gray-50 transition flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
                {language === 'no' ? 'Fortsett med OIDC' : 'Continue with OIDC'}
              </button>
            )}
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  {language === 'no' ? 'eller' : 'or'}
                </span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('login.username')}</label>
            <input
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('login.password')}</label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-lg shadow hover:bg-indigo-700 transition disabled:opacity-60"
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>
      <button
        onClick={() => navigate('/')}
        className="mt-6 text-sm text-gray-600 hover:text-gray-800"
      >
        {t('login.back')}
      </button>
    </div>
  );
};

export default Login;
