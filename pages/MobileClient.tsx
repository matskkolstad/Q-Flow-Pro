import React, { useState } from 'react';
import { useQueue } from '../context/QueueContext';
import { TicketStatus } from '../types';
import { Logo } from '../components/Logo';
import { Bell, MapPin, Clock, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';

const MobileClient: React.FC = () => {
    const { services, addTicket, tickets, getWaitTime, branding, isClosed, publicMessage } = useQueue();
  const [myTicketId, setMyTicketId] = useState<string | null>(null);
  const navigate = useNavigate();
    const { t } = useI18n();
    const brandName = (branding.brandText || '').trim() || 'Q-Flow Pro';

  const myTicket = tickets.find(t => t.id === myTicketId);

    const handleDrawTicket = async (serviceId: string) => {
        if (isClosed) return;
        const t = await addTicket(serviceId);
        setMyTicketId(t.id);
    };

  if (!myTicket) {
    return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center relative font-sans">
             <div className="absolute top-6 right-6 z-10">
                 <Link to="/" className="flex items-center justify-center w-10 h-10 bg-white rounded-full shadow-md text-gray-500 hover:text-red-500 transition-colors">
                     <X size={20} />
                 </Link>
             </div>

            <Logo className="h-12 w-12 mb-8 mt-12" textClass="text-3xl font-black" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
            <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-xl p-8 border border-gray-100">
                <h2 className="text-2xl font-bold text-center mb-8 text-gray-900">{t('mobile.title')}</h2>
                <div className="space-y-4">
                    {services.map(s => (
                        <button 
                            key={s.id}
                            onClick={() => handleDrawTicket(s.id)}
                            disabled={isClosed}
                            className="w-full flex items-center p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:border-indigo-500 hover:bg-white hover:shadow-md transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <div className={`w-14 h-14 rounded-2xl ${s.color} text-white flex items-center justify-center font-black text-xl mr-5 shadow-sm`}>
                                {s.prefix}
                            </div>
                            <div className="text-left flex-1">
                                <h3 className="font-bold text-lg text-gray-900">{s.name}</h3>
                                <p className="text-sm text-gray-500">{t('mobile.waitTime', { minutes: getWaitTime(s.id) })}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
                        <p className="mt-8 text-gray-400 text-sm font-medium">{t('mobile.demo')}</p>

                        {publicMessage && (
                            <div className="mt-4 w-full max-w-sm bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm font-semibold px-4 py-3 rounded-2xl text-center">
                                {publicMessage}
                            </div>
                        )}

                        {isClosed && (
                            <div className="fixed inset-0 bg-white/90 z-40 flex flex-col items-center justify-center px-6 text-center">
                                <Logo className="h-12 w-12 mb-4" textClass="text-2xl" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
                                <p className="text-3xl font-black text-gray-900 mb-2">{t('mobile.closed.title')}</p>
                                <p className="text-lg text-gray-600 max-w-xl">{t('mobile.closed.subtitle')}</p>
                            </div>
                        )}
        </div>
    );
  }

  const service = services.find(s => s.id === myTicket.serviceId);
  const waitTime = getWaitTime(myTicket.serviceId);
  const peopleAhead = tickets.filter(t => t.serviceId === myTicket.serviceId && t.status === TicketStatus.WAITING && t.createdAt < myTicket.createdAt).length;

  return (
    <div className={`min-h-screen p-6 flex flex-col items-center justify-between transition-colors duration-700 font-sans ${myTicket.status === TicketStatus.SERVING ? 'bg-green-600' : 'bg-indigo-600'}`}>
      
      <div className="w-full flex justify-between items-center text-white/90">
         <Logo className="h-10 w-10" textClass="text-xl font-black text-white" brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
            <button onClick={() => setMyTicketId(null)} className="text-xs font-bold bg-black/20 px-4 py-2 rounded-full hover:bg-black/30 backdrop-blur-sm transition-colors text-white">
                {t('mobile.exit')}
         </button>
      </div>

      <div className="w-full max-w-sm my-8">
        {myTicket.status === TicketStatus.SERVING ? (
            <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl animate-bounce text-center">
                <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Bell size={48} />
                </div>
                 <h1 className="text-3xl font-black text-gray-900 mb-2">{t('mobile.ticket.yourTurn.title')}</h1>
                 <p className="text-gray-600 mb-8 text-lg font-medium">{t('mobile.ticket.yourTurn.subtitle')}</p>
                <div className="bg-gray-100 rounded-2xl p-6">
                     <p className="text-sm text-gray-500 uppercase font-bold tracking-widest mb-2">{t('mobile.ticket.yourNumber')}</p>
                     <p className="text-6xl font-black text-gray-900 tracking-tighter">{myTicket.number}</p>
                </div>
            </div>
        ) : (
            <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-full h-3 ${service?.color}`}></div>
                
                <div className="text-center mb-8 mt-4">
                    <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-3">{t('mobile.ticket.yourNumber')}</p>
                    <div className="text-7xl font-black text-gray-900 mb-4 tracking-tighter">{myTicket.number}</div>
                    <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold text-white uppercase tracking-wider shadow-sm ${service?.color}`}>
                        {service?.name}
                    </span>
                </div>

                <div className="space-y-6 border-t border-gray-100 pt-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-gray-600">
                             <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><Clock size={20} /></div>
                             <span className="font-bold text-sm text-gray-500 uppercase tracking-wide">{t('mobile.ticket.estimated')}</span>
                        </div>
                        <span className="font-black text-2xl text-gray-900">{waitTime} <span className="text-sm font-bold text-gray-400">min</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-gray-600">
                             <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><MapPin size={20} /></div>
                             <span className="font-bold text-sm text-gray-500 uppercase tracking-wide">{t('mobile.ticket.ahead')}</span>
                        </div>
                        <span className="font-black text-2xl text-gray-900">{peopleAhead}</span>
                    </div>
                </div>

                <div className="mt-10 pt-6 border-t border-gray-100 text-center">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{t('mobile.ticket.notify')}</p>
                </div>
            </div>
        )}
      </div>

      <div className="text-white/60 text-xs text-center font-medium">
        {brandName} Mobile Client
      </div>
    </div>
  );
};

export default MobileClient;
