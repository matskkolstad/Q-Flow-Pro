import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Clock, List, LogOut, Settings, Shield } from 'lucide-react';
import { useQueue, setSoundRole } from '../context/QueueContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { Logo } from '../components/Logo';
import DashboardView from './admin/DashboardView';
import StatsView from './admin/StatsView';
import LogsView from './admin/LogsView';
import AccountSettings from './admin/settings/AccountSettings';
import GeneralSettings from './admin/settings/GeneralSettings';
import BrandingSettings from './admin/settings/BrandingSettings';
import ServicesSettings from './admin/settings/ServicesSettings';
import CountersSettings from './admin/settings/CountersSettings';
import UsersSettings from './admin/settings/UsersSettings';
import DevicesSettings from './admin/settings/DevicesSettings';
import ScheduleSettings from './admin/settings/ScheduleSettings';
import BackupSettings from './admin/settings/BackupSettings';
import AuthSettings from './admin/settings/AuthSettings';

type View = 'dashboard' | 'stats' | 'logs' | 'settings';
type SettingsTab = 'account' | 'general' | 'branding' | 'services' | 'counters' | 'users' | 'devices' | 'schedule' | 'backups' | 'auth';

const ADMIN_TABS: SettingsTab[] = ['general', 'branding', 'services', 'counters', 'users', 'devices', 'schedule', 'backups', 'auth', 'account'];
const OPERATOR_TABS: SettingsTab[] = ['account'];
// The selected counter is remembered per browser, so each workstation keeps "its" counter.
const COUNTER_KEY = 'qflow_counter_id';

const SETTINGS_COMPONENTS: Record<SettingsTab, React.FC> = {
  account: AccountSettings,
  general: GeneralSettings,
  branding: BrandingSettings,
  services: ServicesSettings,
  counters: CountersSettings,
  users: UsersSettings,
  devices: DevicesSettings,
  schedule: ScheduleSettings,
  backups: BackupSettings,
  auth: AuthSettings,
};

const AdminDashboard: React.FC = () => {
  const { counters, branding, isClosed } = useQueue();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const [view, setView] = useState<View>('dashboard');
  const tabs = useMemo(() => (isAdmin ? ADMIN_TABS : OPERATOR_TABS), [isAdmin]);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(tabs[0]);
  const [counterId, setCounterId] = useState<string>(() => {
    try {
      return localStorage.getItem(COUNTER_KEY) || '';
    } catch {
      return '';
    }
  });

  // The operator panel may play call sounds (can be turned off under Settings → General)
  useEffect(() => {
    setSoundRole('admin');
    return () => setSoundRole(null);
  }, []);

  useEffect(() => {
    if (!tabs.includes(settingsTab)) setSettingsTab(tabs[0]);
  }, [tabs, settingsTab]);

  useEffect(() => {
    if (counters.length === 0) return;
    if (!counters.some((c) => c.id === counterId)) setCounterId(counters[0].id);
  }, [counters, counterId]);

  useEffect(() => {
    try {
      if (counterId) localStorage.setItem(COUNTER_KEY, counterId);
    } catch {
      // ignore
    }
  }, [counterId]);

  const currentCounter = counters.find((c) => c.id === counterId);
  const SettingsComponent = SETTINGS_COMPONENTS[settingsTab];

  const navItems: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: t('admin.nav.dashboard'), icon: <List size={18} /> },
    { key: 'stats', label: t('admin.nav.stats'), icon: <BarChart3 size={18} /> },
    { key: 'logs', label: t('admin.nav.logs'), icon: <Clock size={18} /> },
    { key: 'settings', label: t('admin.nav.settings'), icon: <Settings size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      <header className="bg-white shadow-md border-b border-gray-200 px-4 md:px-6 py-3 z-20 sticky top-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 md:gap-8 min-w-0">
            <Link to="/" className="shrink-0">
              <Logo brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} className="h-9 w-9" textClass="text-xl md:text-2xl font-black text-gray-900" />
            </Link>
            <nav className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto max-w-full" aria-label={t('admin.nav.label')}>
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  aria-current={view === item.key ? 'page' : undefined}
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${view === item.key ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  {item.icon} <span className="hidden sm:inline">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {isClosed && <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">{t('admin.header.closed')}</span>}
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
              <label htmlFor="counter-select" className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('admin.header.counter')}</label>
              <select
                id="counter-select"
                value={counterId}
                onChange={(e) => setCounterId(e.target.value)}
                className="bg-transparent text-sm font-bold text-gray-800 focus:outline-none cursor-pointer max-w-[10rem]"
              >
                {counters.length === 0 && <option value="">{t('admin.header.noCounters')}</option>}
                {counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className={`h-2.5 w-2.5 rounded-full ${currentCounter?.isOnline ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true"></span>
            </div>
            {user && (
              <span className="hidden md:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200 text-sm">
                <Shield size={14} /> {user.name} · {isAdmin ? t('role.admin') : t('role.operator')}
              </span>
            )}
            <button
              onClick={() => logout().then(() => navigate('/login'))}
              className="flex items-center gap-2 text-sm font-bold text-red-600 hover:text-red-700 px-3 py-2 bg-red-50 hover:bg-red-100 rounded-lg"
              title={t('admin.header.logout')}
            >
              <LogOut size={18} /> <span className="hidden sm:inline">{t('admin.header.logout')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        {view === 'dashboard' && <DashboardView counterId={counterId} />}
        {view === 'stats' && <StatsView />}
        {view === 'logs' && <LogsView />}
        {view === 'settings' && (
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row min-h-[600px]">
            <aside className="w-full md:w-60 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 p-3 md:p-6">
              <h2 className="hidden md:block text-xs font-black text-gray-500 uppercase tracking-wider mb-4 px-2">{t('admin.settings.title')}</h2>
              <div className="flex md:flex-col gap-1 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    aria-current={settingsTab === tab ? 'page' : undefined}
                    className={`text-left px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${settingsTab === tab ? 'bg-white text-brand-700 shadow-md ring-1 ring-black/5' : 'text-gray-600 hover:bg-gray-200/50'}`}
                  >
                    {t(`admin.settings.${tab}`)}
                  </button>
                ))}
              </div>
            </aside>
            <div className="flex-1 p-4 md:p-8 bg-white min-w-0">
              <SettingsComponent />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
