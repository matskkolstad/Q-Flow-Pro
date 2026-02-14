import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Monitor, Smartphone, Users, LayoutGrid, Tv, ShieldCheck, LogIn } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useQueue } from '../context/QueueContext';
import { useAuth } from '../context/AuthContext';

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
  const isAdmin = user?.role === 'ADMIN';
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12">
        <div className="flex justify-center mb-6">
           <Logo className="h-12 w-12" textClass="text-4xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Velkommen</h1>
        <p className="text-gray-500 max-w-md mx-auto">
          Logg inn for å styre køen. Offentlige visninger er tilgjengelig uten innlogging.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-gray-600">
          {user ? (
            <>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                <ShieldCheck size={16} /> {user.name} · {user.role === 'ADMIN' ? 'Admin' : 'Operatør'}
              </span>
              <button
                onClick={() => logout().then(() => navigate('/login'))}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Logg ut
              </button>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
              <LogIn size={16} /> Ikke innlogget
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl w-full">
        {!user && (
          <ModeCard 
            to="/login" 
            title="Logg inn" 
            desc="Få tilgang til operatør- og adminverktøy." 
            icon={<LogIn size={24} />} 
            color="bg-slate-700"
          />
        )}

        {isAdmin && (
          <ModeCard 
            to="/kiosk" 
            title="Kiosk / Trekking" 
            desc="Touch-skjerm for å trekke kølapper." 
            icon={<Smartphone size={24} />} 
            color="bg-blue-600"
          />
        )}

        <ModeCard 
          to="/display" 
          title="Storskjerm" 
          desc="Visning av nåværende køstatus." 
          icon={<Monitor size={24} />} 
          color="bg-purple-600"
        />

        {user && (
          <ModeCard 
            to="/admin" 
            title="Operatør / Admin" 
            desc="Administrer køer og kall inn neste." 
            icon={<LayoutGrid size={24} />} 
            color="bg-emerald-600"
          />
        )}

        <ModeCard 
          to="/mobile/new" 
          title="Mobilbruker" 
          desc="Simuler en bruker på mobil." 
          icon={<Users size={24} />} 
          color="bg-orange-500"
        />

        <ModeCard 
          to="/counter-display" 
          title="Skrankeskjerm" 
          desc="Skjerm over skranke for tildelt nummer." 
          icon={<Tv size={24} />} 
          color="bg-indigo-700"
        />
      </div>
      
      <div className="mt-12 text-sm text-gray-400">
        &copy; {new Date().getFullYear()} Q-Flow Pro. Utviklet for effektiv køhåndtering.
      </div>
    </div>
  );
};

export default Home;
