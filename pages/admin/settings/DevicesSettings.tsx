import React, { useEffect, useState } from 'react';
import { Printer as PrinterIcon, Monitor, Tablet, Trash2 } from 'lucide-react';
import { useQueue } from '../../../context/QueueContext';
import { useI18n } from '../../../context/I18nContext';
import { Printer } from '../../../types';
import { publicBaseUrl } from '../../../components/QrCode';
import { Button, Card, inputClass, Label, PageTitle, SavedHint, StatusDot, Toggle, isRecentlySeen, useSavedFlag } from '../ui';

type PrinterDraft = { id?: string; name: string; ipAddress: string; port: number; type: Printer['type'] };

const PrinterForm: React.FC<{ printer?: Printer; onSaved?: () => void }> = ({ printer, onSaved }) => {
  const { savePrinter, deletePrinter, testPrinter } = useQueue();
  const { t } = useI18n();
  const initial: PrinterDraft = { id: printer?.id, name: printer?.name || '', ipAddress: printer?.ipAddress || '', port: printer?.port || 9100, type: printer?.type || 'EPSON_IP' };
  const [draft, setDraft] = useState(initial);
  const [saved, markSaved] = useSavedFlag();
  const [testResult, setTestResult] = useState('');
  useEffect(() => { setDraft(initial); }, [printer?.id, printer?.name, printer?.ipAddress, printer?.port, printer?.type]);
  const set = (patch: Partial<PrinterDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const idBase = printer?.id || 'new-printer';
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);

  const handleSave = async () => {
    const res = await savePrinter(draft);
    if (res.ok) {
      markSaved();
      onSaved?.();
    }
  };

  const handleTest = async () => {
    if (!printer) return;
    setTestResult(t('admin.devices.testing'));
    const res = await testPrinter(printer.id);
    setTestResult(res.ok ? t('admin.devices.testOk') : t('admin.devices.testFailed'));
  };

  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div className="col-span-2 md:col-span-1">
          <Label htmlFor={`${idBase}-name`}>{t('admin.devices.printerName')}</Label>
          <input id={`${idBase}-name`} value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} className={inputClass} placeholder={t('admin.devices.printerNamePlaceholder')} />
        </div>
        <div className="col-span-2">
          <Label htmlFor={`${idBase}-ip`}>{t('admin.devices.printerIp')}</Label>
          <input id={`${idBase}-ip`} value={draft.ipAddress} onChange={(e) => set({ ipAddress: e.target.value.trim() })} className={`${inputClass} font-mono`} placeholder={t('admin.devices.printerIpPlaceholder')} />
        </div>
        <div>
          <Label htmlFor={`${idBase}-port`}>{t('admin.devices.port')}</Label>
          <input id={`${idBase}-port`} type="number" min={1} max={65535} value={draft.port} onChange={(e) => set({ port: Number(e.target.value) })} className={inputClass} />
        </div>
        <div>
          <Label htmlFor={`${idBase}-type`}>{t('admin.devices.type')}</Label>
          <select id={`${idBase}-type`} value={draft.type} onChange={(e) => set({ type: e.target.value as Printer['type'] })} className={inputClass}>
            <option value="EPSON_IP">Epson (ESC/POS)</option>
            <option value="GENERIC_NETWORK">{t('admin.devices.typeGeneric')}</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-2 text-sm">
          {printer && <StatusDot online={printer.status === 'ONLINE'} label={printer.status === 'ONLINE' ? t('admin.devices.online') : t('admin.devices.offline')} />}
          {testResult && <span className="text-gray-600 font-medium">{testResult}</span>}
        </div>
        <div className="flex items-center gap-2">
          <SavedHint show={saved} text={t('common.saved')} />
          {printer && <Button variant="secondary" size="sm" onClick={handleTest}>{t('admin.devices.testPrint')}</Button>}
          {printer && (
            <Button variant="danger" size="sm" aria-label={t('admin.devices.removePrinter')} onClick={() => { if (window.confirm(t('admin.devices.removePrinterConfirm', { name: printer.name }))) deletePrinter(printer.id); }}>
              <Trash2 size={14} />
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!changed || !draft.ipAddress}>{printer ? t('common.save') : t('admin.devices.printerAdd')}</Button>
        </div>
      </div>
    </div>
  );
};

