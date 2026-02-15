import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  isRequired?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  isRequired = false,
  onClose,
  onSuccess,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (newPassword !== confirmPassword) {
      setError('Nye passord matcher ikke');
      return;
    }

    if (newPassword.length < 8) {
      setError('Passordet må være minst 8 tegn');
      return;
    }

    if (!/(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/.test(newPassword)) {
      setError('Passordet må inneholde store og små bokstaver, og minst ett tall');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('qflow_token');
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'invalid_old_password') {
          setError('Gammelt passord er feil');
        } else if (data.error === 'password_too_short') {
          setError('Passordet må være minst 8 tegn');
        } else if (data.error === 'password_needs_upper_lower_digit') {
          setError('Passordet må inneholde store og små bokstaver, og minst ett tall');
        } else {
          setError('Kunne ikke endre passord');
        }
        return;
      }

      // Success
      onSuccess();
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError('Nettverksfeil. Prøv igjen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {isRequired ? 'Du må endre passord' : 'Endre passord'}
          </h2>
          {!isRequired && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {isRequired && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              Av sikkerhetsgrunner må du endre passordet ditt før du kan fortsette.
              Dette er et standardpassord som må endres.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gammelt passord
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nytt passord
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minst 8 tegn, med store og små bokstaver og tall
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bekreft nytt passord
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-lg shadow hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {loading ? 'Endrer...' : 'Endre passord'}
            </button>
            {!isRequired && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                Avbryt
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
