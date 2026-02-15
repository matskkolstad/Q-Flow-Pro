import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Ticket, Service, Counter, LogEntry, QueueContextType, TicketStatus, User, Printer, KioskConfig, SoundSettings, CounterDisplay, BrandingConfig, AuthProviderConfig } from '../types';
import { audioService } from '../services/audioService';
import { useI18n } from './I18nContext';

const QueueContext = createContext<QueueContextType | undefined>(undefined);

// Resolve Socket.IO endpoint (works for dev on 5173 -> 3000, or same-origin in prod)
const socketBase = (() => {
    if (typeof window === 'undefined') return undefined;
    const envUrl = import.meta.env.VITE_SOCKET_URL;
    if (envUrl) return envUrl;
    const { protocol, hostname, port } = window.location;
    // If frontend is not served from backend port 3000 (e.g., Vite dev on 5173), point to backend:3000
    if (port && port !== '3000') return `${protocol}//${hostname}:3000`;
    return undefined; // same-origin
})();

const socket: Socket = io(socketBase, {
    path: '/socket.io',
    auth: {
        token: typeof window !== 'undefined' ? localStorage.getItem('qflow_token') : undefined,
    },
    // Prefer long-polling first to avoid LAN WebSocket quirks on Safari/iOS; WS upgrade happens if possible
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 8000,
    forceNew: false,
    autoConnect: true,
});

