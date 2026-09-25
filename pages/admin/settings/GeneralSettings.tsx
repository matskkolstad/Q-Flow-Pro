import React, { useEffect, useState } from 'react';
import { useQueue } from '../../../context/QueueContext';
import { useI18n } from '../../../context/I18nContext';
import { Button, Card, inputClass, PageTitle, SavedHint, Toggle, useSavedFlag } from '../ui';

// Day-to-day settings: open/close, screen message, sounds and resetting the queue.
const GeneralSettings: React.FC = () => {
  const { isClosed, publicMessage, soundSettings, updateSettings, resetSystem } = useQueue();
  const { t } = useI18n();
  const [message, setMessage] = useState(publicMessage);
  const [savedMessage, markMessageSaved] = useSavedFlag();

  useEffect(() => { setMessage(publicMessage); }, [publicMessage]);

  const saveMessage = async () => {
    const res = await updateSettings({ publicMessage: message.trim() });
    if (res.ok) markMessageSaved();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle>{t('admin.general.title')}</PageTitle>

      <Card title={t('admin.general.close.title')} description={t('admin.general.close.desc')}>
        <div className="flex flex-wrap items-center gap-4">
          <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${isClosed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {isClosed ? t('admin.general.close.closed') : t('admin.general.close.open')}
          </span>
          <Button variant={isClosed ? 'primary' : 'danger'} onClick={() => updateSettings({ isClosed: !isClosed })}>
            {isClosed ? t('admin.general.close.openButton') : t('admin.general.close.closeButton')}
          </Button>
        </div>
      </Card>

      <Card title={t('admin.general.marquee.label')} description={t('admin.general.marquee.help')}>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={message}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveMessage(); }}
            placeholder={t('admin.general.marquee.placeholder')}
            className={inputClass}
            aria-label={t('admin.general.marquee.label')}
          />
          <div className="flex gap-2">
            <Button onClick={saveMessage} disabled={message.trim() === publicMessage}>{t('common.save')}</Button>
            {publicMessage && <Button variant="secondary" onClick={() => updateSettings({ publicMessage: '' })}>{t('admin.general.marquee.clear')}</Button>}
          </div>
        </div>
        <div className="mt-2"><SavedHint show={savedMessage} text={t('common.saved')} /></div>
      </Card>

      <Card title={t('admin.general.sound.title')}>
        <div className="divide-y divide-gray-100">
          <Toggle label={t('admin.general.sound.call')} description={t('admin.general.sound.callDesc')} checked={soundSettings.callChime} onChange={(v) => updateSettings({ soundSettings: { callChime: v } })} />
          <Toggle label={t('admin.general.sound.voice')} description={t('admin.general.sound.voiceDesc')} checked={soundSettings.callVoice} onChange={(v) => updateSettings({ soundSettings: { callVoice: v } })} />
          <Toggle label={t('admin.general.sound.kiosk')} description={t('admin.general.sound.kioskDesc')} checked={soundSettings.kioskEffects} onChange={(v) => updateSettings({ soundSettings: { kioskEffects: v } })} />
          <Toggle label={t('admin.general.sound.admin')} description={t('admin.general.sound.adminDesc')} checked={soundSettings.adminEffects} onChange={(v) => updateSettings({ soundSettings: { adminEffects: v } })} />
        </div>
      </Card>

      <Card title={t('admin.general.reset.title')} description={t('admin.general.reset.desc')} className="!bg-yellow-50 !border-yellow-100">
        <Button
          className="!bg-yellow-500 hover:!bg-yellow-600 text-white"
          onClick={() => { if (window.confirm(t('admin.general.reset.confirm'))) resetSystem(); }}
        >
          {t('admin.general.reset.button')}
        </Button>
      </Card>
    </div>
  );
};

export default GeneralSettings;
