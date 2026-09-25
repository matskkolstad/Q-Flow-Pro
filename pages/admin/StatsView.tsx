import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useQueue } from '../../context/QueueContext';
import { StatsResponse, StatsGroup } from '../../types';
import { authJson, downloadFile } from '../../utils/api';
import { Button, Card, inputClass, Label } from './ui';

const dayString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayString(d);
};

type Bar = { key: string; label: string; value: number; tooltip: string };

// Single-series bar chart: one hue, thin marks with 2px gaps, rounded data ends on a baseline,
// hover tooltip per bar and a hidden table for screen readers.
const BarChart: React.FC<{ bars: Bar[]; caption: string; labelEvery?: number }> = ({ bars, caption, labelEvery = 1 }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <figure className="w-full">
      <div className="relative h-48 flex items-end gap-[2px] border-b border-gray-200" role="img" aria-label={caption}>
        {bars.map((bar, i) => (
          <div
            key={bar.key}
            className="flex-1 h-full flex items-end relative"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
          >
            <div
              className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-brand-700' : 'bg-brand-500'}`}
              style={{ height: `${(bar.value / max) * 100}%`, minHeight: bar.value > 0 ? 2 : 0 }}
            />
            {hover === i && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded-md shadow-lg z-10 pointer-events-none">
                {bar.tooltip}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1" aria-hidden="true">
        {bars.map((bar, i) => (
          <div key={bar.key} className="flex-1 text-center text-[10px] text-gray-500 truncate">
            {i % labelEvery === 0 ? bar.label : ''}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {bars.map((bar) => <tr key={bar.key}><th scope="row">{bar.label}</th><td>{bar.value}</td></tr>)}
        </tbody>
      </table>
    </figure>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-white p-5 rounded-2xl border border-gray-200">
    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</p>
    <p className="text-3xl font-black text-gray-900 mt-2 tabular-nums">{value}</p>
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

const minutes = (value: number | null | undefined) => (value == null ? '–' : `${value} min`);

const GroupTable: React.FC<{ title: string; rows: StatsGroup[]; nameLabel: string }> = ({ title, rows, nameLabel }) => {
  const { t } = useI18n();
  return (
    <Card title={title}>
      {rows.length === 0 ? <p className="text-sm text-gray-500">{t('admin.stats.noData')}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-black text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="py-2 pr-4">{nameLabel}</th>
                <th className="py-2 pr-4 text-right">{t('admin.stats.tickets')}</th>
                <th className="py-2 pr-4 text-right">{t('admin.stats.completed')}</th>
                <th className="py-2 pr-4 text-right">{t('admin.stats.noShow')}</th>
                <th className="py-2 pr-4 text-right">{t('admin.stats.avgWait')}</th>
                <th className="py-2 text-right">{t('admin.stats.avgService')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="py-2 pr-4 font-bold text-gray-900">{row.label}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.total}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.completed}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.noShow}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{minutes(row.avgWaitMinutes)}</td>
                  <td className="py-2 text-right tabular-nums">{minutes(row.avgServiceMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const PRESETS = [
  { key: 'today', days: 0 },
  { key: 'week', days: 6 },
  { key: 'month', days: 29 },
];

const StatsView: React.FC = () => {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { todaySummary } = useQueue();
  const [from, setFrom] = useState(daysAgo(0));
  const [to, setTo] = useState(daysAgo(0));
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const locale = language === 'en' ? 'en-GB' : 'nb-NO';

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await authJson<StatsResponse>(`/api/stats?from=${from}&to=${to}`);
    setLoading(false);
    if (!res.ok) {
      setError(t('admin.stats.loadError'));
      return;
    }
    setStats(res.data);
  };

  // Reload when the range changes, and when tickets finish today (todaySummary changes).
  useEffect(() => { load(); }, [from, to, todaySummary?.total, todaySummary?.completed]);

  const hourBars: Bar[] = useMemo(() => (stats?.byHour || []).map((h) => ({
    key: String(h.hour),
    label: String(h.hour).padStart(2, '0'),
    value: h.tickets,
    tooltip: t('admin.stats.hourTooltip', { hour: String(h.hour).padStart(2, '0'), count: h.tickets }),
  })), [stats, t]);

  // Every day in the range gets a bar, so days without tickets show as gaps instead of disappearing.
  const dayBars: Bar[] = useMemo(() => {
    if (!stats) return [];
    const totals = new Map(stats.byDay.map((d) => [d.key, d.total]));
    const first = stats.byDay[0]?.key;
    const bars: Bar[] = [];
    if (!first) return bars;
    for (let date = new Date(`${first}T12:00:00`); bars.length < 366; date.setDate(date.getDate() + 1)) {
      const key = dayString(date);
      if (key > to) break;
      const value = totals.get(key) || 0;
      const label = date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
      bars.push({ key, label, value, tooltip: `${label}: ${value}` });
    }
    return bars;
  }, [stats, locale, to]);

  const exportCsv = () => downloadFile(`/api/stats/export.csv?from=${from}&to=${to}`, `qflow-${from}_${to}.csv`).catch(() => setError(t('admin.stats.exportError')));

  const totals = stats?.totals;
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-2 flex-wrap" role="group" aria-label={t('admin.stats.range')}>
          {PRESETS.map((p) => {
            const active = from === daysAgo(p.days) && to === daysAgo(0);
            return (
              <Button key={p.key} variant={active ? 'primary' : 'secondary'} size="sm" onClick={() => { setFrom(daysAgo(p.days)); setTo(daysAgo(0)); }} aria-pressed={active}>
                {t(`admin.stats.preset.${p.key}`)}
              </Button>
            );
          })}
        </div>
        <div>
          <Label htmlFor="stats-from">{t('admin.stats.from')}</Label>
          <input id="stats-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <Label htmlFor="stats-to">{t('admin.stats.to')}</Label>
          <input id="stats-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputClass} />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="secondary" onClick={load} disabled={loading}><RefreshCw size={16} /> {t('admin.stats.refresh')}</Button>
          {user?.role === 'ADMIN' && <Button onClick={exportCsv}><Download size={16} /> {t('admin.stats.export')}</Button>}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 font-bold">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label={t('admin.stats.tickets')} value={totals ? totals.total + (totals.waitingNow || 0) + (totals.servingNow || 0) : '–'} hint={totals && (totals.waitingNow || totals.servingNow) ? t('admin.stats.inProgress', { count: (totals.waitingNow || 0) + (totals.servingNow || 0) }) : undefined} />
        <Tile label={t('admin.stats.completed')} value={totals?.completed ?? '–'} hint={totals ? t('admin.stats.noShowCancelled', { noShow: totals.noShow, cancelled: totals.cancelled }) : undefined} />
        <Tile label={t('admin.stats.avgWait')} value={minutes(totals?.avgWaitMinutes)} />
        <Tile label={t('admin.stats.avgService')} value={minutes(totals?.avgServiceMinutes)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title={t('admin.stats.byHour')} description={t('admin.stats.byHourDesc')}>
          <BarChart bars={hourBars} caption={t('admin.stats.byHour')} labelEvery={3} />
        </Card>
        {dayBars.length > 1 && (
          <Card title={t('admin.stats.byDay')}>
            <BarChart bars={dayBars} caption={t('admin.stats.byDay')} labelEvery={Math.max(1, Math.ceil(dayBars.length / 10))} />
          </Card>
        )}
      </div>

      <GroupTable title={t('admin.stats.byService')} rows={stats?.byService || []} nameLabel={t('admin.stats.service')} />
      <GroupTable title={t('admin.stats.byCounter')} rows={stats?.byCounter || []} nameLabel={t('admin.stats.counter')} />
    </div>
  );
};

export default StatsView;