const KioskPinCard: React.FC = () => {
  const { kioskExitPinSet, updateSettings, reportError } = useQueue();
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [saved, markSaved] = useSavedFlag();
  const save = async () => {
    const value = pin.trim();
    if (value && !/^\d{4,12}$/.test(value)) {
      reportError(t('admin.general.pin.invalid'));
      return;
    }
    const res = await updateSettings({ kioskExitPin: value });
    if (res.ok) {
      setPin('');
      markSaved();
    }
  };
  return (
    <Card title={t('admin.general.pin.title')} description={t('admin.general.pin.desc')}>
      <div className="flex gap-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          className={`${inputClass} font-mono`}
          placeholder={t('admin.general.pin.placeholder')}
          aria-label={t('admin.general.pin.title')}
        />
        <Button onClick={save} disabled={!pin.trim()}>{t('admin.general.pin.save')}</Button>
      </div>
      <p className={`text-xs mt-2 font-medium ${kioskExitPinSet ? 'text-gray-500' : 'text-amber-700'}`}>
        {saved ? t('admin.general.pin.saved') : kioskExitPinSet ? t('admin.general.pin.set') : t('admin.general.pin.notSet')}
      </p>
    </Card>
  );
};

const KioskBehaviourCard: React.FC = () => {
  const { settings, updateSettings } = useQueue();
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(String(settings.kiosk?.autoReturnSeconds ?? 15));
  useEffect(() => { setSeconds(String(settings.kiosk?.autoReturnSeconds ?? 15)); }, [settings.kiosk?.autoReturnSeconds]);
  const saveSeconds = () => {
    const value = Math.max(0, Math.min(600, Math.round(Number(seconds) || 0)));
    if (value !== settings.kiosk?.autoReturnSeconds) updateSettings({ settings: { kiosk: { autoReturnSeconds: value } } });
  };
  return (
    <Card title={t('admin.devices.kioskBehaviour')}>
      <div className="max-w-xs mb-2">
        <Label htmlFor="kiosk-return">{t('admin.devices.autoReturn')}</Label>
        <input id="kiosk-return" type="number" min={0} max={600} value={seconds} onChange={(e) => setSeconds(e.target.value)} onBlur={saveSeconds} onKeyDown={(e) => { if (e.key === 'Enter') saveSeconds(); }} className={inputClass} />
        <p className="text-xs text-gray-500 mt-1">{t('admin.devices.autoReturnHelp')}</p>
      </div>
      <div className="divide-y divide-gray-100">
        <Toggle label={t('admin.devices.showQr')} description={t('admin.devices.showQrHelp')} checked={settings.kiosk?.showQr !== false} onChange={(v) => updateSettings({ settings: { kiosk: { showQr: v } } })} />
        <Toggle label={t('admin.devices.printQr')} description={t('admin.devices.printQrHelp')} checked={!!settings.kiosk?.printQr} onChange={(v) => updateSettings({ settings: { kiosk: { printQr: v } } })} />
      </div>
    </Card>
  );
};

const DisplayMessage: React.FC<{ displayId: string; message: string }> = ({ displayId, message }) => {
  const { setCounterDisplayMessage } = useQueue();
  const { t } = useI18n();
  const [value, setValue] = useState(message);
  const [saved, markSaved] = useSavedFlag();
  useEffect(() => { setValue(message); }, [message]);
  const save = async () => {
    if (value.trim() === message) return;
    const res = await setCounterDisplayMessage(displayId, value.trim());
    if (res.ok) markSaved();
  };
  return (
    <div className="mt-3">
      <Label htmlFor={`msg-${displayId}`}>{t('admin.devices.messageLabel')}</Label>
      <div className="flex gap-2">
        <input id={`msg-${displayId}`} value={value} maxLength={300} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder={t('admin.devices.messagePlaceholder')} className={inputClass} />
        <Button onClick={save} disabled={value.trim() === message}>{t('common.save')}</Button>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-[11px] text-gray-500">{t('admin.devices.messageHelp')}</p>
        <SavedHint show={saved} text={t('common.saved')} />
      </div>
    </div>
  );
};

