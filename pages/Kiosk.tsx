import React, { useState, useEffect, useRef } from 'react';
import { useQueue } from '../context/QueueContext';
import { useAuth } from '../context/AuthContext';
import { Ticket, TicketStatus } from '../types';
import { Printer, Clock, Info, X, MonitorSmartphone, Smartphone } from 'lucide-react';
import { Logo } from '../components/Logo';
import { LanguageToggle } from '../components/LanguageToggle';
import { QrCode, publicBaseUrl } from '../components/QrCode';
import { Link, useNavigate } from 'react-router-dom';
import { audioService } from '../services/audioService';
import { useI18n } from '../context/I18nContext';
import { serviceBg } from '../utils/color';
import { estimateWaitMinutes, peopleAheadOf } from '../utils/queue';
import { nextOpening, formatOpening } from '../utils/schedule';

const KIOSK_HEARTBEAT_MS = 15000;
const KNOWN_TICKET_ERRORS = ['closed', 'service_unavailable', 'rate_limited', 'queue_full'];

// Shown when this browser is not an activated kiosk device.
const KioskGate: React.FC = () => {
  const { branding, activateKiosk } = useQueue();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const handleActivate = async () => {
    setWorking(true);
    setError('');
    const result = await activateKiosk();
    if (!result.ok) {
      setError(t('kiosk.activate.failed'));
      setWorking(false);
      return;
    }
    // The kiosk now runs on its own device token; the admin session must not stay on the device.
    await logout();
    setWorking(false);
  };

  const isAdmin = user?.role === 'ADMIN';
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="bg-white shadow-lg border border-gray-100 rounded-2xl p-8 w-full max-w-lg text-center">
        <Logo className="h-12 w-12" textClass="text-3xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
        <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mt-6 mb-4">
          <MonitorSmartphone size={28} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{isAdmin ? t('kiosk.activate.title') : t('kiosk.notActivated.title')}</h1>
        <p className="text-gray-500 text-sm mb-6">{isAdmin ? t('kiosk.activate.desc') : t('kiosk.notActivated.desc')}</p>
        {error && <p className="text-sm text-red-600 font-semibold mb-4">{error}</p>}
        {isAdmin ? (
          <button
            onClick={handleActivate}
            disabled={working}
            className="w-full bg-brand-600 text-white font-semibold py-3 rounded-lg shadow hover:bg-brand-700 transition disabled:opacity-60"
          >
            {t('kiosk.activate.button')}
          </button>
        ) : (
          <Link to="/login" className="inline-block w-full bg-brand-600 text-white font-semibold py-3 rounded-lg shadow hover:bg-brand-700 transition">
            {t('kiosk.notActivated.login')}
          </Link>
        )}
      </div>
      <Link to="/" className="mt-6 text-sm text-gray-600 hover:text-gray-800">{t('login.back')}</Link>
    </div>
  );
};

const Kiosk: React.FC = () => {
  const { session } = useQueue();
  const { t } = useI18n();
  if (!session) return <div className="p-6 text-center text-gray-600">{t('common.loading')}</div>;
  if (!session.kioskId) return <KioskGate />;
  return <KioskScreen kioskId={session.kioskId} />;
};

type DrawnTicket = { ticket: Ticket; ownerKey?: string; printing: boolean };