export const QueueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { language, t } = useI18n();
  // Initial empty state (will be populated by server)
  const [services, setServices] = useState<Service[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [kiosks, setKiosks] = useState<KioskConfig[]>([]);
    const [counterDisplays, setCounterDisplays] = useState<CounterDisplay[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [publicMessage, setPublicMessage] = useState("");
    const [branding, setBrandingState] = useState<BrandingConfig>({ brandText: 'Q-Flow Pro', brandLogoUrl: '' });
    const [kioskExitPin, setKioskExitPinState] = useState<string>('1234');
    const [isClosed, setIsClosed] = useState(false);
    const [soundSettings, setSoundSettingsState] = useState<SoundSettings>({
        kioskEffects: true,
        adminEffects: true,
        callChime: true,
        callVoice: true
    });
    const [authProviders, setAuthProvidersState] = useState<AuthProviderConfig>({
        google: {
            enabled: false,
            clientId: '',
            clientSecret: '',
            allowedDomains: [],
            autoProvision: false,
            defaultRole: 'OPERATOR'
        },
        oidc: {
            enabled: false,
            issuerUrl: '',
            clientId: '',
            clientSecret: '',
            autoProvision: false,
            defaultRole: 'OPERATOR'
        }
    });
    const soundSettingsRef = useRef<SoundSettings>(soundSettings);
    const languageRef = useRef<'en' | 'no'>(language);
    const [isConnected, setIsConnected] = useState(socket.connected);
        const [lastError, setLastError] = useState<string>('');

    useEffect(() => {
        languageRef.current = language;
    }, [language]);

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
        setPublicMessage(state.publicMessage || "");
        setBrandingState(state.branding || { brandText: 'Q-Flow Pro', brandLogoUrl: '' });
        setKioskExitPinState(state.kioskExitPin ?? '1234');
        setIsClosed(!!state.isClosed);
        setSoundSettingsState(state.soundSettings || {
            kioskEffects: true,
            adminEffects: true,
            callChime: true,
            callVoice: true
        });
        soundSettingsRef.current = state.soundSettings || {
            kioskEffects: true,
            adminEffects: true,
            callChime: true,
            callVoice: true
        };
        setAuthProvidersState(state.authProviders || {
            google: {
                enabled: false,
                clientId: '',
                clientSecret: '',
                allowedDomains: [],
                autoProvision: false,
                defaultRole: 'OPERATOR'
            },
            oidc: {
                enabled: false,
                issuerUrl: '',
                clientId: '',
                clientSecret: '',
                autoProvision: false,
                defaultRole: 'OPERATOR'
            }
        });
    };

    useEffect(() => {
        const applyAuthToken = (token?: string | null) => {
            if (typeof window === 'undefined') return;
            const nextToken = token ?? localStorage.getItem('qflow_token');
            socket.auth = { ...(socket.auth || {}), token: nextToken || undefined };
            // Reconnect to send auth in handshake if token changed
            if (socket.connected) {
                socket.disconnect();
                socket.connect();
            } else if (!socket.connected) {
                socket.connect();
            }
        };

        // Sync initial connection state (in case connect fires before effect runs)
        setIsConnected(socket.connected);

        const requestState = () => socket.emit('request-state');
        applyAuthToken();

        const onAuthChanged = (event: Event) => {
            const custom = event as CustomEvent<{ token?: string | null }>;
            applyAuthToken(custom.detail?.token);
        };

        const onStorage = (event: StorageEvent) => {
            if (event.key === 'qflow_token') {
                applyAuthToken(event.newValue);
            }
        };

        const onConnect = () => {
            setIsConnected(true);
            setLastError('');
        };
        const onDisconnect = (reason?: any) => {
            setIsConnected(false);
            setLastError(typeof reason === 'string' ? reason : t('common.error.connectionLost'));
        };
        const onConnectError = (err: any) => {
            console.warn('Socket connect_error', err?.message || err);
            setIsConnected(false);
            setLastError(err?.message || t('common.error.cannotReachServer'));
        };
        const onReconnect = () => setIsConnected(true);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        socket.on('reconnect', onReconnect);

                socket.on('init-state', applyState);

                socket.on('state-update', applyState);

        socket.on('log-event', (log: any) => {
            setLogs((prev) => [log, ...prev].slice(0, 500));
        });

        socket.on('update-users-error', (payload: any) => {
            const code = payload?.error;
            const msg = code === 'password_too_short'
                ? 'Passordet må være minst 8 tegn.'
                : code === 'password_needs_upper_lower_digit'
                    ? 'Passordet må ha stor, liten bokstav og tall.'
                    : code === 'must_have_admin'
                        ? 'Det må være minst én admin.'
                        : 'Kunne ikke oppdatere bruker(e).';
            setLastError(msg);
        });

        socket.on('action-denied', (payload: any) => {
            const msg = payload?.error || 'Handling ikke tillatt';
            console.warn('Action denied by server:', msg);
            setLastError(typeof msg === 'string' ? msg : 'Handling blokkert');
        });

        // Pull state proactively in case initial init-state was missed
        requestState();
        socket.on('connect', requestState);
        window.addEventListener('qflow-auth-changed', onAuthChanged as EventListener);
        window.addEventListener('storage', onStorage);

    socket.on('play-sound', (data: { type: 'ding'|'print'|'alert', text?: string, textNo?: string, textEn?: string }) => {
        // Public displays and admin/operator panels should react to call sounds
        const shouldHandle = (() => {
            if (typeof window === 'undefined') return false;
            const hash = window.location.hash.toLowerCase();
            const path = window.location.pathname.toLowerCase();
            const role = localStorage.getItem('qflow_client_role');
            const isDisplay = role === 'display' || hash.includes('display') || path.includes('display');
            const isAdminPanel = role === 'admin' || hash.includes('admin') || path.includes('admin');
            return isDisplay || isAdminPanel;
        })();
        if (!shouldHandle) return;

        const s = soundSettingsRef.current;
        const lang = languageRef.current || 'no';
        const voiceText = lang === 'en'
            ? data.textEn || data.text || data.textNo
            : data.textNo || data.text || data.textEn;

        if (voiceText) {
            if (s.callVoice) {
                audioService.announce(voiceText, lang);
            } else if (s.callChime) {
                audioService.playEffect('ding');
            }
        } else if (s.callChime) {
            audioService.playEffect(data.type);
        }
    });

        // Kick a connect if it hasn't connected yet (Safari sometimes waits)
        if (!socket.connected) socket.connect();

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
            socket.off('reconnect', onReconnect);
            socket.off('connect', requestState);
            socket.off('init-state');
            socket.off('state-update');
            socket.off('log-event');
            socket.off('update-users-error');
            socket.off('play-sound');
            socket.off('action-denied');
            window.removeEventListener('qflow-auth-changed', onAuthChanged as EventListener);
            window.removeEventListener('storage', onStorage);
        };
  }, []);

  // --- Actions (Emit to Server) ---

  const addLog = (message: string, type: 'INFO' | 'ACTION' | 'ALERT' = 'INFO') => {
      // Logs are now handled mostly by server, but client can request log?
      // Keeping interface, but maybe no-op or emit 'log' event if needed.
  };

    const addTicket = (serviceId: string): Promise<Ticket> => {
        const requestStarted = Date.now();
        socket.emit('add-ticket', { serviceId });

        return new Promise((resolve) => {
            const cleanup = () => {
                socket.off('state-update', handler);
                socket.off('add-ticket-denied', onDenied);
                clearTimeout(fallback);
            };

            const onDenied = (payload: any) => {
                cleanup();
                resolve({
                    id: 'denied',
                    number: payload?.error || 'Stengt',
                    serviceId,
                    status: TicketStatus.CANCELLED,
                    createdAt: requestStarted,
                });
            };

            const handler = (state: any) => {
                const list = state?.tickets || [];
                const latest = list
                    .filter((t: Ticket) => t.serviceId === serviceId)
                    .sort((a: Ticket, b: Ticket) => b.createdAt - a.createdAt)[0];

                if (latest && latest.createdAt >= requestStarted - 2000) {
                    cleanup();
                    resolve(latest);
                }
            };

            // Safety timeout so UI still proceeds even if no state arrives
            const fallback = setTimeout(() => {
                cleanup();
                const service = services.find(s => s.id === serviceId);
                resolve({
                    id: 'temp',
                    number: '...',
                    serviceId,
                    status: TicketStatus.WAITING,
                    createdAt: requestStarted,
                });
            }, 2000);

            socket.on('state-update', handler);
            socket.once('add-ticket-denied', onDenied);
        });
    };

  const updateTicketStatus = (ticketId: string, status: TicketStatus, counterId?: string) => {
    socket.emit('update-ticket-status', { ticketId, status, counterId });
  };

    const callNextTicket = (counterId: string) => {
        const counter = counters.find(c => c.id === counterId);
        if (!counter) return;

        const validServiceIds = counter.activeServiceIds.filter(id => services.some(s => s.id === id));
        const serviceScope = validServiceIds.length > 0 ? validServiceIds : services.map(s => s.id);

        const nextTicket = tickets
            .filter(t => t.status === TicketStatus.WAITING && serviceScope.includes(t.serviceId))
            .sort((a, b) => {
                const sa = services.find(s => s.id === a.serviceId);
                const sb = services.find(s => s.id === b.serviceId);
                const pa = sa?.priority ?? 1;
                const pb = sb?.priority ?? 1;
                if (pa !== pb) return pb - pa; // higher priority first
                return a.createdAt - b.createdAt;
            })[0];

    if (nextTicket) {
       // Clear current if exists
       if (counter.currentTicketId) {
           updateTicketStatus(counter.currentTicketId, TicketStatus.COMPLETED, counterId);
       }
       // Call next
       updateTicketStatus(nextTicket.id, TicketStatus.SERVING, counterId);
    } else {
       // Just clear current
       if (counter.currentTicketId) {
           updateTicketStatus(counter.currentTicketId, TicketStatus.COMPLETED, counterId);
       }
    }
  };

  const callSpecificTicket = (ticketId: string, counterId: string) => {
      const counter = counters.find(c => c.id === counterId);
      // Clear current
      if (counter && counter.currentTicketId) {
           updateTicketStatus(counter.currentTicketId, TicketStatus.COMPLETED, counterId);
      }
      updateTicketStatus(ticketId, TicketStatus.SERVING, counterId);
  };

  const deleteTicket = (ticketId: string) => {
      socket.emit('delete-ticket', { ticketId });
  };

  const resetSystem = () => {
      if(window.confirm("Er du sikker? Dette sletter alle aktive billetter.")) {
          socket.emit('reset-system');
      }
  };

  // --- Admin Updates ---

  const syncSettings = (updates: any) => {
      socket.emit('update-settings', updates);
  };

  const addService = (serviceData: Omit<Service, 'id'>) => {
      const newService = { ...serviceData, id: Math.random().toString(36).substr(2, 9) };
      syncSettings({ services: [...services, newService] });
  };

  const updateService = (id: string, updates: Partial<Service>) => {
      const next = services.map(s => s.id === id ? { ...s, ...updates } : s);
      syncSettings({ services: next });
  };

  const removeService = (id: string) => {
      syncSettings({ services: services.filter(s => s.id !== id) });
  };

  const addCounter = (counterData: Omit<Counter, 'id'>) => {
      const newCounter = { ...counterData, id: Math.random().toString(36).substr(2, 9) };
      syncSettings({ counters: [...counters, newCounter] });
  };

  const removeCounter = (id: string) => {
      syncSettings({ counters: counters.filter(c => c.id !== id) });
  };

  const updateCounter = (id: string, updates: Partial<Counter>) => {
      syncSettings({ counters: counters.map(c => c.id === id ? { ...c, ...updates } : c) });
  };

  const updateCounterStatus = (id: string, isOnline: boolean) => {
      updateCounter(id, { isOnline });
  };

  const addUser = (userData: Omit<User, 'id'> & { password?: string }) => {
      const newUser = { ...userData, id: Math.random().toString(36).substr(2, 9) };
      syncSettings({ users: [...users, newUser] });
  };

  const updateUser = (id: string, updates: Partial<User> & { password?: string }) => {
      const nextUsers = users.map(u => u.id === id ? { ...u, ...updates } : u);
      syncSettings({ users: nextUsers });
  };

  const removeUser = (id: string) => {
      syncSettings({ users: users.filter(u => u.id !== id) });
  };

  const setPublicMessageWrapper = (msg: string) => {
      setPublicMessage(msg); // Optimistic
      syncSettings({ publicMessage: msg });
  };

  const setBranding = (updates: Partial<BrandingConfig>) => {
      const next = { ...branding, ...updates };
      setBrandingState(next);
      syncSettings({ branding: updates });
  };

  const setKioskExitPin = (pin: string) => {
      setKioskExitPinState(pin);
      syncSettings({ kioskExitPin: pin });
  };

  const setSoundSettings = (updates: Partial<SoundSettings>) => {
      const next = { ...soundSettings, ...updates };
      setSoundSettingsState(next); // Optimistic
      soundSettingsRef.current = next;
      syncSettings({ soundSettings: updates });
  };

  const setAuthProviders = (updates: Partial<AuthProviderConfig>) => {
      const next = {
          ...authProviders,
          ...updates,
          google: updates.google ? { ...authProviders.google, ...updates.google } : authProviders.google,
          oidc: updates.oidc ? { ...authProviders.oidc, ...updates.oidc } : authProviders.oidc
      };
      setAuthProvidersState(next); // Optimistic
      syncSettings({ authProviders: updates });
  };

  const setSystemClosed = (closed: boolean) => {
      setIsClosed(closed);
      syncSettings({ isClosed: closed });
  };

  const reportError = (message: string) => {
      setLastError(message);
  };

  // --- Device Actions ---

  const addPrinter = (printerData: Omit<Printer, 'id' | 'status'>) => {
      const newPrinter = { ...printerData, port: printerData.port || 9100, id: Math.random().toString(36).substr(2, 9), status: 'OFFLINE' };
      syncSettings({ printers: [...printers, newPrinter] });
  };

  const removePrinter = (id: string) => {
      syncSettings({ printers: printers.filter(p => p.id !== id) });
  };

  const registerKiosk = (id: string, name: string) => {
      socket.emit('register-kiosk', { id, name });
  };

  const assignPrinterToKiosk = (kioskId: string, printerId: string) => {
      socket.emit('assign-printer', { kioskId, printerId });
  };

  const removeKiosk = (kioskId: string) => {
      socket.emit('delete-kiosk', { kioskId });
  };

  const registerCounterDisplay = (id: string, name: string, counterId?: string) => {
      socket.emit('register-counter-display', { id, name, counterId });
  };

  const assignCounterDisplay = (displayId: string, counterId?: string) => {
      socket.emit('assign-counter-display', { displayId, counterId });
  };

  const removeCounterDisplay = (displayId: string) => {
      socket.emit('delete-counter-display', { displayId });
  };

  const setCounterDisplayMessage = (displayId: string, message: string) => {
      socket.emit('set-counter-display-message', { displayId, message });
  };

  const triggerSound = (payload: { type: 'ding'|'print'|'alert', text?: string }) => {
      socket.emit('play-sound', payload);
  };

  const getWaitTime = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return 0;

        const waitingCount = tickets.filter(t => t.serviceId === serviceId && t.status === TicketStatus.WAITING).length;
        const perPerson = service.estimatedTimePerPersonMinutes || 1;
        if (waitingCount === 0) return 0;
        return waitingCount * perPerson;
  };

  return (
    <QueueContext.Provider value={{
            services, counters, tickets, logs, users, printers, kiosks, counterDisplays, isClosed, publicMessage, 
    soundSettings,
    branding,
    kioskExitPin,
    authProviders,
    setPublicMessage: setPublicMessageWrapper,
    setSoundSettings,
    setBranding,
    setKioskExitPin,
    setAuthProviders,
        setSystemClosed,
    reportError,
      addTicket, updateTicketStatus, callNextTicket, callSpecificTicket, deleteTicket,
          addService, removeService, addCounter, removeCounter, updateCounterStatus, updateCounter,
          updateService,
          addUser, updateUser, removeUser, 
        addPrinter, removePrinter, registerKiosk, assignPrinterToKiosk, removeKiosk,
                registerCounterDisplay, assignCounterDisplay, removeCounterDisplay, setCounterDisplayMessage,
        triggerSound,
      addLog, getWaitTime, resetSystem
    }}>
      {!isConnected && (
          <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-center text-xs font-bold p-1 z-50">
              Ingen forbindelse til server... Prøver å koble til.
          </div>
      )}
            {lastError && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 w-[90%] md:w-auto max-w-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold px-4 py-3 rounded-xl shadow-lg z-50 flex items-start gap-3">
                    <span>Feil: {lastError}</span>
                    <button onClick={() => setLastError('')} className="ml-auto text-red-500 hover:text-red-700 font-bold">Lukk</button>
                </div>
            )}
      {children}
    </QueueContext.Provider>
  );
};

export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) throw new Error("useQueue must be used within a QueueProvider");
  return context;
};