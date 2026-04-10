import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueueProvider } from './context/QueueContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { I18nProvider } from './context/I18nContext';
import { useI18n } from './context/I18nContext';
import { PasswordChangeGuard } from './components/PasswordChangeGuard';
import Home from './pages/Home';
import Kiosk from './pages/Kiosk';
import PublicDisplay from './pages/PublicDisplay';
import AdminDashboard from './pages/AdminDashboard';
import MobileClient from './pages/MobileClient';
import CounterDisplay from './pages/CounterDisplay';
import Login from './pages/Login';

const ProtectedRoute: React.FC<{ children: React.ReactElement; requireAdmin?: boolean }> = ({ children, requireAdmin = false }) => {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (loading) return <div className="p-6 text-center text-gray-600">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
};

const App: React.FC = () => {
  return (
    <I18nProvider>
      <AuthProvider>
        <PasswordChangeGuard>
          <QueueProvider>
            <Router>
              <Routes>
                {/* Support both with and without leading slash in the hash (#/admin or #admin) */}
                <Route path="/" element={<Home />} />
                <Route path="login" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="kiosk" element={<ProtectedRoute requireAdmin><Kiosk /></ProtectedRoute>} />
                <Route path="/kiosk" element={<ProtectedRoute requireAdmin><Kiosk /></ProtectedRoute>} />
                <Route path="display" element={<PublicDisplay />} />
                <Route path="/display" element={<PublicDisplay />} />
                <Route path="public" element={<PublicDisplay />} />
                <Route path="/public" element={<PublicDisplay />} />
                <Route path="counter-display" element={<CounterDisplay />} />
                <Route path="/counter-display" element={<CounterDisplay />} />
                <Route path="admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
                <Route path="mobile/new" element={<MobileClient />} />
                <Route path="/mobile/new" element={<MobileClient />} />
                {/* Fallback to home for any unknown hash */}
                <Route path="*" element={<Home />} />
              </Routes>
            </Router>
          </QueueProvider>
        </PasswordChangeGuard>
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;