// The ticket that was just drawn, with live position, QR link and an auto-return countdown.
const TicketView: React.FC<{ drawn: DrawnTicket; onDone: () => void }> = ({ drawn, onDone }) => {
  const { services, tickets, counters, branding, settings } = useQueue();
  const { t } = useI18n();
  const autoReturn = settings.kiosk?.autoReturnSeconds ?? 15;
  const [secondsLeft, setSecondsLeft] = useState(autoReturn);

  useEffect(() => {
    if (!autoReturn) return undefined;
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [autoReturn]);

  useEffect(() => {
    if (autoReturn && secondsLeft <= 0) onDone();
  }, [secondsLeft, autoReturn, onDone]);

  const live = tickets.find((x) => x.id === drawn.ticket.id) || drawn.ticket;
  const service = services.find((s) => s.id === live.serviceId);
  const ahead = live.status === TicketStatus.WAITING ? peopleAheadOf(tickets, services, live) : 0;
  const waitTime = estimateWaitMinutes(tickets, services, counters, live.serviceId, ahead);
  const trackUrl = drawn.ownerKey ? `${publicBaseUrl(settings.publicUrl)}/#/ticket/${live.id}?k=${drawn.ownerKey}` : '';
  const showQr = settings.kiosk?.showQr !== false && !!trackUrl;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden font-sans">
      <div className="bg-white w-full max-w-md p-8 md:p-10 rounded-[2.5rem] shadow-2xl animate-print-ticket relative z-10">
        <div className="border-b-2 border-dashed border-gray-200 pb-6 mb-6">
          <Logo className="h-8 w-8" textClass="text-xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
          <p className="text-gray-400 text-xs mt-2 uppercase tracking-widest font-bold">{t('kiosk.ticket.welcome')}</p>
        </div>

        <div className="space-y-2 mb-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">{t('kiosk.ticket.yourNumber')}</h2>
          <div className="text-8xl font-black text-gray-900 tracking-tighter">{live.number}</div>
          <div {...serviceBg(service?.color, 'inline-block px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide text-white shadow-md')}>
            {service?.name}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <Clock className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <p className="text-xs text-gray-500 font-bold uppercase">{t('kiosk.ticket.estimated')}</p>
            <p className="font-black text-2xl text-gray-800">{waitTime} min</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <Info className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <p className="text-xs text-gray-500 font-bold uppercase">{t('kiosk.ticket.ahead')}</p>
            <p className="font-black text-2xl text-gray-800">{ahead}</p>
          </div>
        </div>

        <p className="text-gray-500 text-sm mb-6 font-medium flex items-center justify-center gap-2">
          {drawn.printing ? <Printer size={16} /> : null}
          {drawn.printing ? t('kiosk.ticket.takePrint') : t('kiosk.ticket.rememberNumber')}
        </p>

        {showQr && (
          <div className="flex items-center gap-4 bg-brand-50 border border-brand-100 rounded-2xl p-4 mb-6 text-left">
            <QrCode value={trackUrl} size={112} alt={t('kiosk.ticket.qrAlt')} className="rounded-lg bg-white p-1" />
            <div>
              <p className="font-bold text-gray-900 flex items-center gap-2"><Smartphone size={16} /> {t('kiosk.ticket.qrTitle')}</p>
              <p className="text-xs text-gray-600 mt-1">{t('kiosk.ticket.qrDesc')}</p>
            </div>
          </div>
        )}

        {branding.ticketFooter && <p className="text-xs text-gray-400 mb-6">{branding.ticketFooter}</p>}

        <button
          onClick={onDone}
          className="w-full bg-brand-600 text-white py-5 rounded-2xl font-bold text-xl hover:bg-brand-700 transition-colors shadow-lg shadow-brand-200 active:scale-95 transform"
        >
          {t('kiosk.ticket.done')}{autoReturn ? ` (${Math.max(0, secondsLeft)})` : ''}
        </button>
      </div>

      <div className="absolute top-0 left-0 w-64 h-64 bg-brand-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2 animate-pulse"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 translate-x-1/2 translate-y-1/2 animate-pulse"></div>
    </div>
  );
};

