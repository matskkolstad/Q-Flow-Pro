import React, { useEffect, useState } from 'react';
import { useQueue, setSoundRole } from '../context/QueueContext';
import { TicketStatus } from '../types';
import { Logo } from '../components/Logo';
import { AudioUnlock } from '../components/AudioUnlock';
import { QrCode, publicBaseUrl } from '../components/QrCode';
import { ArrowRight, Clock, X, Smartphone, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { serviceBg } from '../utils/color';
import { orderWaiting } from '../utils/queue';
import { nextOpening, formatOpening } from '../utils/schedule';

const WAITING_LIMIT = 8;
const RECENT_LIMIT = 5;
// A call is highlighted on the screen this long.
const HIGHLIGHT_MS = 10_000;

const useClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

const PublicDisplay: React.FC = () => {
  const { tickets, counters, services, publicMessage, isClosed, branding, settings } = useQueue();
  const { t, language } = useI18n();
  const now = useClock();
  const locale = language === 'en' ? 'en-GB' : 'nb-NO';
  const mobileUrl = `${publicBaseUrl(settings.publicUrl)}/#/mobile/new`;
  const opening = isClosed ? nextOpening(settings.schedule) : null;

  // This screen announces calls (chime + voice)
  useEffect(() => {
    setSoundRole('display');
    return () => setSoundRole(null);
  }, []);

  // Newest call first
  const servingTickets = tickets
    .filter((ticket) => ticket.status === TicketStatus.SERVING)
    .sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0));

  // Same order as the counters will call them (priority, then time)
  const waitingTickets = orderWaiting(tickets, services).slice(0, WAITING_LIMIT);

  const recentTickets = tickets
    .filter((ticket) => ticket.status === TicketStatus.COMPLETED && ticket.calledAt)
    .sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0))
    .slice(0, RECENT_LIMIT);

  return (
    <div className="min-h-screen lg:h-screen bg-gray-950 text-white flex flex-col overflow-hidden relative font-sans">
      <div className="absolute top-0 right-0 z-50">
        <Link to="/" className="block p-6 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity" aria-label={t('common.close')}>
          <div className="bg-white/10 p-2 rounded-full hover:bg-white/20 text-white shadow-lg">
            <X size={24} />
          </div>
        </Link>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="bg-gray-900 px-6 lg:px-8 py-4 lg:py-5 flex justify-between items-center shadow-2xl border-b border-gray-800 z-10">
          <Logo textClass="text-4xl lg:text-5xl text-white font-black tracking-tighter" className="h-10 lg:h-12 w-10 lg:w-12" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
          <div className="text-right">
            <p className="text-3xl lg:text-4xl font-light tracking-wide text-gray-200 tabular-nums">{now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-sm text-gray-500 capitalize">{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>

        {/* On TV-sized screens everything fits the viewport; the lists scroll inside their panels */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row p-6 lg:p-8 gap-6 lg:gap-8 relative overflow-hidden">
          {/* Left: now serving */}
          <div className="lg:w-2/3 flex-1 min-w-0 bg-gray-900/80 backdrop-blur-md rounded-[2rem] p-7 lg:p-8 shadow-2xl flex flex-col border border-white/5 relative overflow-hidden min-h-0">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-600 rounded-full mix-blend-overlay filter blur-[80px] opacity-20"></div>

            <h2 className="text-2xl lg:text-3xl font-black text-white uppercase tracking-widest mb-5 lg:mb-7 border-b-2 border-gray-800 pb-3 flex items-center gap-3 lg:gap-4">
              <span className="w-4 h-4 rounded-full bg-green-500 animate-pulse"></span>
              {t('display.nowServing')}
            </h2>

            <div className="flex-1 space-y-3 lg:space-y-5 overflow-y-auto custom-scrollbar min-h-0 pb-1" aria-live="polite">
              {servingTickets.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <div className="w-32 h-32 rounded-full border-4 border-gray-800 flex items-center justify-center mb-6 bg-gray-900">
                    <Clock size={64} className="opacity-50" />
                  </div>
                  <p className="text-3xl font-light">{t('display.waitingForNext')}</p>
                </div>
              )}

              {servingTickets.map((ticket) => {
                const counter = counters.find((c) => c.id === ticket.counterId);
                const service = services.find((s) => s.id === ticket.serviceId);
                const fresh = ticket.calledAt && now.getTime() - ticket.calledAt < HIGHLIGHT_MS;
                return (
                  <div key={ticket.id} className={`bg-gradient-to-r from-gray-800 to-gray-900 rounded-3xl p-5 lg:p-6 flex items-center justify-between border-l-8 border-green-500 shadow-xl relative z-10 ${fresh ? 'animate-flash ring-4 ring-green-500/40' : ''}`}>
                    <div className="flex items-center gap-4 lg:gap-6 min-w-0">
                      <div {...serviceBg(service?.color, 'w-20 h-20 2xl:w-32 2xl:h-32 rounded-2xl flex items-center justify-center text-4xl 2xl:text-5xl font-black text-white shadow-lg shrink-0')}>
                        {service?.prefix || ticket.number.replace(/\d+$/, '')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-gray-400 text-lg lg:text-xl uppercase font-bold tracking-widest mb-1">{t('display.number')}</p>
                        <h3 className="text-5xl 2xl:text-7xl font-black text-white tracking-tighter leading-none">{ticket.number}</h3>
                        <p className="text-base lg:text-lg text-gray-500 font-medium mt-2 truncate">{service?.name}</p>
                      </div>
                    </div>

                    <ArrowRight className="hidden 2xl:block text-gray-700 h-16 w-16 shrink-0" />

                    <div className="text-right min-w-0 pl-4 shrink-0 max-w-[45%]">
                      <p className="text-gray-400 text-lg lg:text-xl uppercase font-bold tracking-widest mb-1">{t('display.goTo')}</p>
                      <h3 className="text-3xl 2xl:text-5xl font-black text-green-400 leading-tight break-words">{counter?.name || t('display.counter')}</h3>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: next in line, recently called, QR */}
          <div className="lg:w-1/3 flex-1 min-w-0 flex flex-col gap-3 lg:gap-4 min-h-0">
            <div className="bg-gray-900/80 backdrop-blur-md rounded-[2rem] p-6 lg:p-8 shadow-2xl flex-1 flex flex-col border border-white/5 min-h-0">
              <h2 className="text-2xl font-bold text-gray-300 uppercase tracking-widest mb-6 border-b border-gray-800 pb-4">
                {t('display.waitingList')}
              </h2>
              <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0 pr-1 [mask-image:linear-gradient(to_bottom,black_85%,transparent)]">
                {waitingTickets.map((ticket, index) => {
                  const service = services.find((s) => s.id === ticket.serviceId);
                  return (
                    <div key={ticket.id} className="flex items-center justify-between p-4 bg-gray-800 rounded-2xl border border-gray-700 shadow-md">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-gray-400 font-bold text-lg border border-gray-700">{index + 1}</div>
                        <span {...serviceBg(service?.color, 'px-3 py-1.5 rounded-lg text-xs font-black text-white uppercase tracking-wider')}>
                          {service?.name || service?.prefix}
                        </span>
                      </div>
                      <span className="text-4xl font-black text-white tracking-tight">{ticket.number}</span>
                    </div>
                  );
                })}
                {waitingTickets.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-600">
                    <p className="text-xl italic">{t('display.waitingEmpty')}</p>
                  </div>
                )}
              </div>
              {recentTickets.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2"><History size={16} /> {t('display.recent')}</p>
                  <div className="flex flex-wrap gap-2">
                    {recentTickets.map((ticket) => (
                      <span key={ticket.id} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 font-bold">
                        {ticket.number} <span className="text-gray-500 font-medium">→ {counters.find((c) => c.id === ticket.counterId)?.name || ''}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 bg-gradient-to-br from-brand-600 to-brand-800 rounded-[2rem] p-5 lg:p-7 text-white shadow-2xl flex items-center justify-between relative overflow-hidden gap-4">
              <div className="relative z-10 min-w-0">
                <h3 className="font-bold text-2xl mb-1 flex items-center gap-2">
                  <Smartphone size={24} />
                  {t('display.qr.title')}
                </h3>
                <p className="text-brand-100 text-sm">{t('display.qr.subtitle')}</p>
                <p className="text-brand-100 text-[11px] mt-1 break-all leading-tight opacity-80">{mobileUrl}</p>
              </div>
              <div className="bg-white p-2 rounded-2xl shadow-lg relative z-10 shrink-0">
                <QrCode value={mobileUrl} size={96} alt={t('display.qr.alt')} />
              </div>
            </div>
          </div>
        </div>

        {/* Rolling footer message (in flow, not overlapping content) */}
        {publicMessage && (
          <div
            className="bg-yellow-500 text-yellow-950 py-4 lg:py-5 overflow-hidden w-full z-20 font-black text-2xl uppercase tracking-widest border-t-4 border-yellow-400 shadow-[0_-10px_40px_rgba(234,179,8,0.3)]"
          >
            <div className="whitespace-nowrap animate-marquee flex gap-40 px-6">
              <span>{publicMessage}</span>
              <span>{publicMessage}</span>
              <span>{publicMessage}</span>
              <span>{publicMessage}</span>
            </div>
          </div>
        )}
        {isClosed && (
          <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center text-center px-6">
            <Logo className="mb-4" textClass="text-white" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
            <p className="text-4xl lg:text-5xl font-black text-white mb-2">{t('display.closed.title')}</p>
            <p className="text-lg lg:text-xl text-gray-300 max-w-2xl">{t('display.closed.subtitle')}</p>
            {opening && <p className="text-2xl font-bold text-white mt-6">{t('common.opensAt', { time: formatOpening(opening, language) })}</p>}
          </div>
        )}
      </div>
      <AudioUnlock />
    </div>
  );
};

export default PublicDisplay;
