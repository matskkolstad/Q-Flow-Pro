import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useQueue } from '../../../context/QueueContext';
import { useI18n } from '../../../context/I18nContext';
import { Service } from '../../../types';
import { serviceHex } from '../../../utils/color';
import { Button, Card, inputClass, Label, PageTitle, SavedHint, Toggle, useSavedFlag } from '../ui';

const PRESET_COLORS = ['#2563eb', '#9333ea', '#059669', '#dc2626', '#ea580c', '#ca8a04', '#db2777', '#0891b2', '#4b5563'];

type Draft = Omit<Service, 'id'> & { id?: string };

const emptyDraft = (): Draft => ({ name: '', prefix: '', color: PRESET_COLORS[0], estimatedTimePerPersonMinutes: 5, priority: 1, isOpen: true });

const ServiceForm: React.FC<{ initial: Draft; onSaved?: () => void; isNew?: boolean }> = ({ initial, onSaved, isNew = false }) => {
  const { saveService, deleteService, tickets } = useQueue();
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, markSaved] = useSavedFlag();
  useEffect(() => { setDraft(initial); }, [JSON.stringify(initial)]);
  const idBase = draft.id || 'new';
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const openTickets = tickets.filter((x) => x.serviceId === draft.id && (x.status === 'WAITING' || x.status === 'SERVING')).length;

  const handleSave = async () => {
    const res = await saveService({ ...draft, prefix: draft.prefix.toUpperCase() });
    if (res.ok) {
      markSaved();
      onSaved?.();
    }
  };

  const handleDelete = async () => {
    if (!draft.id) return;
    const text = openTickets > 0 ? t('admin.services.deleteConfirmTickets', { name: draft.name, count: openTickets }) : t('admin.services.deleteConfirm', { name: draft.name });
    if (window.confirm(text)) await deleteService(draft.id);
  };

  return (
    <div className="p-5 bg-white border-2 border-gray-100 rounded-2xl">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
        <div className="col-span-2">
          <Label htmlFor={`${idBase}-name`}>{t('admin.services.name')}</Label>
          <input id={`${idBase}-name`} value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} className={inputClass} placeholder={t('admin.services.namePlaceholder')} />
        </div>
        <div>
          <Label htmlFor={`${idBase}-prefix`}>{t('admin.services.prefix')}</Label>
          <input id={`${idBase}-prefix`} value={draft.prefix} maxLength={3} onChange={(e) => set({ prefix: e.target.value.toUpperCase() })} className={`${inputClass} font-bold`} placeholder="A" />
        </div>
        <div>
          <Label htmlFor={`${idBase}-eta`}>{t('admin.services.eta')}</Label>
          <input id={`${idBase}-eta`} type="number" min={1} max={600} value={draft.estimatedTimePerPersonMinutes} onChange={(e) => set({ estimatedTimePerPersonMinutes: Number(e.target.value) })} className={inputClass} />
        </div>
        <div>
          <Label htmlFor={`${idBase}-prio`}>{t('admin.services.priority')}</Label>
          <input id={`${idBase}-prio`} type="number" min={0} max={100} value={draft.priority ?? 1} onChange={(e) => set({ priority: Number(e.target.value) })} className={inputClass} />
        </div>
        <div>
          <Label>{t('admin.services.color')}</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={serviceHex(draft.color)} onChange={(e) => set({ color: e.target.value })} className="h-11 w-12 rounded-lg border-2 border-gray-200 cursor-pointer" aria-label={t('admin.services.color')} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label={t('admin.services.color')}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set({ color: c })}
            className={`w-7 h-7 rounded-lg border-2 ${serviceHex(draft.color).toLowerCase() === c ? 'border-gray-900' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
      <p className="text-[11px] text-gray-500 mt-2">{t('admin.services.prioHelp')}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
        <div className="min-w-[220px]">
          <Toggle label={t('admin.services.open')} description={t('admin.services.openHelp')} checked={draft.isOpen !== false} onChange={(v) => set({ isOpen: v })} />
        </div>
        <div className="flex items-center gap-2">
          <SavedHint show={saved} text={t('common.saved')} />
          {!isNew && (
            <Button variant="danger" onClick={handleDelete} aria-label={t('admin.services.delete')}><Trash2 size={16} /></Button>
          )}
          <Button onClick={handleSave} disabled={!changed || !draft.name.trim() || !draft.prefix.trim()}>
            {isNew ? t('admin.services.add') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const ServicesSettings: React.FC = () => {
  const { services } = useQueue();
  const { t } = useI18n();
  const [newKey, setNewKey] = useState(0);
  return (
    <div className="space-y-6">
      <PageTitle>{t('admin.services.title')}</PageTitle>
      <Card title={t('admin.services.new')}>
        <ServiceForm key={newKey} initial={emptyDraft()} isNew onSaved={() => setNewKey((k) => k + 1)} />
      </Card>
      <div className="space-y-3">
        {services.map((s) => (
          <ServiceForm key={s.id} initial={{ ...s, priority: s.priority ?? 1 }} />
        ))}
      </div>
    </div>
  );
};

export default ServicesSettings;
