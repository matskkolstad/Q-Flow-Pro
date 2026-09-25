import React, { useEffect, useState } from 'react';
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useI18n } from '../../../context/I18nContext';
import { authFetch, authJson, downloadFile } from '../../../utils/api';
import { Button, Card, PageTitle } from '../ui';

type BackupItem = { file: string; mtime: number; size: number };

const formatSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);

const BackupSettings: React.FC = () => {
  const { t, language } = useI18n();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const locale = language === 'en' ? 'en-GB' : 'nb-NO';

  const load = async () => {
    setLoading(true);
    const res = await authJson<{ backups: BackupItem[] }>('/api/admin/backups');
    setLoading(false);
    if (res.ok) setBackups(res.data.backups || []);
    else setMessage({ tone: 'error', text: t('admin.general.backup.fetchError') });
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setMessage(null);
    const res = await authJson<{ file: string }>('/api/admin/backup', { method: 'POST' });
    if (res.ok) {
      setMessage({ tone: 'ok', text: t('admin.general.backup.createdWithFile', { file: res.data.file }) });
      load();
    } else {
      setMessage({ tone: 'error', text: t('admin.general.backup.failed') });
    }
  };

  const restore = async (file: string) => {
    if (!window.confirm(t('admin.backup.restoreConfirm', { file }))) return;
    const res = await authJson<{ safetyBackup: string }>(`/api/admin/backup/${encodeURIComponent(file)}/restore`, { method: 'POST' });
    if (res.ok) {
      setMessage({ tone: 'ok', text: t('admin.backup.restored', { file: res.data.safetyBackup }) });
      load();
    } else {
      setMessage({ tone: 'error', text: t('admin.backup.restoreFailed') });
    }
  };

  const remove = async (file: string) => {
    if (!window.confirm(t('admin.backup.deleteConfirm', { file }))) return;
    const res = await authJson(`/api/admin/backup/${encodeURIComponent(file)}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  const upload = async (fileObj?: File | null) => {
    if (!fileObj) return;
    setMessage(null);
    const res = await authFetch('/api/admin/backups/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fileObj,
    });
    if (res.ok) {
      const data = await res.json();
      setMessage({ tone: 'ok', text: t('admin.backup.uploaded', { file: data.file }) });
      load();
    } else {
      setMessage({ tone: 'error', text: t('admin.backup.uploadFailed') });
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle>{t('admin.general.backup.title')}</PageTitle>
      <Card title={t('admin.general.backup.title')} description={t('admin.backup.desc')}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Button onClick={create}>{t('admin.general.backup.create')}</Button>
          <Button variant="secondary" onClick={load} disabled={loading}>{t('admin.general.backup.refresh')}</Button>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-800 rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-200">
            <Upload size={16} /> {t('admin.backup.upload')}
            <input type="file" accept=".db,application/octet-stream" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        {message && <p role="status" className={`text-sm font-bold mb-4 ${message.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
        <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 bg-gray-50">
          {loading && <div className="px-4 py-3 text-sm text-gray-500">{t('admin.general.backup.loading')}</div>}
          {!loading && backups.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">{t('admin.general.backup.none')}</div>}
          {!loading && backups.map((b) => (
            <div key={b.file} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-gray-800 text-sm break-all">{b.file}</p>
                <p className="text-xs text-gray-500">{new Date(b.mtime).toLocaleString(locale)} · {formatSize(b.size)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => downloadFile(`/api/admin/backup/${encodeURIComponent(b.file)}`, b.file)}>
                  <Download size={14} /> {t('admin.general.backup.download')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => restore(b.file)}>
                  <RotateCcw size={14} /> {t('admin.backup.restore')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(b.file)} aria-label={t('admin.backup.delete')}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default BackupSettings;
