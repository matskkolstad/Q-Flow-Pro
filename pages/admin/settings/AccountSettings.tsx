import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useI18n, SupportedLanguage } from '../../../context/I18nContext';
import { authJson } from '../../../utils/api';
import { Button, Card, inputClass, Label, PageTitle, SavedHint, useSavedFlag } from '../ui';

const PASSWORD_ERRORS = ['invalid_old_password', 'password_too_short', 'password_needs_upper_lower_digit', 'password_unchanged'];

// Available to every user: own password and interface language.
const AccountSettings: React.FC = () => {
  const { user } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, markSaved] = useSavedFlag();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError(t('password.mismatch'));
      return;
    }
    setBusy(true);
    const res = await authJson('/api/user/password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
    setBusy(false);
    if (!res.ok) {
      const code = (res.data as { error?: string })?.error || '';
      setError(t(PASSWORD_ERRORS.includes(code) ? `password.error.${code}` : 'password.error.generic'));
      return;
    }
    setOldPassword('');
    setNewPassword('');
    setConfirm('');
    markSaved();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle>{t('admin.account.title')}</PageTitle>
      <Card title={t('admin.account.profile')}>
        <p className="text-sm text-gray-700"><span className="font-bold">{user?.name}</span> · {user?.username} · {user?.role === 'ADMIN' ? t('role.admin') : t('role.operator')}</p>
      </Card>
      <Card title={t('admin.general.password.title')} description={t('password.rules')}>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="pwd-old">{t('admin.general.password.old')}</Label>
            <input id="pwd-old" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className={inputClass} />
          </div>
          <div>
            <Label htmlFor="pwd-new">{t('admin.general.password.new')}</Label>
            <input id="pwd-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
          </div>
          <div>
            <Label htmlFor="pwd-confirm">{t('password.confirm')}</Label>
            <input id="pwd-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </div>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="submit" disabled={!newPassword || busy}>{busy ? t('admin.general.password.saving') : t('admin.general.password.update')}</Button>
            <SavedHint show={saved} text={t('admin.general.password.saved')} />
            {error && <span role="alert" className="text-sm text-red-600 font-bold">{error}</span>}
          </div>
        </form>
      </Card>
      <Card title={t('common.language')} description={t('admin.language.help')}>
        <select value={language} onChange={(e) => setLanguage(e.target.value as SupportedLanguage)} className={`${inputClass} max-w-xs`} aria-label={t('common.language')}>
          <option value="no">{t('common.language.norwegian')}</option>
          <option value="en">{t('common.language.english')}</option>
        </select>
      </Card>
    </div>
  );
};

export default AccountSettings;
