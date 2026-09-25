import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useQueue } from '../../../context/QueueContext';
import { useI18n } from '../../../context/I18nContext';
import { Counter } from '../../../types';
import { Button, Card, inputClass, PageTitle, SavedHint, useSavedFlag } from '../ui';

const CounterRow: React.FC<{ counter: Counter }> = ({ counter }) => {
  const { services, saveCounter, deleteCounter } = useQueue();
  const { t } = useI18n();
  const [name, setName] = useState(counter.name);
  const [saved, markSaved] = useSavedFlag();
  useEffect(() => { setName(counter.name); }, [counter.name]);

  const toggleService = (serviceId: string) => {
    const current = counter.activeServiceIds || [];
    const next = current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId];
    saveCounter({ ...counter, activeServiceIds: next });
  };

  const saveName = async () => {
    if (!name.trim() || name === counter.name) return;
    const res = await saveCounter({ ...counter, name: name.trim() });
    if (res.ok) markSaved();
  };

  return (
    <div className="p-5 bg-white border-2 border-gray-100 rounded-2xl shadow-sm">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
          className={`${inputClass} flex-1 min-w-[160px] font-bold`}
          aria-label={t('admin.counters.name')}
        />
        <button
          onClick={() => saveCounter({ ...counter, isOnline: !counter.isOnline })}
          className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${counter.isOnline ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
          aria-pressed={counter.isOnline}
        >
          {counter.isOnline ? t('admin.counters.online') : t('admin.counters.offline')}
        </button>
        <Button
          variant="danger"
          aria-label={t('admin.counters.delete')}
          onClick={() => { if (window.confirm(t('admin.counters.deleteConfirm', { name: counter.name }))) deleteCounter(counter.id); }}
        >
          <Trash2 size={16} />
        </Button>
        <SavedHint show={saved} text={t('common.saved')} />
      </div>
      <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">{t('admin.counters.handles')}</p>
      <div className="flex flex-wrap gap-2">
        {services.map((s) => {
          const active = (counter.activeServiceIds || []).includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleService(s.id)}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-lg border-2 text-xs font-bold select-none transition-all ${active ? 'bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100' : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
      {(counter.activeServiceIds || []).length === 0 && <p className="text-xs text-gray-500 mt-2">{t('admin.counters.allServices')}</p>}
    </div>
  );
};

const CountersSettings: React.FC = () => {
  const { counters, services, saveCounter } = useQueue();
  const { t } = useI18n();
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await saveCounter({ name: newName.trim(), activeServiceIds: services.map((s) => s.id), isOnline: true });
    if (res.ok) setNewName('');
  };

  return (
    <div className="space-y-6">
      <PageTitle>{t('admin.counters.title')}</PageTitle>
      <Card title={t('admin.counters.new')}>
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} className={inputClass} placeholder={t('admin.counters.placeholder')} aria-label={t('admin.counters.name')} />
          <Button onClick={handleCreate} disabled={!newName.trim()}>{t('admin.counters.create')}</Button>
        </div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {counters.map((c) => <CounterRow key={c.id} counter={c} />)}
      </div>
    </div>
  );
};

export default CountersSettings;
