import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueue } from '../context/QueueContext';
import { TicketStatus } from '../types';
import { Logo } from '../components/Logo';
import { audioService } from '../services/audioService';
import { ArrowRight, Clock, X, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';

const PublicDisplay: React.FC = () => {
  const { tickets, counters, services, publicMessage, isClosed, branding } = useQueue();
  const { t } = useI18n();
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>();
  const [mobileUrl, setMobileUrl] = useState<string>('');

  // Mark this client as a display so only this screen plays sounds
  useEffect(() => {
    localStorage.setItem('qflow_client_role', 'display');
    // Try to unlock audio on first user interaction
    const unlock = () => audioService.unlock();
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      localStorage.removeItem('qflow_client_role');
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Build QR target URL based on current host (works on LAN/IP or domain); points to mobile ticket page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { origin, pathname } = window.location;
    const cleanPath = pathname.endsWith('/') ? (pathname.slice(0, -1) || '/') : pathname;
    setMobileUrl(`${origin}${cleanPath}#/mobile/new`);
  }, []);

  // Lock main content height to viewport (header + footer subtracted) to avoid page scrolling; sections can scroll internally
  useLayoutEffect(() => {
    const recalc = () => {
      const vh = window.innerHeight;
      const headerH = headerRef.current?.offsetHeight || 0;
      const footerH = footerRef.current?.offsetHeight || 0;
      const available = vh - headerH - footerH - 12;
      setContentHeight(available > 300 ? available : 300);
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [publicMessage, tickets.length]);

  // Filter relevant tickets
  const servingTickets = tickets.filter(t => t.status === TicketStatus.SERVING);
  
  // Get next waiting tickets per service or globally
  const waitingTickets = tickets
    .filter(t => t.status === TicketStatus.WAITING)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, 7);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col overflow-hidden relative font-sans">
      
      {/* Exit Button (Hidden in top right corner interaction, improved hit area) */}
      <div className="absolute top-0 right-0 z-50">
        <Link to="/" className="block p-6 opacity-0 hover:opacity-100 transition-opacity">
            <div className="bg-white/10 p-2 rounded-full hover:bg-white/20 text-white shadow-lg">
                <X size={24} />
            </div>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col flex-1">
      <div ref={headerRef} className="bg-gray-900 px-6 lg:px-8 py-4 lg:py-5 flex justify-between items-center shadow-2xl border-b border-gray-800 z-10">
        <Logo textClass="text-4xl lg:text-5xl text-white font-black tracking-tighter" className="h-10 lg:h-12 w-10 lg:w-12" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
        <div className="text-right">
            <h2 className="text-3xl lg:text-4xl font-light tracking-wide text-gray-200">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</h2>
        </div>
      </div>

      <div
        className="flex-1 flex flex-col lg:flex-row p-6 lg:p-8 gap-6 lg:gap-8 relative overflow-hidden"
        style={contentHeight ? { height: `${contentHeight}px` } : undefined}
      >
        {/* Left Side: Now Serving (Prominent) */}
        <div className="lg:w-2/3 flex-1 min-w-0 bg-gray-900/80 backdrop-blur-md rounded-[2rem] p-7 lg:p-8 shadow-2xl flex flex-col border border-white/5 relative overflow-hidden min-h-0">
            {/* Background accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600 rounded-full mix-blend-overlay filter blur-[80px] opacity-20"></div>

          <h2 className="text-2xl lg:text-3xl font-black text-white uppercase tracking-widest mb-5 lg:mb-7 border-b-2 border-gray-800 pb-3 flex items-center gap-3 lg:gap-4">
            <span className="w-4 h-4 rounded-full bg-green-500 animate-pulse"></span>
            {t('display.nowServing')}
          </h2>
          
          <div className="flex-1 space-y-3 lg:space-y-5 overflow-y-auto custom-scrollbar min-h-0 pb-1">
             {servingTickets.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <div className="w-32 h-32 rounded-full border-4 border-gray-800 flex items-center justify-center mb-6 bg-gray-900">
                    <Clock size={64} className="opacity-50"/>
                  </div>
                  <p className="text-3xl font-light">{t('display.waitingForNext')}</p>
                </div>
             )}

             {servingTickets.map(ticket => {
                const counter = counters.find(c => c.id === ticket.counterId);
                const service = services.find(s => s.id === ticket.serviceId);
                
                return (
                 <div key={ticket.id} className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-3xl p-5 lg:p-6 flex items-center justify-between border-l-8 border-green-500 animate-flash shadow-xl relative z-10">
                  <div className="flex items-center gap-4 lg:gap-6">
                    <div className={`w-24 h-24 lg:w-32 lg:h-32 rounded-2xl flex items-center justify-center text-5xl lg:text-6xl font-black text-white shadow-lg ${service?.color || 'bg-gray-600'}`}>
                            {ticket.number.charAt(0)}
                        </div>
                        <div>
                            <p className="text-gray-400 text-lg lg:text-xl uppercase font-bold tracking-widest mb-1">Nummer</p>
                            <h3 className="text-5xl lg:text-7xl font-black text-white tracking-tighter leading-none">{ticket.number}</h3>
                            <p className="text-base lg:text-lg text-gray-500 font-medium mt-2">{service?.name}</p>
                        </div>
                    </div>
                    
                    <ArrowRight className="text-gray-700 h-12 w-12 lg:h-16 lg:w-16" />

                    <div className="text-right min-w-[160px] lg:min-w-[200px]">
                       <p className="text-gray-400 text-lg lg:text-xl uppercase font-bold tracking-widest mb-1">{t('display.goTo')}</p>
                      <h3 className="text-4xl lg:text-5xl font-black text-green-400 leading-tight">{counter?.name || 'Skranke'}</h3>
                    </div>
                 </div>
                );
             })}
          </div>
        </div>

        {/* Right Side: Waiting List */}
        <div className="lg:w-1/3 flex-1 min-w-0 flex flex-col gap-3 lg:gap-4 min-h-0">
            <div className="bg-gray-900/80 backdrop-blur-md rounded-[2rem] p-6 lg:p-8 shadow-2xl flex-1 flex flex-col border border-white/5 min-h-0">
                <h2 className="text-2xl font-bold text-gray-300 uppercase tracking-widest mb-6 border-b border-gray-800 pb-4">
                  {t('display.waitingList')}
                </h2>
            <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0 pr-1">
                    {waitingTickets.map((ticket, index) => {
                         const service = services.find(s => s.id === ticket.serviceId);
                         return (
                            <div key={ticket.id} className="flex items-center justify-between p-5 bg-gray-800 rounded-2xl border border-gray-700 shadow-md transform transition-all hover:scale-[1.02]">
                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-gray-400 font-bold text-lg border border-gray-700">#{index + 1}</div>
                                    <span className={`px-3 py-1.5 rounded-lg text-xs font-black text-white uppercase tracking-wider ${service?.color}`}>
                                        {service?.prefix}
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
            </div>

            {/* Promo / Info Box */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2rem] p-5 lg:p-7 text-white shadow-2xl flex items-center justify-between relative overflow-hidden">
                 <div className="relative z-10">
                    <h3 className="font-bold text-2xl mb-1 flex items-center gap-2">
                        <Smartphone size={24} />
                        {t('display.qr.title')}
                    </h3>
                  <p className="text-indigo-200 text-sm">{t('display.qr.subtitle')}</p>
                  {mobileUrl && (
                   <p className="text-indigo-200 text-[11px] mt-1 break-all leading-tight opacity-80">{mobileUrl}</p>
                  )}
                 </div>
                <div className="bg-white p-2 rounded-2xl shadow-lg relative z-10">
                  <img
                   src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl || '#')}`}
                   alt="QR kode for digital kølapp"
                   className="w-24 h-24 mix-blend-multiply"
                  />
                </div>
            </div>
        </div>
      </div>

      {/* Rolling Footer Message (in flow, not overlapping content) */}
      {publicMessage && (
        <div
          ref={footerRef}
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
          <Logo className="mb-4" textClass="text-white" />
          <p className="text-4xl lg:text-5xl font-black text-white mb-2">{t('display.closed.title')}</p>
          <p className="text-lg lg:text-xl text-gray-300 max-w-2xl">{t('display.closed.subtitle')}</p>
        </div>
      )}
      </div>
    </div>
  );
};

export default PublicDisplay;