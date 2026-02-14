import React, { useState, useEffect, useRef } from 'react';
import { useQueue } from '../context/QueueContext';
import { Ticket } from '../types';
import { Printer, Clock, Info, X } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useNavigate } from 'react-router-dom';
import { audioService } from '../services/audioService';
import { printTicket } from '../services/printerService';
import { useI18n } from '../context/I18nContext';

const Kiosk: React.FC = () => {
  const { services, addTicket, getWaitTime, registerKiosk, kiosks, printers, addLog, soundSettings, branding, kioskExitPin, isClosed, publicMessage } = useQueue();
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const { t, language } = useI18n();
  const [printingStatus, setPrintingStatus] = useState(t('kiosk.printing'));
  const [kioskId, setKioskId] = useState<string>("");
  const [tapCount, setTapCount] = useState(0);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const tapResetRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Generate persistent ID for this browser client
    let id = localStorage.getItem('qflow_this_kiosk_id');
    if (!id) {
        id = `kiosk_${Math.random().toString(36).substr(2, 6)}`;
        localStorage.setItem('qflow_this_kiosk_id', id);
    }
    setKioskId(id);
    
    // Auto-register with Admin
    registerKiosk(id, `Kiosk ${id.substr(-4).toUpperCase()}`);
    
    // Periodic Keep-alive
    const interval = setInterval(() => {
        registerKiosk(id, `Kiosk ${id.substr(-4).toUpperCase()}`);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleTicketSelect = async (serviceId: string) => {
    if (isClosed) return;
    setIsPrinting(true);
    setPrintingStatus(t('kiosk.printingTicket'));

    const service = services.find(s => s.id === serviceId);
    
    // Simulate printing delay visually
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Create ticket in system and wait for assigned number
    const ticket = await addTicket(serviceId);
    
    // Physical Printing Logic
    const myConfig = kiosks.find(k => k.id === kioskId);
    const assignedPrinter = printers.find(p => p.id === myConfig?.assignedPrinterId);

    if (assignedPrinter && assignedPrinter.ipAddress) {
      addLog(`Forsøker å skrive ut til ${assignedPrinter.ipAddress}...`, 'INFO');
      // Offload printing to backend to avoid browser CORS/mixed-content issues
      printTicket(
        assignedPrinter.ipAddress, 
        ticket, 
        service?.name || 'Tjeneste', 
        getWaitTime(serviceId),
        language,
        branding.brandText,
        branding.brandLogoUrl,
      ).then(success => {
        if (!success) {
          console.warn("Kunne ikke nå skriveren. Sjekk nettverk/CORS.");
        }
      });
    } else {
      setPrintingStatus(t('kiosk.noPrinter'));
    }

    setActiveTicket(ticket);
    setIsPrinting(false);
    if (soundSettings.kioskEffects) {
      audioService.playEffect('print');
    }
  };

  const handleReset = () => {
    setActiveTicket(null);
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

  const handlePinSubmit = () => {
    if (pinInput.trim() === kioskExitPin) {
      setShowPinModal(false);
      setPinInput('');
      navigate('/');
    } else {
      setPinError(t('kiosk.pin.error'));
    }
  };

  if (activeTicket) {
    const service = services.find(s => s.id === activeTicket.serviceId);
    const waitTime = getWaitTime(activeTicket.serviceId);

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden font-sans">
        <div className="bg-white w-full max-w-md p-10 rounded-[2.5rem] shadow-2xl animate-print-ticket relative z-10">
          <div className="border-b-2 border-dashed border-gray-200 pb-6 mb-8">
            <Logo className="h-8 w-8" textClass="text-xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
            <p className="text-gray-400 text-xs mt-2 uppercase tracking-widest font-bold">{t('kiosk.ticket.welcome')}</p>
          </div>
          
          <div className="space-y-2 mb-10">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">{t('kiosk.ticket.yourNumber')}</h2>
            <div className="text-8xl font-black text-gray-900 tracking-tighter">
              {activeTicket.number}
            </div>
            <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide ${service?.color} text-white shadow-md`}>
              {service?.name}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-10">
             <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <Clock className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t('kiosk.ticket.estimated')}</p>
                <p className="font-black text-2xl text-gray-800">{waitTime} min</p>
             </div>
             <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <Info className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t('kiosk.ticket.ahead')}</p>
                <p className="font-black text-2xl text-gray-800">~{Math.ceil(waitTime / (service?.estimatedTimePerPersonMinutes || 5))}</p>
             </div>
          </div>

          <p className="text-gray-400 text-sm mb-8 font-medium">
            {t('kiosk.ticket.instructions')}
          </p>

          <button 
            onClick={handleReset}
            className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 active:scale-95 transform"
          >
            {t('kiosk.ticket.done')}
          </button>
        </div>
        
        {/* Background blobs */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 translate-x-1/2 translate-y-1/2 animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative overflow-hidden font-sans">
      <button
        aria-label="Skjult avsluttknapp"
        onClick={handleHiddenExitTap}
        className="absolute top-0 right-0 w-16 h-16 z-30 opacity-0"
      />

      <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-6xl mx-auto w-full z-10">
        <div className="mb-16 text-center">
            <Logo className="h-20 w-20 mb-6 mx-auto" textClass="text-6xl block mt-4" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
            <h2 className="text-3xl font-light text-gray-500 mt-4">{t('kiosk.chooseService')}</h2>
            
        </div>

        {isPrinting ? (
          <div className="flex flex-col items-center justify-center h-64 animate-pulse">
            <Printer size={80} className="text-indigo-600 mb-6" />
            <h3 className="text-3xl font-bold text-gray-800 mb-2">{printingStatus}</h3>
              <p className="text-gray-500 text-xl">{t('kiosk.waitPrinting')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
            {services.map(service => (
              <button
                key={service.id}
                onClick={() => handleTicketSelect(service.id)}
                disabled={isClosed}
                className="group relative flex flex-col items-center justify-center p-12 bg-white rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 border border-white overflow-hidden active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className={`absolute top-0 left-0 w-full h-4 ${service.color}`}></div>
                <div className={`w-24 h-24 rounded-3xl ${service.color} text-white flex items-center justify-center text-4xl font-black mb-8 group-hover:scale-110 transition-transform shadow-lg`}>
                  {service.prefix}
                </div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">{service.name}</h3>
                    <p className="text-gray-400 font-medium">{t('kiosk.service.estimated', { minutes: getWaitTime(service.id) })}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      
      <div className="p-8 text-center text-gray-400 text-sm font-medium">
            {t('kiosk.footer.id')}: <span className="font-mono text-gray-500">{kioskId.substr(-4).toUpperCase()}</span> • {branding.brandText}
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
        </div>
      )}

      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-gray-900">{t('kiosk.pin.title')}</h3>
              
              <button onClick={() => setShowPinModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-3">{t('kiosk.pin.subtitle')}</p>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(''); }}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
              placeholder={t('kiosk.pin.placeholder')}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handlePinSubmit(); }}
            />
            {pinError && <p className="text-sm text-red-600 mt-2 font-semibold">{pinError}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowPinModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800">{t('kiosk.pin.cancel')}</button>
              <button onClick={handlePinSubmit} className="px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700">{t('kiosk.pin.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Kiosk;