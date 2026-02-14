import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueue } from '../context/QueueContext';
import { TicketStatus } from '../types';
import { Logo } from '../components/Logo';
import { Link, useLocation } from 'react-router-dom';
import { Monitor, Wifi, Clock, ArrowRight, X } from 'lucide-react';

const COUNTER_DISPLAY_HEARTBEAT_MS = 10_000;

const CounterDisplay: React.FC = () => {
  const { counters, tickets, counterDisplays, isClosed, registerCounterDisplay, assignCounterDisplay, branding } = useQueue();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const paramCounterId = searchParams.get('counterId') || undefined;

  const [displayId] = useState(() => {
    if (typeof window === 'undefined') return 'counter-display';
    const stored = localStorage.getItem('qflow_counter_display_id');
    if (stored) return stored;
    const generated = `cd_${Math.random().toString(36).substr(2, 6)}`;
    localStorage.setItem('qflow_counter_display_id', generated);
    return generated;
  });

  const displayShort = displayId.slice(-4).toUpperCase();

  const [displayName] = useState(() => {
    if (typeof window === 'undefined') return `Skrankeskjerm ${displayShort}`;
    const stored = localStorage.getItem('qflow_counter_display_name');
    if (stored) return stored;
    const fallback = `Skrankeskjerm ${displayShort}`;
    localStorage.setItem('qflow_counter_display_name', fallback);
    return fallback;
  });

  // Counter assignment is controlled from admin; this screen reads assignment from server state
  const myDisplay = counterDisplays.find(d => d.id === displayId);
  const assignedCounterId = myDisplay?.counterId;
  const counterAssignmentPendingRef = useRef(false);

  // Register heartbeat
  useEffect(() => {
    if (!displayId) return;
    registerCounterDisplay(displayId, displayName, assignedCounterId);
    const interval = setInterval(() => {
      registerCounterDisplay(displayId, displayName, assignedCounterId);
    }, COUNTER_DISPLAY_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [displayId, displayName, assignedCounterId, registerCounterDisplay]);

  // Optional: if URL provides counterId and none is assigned yet, bind once
  useEffect(() => {
    if (!displayId || !paramCounterId) return;
    if (assignedCounterId) return;
    if (counterAssignmentPendingRef.current) return;
    counterAssignmentPendingRef.current = true;
    assignCounterDisplay(displayId, paramCounterId);
  }, [displayId, paramCounterId, assignedCounterId, assignCounterDisplay]);

  const currentCounter = counters.find(c => c.id === assignedCounterId);
  const currentTicket = tickets.find(t => t.id === currentCounter?.currentTicketId);
  const waitingCount = tickets.filter(t => t.status === TicketStatus.WAITING && (currentCounter?.activeServiceIds || []).includes(t.serviceId)).length;
  const counterOffline = currentCounter && !currentCounter.isOnline;
  const customMessage = myDisplay?.message?.trim();
  const showTicker = !!(customMessage && !isClosed && !counterOffline);
  const [headerVisible, setHeaderVisible] = useState(true);
  const headerTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const resetHideTimer = () => {
      if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
      headerTimerRef.current = setTimeout(() => setHeaderVisible(false), 5000);
    };
    resetHideTimer();
    return () => {
      if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
    };
  }, []);

  const revealHeader = () => {
    setHeaderVisible(true);
    if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
    headerTimerRef.current = setTimeout(() => setHeaderVisible(false), 5000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans" onMouseMove={revealHeader}>
      <div className="absolute top-0 right-0 z-30">
        <Link to="/" className="block p-6 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <div className="bg-white/10 p-2 rounded-full hover:bg-white/20 text-white shadow-lg">
            <X size={20} />
          </div>
        </Link>
      </div>
      <div className={`absolute left-3 text-[11px] font-mono text-gray-300 bg-white/5 border border-white/10 rounded-lg px-3 py-1 shadow-sm z-30 ${showTicker ? 'bottom-16' : 'bottom-3'}`}>
        ID: {displayShort}
      </div>
      <header
        className={`flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-800 shadow-lg transition-opacity duration-300 ${headerVisible ? 'opacity-100' : 'opacity-0'}`}
        onMouseEnter={revealHeader}
        onMouseMove={revealHeader}
      >
        <div className="flex items-center gap-3">
          <Monitor className="text-indigo-400" />
          <div>
            <p className="text-xs uppercase font-bold text-gray-400">Skrankeskjerm</p>
            <p className="text-lg font-black text-white">{currentCounter?.name || 'Ingen skranke valgt'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-left">
            <p className="text-[11px] uppercase font-bold text-gray-500">Tildelt skranke</p>
            <p className="text-sm font-black text-white">{currentCounter?.name || 'Ikke tildelt ennå'}</p>
          </div>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-900/60 text-green-300 text-xs font-bold">
            <Wifi size={14} /> Online
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-8 relative">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-[2rem] p-10 shadow-2xl border border-white/5 w-full max-w-5xl text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.15),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_30%)]"></div>
          <div className="relative z-10 space-y-6">
            <Logo className="h-12 w-12 mx-auto" textClass="text-3xl text-white leading-tight" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
            <p className="text-base font-bold text-gray-300 tracking-[0.12em]">Gå til {currentCounter?.name || 'skranke'}</p>
            {currentTicket ? (
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-4 text-gray-300 text-sm font-bold">
                  <Clock size={18} />
                  <span>Nummer kalles nå</span>
                </div>
                <div className="text-[10rem] leading-none font-black tracking-tighter text-white drop-shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
                  {currentTicket.number}
                </div>
                <div className="text-xl text-gray-300 font-semibold flex items-center justify-center gap-2">
                  <ArrowRight size={20} className="text-indigo-300" />
                  {currentCounter?.name}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="w-28 h-28 rounded-full border-4 border-gray-700 mx-auto flex items-center justify-center text-gray-500">
                  <Clock size={48} />
                </div>
                <p className="text-3xl font-black text-white">Venter på neste nummer...</p>
                <p className="text-sm text-gray-400 font-medium">{currentCounter ? `${waitingCount} i kø for denne skranken.` : 'Tildel skranke i Admin for å vise numre.'}</p>
              </div>
            )}
          </div>
        </div>

        {showTicker && (
          <div className="absolute inset-x-0 bottom-0 z-20">
            <div className="bg-yellow-500 text-yellow-950 py-3 overflow-hidden w-full border-t-4 border-yellow-400 shadow-[0_-10px_40px_rgba(234,179,8,0.35)]">
              <div className="whitespace-nowrap animate-marquee flex gap-24 px-6">
                <span className="font-black text-base uppercase tracking-widest">{customMessage}</span>
                <span className="font-black text-base uppercase tracking-widest">{customMessage}</span>
                <span className="font-black text-base uppercase tracking-widest">{customMessage}</span>
              </div>
            </div>
          </div>
        )}

        {(isClosed || counterOffline) && (
          <div className="absolute inset-0 bg-black/85 z-20 flex flex-col items-center justify-center text-center px-6">
            <Logo className="h-10 w-10 mb-4" textClass="text-white" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
            <p className="text-4xl font-black text-white mb-2">{isClosed ? 'Stengt' : 'Skranke stengt'}</p>
            <p className="text-lg text-gray-300 max-w-2xl">{isClosed ? 'Køsystemet er midlertidig stengt. Vennligst vent.' : 'Denne skranken er offline. Vennligst bruk annen skranke eller vent.'}</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default CounterDisplay;
