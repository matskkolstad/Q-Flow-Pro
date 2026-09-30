import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useQueue } from '../../context/QueueContext';
import { useI18n } from '../../context/I18nContext';
import { LogEntry } from '../../types';
import { Button, inputClass } from './ui';

const TYPES: Array<LogEntry['type'] | 'ALL'> = ['ALL', 'ACTION', 'ALERT', 'INFO'];

const badgeClass = (type: LogEntry['type']) => ({
  INFO: 'bg-blue-50 text-blue-700 border-blue-100',
  ACTION: 'bg-green-50 text-green-700 border-green-100',
  ALERT: 'bg-red-50 text-red-700 border-red-100',
}[type]);

// Neutralises spreadsheet formulas in exported cells.
const csvCell = (value: string) => {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
};

const LogsView: React.FC = () => {
  const { logs } = useQueue();
  const { t, language } = useI18n();
  const [type, setType] = useState<LogEntry['type'] | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const locale = language === 'en' ? 'en-GB' : 'nb-NO';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => (type === 'ALL' || log.type === type) && (!q || log.message.toLowerCase().includes(q)));
  }, [logs, type, query]);

  const handleExport = () => {
    const header = [t('admin.logs.table.time'), t('admin.logs.table.type'), t('admin.logs.table.message')].map(csvCell).join(',');
    const rows = filtered.map((log) => [new Date(log.timestamp).toLocaleString(locale), log.type, log.message].map(csvCell).join(','));
    const blob = new Blob([`\uFEFF${[header, ...rows].join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qflow_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-gray-100 flex flex-wrap gap-3 justify-between items-center bg-gray-50/50">
        <div>
          <h3 className="font-bold text-gray-900 text-xl">{t('admin.logs.title')}</h3>
          <p className="text-xs text-gray-500">{t('admin.logs.hint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('admin.logs.search')}
              aria-label={t('admin.logs.search')}
              className={`${inputClass} pl-9 !py-2 w-56`}
            />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value as LogEntry['type'] | 'ALL')} aria-label={t('admin.logs.table.type')} className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold bg-white">
            {TYPES.map((value) => <option key={value} value={value}>{value === 'ALL' ? t('admin.logs.allTypes') : value}</option>)}
          </select>
          <Button variant="secondary" size="sm" onClick={handleExport}><Download size={16} /> {t('admin.logs.export')}</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 text-left border-b border-gray-200">
            <tr>
              <th className="px-4 md:px-6 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">{t('admin.logs.table.time')}</th>
              <th className="px-4 md:px-6 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">{t('admin.logs.table.type')}</th>
              <th className="px-4 md:px-6 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">{t('admin.logs.table.message')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-500">{t('admin.logs.empty')}</td></tr>
            )}
            {filtered.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm font-mono text-gray-500">
                  {new Date(log.timestamp).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sm">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${badgeClass(log.type)}`}>{log.type}</span>
                </td>
                <td className="px-4 md:px-6 py-3 text-sm text-gray-800 font-medium break-words">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LogsView;
