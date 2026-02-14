import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Monitor, Smartphone, Users, LayoutGrid, Tv, ShieldCheck, LogIn } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useQueue } from '../context/QueueContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

const ModeCard: React.FC<{ to: string; title: string; desc: string; icon: React.ReactNode; color: string }> = ({ to, title, desc, icon, color }) => (
  <Link to={to} className="group relative overflow-hidden bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-indigo-100 transition-all duration-300">
    <div className={`absolute top-0 right-0 p-24 -mr-8 -mt-8 rounded-full opacity-10 group-hover:scale-110 transition-transform duration-500 ${color}`}></div>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${color} text-white shadow-md`}>
      {icon}
    </div>
    <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-500 text-sm">{desc}</p>
  </Link>
);

const Home: React.FC = () => {
  const { branding } = useQueue();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const isAdmin = user?.role === 'ADMIN';
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12">
        <div className="flex justify-center mb-6">
           <Logo className="h-12 w-12" textClass="text-4xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('home.title')}</h1>
        <p className="text-gray-500 max-w-md mx-auto">
          {t('home.subtitle')}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-gray-600">
          {user ? (
            <>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                <ShieldCheck size={16} /> {user.name} · {user.role === 'ADMIN' ? t('role.admin') : t('role.operator')}
              </span>
              <button
                onClick={() => logout().then(() => navigate('/login'))}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                {t('common.logout')}
              </button>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
              <LogIn size={16} /> {t('common.notLoggedIn')}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl w-full">
        {!user && (
          <ModeCard 
            to="/login" 
            title={t('home.card.login.title')} 
            desc={t('home.card.login.desc')} 
            icon={<LogIn size={24} />} 
            color="bg-slate-700"
          />
        )}

        {isAdmin && (
          <ModeCard 
            to="/kiosk" 
            title={t('home.card.kiosk.title')} 
            desc={t('home.card.kiosk.desc')} 
            icon={<Smartphone size={24} />} 
            color="bg-blue-600"
          />
        )}

        <ModeCard 
          to="/display" 
          title={t('home.card.display.title')} 
          desc={t('home.card.display.desc')} 
          icon={<Monitor size={24} />} 
          color="bg-purple-600"
        />

        {user && (
          <ModeCard 
            to="/admin" 
            title={t('home.card.admin.title')} 
            desc={t('home.card.admin.desc')} 
            icon={<LayoutGrid size={24} />} 
            color="bg-emerald-600"
          />
        )}

        <ModeCard 
          to="/mobile/new" 
          title={t('home.card.mobile.title')} 
          desc={t('home.card.mobile.desc')} 
          icon={<Users size={24} />} 
          color="bg-orange-500"
        />

        <ModeCard 
          to="/counter-display" 
          title={t('home.card.counter.title')} 
          desc={t('home.card.counter.desc')} 
          icon={<Tv size={24} />} 
          color="bg-indigo-700"
        />
      </div>
      
      <div className="mt-12 text-sm text-gray-400">
        &copy; {new Date().getFullYear()} Q-Flow Pro. {t('home.footer')}
      </div>
    </div>
  );
};

export default Home;
