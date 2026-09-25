import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useQueue } from '../../../context/QueueContext';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';
import { User } from '../../../types';
import { Button, Card, inputClass, Label, PageTitle, SavedHint, useSavedFlag } from '../ui';

type Draft = { id?: string; username: string; name: string; role: 'ADMIN' | 'OPERATOR'; password: string; mustChangePassword: boolean };

const toDraft = (u?: User): Draft => ({
  id: u?.id,
  username: u?.username || '',
  name: u?.name || '',
  role: u?.role || 'OPERATOR',
  password: '',
  mustChangePassword: !u,
});

const UserForm: React.FC<{ user?: User; onSaved?: () => void }> = ({ user, onSaved }) => {
  const { saveUser, deleteUser, users } = useQueue();
  const { user: me } = useAuth();
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft>(toDraft(user));
  const [saved, markSaved] = useSavedFlag();
  useEffect(() => { setDraft(toDraft(user)); }, [user?.id, user?.username, user?.name, user?.role]);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const idBase = user?.id || 'new-user';
  const isNew = !user;
  const adminCount = users.filter((u) => u.role === 'ADMIN').length;
  const lastAdmin = user?.role === 'ADMIN' && adminCount <= 1;
  const isMe = user?.id === me?.id;

  const handleSave = async () => {
    const payload: Partial<User> & { password?: string } = { id: draft.id, username: draft.username.trim(), name: draft.name.trim(), role: draft.role };
    if (draft.password) {
      payload.password = draft.password;
      payload.mustChangePassword = draft.mustChangePassword;
    }
    const res = await saveUser(payload);
    if (res.ok) {
      markSaved();
      setDraft((d) => ({ ...d, password: '' }));
      onSaved?.();
    }
  };

  return (
    <div className="p-4 bg-white border-2 border-gray-100 rounded-2xl">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <Label htmlFor={`${idBase}-username`}>{t('admin.users.username')}</Label>
          <input id={`${idBase}-username`} value={draft.username} maxLength={64} autoComplete="off" onChange={(e) => set({ username: e.target.value })} className={inputClass} placeholder={t('admin.users.usernamePlaceholder')} />
        </div>
        <div>
          <Label htmlFor={`${idBase}-name`}>{t('admin.users.name')}</Label>
          <input id={`${idBase}-name`} value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} className={inputClass} placeholder={t('admin.users.namePlaceholder')} />
        </div>
        <div>
          <Label htmlFor={`${idBase}-role`}>{t('admin.users.role')}</Label>
          <select id={`${idBase}-role`} value={draft.role} disabled={lastAdmin} onChange={(e) => set({ role: e.target.value as Draft['role'] })} className={inputClass}>
            <option value="OPERATOR">{t('role.operator')}</option>
            <option value="ADMIN">{t('role.admin')}</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`${idBase}-password`}>{isNew ? t('admin.users.password') : t('admin.users.newPassword')}</Label>
          <input id={`${idBase}-password`} type="password" autoComplete="new-password" value={draft.password} onChange={(e) => set({ password: e.target.value })} className={inputClass} placeholder={isNew ? t('admin.users.setPasswordPlaceholder') : t('admin.users.passwordPlaceholder')} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {draft.password && (
            <label className="flex items-center gap-2 font-bold text-gray-700">
              <input type="checkbox" checked={draft.mustChangePassword} onChange={(e) => set({ mustChangePassword: e.target.checked })} />
              {t('admin.users.mustChange')}
            </label>
          )}
          {user?.provider && user.provider !== 'local' && <span className="px-2 py-1 rounded-full bg-gray-100 font-bold">{user.provider.toUpperCase()}{user.email ? ` · ${user.email}` : ''}</span>}
          {user?.mustChangePassword && <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 font-bold">{t('admin.users.pendingPasswordChange')}</span>}
          {isMe && <span className="px-2 py-1 rounded-full bg-brand-50 text-brand-700 font-bold">{t('admin.users.you')}</span>}
        </div>
        <div className="flex items-center gap-2">
          <SavedHint show={saved} text={t('common.saved')} />
          {!isNew && (
            <Button
              variant="danger"
              disabled={lastAdmin || isMe}
              title={lastAdmin ? t('admin.users.cannotDeleteAdmin') : isMe ? t('admin.users.cannotDeleteSelf') : undefined}
              aria-label={t('admin.users.delete')}
              onClick={() => { if (user && window.confirm(t('admin.users.deleteConfirm', { name: user.username }))) deleteUser(user.id); }}
            >
              <Trash2 size={16} />
            </Button>
          )}
          <Button onClick={handleSave} disabled={!draft.username.trim() || (isNew && !draft.password)}>
            {isNew ? t('admin.users.add') : t('admin.users.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const UsersSettings: React.FC = () => {
  const { users } = useQueue();
  const { t } = useI18n();
  const [newKey, setNewKey] = useState(0);
  return (
    <div className="space-y-6">
      <PageTitle>{t('admin.users.title')}</PageTitle>
      <Card title={t('admin.users.new')} description={t('password.rules')}>
        <UserForm key={newKey} onSaved={() => setNewKey((k) => k + 1)} />
      </Card>
      <div className="space-y-3">
        {users.map((u) => <UserForm key={u.id} user={u} />)}
      </div>
    </div>
  );
};

export default UsersSettings;
