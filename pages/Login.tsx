import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import { useQueue } from '../context/QueueContext';

const Login: React.FC = () => {
  const { login, user } = useAuth();
  const { branding } = useQueue();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError('Feil brukernavn eller passord');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white shadow-lg border border-gray-100 rounded-2xl p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Logo className="h-12 w-12" textClass="text-3xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Logg inn</h1>
          <p className="text-gray-500 text-sm">Tilgang til operatør- og adminverktøy</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brukernavn</label>
            <input
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passord</label>
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
            {loading ? 'Logger inn...' : 'Logg inn'}
          </button>
        </form>
      </div>
      <button
        onClick={() => navigate('/')}
        className="mt-6 text-sm text-gray-600 hover:text-gray-800"
      >
        Tilbake til forsiden
      </button>
    </div>
  );
};

export default Login;
