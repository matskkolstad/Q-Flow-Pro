import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Ticket, Service, Counter, LogEntry, QueueContextType, User, Printer, KioskConfig, SoundSettings, CounterDisplay,
  BrandingConfig, AuthProviderConfig, SessionInfo, AddTicketResult, ActionResult, AppSettings, StatsSummary, SettingsUpdate, CallResult,
} from '../types';
import { audioService } from '../services/audioService';
import { useI18n } from './I18nContext';
import { applyBrandColor } from '../utils/color';
import { estimateWaitMinutes } from '../utils/queue';

const QueueContext = createContext<QueueContextType | undefined>(undefined);

// Same origin by default (the Vite dev server proxies /socket.io to the backend).
const socketBase = import.meta.env.VITE_SOCKET_URL || undefined;

// Kiosk devices authenticate with their own device token instead of a user session.
export const DEVICE_TOKEN_KEY = 'qflow_device_token';
export const KIOSK_ID_KEY = 'qflow_this_kiosk_id';

const readStorage = (key: string) => {
  if (typeof window === 'undefined') return undefined;
  try {
    return localStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
};

const ACK_TIMEOUT_MS = 8000;

const socket: Socket = io(socketBase, {
  path: '/socket.io',
  auth: {
    token: readStorage('qflow_token'),
    deviceToken: readStorage(DEVICE_TOKEN_KEY),
  },
  // Prefer long-polling first to avoid LAN WebSocket quirks on Safari/iOS; WS upgrade happens if possible
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 8000,
  autoConnect: true,
});

// Which screens play call sounds: public/counter displays and (optionally) the operator panel.
type SoundRole = 'display' | 'admin' | null;
let soundRole: SoundRole = null;
export const setSoundRole = (role: SoundRole) => {
  soundRole = role;
};

const DEFAULT_SOUND: SoundSettings = { kioskEffects: true, adminEffects: true, callChime: true, callVoice: true };
const DEFAULT_SETTINGS: AppSettings = {
  schedule: { enabled: false, days: {} as AppSettings['schedule']['days'] },
  kiosk: { autoReturnSeconds: 15, showQr: true, printQr: false },
  publicUrl: '',
};
const DEFAULT_AUTH: AuthProviderConfig = {
  google: { enabled: false, clientId: '', allowedDomains: [], autoProvision: false, defaultRole: 'OPERATOR' },
  oidc: { enabled: false, issuerUrl: '', clientId: '', autoProvision: false, defaultRole: 'OPERATOR', requireVerifiedEmail: true },
};

// Sends an event and resolves with the server's answer ({ ok, ... }).
const request = <T extends ActionResult = ActionResult>(event: string, payload?: unknown): Promise<T> => new Promise((resolve) => {
  socket.timeout(ACK_TIMEOUT_MS).emit(event, payload ?? {}, (err: Error | null, res?: T) => {
    if (err || !res) {
      resolve({ ok: false, error: 'timeout' } as T);
      return;
    }
    resolve(res);
  });
});

export const QueueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { language, t } = useI18n();
  const [services, setServices] = useState<Service[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [kiosks, setKiosks] = useState<KioskConfig[]>([]);
  const [counterDisplays, setCounterDisplays] = useState<CounterDisplay[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [publicMessage, setPublicMessage] = useState('');
  const [branding, setBranding] = useState<BrandingConfig>({ brandText: 'Q-Flow Pro', brandLogoUrl: '' });
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [kioskExitPinSet, setKioskExitPinSet] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isClosed, setIsClosed] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(DEFAULT_SOUND);
  const [authProviders, setAuthProviders] = useState<AuthProviderConfig>(DEFAULT_AUTH);
  const [todaySummary, setTodaySummary] = useState<StatsSummary | null>(null);
  const [jobs, setJobs] = useState<QueueContextType['jobs']>({});
  const soundSettingsRef = useRef<SoundSettings>(soundSettings);
  const languageRef = useRef<'en' | 'no'>(language);
  const tRef = useRef(t);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastError, setLastError] = useState<string>('');

  useEffect(() => {
    languageRef.current = language;
    tRef.current = t;
  }, [language, t]);

  const errorText = useCallback((code?: string) => {
    const key = `error.${code || 'generic'}`;
    const text = tRef.current(key);
    return text === key ? tRef.current('error.generic') : text;
  }, []);

  // Runs an admin/operator action and shows a banner when it fails.
  const act = useCallback(async <T extends ActionResult = ActionResult>(event: string, payload?: unknown): Promise<T> => {
    const res = await request<T>(event, payload);
    if (!res.ok) setLastError(errorText(res.error));
    return res;
  }, [errorText]);

  const applyState = (state: any = {}) => {
    // Fallbacks ensure UI keeps rendering even if backend sends partial data
    setServices(state.services || []);
    setCounters(state.counters || []);
    setTickets(state.tickets || []);
    setUsers(state.users || []);
    setPrinters(state.printers || []);
    setKiosks(state.kiosks || []);
    setCounterDisplays(state.counterDisplays || []);
    setLogs(state.logs || []);
    setPublicMessage(state.publicMessage || '');
    setBranding(state.branding || { brandText: 'Q-Flow Pro', brandLogoUrl: '' });
    setSettings({ ...DEFAULT_SETTINGS, ...(state.settings || {}) });
    setKioskExitPinSet(!!state.kioskExitPinSet);
    setIsClosed(!!state.isClosed);
    setTodaySummary(state.todaySummary || null);
    setJobs(state.jobs || {});
    const sound = { ...DEFAULT_SOUND, ...(state.soundSettings || {}) };
    setSoundSettings(sound);
    soundSettingsRef.current = sound;
    // Only admins receive auth provider settings; keep the previous value otherwise.
    if (state.authProviders) setAuthProviders(state.authProviders);
  };

  useEffect(() => {
    const applyAuthToken = (token?: string | null) => {
      if (typeof window === 'undefined') return;
      const nextToken = token === undefined ? readStorage('qflow_token') : token;
      socket.auth = { token: nextToken || undefined, deviceToken: readStorage(DEVICE_TOKEN_KEY) };
      // Reconnect to send auth in handshake if token changed
      socket.disconnect();
      socket.connect();
    };

    setIsConnected(socket.connected);

    const onAuthChanged = (event: Event) => {
      const custom = event as CustomEvent<{ token?: string | null }>;
      applyAuthToken(custom.detail?.token);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'qflow_token') applyAuthToken(event.newValue);
      else if (event.key === DEVICE_TOKEN_KEY) applyAuthToken();
    };
    const onConnect = () => {
      setIsConnected(true);
      socket.emit('request-state');
    };
    const onDisconnect = () => setIsConnected(false);
    const onConnectError = (err: any) => {
      console.warn('Socket connect_error', err?.message || err);
      setIsConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('init-state', applyState);
    socket.on('state-update', applyState);
    socket.on('session-info', (info: SessionInfo) => setSession(info));
    socket.on('log-event', (log: LogEntry) => setLogs((prev) => [log, ...prev].slice(0, 500)));
    socket.on('settings-error', (payload: any) => setLastError(errorText(payload?.error)));
    socket.on('action-denied', (payload: any) => {
      // Rate limiting is reported by the screens themselves.
      if (payload?.error === 'rate_limited') return;
      setLastError(errorText(payload?.error));
    });
    socket.on('play-sound', (data: { type?: 'ding' | 'print' | 'alert'; text?: string; textNo?: string; textEn?: string }) => {
      if (!soundRole) return;
      const s = soundSettingsRef.current;
      if (soundRole === 'admin' && !s.adminEffects) return;
      const lang = languageRef.current || 'no';
      const voiceText = lang === 'en' ? data.textEn || data.text || data.textNo : data.textNo || data.text || data.textEn;
      if (voiceText && s.callVoice) {
        audioService.announce(voiceText, lang, s.callChime);
      } else if (s.callChime) {
        audioService.playEffect(data.type || 'ding');
      }
    });

    applyAuthToken();
    window.addEventListener('qflow-auth-changed', onAuthChanged as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      ['init-state', 'state-update', 'session-info', 'log-event', 'settings-error', 'action-denied', 'play-sound']
        .forEach((event) => socket.off(event));
      window.removeEventListener('qflow-auth-changed', onAuthChanged as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [errorText]);

  // Branding: colour scale, page title and favicon follow the admin's settings.
  useEffect(() => {
    applyBrandColor(branding.primaryColor);
    document.title = (branding.brandText || '').trim() || 'Q-Flow Pro';
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (branding.brandLogoUrl) {
      if (!icon) {
        icon = document.createElement('link');
        icon.rel = 'icon';
        document.head.appendChild(icon);
      }
      icon.href = branding.brandLogoUrl;
    } else if (icon) {
      icon.href = '/favicon.svg';
    }
  }, [branding]);

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'no';
  }, [language]);

  // --- Tickets ---

  const addTicket = (serviceId: string, lang?: 'en' | 'no') => request<AddTicketResult & ActionResult>('add-ticket', {
    serviceId,
    language: lang,
    origin: typeof window !== 'undefined' ? window.location.origin + window.location.pathname.replace(/\/+$/, '') : undefined,
  });

  const cancelOwnTicket = (ticketId: string, key: string) => request('ticket:cancel-own', { ticketId, key });
  const callNext = (counterId: string) => act<CallResult>('ticket:call-next', { counterId });
  const callTicket = (ticketId: string, counterId: string) => act<CallResult>('ticket:call', { ticketId, counterId });
  const recallTicket = (counterId: string) => act('ticket:recall', { counterId });
  const completeTicket = (counterId: string) => act('ticket:complete', { counterId });
  const noShowTicket = (counterId: string) => act('ticket:no-show', { counterId });
  const requeueTicket = (counterId: string) => act('ticket:requeue', { counterId });
  const transferTicket = (counterId: string, serviceId: string) => act('ticket:transfer', { counterId, serviceId });
  const cancelTicket = (ticketId: string) => act('ticket:cancel', { ticketId });
  const resetSystem = () => act('reset-system');

  // --- Admin ---

  const updateSettings = (updates: SettingsUpdate) => act('update-settings', updates);
  const saveService = (service: Partial<Service>) => act('service:save', { service });
  const deleteService = (id: string) => act('service:delete', { id });
  const saveCounter = (counter: Partial<Counter>) => act('counter:save', { counter });
  const deleteCounter = (id: string) => act('counter:delete', { id });
  const saveUser = (user: Partial<User> & { password?: string }) => act('user:save', { user });
  const deleteUser = (id: string) => act('user:delete', { id });
  const savePrinter = (printer: Partial<Printer>) => act('printer:save', { printer });
  const deletePrinter = (id: string) => act('printer:delete', { id });
  const testPrinter = (id: string) => act('printer:test', { id });

  // --- Devices ---

  const registerKiosk = () => {
    socket.emit('register-kiosk', {});
  };

  const reconnectWithStoredCredentials = () => {
    socket.auth = { token: readStorage('qflow_token'), deviceToken: readStorage(DEVICE_TOKEN_KEY) };
    socket.disconnect();
    socket.connect();
  };

  // Admin only: turns this browser into a kiosk with its own device token.
  const activateKiosk = async (): Promise<ActionResult> => {
    const res = await request<ActionResult & { deviceToken?: string; kioskId?: string }>('activate-kiosk', { kioskId: readStorage(KIOSK_ID_KEY) });
    if (!res.ok || !res.deviceToken || !res.kioskId) return { ok: false, error: res.error || 'timeout' };
    localStorage.setItem(DEVICE_TOKEN_KEY, res.deviceToken);
    localStorage.setItem(KIOSK_ID_KEY, res.kioskId);
    return { ok: true };
  };

  // Kiosk only: the server checks the exit PIN and deactivates the device on success.
  const verifyKioskPin = async (pin: string): Promise<ActionResult> => {
    const res = await request('verify-kiosk-pin', { pin });
    if (res.ok) {
      localStorage.removeItem(DEVICE_TOKEN_KEY);
      reconnectWithStoredCredentials();
    }
    return res;
  };

  const assignPrinterToKiosk = (kioskId: string, printerId: string) => act('assign-printer', { kioskId, printerId });
  const removeKiosk = (kioskId: string) => act('delete-kiosk', { kioskId });
  const registerCounterDisplay = (id: string, name: string, counterId?: string) => {
    socket.emit('register-counter-display', { id, name, counterId });
  };
  const assignCounterDisplay = (displayId: string, counterId?: string) => act('assign-counter-display', { displayId, counterId });
  const removeCounterDisplay = (displayId: string) => act('delete-counter-display', { displayId });
  const setCounterDisplayMessage = (displayId: string, message: string) => act('set-counter-display-message', { displayId, message });

  const reportError = (message: string) => setLastError(message);

  const getWaitTime = (serviceId: string) => estimateWaitMinutes(tickets, services, counters, serviceId);

  return (
    <QueueContext.Provider value={{
      services, counters, tickets, logs, users, printers, kiosks, counterDisplays, isClosed, publicMessage,
      soundSettings, branding, settings, kioskExitPinSet, authProviders, todaySummary, jobs, session, isConnected,
      updateSettings,
      addTicket, cancelOwnTicket, callNext, callTicket, recallTicket, completeTicket, noShowTicket, requeueTicket, transferTicket, cancelTicket, resetSystem,
      saveService, deleteService, saveCounter, deleteCounter, saveUser, deleteUser, savePrinter, deletePrinter, testPrinter,
      registerKiosk, activateKiosk, verifyKioskPin, assignPrinterToKiosk, removeKiosk,
      registerCounterDisplay, assignCounterDisplay, removeCounterDisplay, setCounterDisplayMessage,
      reportError, getWaitTime,
    }}>
      {!isConnected && (
        <div role="status" className="fixed top-0 left-0 w-full bg-red-600 text-white text-center text-xs font-bold p-1 z-50">
          {t('common.error.connectionLost')}
        </div>
      )}
      {lastError && (
        <div role="alert" className="fixed top-8 left-1/2 -translate-x-1/2 w-[90%] md:w-auto max-w-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold px-4 py-3 rounded-xl shadow-lg z-50 flex items-start gap-3">
          <span>{lastError}</span>
          <button onClick={() => setLastError('')} className="ml-auto text-red-500 hover:text-red-700 font-bold">{t('common.close')}</button>
        </div>
      )}
      {children}
    </QueueContext.Provider>
  );
};

export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) throw new Error('useQueue must be used within a QueueProvider');
  return context;
};
