import React, { useEffect, useState } from 'react';
import { useQueue } from '../../../context/QueueContext';
import { useI18n } from '../../../context/I18nContext';
import { DailyJob, ScheduleSettings as Schedule, Weekday } from '../../../types';
import { Button, Card, inputClass, Label, PageTitle, SavedHint, Toggle, useSavedFlag } from '../ui';

const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FALLBACK_DAY = { enabled: false, open: '08:00', close: '16:00' };

// Opening hours (automatic open/close), the nightly queue reset and automatic backups.
const ScheduleSettings: React.FC = () => {
  const { settings, updateSettings, jobs } = useQueue();
  const { t } = useI18n();
  const [schedule, setSchedule] = useState<Schedule>(settings.schedule);
  const [autoReset, setAutoReset] = useState<DailyJob>(settings.autoReset || { enabled: true, time: '04:00' });
  const [backup, setBackup] = useState<DailyJob>(settings.backup || { enabled: true, time: '02:30' });
  const [saved, markSaved] = useSavedFlag();

  useEffect(() => {
    setSchedule(settings.schedule);
    if (settings.autoReset) setAutoReset(settings.autoReset);
    if (settings.backup) setBackup(settings.backup);
  }, [JSON.stringify(settings.schedule), JSON.stringify(settings.autoReset), JSON.stringify(settings.backup)]);

  const setDay = (day: Weekday, patch: Partial<Schedule['days'][Weekday]>) => setSchedule((s) => ({
    ...s,
    days: { ...s.days, [day]: { ...(s.days?.[day] || FALLBACK_DAY), ...patch } },
  }));

  const save = async () => {
    const res = await updateSettings({ settings: { schedule, autoReset, backup } });
    if (res.ok) markSaved();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle>{t('admin.schedule.title')}</PageTitle>
      <p className="text-sm text-gray-600 -mt-4">{t('admin.schedule.timezone')}</p>

      <Card title={t('admin.schedule.openingHours')} description={t('admin.schedule.openingHoursHelp')}>
        <Toggle label={t('admin.schedule.enable')} checked={schedule.enabled} onChange={(v) => setSchedule((s) => ({ ...s, enabled: v }))} />
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-black text-gray-500 uppercase tracking-wider">
                <th className="py-2 pr-3">{t('admin.schedule.day')}</th>
                <th className="py-2 pr-3">{t('admin.schedule.open')}</th>
                <th className="py-2 pr-3">{t('admin.schedule.opens')}</th>
                <th className="py-2">{t('admin.schedule.closes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {DAYS.map((day) => {
                const config = schedule.days?.[day] || FALLBACK_DAY;
                return (
                  <tr key={day} className={schedule.enabled ? '' : 'opacity-60'}>
                    <td className="py-2 pr-3 font-bold text-gray-800">{t(`weekday.${day}`)}</td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={config.enabled} onChange={(e) => setDay(day, { enabled: e.target.checked })} aria-label={`${t(`weekday.${day}`)}: ${t('admin.schedule.open')}`} />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="time" value={config.open} disabled={!config.enabled} onChange={(e) => setDay(day, { open: e.target.value })} className={`${inputClass} !py-1.5 max-w-[8rem]`} aria-label={`${t(`weekday.${day}`)}: ${t('admin.schedule.opens')}`} />
                    </td>
                    <td className="py-2">
                      <input type="time" value={config.close} disabled={!config.enabled} onChange={(e) => setDay(day, { close: e.target.value })} className={`${inputClass} !py-1.5 max-w-[8rem]`} aria-label={`${t(`weekday.${day}`)}: ${t('admin.schedule.closes')}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('admin.schedule.autoReset')} description={t('admin.schedule.autoResetHelp')}>
        <Toggle label={t('admin.schedule.enableAutoReset')} checked={autoReset.enabled} onChange={(v) => setAutoReset((j) => ({ ...j, enabled: v }))} />
        <div className="max-w-[10rem] mt-2">
          <Label htmlFor="reset-time">{t('admin.schedule.time')}</Label>
          <input id="reset-time" type="time" value={autoReset.time} disabled={!autoReset.enabled} onChange={(e) => setAutoReset((j) => ({ ...j, time: e.target.value }))} className={inputClass} />
        </div>
        {jobs.lastResetDay && <p className="text-xs text-gray-500 mt-2">{t('admin.schedule.lastRun', { day: jobs.lastResetDay })}</p>}
      </Card>

      <Card title={t('admin.schedule.autoBackup')} description={t('admin.schedule.autoBackupHelp')}>
        <Toggle label={t('admin.schedule.enableAutoBackup')} checked={backup.enabled} onChange={(v) => setBackup((j) => ({ ...j, enabled: v }))} />
        <div className="max-w-[10rem] mt-2">
          <Label htmlFor="backup-time">{t('admin.schedule.time')}</Label>
          <input id="backup-time" type="time" value={backup.time} disabled={!backup.enabled} onChange={(e) => setBackup((j) => ({ ...j, time: e.target.value }))} className={inputClass} />
        </div>
        {jobs.lastBackupDay && <p className="text-xs text-gray-500 mt-2">{t('admin.schedule.lastRun', { day: jobs.lastBackupDay })}</p>}
      </Card>

      <div className="flex items-center gap-3">
        <Button size="lg" onClick={save}>{t('common.save')}</Button>
        <SavedHint show={saved} text={t('common.saved')} />
      </div>
    </div>
  );
};

export default ScheduleSettings;
