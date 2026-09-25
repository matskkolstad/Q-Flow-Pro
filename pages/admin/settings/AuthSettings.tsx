import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useQueue } from '../../../context/QueueContext';
import { useI18n } from '../../../context/I18nContext';
import { AuthProviderConfig } from '../../../types';
import { Button, Card, inputClass, Label, PageTitle, Toggle } from '../ui';

type ProviderKey = 'google' | 'oidc';

// Text field that saves on blur/Enter instead of on every keystroke.
const DraftField: React.FC<{ id: string; label: string; value: string; placeholder?: string; help?: string; onSave: (value: string) => void }> = ({ id, label, value, placeholder, help, onSave }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => { if (draft.trim() !== value) onSave(draft.trim()); };
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} placeholder={placeholder} className={inputClass} />
      {help && <p className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  );
};

// OAuth client secrets are write-only: typed here and sent once, never received from the server.
const SecretField: React.FC<{ id: string; isSet?: boolean; placeholder: string; onSave: (secret: string) => void }> = ({ id, isSet, placeholder, onSave }) => {
  const { t } = useI18n();
  const [secret, setSecret] = useState('');
  return (
    <div>
      <Label htmlFor={id}>Client Secret</Label>
      <div className="flex gap-2">
        <input id={id} type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={isSet ? t('admin.auth.secretSaved') : placeholder} className={inputClass} />
        <Button onClick={() => { onSave(secret.trim()); setSecret(''); }} disabled={!secret.trim()}>{t('common.save')}</Button>
      </div>
      <p className="text-xs text-gray-500 mt-1">{isSet ? t('admin.auth.secretReplace') : t('admin.auth.secretMissing')}</p>
    </div>
  );
};

const AuthSettings: React.FC = () => {
  const { authProviders, updateSettings } = useQueue();
  const { t } = useI18n();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const update = (provider: ProviderKey, patch: Partial<AuthProviderConfig[ProviderKey]>) => updateSettings({ authProviders: { [provider]: patch } });

  const provisioning = (provider: ProviderKey) => {
    const config = authProviders[provider];
    return (
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <input type="checkbox" checked={config.autoProvision} onChange={(e) => update(provider, { autoProvision: e.target.checked })} />
          {t('admin.auth.autoProvision')}
        </label>
        {config.autoProvision && (
          <select value={config.defaultRole} onChange={(e) => update(provider, { defaultRole: e.target.value as 'ADMIN' | 'OPERATOR' })} className="px-3 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-bold bg-white" aria-label={t('admin.auth.defaultRole')}>
            <option value="OPERATOR">{t('role.operator')}</option>
            <option value="ADMIN">{t('role.admin')}</option>
          </select>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle>{t('admin.auth.title')}</PageTitle>
      <p className="text-sm text-gray-600 -mt-4">{t('admin.auth.desc')}</p>

      <Card title="Google Workspace">
        <Toggle label={t('admin.auth.enabled')} checked={authProviders.google.enabled} onChange={(v) => update('google', { enabled: v })} />
        {authProviders.google.enabled && (
          <div className="space-y-4 mt-3">
            <DraftField id="google-client-id" label="Client ID" value={authProviders.google.clientId || ''} placeholder="your-app.apps.googleusercontent.com" onSave={(v) => update('google', { clientId: v })} />
            <SecretField id="google-secret" isSet={authProviders.google.clientSecretSet} placeholder="GOCSPX-..." onSave={(v) => update('google', { clientSecret: v })} />
            <DraftField
              id="google-domains"
              label={t('admin.auth.allowedDomains')}
              value={(authProviders.google.allowedDomains || []).join(', ')}
              placeholder="example.com, company.no"
              help={t('admin.auth.allowedDomainsHelp')}
              onSave={(v) => update('google', { allowedDomains: v.split(',').map((d) => d.trim()).filter(Boolean) })}
            />
            {provisioning('google')}
          </div>
        )}
      </Card>

      <Card title={<span className="flex items-center gap-2"><Lock size={20} className="text-brand-600" /> OIDC</span>} description={t('admin.auth.oidcDesc')}>
        <Toggle label={t('admin.auth.enabled')} checked={authProviders.oidc.enabled} onChange={(v) => update('oidc', { enabled: v })} />
        {authProviders.oidc.enabled && (
          <div className="space-y-4 mt-3">
            <DraftField id="oidc-issuer" label="Issuer URL" value={authProviders.oidc.issuerUrl || ''} placeholder="https://login.microsoftonline.com/{tenant-id}/v2.0" help={t('admin.auth.issuerHelp')} onSave={(v) => update('oidc', { issuerUrl: v })} />
            <DraftField id="oidc-client-id" label="Client ID" value={authProviders.oidc.clientId || ''} placeholder="application-id" onSave={(v) => update('oidc', { clientId: v })} />
            <SecretField id="oidc-secret" isSet={authProviders.oidc.clientSecretSet} placeholder="client-secret" onSave={(v) => update('oidc', { clientSecret: v })} />
            {provisioning('oidc')}
            <Toggle
              label={t('admin.auth.requireVerified')}
              description={t('admin.auth.requireVerifiedHelp')}
              checked={authProviders.oidc.requireVerifiedEmail !== false}
              onChange={(v) => update('oidc', { requireVerifiedEmail: v })}
            />
          </div>
        )}
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900">
        <p className="font-bold mb-1">{t('admin.auth.callbackUrls')}</p>
        <p>Google: <code className="bg-blue-100 px-1 py-0.5 rounded">{origin}/auth/google/callback</code></p>
        <p>OIDC: <code className="bg-blue-100 px-1 py-0.5 rounded">{origin}/auth/oidc/callback</code></p>
        <p className="mt-2">{t('admin.auth.callbackEnv')}</p>
      </div>
    </div>
  );
};

export default AuthSettings;