const DevicesSettings: React.FC = () => {
  const { printers, kiosks, counterDisplays, counters, assignPrinterToKiosk, removeKiosk, assignCounterDisplay, removeCounterDisplay, settings } = useQueue();
  const { t, language } = useI18n();
  const [newPrinterKey, setNewPrinterKey] = useState(0);
  const [, setTick] = useState(0);
  const locale = language === 'en' ? 'en-GB' : 'nb-NO';
  const base = publicBaseUrl(settings.publicUrl);

  // Re-render every 15 s so online/offline badges stay current.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const lastSeenText = (lastSeen?: number) => (lastSeen ? new Date(lastSeen).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : t('admin.devices.never'));

  return (
    <div className="space-y-6">
      <PageTitle>{t('admin.devices.title')}</PageTitle>

      <Card title={<span className="flex items-center gap-2"><PrinterIcon size={20} /> {t('admin.devices.configuredPrinters')}</span>} description={t('admin.devices.printersHelp')}>
        <div className="space-y-3">
          {printers.length === 0 && <p className="text-gray-500 italic text-sm">{t('admin.devices.noPrinters')}</p>}
          {printers.map((p) => <PrinterForm key={p.id} printer={p} />)}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t('admin.devices.addPrinter')}</p>
            <PrinterForm key={newPrinterKey} onSaved={() => setNewPrinterKey((k) => k + 1)} />
          </div>
        </div>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Tablet size={20} /> {t('admin.devices.activeKiosks')}</span>} description={t('admin.devices.kiosksHelp', { url: `${base}/#/kiosk` })}>
        {kiosks.length === 0 ? <p className="text-gray-500 italic text-sm">{t('admin.devices.noKiosks')}</p> : (
          <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {kiosks.map((k) => {
              const online = isRecentlySeen(k.lastSeen);
              return (
                <li key={k.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <div>
                      <p className="font-bold text-gray-800">{k.name}</p>
                      <p className="text-xs text-gray-500">{t('admin.devices.lastSeen')}: {lastSeenText(k.lastSeen)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusDot online={online} label={online ? t('admin.devices.online') : t('admin.devices.offline')} />
                      <button
                        onClick={() => { if (window.confirm(t('admin.devices.removeKioskConfirm', { name: k.name }))) removeKiosk(k.id); }}
                        className="text-gray-400 hover:text-red-600 p-1"
                        title={t('admin.devices.removeKiosk')}
                        aria-label={t('admin.devices.removeKiosk')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <Label htmlFor={`kiosk-printer-${k.id}`}>{t('admin.devices.assignedPrinter')}</Label>
                  <select id={`kiosk-printer-${k.id}`} value={k.assignedPrinterId || ''} onChange={(e) => assignPrinterToKiosk(k.id, e.target.value)} className={inputClass}>
                    <option value="">{t('admin.devices.noneSelected')}</option>
                    {printers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.ipAddress})</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <KioskBehaviourCard />
        <KioskPinCard />
      </div>

      <Card title={<span className="flex items-center gap-2"><Monitor size={20} /> {t('admin.devices.counterDisplays')}</span>} description={t('admin.devices.displaysHelp', { url: `${base}/#/counter-display` })}>
        {counterDisplays.length === 0 ? <p className="text-gray-500 italic text-sm">{t('admin.devices.noCounterDisplays')}</p> : (
          <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {counterDisplays.map((d) => {
              const online = isRecentlySeen(d.lastSeen);
              return (
                <li key={d.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <div>
                      <p className="font-bold text-gray-800">{d.name}</p>
                      <p className="text-[11px] font-mono text-gray-500">ID: {d.id.slice(-4).toUpperCase()}</p>
                      <p className="text-xs text-gray-500">{t('admin.devices.lastSeen')}: {lastSeenText(d.lastSeen)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusDot online={online} label={online ? t('admin.devices.online') : t('admin.devices.offline')} />
                      <button onClick={() => removeCounterDisplay(d.id)} className="text-gray-400 hover:text-red-600 p-1" title={t('admin.devices.removeDisplay')} aria-label={t('admin.devices.removeDisplay')}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <Label htmlFor={`display-counter-${d.id}`}>{t('admin.devices.assignedCounter')}</Label>
                  <select id={`display-counter-${d.id}`} value={d.counterId || ''} onChange={(e) => assignCounterDisplay(d.id, e.target.value || undefined)} className={inputClass}>
                    <option value="">{t('admin.devices.notAssigned')}</option>
                    {counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <DisplayMessage displayId={d.id} message={d.message || ''} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default DevicesSettings;
