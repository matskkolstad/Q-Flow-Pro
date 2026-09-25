import React, { useEffect, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { useQueue } from '../../../context/QueueContext';
import { useI18n } from '../../../context/I18nContext';
import { Logo } from '../../../components/Logo';
import { authJson } from '../../../utils/api';
import { isHex } from '../../../utils/color';
import { Button, Card, inputClass, Label, PageTitle, SavedHint, useSavedFlag } from '../ui';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 1.4 * 1024 * 1024;
const MAX_EDGE = 512;
const DEFAULT_COLOR = '#4f46e5';

const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

// Scales raster images down to at most 512 px so uploads stay small (SVGs are kept as they are).
const prepareLogo = async (file: File): Promise<string> => {
  if (file.size > MAX_SOURCE_BYTES) throw new Error('logo_too_large');
  if (file.type === 'image/svg+xml') return readAsDataUrl(file);
  if (!file.type.startsWith('image/')) throw new Error('invalid_logo');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png');
  if (png.length * 0.75 <= MAX_UPLOAD_BYTES) return png;
  return canvas.toDataURL('image/webp', 0.9);
};

const BrandingSettings: React.FC = () => {
  const { branding, settings, updateSettings, reportError } = useQueue();
  const { t } = useI18n();
  const [brandText, setBrandText] = useState(branding.brandText);
  const [color, setColor] = useState(branding.primaryColor || DEFAULT_COLOR);
  const [footer, setFooter] = useState(branding.ticketFooter || '');
  const [logoUrl, setLogoUrl] = useState('');
  const [announcementNo, setAnnouncementNo] = useState(settings.announcements?.no || '');
  const [announcementEn, setAnnouncementEn] = useState(settings.announcements?.en || '');
  const [publicUrl, setPublicUrl] = useState(settings.publicUrl || '');
  const [uploading, setUploading] = useState(false);
  const [saved, markSaved] = useSavedFlag();

  useEffect(() => {
    setBrandText(branding.brandText);
    setColor(branding.primaryColor || DEFAULT_COLOR);
    setFooter(branding.ticketFooter || '');
  }, [branding.brandText, branding.primaryColor, branding.ticketFooter]);

  useEffect(() => {
    setAnnouncementNo(settings.announcements?.no || '');
    setAnnouncementEn(settings.announcements?.en || '');
    setPublicUrl(settings.publicUrl || '');
  }, [settings.announcements?.no, settings.announcements?.en, settings.publicUrl]);

  const saveBranding = async () => {
    const res = await updateSettings({
      branding: { brandText, ticketFooter: footer, primaryColor: isHex(color) && color.toLowerCase() !== DEFAULT_COLOR ? color : '' },
      settings: { announcements: { no: announcementNo, en: announcementEn }, publicUrl: publicUrl.trim() },
    });
    if (res.ok) markSaved();
  };

  const handleUpload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await prepareLogo(file);
      const res = await authJson('/api/admin/branding/logo', { method: 'POST', body: JSON.stringify({ dataUrl }) });
      if (!res.ok) throw new Error((res.data as { error?: string })?.error || 'upload_failed');
    } catch (err) {
      const code = (err as Error).message;
      reportError(t(code === 'logo_too_large' ? 'error.logo_too_large' : 'error.invalid_logo'));
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    const res = await authJson('/api/admin/branding/logo', { method: 'DELETE' });
    if (!res.ok) reportError(t('error.generic'));
  };

  const saveLogoUrl = async () => {
    const res = await updateSettings({ branding: { brandLogoUrl: logoUrl.trim() } });
    if (res.ok) setLogoUrl('');
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle>{t('admin.branding.title')}</PageTitle>

      <Card title={t('admin.branding.preview')}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <Logo className="h-12 w-12" textClass="text-2xl font-black text-gray-900" brandText={brandText} brandLogoUrl={branding.brandLogoUrl} />
          </div>
          <div className="bg-gray-900 rounded-xl p-4">
            <Logo className="h-12 w-12" textClass="text-2xl font-black text-white" brandText={brandText} brandLogoUrl={branding.brandLogoUrl} />
          </div>
          <span className="px-4 py-2 rounded-xl text-white font-bold" style={{ backgroundColor: isHex(color) ? color : DEFAULT_COLOR }}>{t('admin.branding.sampleButton')}</span>
        </div>
      </Card>

      <Card title={t('admin.general.logoTitle')} description={t('admin.general.logoHint')}>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`inline-flex items-center gap-2 px-4 py-2.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-xl text-sm font-bold cursor-pointer hover:bg-brand-100 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload size={16} /> {uploading ? t('admin.branding.uploading') : t('admin.general.upload')}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {branding.brandLogoUrl && (
            <Button variant="danger" onClick={removeLogo}><Trash2 size={16} /> {t('admin.general.remove')}</Button>
          )}
        </div>
        <div className="mt-4">
          <Label htmlFor="logo-url">{t('admin.branding.logoUrl')}</Label>
          <div className="flex gap-2">
            <input id="logo-url" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" className={inputClass} />
            <Button variant="secondary" onClick={saveLogoUrl} disabled={!logoUrl.trim()}>{t('common.save')}</Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">{t('admin.branding.logoUrlHelp')}</p>
        </div>
      </Card>

      <Card title={t('admin.branding.textAndColor')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="brand-text">{t('admin.general.brandName')}</Label>
            <input id="brand-text" type="text" maxLength={60} value={brandText} onChange={(e) => setBrandText(e.target.value)} className={inputClass} />
            <p className="text-xs text-gray-500 mt-1">{t('admin.branding.brandNameHelp')}</p>
          </div>
          <div>
            <Label htmlFor="brand-color">{t('admin.branding.color')}</Label>
            <div className="flex items-center gap-2">
              <input id="brand-color" type="color" value={isHex(color) ? color : DEFAULT_COLOR} onChange={(e) => setColor(e.target.value)} className="h-11 w-14 rounded-lg border-2 border-gray-200 bg-white cursor-pointer" />
              <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className={`${inputClass} font-mono`} aria-label={t('admin.branding.color')} maxLength={7} />
              <Button variant="ghost" onClick={() => setColor(DEFAULT_COLOR)}>{t('admin.branding.resetColor')}</Button>
            </div>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ticket-footer">{t('admin.branding.ticketFooter')}</Label>
            <input id="ticket-footer" type="text" maxLength={120} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder={t('admin.branding.ticketFooterPlaceholder')} className={inputClass} />
          </div>
        </div>
      </Card>

      <Card title={t('admin.branding.announcements')} description={t('admin.branding.announcementsHelp')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="ann-no">{t('common.language.norwegian')}</Label>
            <input id="ann-no" type="text" maxLength={200} value={announcementNo} onChange={(e) => setAnnouncementNo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <Label htmlFor="ann-en">{t('common.language.english')}</Label>
            <input id="ann-en" type="text" maxLength={200} value={announcementEn} onChange={(e) => setAnnouncementEn(e.target.value)} className={inputClass} />
          </div>
        </div>
      </Card>

      <Card title={t('admin.branding.publicUrl')} description={t('admin.branding.publicUrlHelp')}>
        <input type="url" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://queue.example.com" className={inputClass} aria-label={t('admin.branding.publicUrl')} />
      </Card>

      <div className="flex items-center gap-3 sticky bottom-4">
        <Button size="lg" onClick={saveBranding}>{t('common.save')}</Button>
        <SavedHint show={saved} text={t('common.saved')} />
      </div>
    </div>
  );
};

export default BrandingSettings;
