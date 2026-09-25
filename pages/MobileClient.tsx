import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueue } from '../context/QueueContext';
import { TicketStatus } from '../types';
import { Logo } from '../components/Logo';
import { LanguageToggle } from '../components/LanguageToggle';
import { Bell, BellRing, MapPin, Clock, X, CheckCircle2, XCircle, Ticket as TicketIcon } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { serviceBg } from '../utils/color';
import { estimateWaitMinutes, peopleAheadOf, FINISHED_STATUSES } from '../utils/queue';
import { audioService } from '../services/audioService';
import { nextOpening, formatOpening } from '../utils/schedule';

// Tickets drawn on this phone, so a reload or closed tab does not lose them.
const MY_TICKETS_KEY = 'qflow_my_tickets';
type StoredTicket = { id: string; key: string; number: string; createdAt: number };

const readMyTickets = (): StoredTicket[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(MY_TICKETS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const rememberTicket = (entry: StoredTicket) => {
  const next = [entry, ...readMyTickets().filter((x) => x.id !== entry.id)].slice(0, 5);
  try {
    localStorage.setItem(MY_TICKETS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode): the ticket link still works
  }
};

const trackPath = (id: string, key?: string) => `/ticket/${id}${key ? `?k=${encodeURIComponent(key)}` : ''}`;

const KNOWN_TICKET_ERRORS = ['closed', 'service_unavailable', 'rate_limited', 'queue_full'];

// Service selection for drawing a ticket on a phone.
const MobileClient: React.FC = () => {
  const { services, addTicket, tickets, getWaitTime, branding, isClosed, publicMessage, session, settings } = useQueue();
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [drawError, setDrawError] = useState('');
  const [busy, setBusy] = useState(false);
  const opening = isClosed ? nextOpening(settings.schedule) : null;

  // A ticket from this phone that is still in the queue.
  const active = useMemo(() => {
    return readMyTickets().find((mine) => {
      const live = tickets.find((x) => x.id === mine.id);
      return live && !FINISHED_STATUSES.includes(live.status);
    });
  }, [tickets]);

  const handleDrawTicket = async (serviceId: string) => {
    if (isClosed || busy) return;
    audioService.unlock();
    setBusy(true);
    setDrawError('');
    const result = await addTicket(serviceId, language);
    setBusy(false);
    if (!result.ok || !result.ticket) {
      setDrawError(t(KNOWN_TICKET_ERRORS.includes(result.error || '') ? `ticket.error.${result.error}` : 'ticket.error.generic'));
      return;
    }
    rememberTicket({ id: result.ticket.id, key: result.ownerKey || '', number: result.ticket.number, createdAt: result.ticket.createdAt });
    navigate(trackPath(result.ticket.id, result.ownerKey));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center relative font-sans">
      <div className="w-full max-w-sm flex items-center justify-between">
        <LanguageToggle />
        <Link to="/" aria-label={t('common.close')} className="flex items-center justify-center w-10 h-10 bg-white rounded-full shadow-md text-gray-500 hover:text-red-500 transition-colors">
          <X size={20} />
        </Link>
      </div>

      <Logo className="h-12 w-12 mb-8 mt-8" textClass="text-3xl font-black" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />

      {active && (
        <Link to={trackPath(active.id, active.key)} className="w-full max-w-sm mb-6 flex items-center gap-4 bg-brand-600 text-white rounded-2xl p-4 shadow-lg">
          <TicketIcon size={28} />
          <div className="flex-1">
            <p className="text-sm text-white/80">{t('mobile.activeTicket')}</p>
            <p className="text-2xl font-black">{active.number}</p>
          </div>
          <span className="text-sm font-bold underline">{t('mobile.show')}</span>
        </Link>
      )}

      <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-xl p-8 border border-gray-100">
        <h1 className="text-2xl font-bold text-center mb-8 text-gray-900">{t('mobile.title')}</h1>
        {drawError && (
          <p role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-2xl text-center">{drawError}</p>
        )}
        {!session && <p className="text-center text-gray-500">{t('common.loading')}</p>}
        <div className="space-y-4">
          {services.map((s) => {
            const closed = s.isOpen === false;
            return (
              <button
                key={s.id}
                onClick={() => handleDrawTicket(s.id)}
                disabled={isClosed || closed || busy}
                className="w-full flex items-center p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:border-brand-500 hover:bg-white hover:shadow-md transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div {...serviceBg(s.color, 'w-14 h-14 rounded-2xl text-white flex items-center justify-center font-black text-xl mr-5 shadow-sm')}>
                  {s.prefix}
                </div>
                <div className="text-left flex-1">
                  <h2 className="font-bold text-lg text-gray-900">{s.name}</h2>
                  <p className="text-sm text-gray-500">{closed ? t('kiosk.service.closed') : t('mobile.waitTime', { minutes: getWaitTime(s.id) })}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {publicMessage && (
        <div className="mt-6 w-full max-w-sm bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm font-semibold px-4 py-3 rounded-2xl text-center">
          {publicMessage}
        </div>
      )}

      {isClosed && (
        <div className="fixed inset-0 bg-white/90 z-40 flex flex-col items-center justify-center px-6 text-center">
          <Logo className="h-12 w-12 mb-4" textClass="text-2xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
          <p className="text-3xl font-black text-gray-900 mb-2">{t('mobile.closed.title')}</p>
          <p className="text-lg text-gray-600 max-w-xl">{t('mobile.closed.subtitle')}</p>
          {opening && <p className="text-lg font-bold text-gray-800 mt-4">{t('common.opensAt', { time: formatOpening(opening, language) })}</p>}
        </div>
      )}
    </div>
  );
};

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

// Follows one ticket: /#/ticket/<id>?k=<owner key> (from the kiosk QR code or after drawing on the phone).
export const TicketTracker: React.FC = () => {
  const { ticketId = '' } = useParams();
  const [params] = useSearchParams();
  const { services, tickets, counters, branding, session, cancelOwnTicket } = useQueue();
  const { t } = useI18n();
  const navigate = useNavigate();
  const key = params.get('k') || readMyTickets().find((x) => x.id === ticketId)?.key || '';
  const ticket = tickets.find((x) => x.id === ticketId);
  const [notifyEnabled, setNotifyEnabled] = useState(canNotify() && Notification.permission === 'granted');
  const [cancelError, setCancelError] = useState('');
  const lastStatus = useRef<TicketStatus | null>(null);
  const warnedSoon = useRef(false);

  useEffect(() => {
    if (ticket && key) rememberTicket({ id: ticket.id, key, number: ticket.number, createdAt: ticket.createdAt });
  }, [ticket?.id, key]);

  const service = services.find((s) => s.id === ticket?.serviceId);
  const counter = counters.find((c) => c.id === ticket?.counterId);
  const ahead = ticket && ticket.status === TicketStatus.WAITING ? peopleAheadOf(tickets, services, ticket) : 0;
  const waitTime = ticket ? estimateWaitMinutes(tickets, services, counters, ticket.serviceId, ahead) : 0;

  const alertUser = (title: string, body: string, strong: boolean) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(strong ? [400, 150, 400, 150, 400] : [200]);
    if (strong) audioService.playEffect('ding');
    if (canNotify() && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try {
        new Notification(title, { body, tag: `qflow-${ticketId}` });
      } catch {
        // some mobile browsers only allow notifications from a service worker
      }
    }
  };

  // Alert when it is (almost) this ticket's turn.
  useEffect(() => {
    if (!ticket) return;
    if (lastStatus.current === TicketStatus.WAITING && ticket.status === TicketStatus.SERVING) {
      alertUser(t('mobile.ticket.yourTurn.title'), t('mobile.notify.turnBody', { number: ticket.number, counter: counter?.name || '' }), true);
    }
    if (ticket.status === TicketStatus.WAITING && ahead <= 2 && !warnedSoon.current && lastStatus.current !== null) {
      warnedSoon.current = true;
      alertUser(t('mobile.notify.soonTitle'), t('mobile.notify.soonBody', { count: ahead }), false);
    }
    lastStatus.current = ticket.status;
  }, [ticket?.status, ahead]);

  const enableNotifications = async () => {
    await audioService.unlock();
    if (canNotify() && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setNotifyEnabled(permission === 'granted');
    } else {
      setNotifyEnabled(true);
    }
  };

  const handleCancel = async () => {
    if (!ticket || !window.confirm(t('mobile.cancelConfirm'))) return;
    const res = await cancelOwnTicket(ticket.id, key);
    if (!res.ok) setCancelError(t('error.generic'));
  };

  if (!session) return <div className="p-6 text-center text-gray-600">{t('common.loading')}</div>;

  const header = (dark: boolean) => (
    <div className={`w-full max-w-sm flex justify-between items-center ${dark ? 'text-white/90' : ''}`}>
      <Logo className="h-10 w-10" textClass={`text-xl font-black ${dark ? 'text-white' : 'text-gray-900'}`} brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
      <LanguageToggle dark={dark} />
    </div>
  );

  const finalScreen = (icon: React.ReactNode, title: string, subtitle: string) => (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center font-sans">
      {header(false)}
      <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-xl p-8 mt-10 text-center">
        <div className="flex justify-center mb-4">{icon}</div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-600 mb-6">{subtitle}</p>
        <button onClick={() => navigate('/mobile/new')} className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl hover:bg-brand-700">{t('mobile.drawNew')}</button>
      </div>
    </div>
  );

  if (!ticket) return finalScreen(<TicketIcon size={48} className="text-gray-400" />, t('mobile.notFound.title'), t('mobile.notFound.subtitle'));
  if (ticket.status === TicketStatus.COMPLETED) return finalScreen(<CheckCircle2 size={48} className="text-green-600" />, t('mobile.done.title'), t('mobile.done.subtitle'));
  if (ticket.status === TicketStatus.NO_SHOW) return finalScreen(<XCircle size={48} className="text-amber-500" />, t('mobile.noShow.title'), t('mobile.noShow.subtitle'));
  if (ticket.status === TicketStatus.CANCELLED) return finalScreen(<XCircle size={48} className="text-gray-400" />, t('mobile.cancelled.title'), t('mobile.cancelled.subtitle'));

  const serving = ticket.status === TicketStatus.SERVING;
  return (
    <div className={`min-h-screen p-6 flex flex-col items-center justify-between transition-colors duration-700 font-sans ${serving ? 'bg-green-600' : 'bg-brand-600'}`}>
      {header(true)}

      <div className="w-full max-w-sm my-8">
        {serving ? (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl text-center" role="status" aria-live="assertive">
            <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
              <Bell size={48} />
            </div>
            <h1 className="text-3xl font-black text-gray-900 mb-2">{t('mobile.ticket.yourTurn.title')}</h1>
            <p className="text-gray-600 mb-6 text-lg font-medium">{t('mobile.ticket.goTo', { counter: counter?.name || '' })}</p>
            <div className="bg-gray-100 rounded-2xl p-6">
              <p className="text-sm text-gray-500 uppercase font-bold tracking-widest mb-2">{t('mobile.ticket.yourNumber')}</p>
              <p className="text-6xl font-black text-gray-900 tracking-tighter">{ticket.number}</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden" role="status" aria-live="polite">
            <div {...serviceBg(service?.color, 'absolute top-0 left-0 w-full h-3')}></div>
            <div className="text-center mb-8 mt-4">
              <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-3">{t('mobile.ticket.yourNumber')}</p>
              <div className="text-7xl font-black text-gray-900 mb-4 tracking-tighter">{ticket.number}</div>
              <span {...serviceBg(service?.color, 'inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white uppercase tracking-wider shadow-sm')}>
                {service?.name}
              </span>
            </div>

            <div className="space-y-6 border-t border-gray-100 pt-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="p-2 bg-brand-50 rounded-lg text-brand-600"><Clock size={20} /></div>
                  <span className="font-bold text-sm text-gray-500 uppercase tracking-wide">{t('mobile.ticket.estimated')}</span>
                </div>
                <span className="font-black text-2xl text-gray-900">{waitTime} <span className="text-sm font-bold text-gray-400">min</span></span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="p-2 bg-brand-50 rounded-lg text-brand-600"><MapPin size={20} /></div>
                  <span className="font-bold text-sm text-gray-500 uppercase tracking-wide">{t('mobile.ticket.ahead')}</span>
                </div>
                <span className="font-black text-2xl text-gray-900">{ahead}</span>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 space-y-3">
              {notifyEnabled ? (
                <p className="text-xs text-green-700 font-bold uppercase tracking-wider text-center flex items-center justify-center gap-2"><BellRing size={14} /> {t('mobile.notify.enabled')}</p>
              ) : (
                <button onClick={enableNotifications} className="w-full flex items-center justify-center gap-2 bg-brand-50 text-brand-700 font-bold py-3 rounded-xl hover:bg-brand-100">
                  <Bell size={18} /> {t('mobile.notify.enable')}
                </button>
              )}
              <p className="text-xs text-gray-400 text-center">{t('mobile.ticket.notify')}</p>
              {key && (
                <button onClick={handleCancel} className="w-full text-sm font-bold text-red-600 hover:text-red-700 py-2">{t('mobile.cancel')}</button>
              )}
              {cancelError && <p className="text-sm text-red-600 text-center">{cancelError}</p>}
            </div>
          </div>
        )}
      </div>

      <Link to="/mobile/new" className="text-white/70 text-xs text-center font-medium underline">{t('mobile.backToServices')}</Link>
    </div>
  );
};

export default MobileClient;