const KioskScreen: React.FC<{ kioskId: string }> = ({ kioskId }) => {
  const { services, addTicket, getWaitTime, registerKiosk, verifyKioskPin, soundSettings, branding, isClosed, publicMessage, settings } = useQueue();
  const [drawn, setDrawn] = useState<DrawnTicket | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const { t, language } = useI18n();
  const [ticketError, setTicketError] = useState('');
  const [tapCount, setTapCount] = useState(0);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const tapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const brandName = (branding.brandText || '').trim();
  const opening = isClosed ? nextOpening(settings.schedule) : null;

  useEffect(() => {
    // Heartbeat so the admin panel sees this kiosk; identity comes from the device token.
    registerKiosk();
    const interval = setInterval(registerKiosk, KIOSK_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [kioskId]);

  const handleTicketSelect = async (serviceId: string) => {
    if (isClosed || isPrinting) return;
    audioService.unlock();
    setTicketError('');
    setIsPrinting(true);
    // The server prints on this kiosk's assigned printer and returns the ticket.
    const result = await addTicket(serviceId, language);
    setIsPrinting(false);
    if (!result.ok || !result.ticket) {
      setTicketError(t(KNOWN_TICKET_ERRORS.includes(result.error || '') ? `ticket.error.${result.error}` : 'ticket.error.generic'));
      return;
    }
    setDrawn({ ticket: result.ticket, ownerKey: result.ownerKey, printing: !!result.printing });
    if (soundSettings.kioskEffects) audioService.playEffect('print');
  };

  const handleHiddenExitTap = () => {
    if (tapResetRef.current) clearTimeout(tapResetRef.current);
    const next = tapCount + 1;
    setTapCount(next);
    tapResetRef.current = setTimeout(() => setTapCount(0), 5000);
    if (next >= 5) {
      setTapCount(0);
      setShowPinModal(true);
      setPinInput('');
      setPinError('');
    }
  };

  const handlePinSubmit = async () => {
    const result = await verifyKioskPin(pinInput.trim());
    if (result.ok) {
      setShowPinModal(false);
      setPinInput('');
      navigate('/');
      return;
    }
    setPinError(t(result.error === 'pin_not_set' ? 'kiosk.pin.notSet' : result.error === 'rate_limited' ? 'kiosk.pin.rateLimited' : 'kiosk.pin.error'));
  };

  if (drawn) return <TicketView drawn={drawn} onDone={() => setDrawn(null)} />;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative overflow-hidden font-sans">
      <button
        aria-label={t('kiosk.exitArea')}
        onClick={handleHiddenExitTap}
        className="absolute top-0 right-0 w-16 h-16 z-30 opacity-0"
      />
      <LanguageToggle className="absolute top-5 left-5 z-20" />

      <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-6xl mx-auto w-full z-10">
        <div className="mb-12 text-center">
          <Logo className="h-20 w-20 mb-6 mx-auto" textClass="text-6xl block mt-4" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
          <h2 className="text-3xl font-light text-gray-500 mt-4">{t('kiosk.chooseService')}</h2>
          {ticketError && (
            <p role="alert" className="mt-6 inline-block bg-red-50 border border-red-200 text-red-700 font-semibold px-5 py-3 rounded-xl">{ticketError}</p>
          )}
        </div>

        {isPrinting ? (
          <div className="flex flex-col items-center justify-center h-64 animate-pulse">
            <Printer size={80} className="text-brand-600 mb-6" />
            <h3 className="text-3xl font-bold text-gray-800 mb-2">{t('kiosk.printingTicket')}</h3>
            <p className="text-gray-500 text-xl">{t('kiosk.waitPrinting')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
            {services.map((service) => {
              const closed = service.isOpen === false;
              return (
                <button
                  key={service.id}
                  onClick={() => handleTicketSelect(service.id)}
                  disabled={isClosed || closed}
                  className="group relative flex flex-col items-center justify-center p-12 bg-white rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 border border-white overflow-hidden active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  <div {...serviceBg(service.color, 'absolute top-0 left-0 w-full h-4')}></div>
                  <div {...serviceBg(service.color, 'w-24 h-24 rounded-3xl text-white flex items-center justify-center text-4xl font-black mb-8 group-hover:scale-110 transition-transform shadow-lg')}>
                    {service.prefix}
                  </div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-2">{service.name}</h3>
                  <p className="text-gray-400 font-medium">
                    {closed ? t('kiosk.service.closed') : t('kiosk.service.estimated', { minutes: getWaitTime(service.id) })}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-8 text-center text-gray-400 text-sm font-medium">
        {t('kiosk.footer.id')}: <span className="font-mono text-gray-500">{kioskId.slice(-4).toUpperCase()}</span>{brandName ? ` • ${brandName}` : ''}
      </div>

      {publicMessage && (
        <div className="fixed bottom-0 left-0 right-0 bg-yellow-500 text-yellow-950 py-3 text-center font-black uppercase tracking-widest text-sm shadow-[0_-10px_30px_rgba(234,179,8,0.25)] z-30">
          {publicMessage}
        </div>
      )}

      {isClosed && (
        <div className="absolute inset-0 bg-white/90 z-40 flex flex-col items-center justify-center px-6 text-center">
          <Logo className="h-12 w-12 mb-4" textClass="text-2xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
          <p className="text-4xl font-black text-gray-900 mb-2">{t('kiosk.closed.title')}</p>
          <p className="text-lg text-gray-600 max-w-xl">{t('kiosk.closed.subtitle')}</p>
          {opening && <p className="text-lg font-bold text-gray-800 mt-4">{t('common.opensAt', { time: formatOpening(opening, language) })}</p>}
        </div>
      )}

      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-gray-900">{t('kiosk.pin.title')}</h3>
              <button onClick={() => setShowPinModal(false)} className="text-gray-400 hover:text-gray-600" aria-label={t('common.close')}><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-3">{t('kiosk.pin.subtitle')}</p>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(''); }}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
              placeholder={t('kiosk.pin.placeholder')}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handlePinSubmit(); }}
            />
            {pinError && <p className="text-sm text-red-600 mt-2 font-semibold">{pinError}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowPinModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800">{t('kiosk.pin.cancel')}</button>
              <button onClick={handlePinSubmit} className="px-4 py-2 text-sm font-bold bg-brand-600 text-white rounded-lg shadow-md hover:bg-brand-700">{t('kiosk.pin.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Kiosk;
