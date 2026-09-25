import React, { useMemo, useState } from 'react';
import { Users, Clock, Trash2, Bell, CheckCircle, Play, UserX, Undo2, ArrowRightLeft, Megaphone } from 'lucide-react';
import { useQueue } from '../../context/QueueContext';
import { useI18n } from '../../context/I18nContext';
import { TicketStatus } from '../../types';
import { serviceBg } from '../../utils/color';
import { orderWaiting, counterServiceIds, estimateWaitMinutes } from '../../utils/queue';
import { Button } from './ui';

const StatCard: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'text-gray-900' }) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
    <div className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">{label}</div>
    <div className={`text-3xl md:text-4xl font-black ${tone}`}>{value}</div>
  </div>
);

// The operator's work area: the ticket at the selected counter, actions and the queue.
const DashboardView: React.FC<{ counterId: string }> = ({ counterId }) => {
  const {
    counters, tickets, services, todaySummary,
    callNext, callTicket, recallTicket, completeTicket, noShowTicket, requeueTicket, transferTicket, cancelTicket,
  } = useQueue();
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [busy, setBusy] = useState(false);

  const counter = counters.find((c) => c.id === counterId);
  const current = tickets.find((x) => x.status === TicketStatus.SERVING && x.counterId === counterId);
  const currentService = services.find((s) => s.id === current?.serviceId);
  const scope = counterServiceIds(counter, services);
  const allWaiting = useMemo(() => orderWaiting(tickets, services), [tickets, services]);
  const myWaiting = allWaiting.filter((x) => scope.includes(x.serviceId));
  const listed = showAll ? allWaiting : myWaiting;
  const avgWait = useMemo(() => {
    if (allWaiting.length === 0) return 0;
    const total = services.reduce((sum, s) => {
      const count = allWaiting.filter((x) => x.serviceId === s.id).length;
      return sum + count * estimateWaitMinutes(tickets, services, counters, s.id);
    }, 0);
    return Math.round(total / allWaiting.length);
  }, [allWaiting, services, tickets, counters]);

  // Runs one action at a time so a double click cannot call two tickets.
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (!counter) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-600">{t('admin.dashboard.noCounter')}</div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-6 md:p-8 flex flex-col items-center justify-center min-h-[380px] relative overflow-hidden">
          <div className="absolute top-0 w-full h-3 bg-gradient-to-r from-brand-500 via-brand-600 to-brand-800"></div>
          {!counter.isOnline && (
            <p className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold px-4 py-2 rounded-xl">{t('admin.dashboard.counterClosed')}</p>
          )}

          {current ? (
            <div className="text-center w-full z-10">
              <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-green-100 text-green-700 font-bold text-sm mb-6 border border-green-200">
                <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>
                {t('admin.dashboard.nowServing')}
              </span>
              <div className="text-7xl md:text-[9rem] leading-none font-black text-gray-900 mb-2 tracking-tighter">{current.number}</div>
              <div className="text-xl md:text-2xl text-gray-500 font-medium mb-2">{currentService?.name}</div>
              {(current.recallCount || 0) > 0 && (
                <p className="text-sm text-gray-400 mb-6">{t('admin.dashboard.recalled', { count: current.recallCount || 0 })}</p>
              )}
              <div className="flex flex-wrap justify-center gap-3 mt-6">
                <Button size="lg" onClick={() => run(() => callNext(counterId))} disabled={busy}>
                  <Play size={22} fill="currentColor" /> {t('admin.dashboard.completeAndNext')}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => run(() => completeTicket(counterId))} disabled={busy}>
                  <CheckCircle size={22} /> {t('admin.dashboard.complete')}
                </Button>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <Button variant="ghost" onClick={() => run(() => recallTicket(counterId))} disabled={busy}>
                  <Bell size={18} /> {t('admin.dashboard.callAgain')}
                </Button>
                <Button variant="ghost" onClick={() => run(() => noShowTicket(counterId))} disabled={busy}>
                  <UserX size={18} /> {t('admin.dashboard.noShow')}
                </Button>
                <Button variant="ghost" onClick={() => run(() => requeueTicket(counterId))} disabled={busy}>
                  <Undo2 size={18} /> {t('admin.dashboard.requeue')}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <label htmlFor="transfer-to" className="text-sm font-bold text-gray-500 flex items-center gap-1"><ArrowRightLeft size={16} /> {t('admin.dashboard.transfer')}</label>
                <select
                  id="transfer-to"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold bg-white"
                >
                  <option value="">{t('admin.dashboard.chooseService')}</option>
                  {services.filter((s) => s.id !== current.serviceId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Button
                  variant="secondary"
                  disabled={!transferTo || busy}
                  onClick={() => run(async () => {
                    await transferTicket(counterId, transferTo);
                    setTransferTo('');
                  })}
                >
                  {t('admin.dashboard.transferButton')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center z-10">
              <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-brand-200 border-4 border-white shadow-lg">
                <Users size={48} />
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3 tracking-tight">{t('admin.dashboard.ready')}</h2>
              <p className="text-gray-500 mb-8 max-w-sm mx-auto text-lg">{t('admin.dashboard.waiting', { count: myWaiting.length })}</p>
              <Button
                size="lg"
                onClick={() => run(() => callNext(counterId))}
                disabled={myWaiting.length === 0 || busy || !counter.isOnline}
                className="!bg-emerald-500 hover:!bg-emerald-600 text-2xl px-10 py-5"
              >
                <Megaphone size={26} /> {t('admin.dashboard.callNext')}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('admin.dashboard.stats.waiting')} value={allWaiting.length} />
          <StatCard label={t('admin.dashboard.stats.waitTime')} value={<>~{avgWait} <span className="text-sm text-gray-400 font-normal">min</span></>} />
          <StatCard label={t('admin.dashboard.stats.total')} value={todaySummary?.completed ?? 0} />
          <StatCard label={t('admin.dashboard.stats.avgWaitToday')} value={todaySummary?.avgWaitMinutes != null ? <>{todaySummary.avgWaitMinutes} <span className="text-sm text-gray-400 font-normal">min</span></> : '–'} />
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 flex flex-col lg:h-[calc(100vh-160px)] lg:sticky lg:top-24 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-wrap gap-2 justify-between items-center bg-gray-50/80">
          <h3 className="font-bold text-gray-900 text-xl">{t('admin.queue.title')}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              aria-pressed={showAll}
            >
              {showAll ? t('admin.queue.showMine') : t('admin.queue.showAll')}
            </button>
            <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm font-bold">{listed.length}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar max-h-[60vh] lg:max-h-none">
          {listed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Clock size={44} className="mb-4 text-gray-300" />
              <p className="font-medium">{t('admin.queue.empty')}</p>
            </div>
          ) : (
            listed.map((ticket) => {
              const service = services.find((s) => s.id === ticket.serviceId);
              const minutes = Math.floor((Date.now() - ticket.createdAt) / 60000);
              return (
                <div key={ticket.id} className="group p-4 rounded-xl bg-white border border-gray-200 hover:border-brand-400 hover:shadow-md transition-all flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div {...serviceBg(service?.color, 'w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-sm shrink-0')}>
                      {service?.prefix}
                    </div>
                    <div className="min-w-0">
                      <span className="block font-black text-2xl text-gray-900 tracking-tight">{ticket.number}</span>
                      <span className="text-xs font-bold text-gray-500 truncate block">{service?.name} · {t('admin.queue.minutesAgo', { minutes })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => run(() => callTicket(ticket.id, counterId))}
                      disabled={busy || !counter.isOnline}
                      className="px-3 py-2 bg-brand-50 text-brand-700 border border-brand-100 rounded-lg text-xs font-bold hover:bg-brand-600 hover:text-white transition-all disabled:opacity-50"
                    >
                      {t('admin.queue.call')}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(t('admin.queue.cancelConfirm', { number: ticket.number }))) run(() => cancelTicket(ticket.id));
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title={t('admin.queue.deleteTitle')}
                      aria-label={t('admin.queue.deleteTitle')}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
