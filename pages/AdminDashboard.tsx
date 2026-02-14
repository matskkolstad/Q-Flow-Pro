import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQueue } from '../context/QueueContext';
import { TicketStatus, Service, User, Printer } from '../types';
import { Logo } from '../components/Logo';
import { Users, Clock, Trash2, Bell, CheckCircle, Mic, Settings, List, X, Play, Download, Printer as PrinterIcon, Monitor, Shield, Lock, Terminal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type SettingsTab = 'general' | 'services' | 'counters' | 'users' | 'devices';
type ViewTab = 'dashboard' | 'logs' | 'settings';

const AdminDashboard: React.FC = () => {
          const { 
                    counters, tickets, logs, users, services, printers, kiosks, counterDisplays, isClosed, publicMessage, soundSettings, branding, kioskExitPin, setPublicMessage, setSoundSettings, setBranding, setKioskExitPin, setSystemClosed, triggerSound, reportError,
                callNextTicket, callSpecificTicket, updateTicketStatus, deleteTicket,
        addService, updateService, removeService, addCounter, removeCounter, updateCounter, addUser, updateUser, removeUser,
            addPrinter, removePrinter, assignPrinterToKiosk, removeKiosk, assignCounterDisplay, setCounterDisplayMessage, removeCounterDisplay,
        resetSystem, updateCounterStatus
        } = useQueue();
    const { user, token, logout } = useAuth();
    const navigate = useNavigate();
    const isOperator = user?.role === 'OPERATOR';
    const isAdmin = user?.role === 'ADMIN';

    const [activeCounterId, setActiveCounterId] = useState<string>(counters[0]?.id || '');

    // Keep selected counter in sync when counters load or change
        const [view, setView] = useState<ViewTab>('dashboard');
    const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');

    const allowedSettingsTabs = useMemo<SettingsTab[]>(() => {
        if (isAdmin) return ['general', 'services', 'counters', 'users', 'devices'];
        return ['general', 'devices'];
    }, [isAdmin]);

  // Form States
    const [newService, setNewService] = useState<Partial<Service>>({ name: '', prefix: '', color: 'bg-gray-500', estimatedTimePerPersonMinutes: 5, priority: 1 });
    const [newUser, setNewUser] = useState<{ name: string; username: string; role: 'ADMIN' | 'OPERATOR'; password: string }>({ name: '', username: '', role: 'OPERATOR', password: '' });
  const [newCounterName, setNewCounterName] = useState('');
  const [newPrinter, setNewPrinter] = useState<Partial<Printer>>({ name: '', ipAddress: '', port: 9100, type: 'EPSON_IP' });
    const [counterDisplayMessages, setCounterDisplayMessages] = useState<Record<string, string>>({});
    const [editingMessages, setEditingMessages] = useState<Set<string>>(new Set());
        const [pwdOld, setPwdOld] = useState('');
        const [pwdNew, setPwdNew] = useState('');
        const [pwdStatus, setPwdStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
        const [userDrafts, setUserDrafts] = useState<Record<string, { name: string; username: string; role: 'ADMIN' | 'OPERATOR'; password?: string }>>({});
    const [backupStatus, setBackupStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
    const [backupMessage, setBackupMessage] = useState<string>('');
    const [backups, setBackups] = useState<{ file: string; mtime: number }[]>([]);
    const [backupsLoading, setBackupsLoading] = useState(false);
    const liveLogRef = useRef<HTMLDivElement>(null);
    const [followLog, setFollowLog] = useState(true);

    useEffect(() => {
        if (!activeCounterId && counters[0]) {
                setActiveCounterId(counters[0].id);
        } else if (activeCounterId && !counters.find(c => c.id === activeCounterId) && counters[0]) {
                setActiveCounterId(counters[0].id);
        }
    }, [counters, activeCounterId]);

    useEffect(() => {
        if (!allowedSettingsTabs.includes(settingsTab)) {
            setSettingsTab('general');
        }
    }, [allowedSettingsTabs, settingsTab]);

    useEffect(() => {
        setCounterDisplayMessages((prev) => {
            let changed = false;
            const next: Record<string, string> = { ...prev };
            counterDisplays.forEach(d => {
                const incoming = d.message || '';
                const isEditing = editingMessages.has(d.id);
                const current = next[d.id] ?? '';
                if (!isEditing && current !== incoming) {
                    next[d.id] = incoming;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [counterDisplays, editingMessages]);

  const currentCounter = counters.find(c => c.id === activeCounterId);
  const waitingTickets = tickets.filter(t => t.status === TicketStatus.WAITING).sort((a,b) => a.createdAt - b.createdAt);
  const avgWaitTime = 12; // Placeholder for real calc
  const totalServed = tickets.filter(t => t.status === TicketStatus.COMPLETED).length;

    const handleComplete = () => {
        if (currentCounter?.currentTicketId) {
            updateTicketStatus(currentCounter.currentTicketId, TicketStatus.COMPLETED, activeCounterId);
        }
    };

  const handleCreateService = () => {
      if(newService.name && newService.prefix) {
          addService(newService as any);
          setNewService({ name: '', prefix: '', color: 'bg-gray-500', estimatedTimePerPersonMinutes: 5, priority: 1 });
      }
  };

    const handleCreateUser = () => {
            if (!newUser.username || !newUser.password) return;
            const payload = {
                name: newUser.name || newUser.username,
                username: newUser.username,
                role: newUser.role,
                password: newUser.password,
            };
            addUser(payload as any);
            setNewUser({ name: '', username: '', role: 'OPERATOR', password: '' });
    };

  const handleCreateCounter = () => {
      if(newCounterName) {
          addCounter({ name: newCounterName, activeServiceIds: services.map(s=>s.id), isOnline: true });
          setNewCounterName('');
      }
  };

  const handleAddPrinter = () => {
      if(newPrinter.name && newPrinter.ipAddress) {
          addPrinter(newPrinter as any);
          setNewPrinter({ name: '', ipAddress: '', port: 9100, type: 'EPSON_IP' });
      }
  };

  const toggleServiceForCounter = (counterId: string, serviceId: string) => {
    const counter = counters.find(c => c.id === counterId);
    if (!counter) return;
    
    const currentServices = counter.activeServiceIds;
    let newServices;
    if (currentServices.includes(serviceId)) {
        newServices = currentServices.filter(id => id !== serviceId);
    } else {
        newServices = [...currentServices, serviceId];
    }
    updateCounter(counterId, { activeServiceIds: newServices });
  };

  const handleExportCSV = () => {
    const headers = ['Tidspunkt', 'Type', 'Melding'];
    const rows = logs.map(log => [
        new Date(log.timestamp).toLocaleString(),
        log.type,
        `"${log.message.replace(/"/g, '""')}"`
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + rows.map(e => e.join(",")).join("\n");
        
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `qflow_logs_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

    const handleBrandTextChange = (text: string) => {
        setBranding({ brandText: text });
    };

    const handleLogoUpload = async (file?: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            setBranding({ brandLogoUrl: result });
        };
        reader.readAsDataURL(file);
    };

    const handleLogoRemove = () => {
        setBranding({ brandLogoUrl: '' });
    };

    const handleKioskPinChange = (pin: string) => {
        setKioskExitPin(pin);
    };

    const handleCounterDisplayMessageChange = (displayId: string, value: string) => {
        setCounterDisplayMessages(prev => ({ ...prev, [displayId]: value }));
        setEditingMessages(prev => {
            const next = new Set(prev);
            next.add(displayId);
            return next;
        });
    };

    const handleCounterDisplayMessageSave = (displayId: string) => {
        const message = (counterDisplayMessages[displayId] || '').trim();
        setCounterDisplayMessage(displayId, message);
        setEditingMessages(prev => {
            const next = new Set(prev);
            next.delete(displayId);
            return next;
        });
    };

    const handleChangePassword = async () => {
        if (!token) return;
        setPwdStatus('saving');
        try {
            const res = await fetch('/api/user/password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ oldPassword: pwdOld, newPassword: pwdNew })
            });
            if (!res.ok) throw new Error('failed');
            setPwdStatus('success');
            setPwdOld('');
            setPwdNew('');
        } catch (err) {
            setPwdStatus('error');
            reportError('Kunne ikke oppdatere passord');
        } finally {
            setTimeout(() => setPwdStatus('idle'), 2500);
        }
    };

    const fetchBackups = async () => {
        if (!token) return;
        setBackupsLoading(true);
        try {
            const res = await fetch('/api/admin/backups', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error('failed');
            const data = await res.json();
            setBackups(Array.isArray(data?.backups) ? data.backups : []);
        } catch (err) {
            setBackupStatus('error');
            setBackupMessage('Kunne ikke hente backup-liste');
            reportError('Kunne ikke hente backup-liste');
        } finally {
            setBackupsLoading(false);
        }
    };

    const handleCreateBackup = async () => {
        if (!token) return;
        setBackupStatus('working');
        setBackupMessage('Oppretter backup...');
        try {
            const res = await fetch('/api/admin/backup', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error('failed');
            const data = await res.json();
            setBackupStatus('success');
            setBackupMessage(data?.file ? `Backup laget: ${data.file}` : 'Backup fullført');
            await fetchBackups();
        } catch (err) {
            setBackupStatus('error');
            setBackupMessage('Backup feilet');
            reportError('Backup feilet');
        }
    };

    const handleDownloadBackup = async (file: string) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/admin/backup/${encodeURIComponent(file)}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error('failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = file;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            setBackupStatus('success');
            setBackupMessage(`Lastet ned ${file}`);
        } catch (err) {
            setBackupStatus('error');
            setBackupMessage('Kunne ikke laste ned backup');
            reportError('Kunne ikke laste ned backup');
        }
    };

    useEffect(() => {
        if (!followLog) return;
        if (!liveLogRef.current) return;
        liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight;
    }, [logs, followLog]);

    useEffect(() => {
        if (!token || !isAdmin) return;
        if (view !== 'settings' || settingsTab !== 'general') return;
        fetchBackups();
    }, [token, isAdmin, view, settingsTab]);

    const adminCount = useMemo(() => users.filter(u => u.role === 'ADMIN').length, [users]);

    const getUserDraft = (id: string) => userDrafts[id] || { name: users.find(u => u.id === id)?.name || '', username: users.find(u => u.id === id)?.username || '', role: (users.find(u => u.id === id)?.role || 'OPERATOR') as 'ADMIN' | 'OPERATOR', password: '' };

    const handleUserDraftChange = (id: string, field: 'name' | 'username' | 'role' | 'password', value: string) => {
        const val = field === 'role' ? (value as 'ADMIN' | 'OPERATOR') : value;
        setUserDrafts(prev => ({
            ...prev,
            [id]: { ...getUserDraft(id), [field]: val }
        }));
    };

    const handleSaveUser = (id: string) => {
        const draft = getUserDraft(id);
        const current = users.find(u => u.id === id);
        if (current?.role === 'ADMIN' && adminCount <= 1 && draft.role !== 'ADMIN') {
            alert('Det må være minst én admin. Du kan ikke nedgradere siste admin.');
            return;
        }
        const payload: any = {
            name: draft.name || draft.username,
            username: draft.username,
            role: draft.role,
        };
        if (draft.password) payload.password = draft.password;
        updateUser(id, payload);
        setUserDrafts(prev => ({ ...prev, [id]: { ...draft, password: '' } }));
    };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-white shadow-md border-b border-gray-200 px-6 py-4 flex justify-between items-center z-20 sticky top-0">
        <div className="flex items-center gap-8">
            <Link to="/">
                            <Logo brandText={branding.brandText} brandLogoUrl={branding.brandLogoUrl} />
            </Link>
            <nav className="hidden md:flex gap-2 bg-gray-100 p-1.5 rounded-xl">
                <button onClick={() => setView('dashboard')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                    <List size={18}/> Oversikt
                </button>
                <button onClick={() => setView('logs')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'logs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                    <Clock size={18}/> Logg
                </button>
                <button onClick={() => setView('settings')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'} ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={!isAdmin}>
                    <Settings size={18}/> Innstillinger
                </button>
            </nav>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Skranke</span>
                <select 
                    value={activeCounterId} 
                    onChange={(e) => setActiveCounterId(e.target.value)}
                    className="bg-transparent text-sm font-bold text-gray-800 focus:outline-none cursor-pointer"
                >
                    {counters.length === 0 && <option value="">Ingen skranker</option>}
                    {counters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className={`h-2.5 w-2.5 rounded-full ${currentCounter?.isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
                {user && <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200"><Shield size={14}/> {user.name} · {user.role}</span>}
                <button onClick={() => logout().then(() => navigate('/login'))} className="flex items-center gap-2 text-sm font-bold text-red-600 hover:text-red-700 px-3 py-2 bg-red-50 hover:bg-red-100 rounded-lg" title="Logg ut">
                    <X size={18} /> Logg ut
                </button>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        
        {view === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Active Control Area */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Current Ticket Card */}
                    <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-8 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
                        <div className="absolute top-0 w-full h-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                        
                        {currentCounter?.currentTicketId ? (
                             <div className="text-center w-full z-10 animate-in fade-in zoom-in duration-300">
                                <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-green-100 text-green-700 font-bold text-sm mb-8 border border-green-200">
                                    <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>
                                    Nå betjenes
                                </span>
                                <div className="text-[10rem] leading-none font-black text-gray-900 mb-2 tracking-tighter">
                                    {tickets.find(t => t.id === currentCounter.currentTicketId)?.number}
                                </div>
                                <div className="text-2xl text-gray-500 font-medium mb-12">
                                    {services.find(s => s.id === tickets.find(t => t.id === currentCounter.currentTicketId)?.serviceId)?.name}
                                </div>
                                <div className="flex justify-center gap-4">
                                    <button 
                                        onClick={() => {
                                        const num = tickets.find(t => t.id === currentCounter.currentTicketId)?.number;
                                        if (!num) return;
                                        triggerSound({ type: 'ding', text: `Nummer ${num}, til ${currentCounter.name}` });
                                        }}
                                        className="flex items-center gap-2 px-8 py-5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl font-bold transition-all active:scale-95 text-lg"
                                    >
                                        <Bell size={24} /> Kall igjen
                                    </button>
                                    <button 
                                        onClick={handleComplete}
                                        className="flex items-center gap-2 px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-xl shadow-indigo-200 transition-all hover:-translate-y-1 active:scale-95 text-lg"
                                    >
                                        <CheckCircle size={24} /> Fullfør sak
                                    </button>
                                </div>
                             </div>
                        ) : (
                            <div className="text-center z-10">
                                <div className="w-28 h-28 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-8 text-indigo-200 border-4 border-white shadow-lg">
                                    <Users size={56} />
                                </div>
                                <h2 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">Klar for neste?</h2>
                                <p className="text-gray-500 mb-10 max-w-sm mx-auto text-lg">Det er totalt <strong className="text-gray-900">{waitingTickets.length}</strong> personer som venter.</p>
                                <button 
                                    onClick={() => callNextTicket(activeCounterId)}
                                    disabled={waitingTickets.length === 0}
                                    className="px-12 py-6 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-2xl font-black text-2xl shadow-xl shadow-emerald-200 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-4 mx-auto"
                                >
                                    <Play fill="currentColor" size={24} /> Kall inn neste
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">I kø</div>
                            <div className="text-4xl font-black text-gray-900">{waitingTickets.length}</div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Ventetid</div>
                            <div className="text-4xl font-black text-gray-900">~{avgWaitTime} <span className="text-sm text-gray-400 font-normal">min</span></div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Totalt i dag</div>
                            <div className="text-4xl font-black text-gray-900">{totalServed}</div>
                        </div>
                         <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Online</div>
                            <div className="text-4xl font-black text-green-500">{counters.filter(c => c.isOnline).length}/{counters.length}</div>
                        </div>
                    </div>
                </div>

                {/* Waiting List Column */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-140px)] sticky top-6 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 backdrop-blur-sm">
                        <h3 className="font-bold text-gray-900 text-xl">Kø-oversikt</h3>
                        <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm font-bold">{waitingTickets.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {waitingTickets.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400 opacity-60">
                                <Clock size={48} className="mb-4 text-gray-300"/>
                                <p className="font-medium">Ingen ventende kunder</p>
                            </div>
                        ) : (
                            waitingTickets.map((ticket) => {
                                const service = services.find(s => s.id === ticket.serviceId);
                                return (
                                    <div key={ticket.id} className="group p-5 rounded-xl bg-white border border-gray-200 hover:border-indigo-400 hover:shadow-md transition-all flex items-center justify-between">
                                        <div className="flex items-center gap-5">
                                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-black text-white text-xl shadow-sm ${service?.color}`}>
                                                {service?.prefix}
                                            </div>
                                            <div>
                                                <span className="block font-black text-2xl text-gray-900 tracking-tight">{ticket.number}</span>
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{service?.name}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                             <button 
                                                onClick={() => callSpecificTicket(ticket.id, activeCounterId)}
                                                className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                             >
                                                Hent
                                             </button>
                                            <button 
                                                onClick={() => deleteTicket(ticket.id)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" 
                                                title="Slett fra kø"
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
        )}

        {view === 'logs' && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-gray-900 text-xl">Systemlogg</h3>
                    <button onClick={handleExportCSV} className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                        <Download size={16} /> Eksporter CSV
                    </button>
                </div>
                {isAdmin && (
                    <div className="p-6 border-b border-gray-100 bg-gray-50/60">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 shadow-inner flex items-center justify-center text-indigo-200">
                                    <Terminal size={18} />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900">Live logg (admin)</p>
                                    <p className="text-xs text-gray-500">Sanntidsovervåkning av alle hendelser</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-gray-500">{logs.length} linjer</span>
                                <button
                                    onClick={() => setFollowLog((prev) => !prev)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${followLog ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                                >
                                    {followLog ? 'Pause autoscroll' : 'Følg sanntid'}
                                </button>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-inner overflow-hidden">
                            <div
                                ref={liveLogRef}
                                className="h-[320px] overflow-y-auto p-4 space-y-2 custom-scrollbar"
                            >
                                {logs.length === 0 && (
                                    <div className="text-sm text-slate-400 font-mono">Ingen hendelser ennå.</div>
                                )}
                                {logs.map((log) => {
                                    const time = new Date(log.timestamp).toLocaleTimeString('no-NO');
                                    const badge = log.type === 'ALERT'
                                        ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                                        : log.type === 'ACTION'
                                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                                            : 'bg-sky-500/15 text-sky-200 border border-sky-400/20';
                                    return (
                                        <div key={log.id} className="flex gap-3 items-start text-sm font-mono text-slate-100">
                                            <span className="text-slate-500 shrink-0">[{time}]</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wide font-black ${badge}`}>{log.type}</span>
                                            <span className="break-words leading-relaxed">{log.message}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
                <table className="w-full">
                    <thead className="bg-gray-50 text-left border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wider">Tidspunkt</th>
                            <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wider">Melding</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 font-medium">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border
                                        ${log.type === 'INFO' ? 'bg-blue-50 text-blue-700 border-blue-100' : ''}
                                        ${log.type === 'ACTION' ? 'bg-green-50 text-green-700 border-green-100' : ''}
                                        ${log.type === 'ALERT' ? 'bg-red-50 text-red-700 border-red-100' : ''}
                                    `}>
                                        {log.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-800 font-medium">
                                    {log.message}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {view === 'settings' && (
             <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row min-h-[600px]">
                {/* Settings Sidebar */}
                <div className="w-full md:w-64 bg-gray-50 border-r border-gray-200 p-6">
                    <h2 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-6 px-2">Konfigurasjon</h2>
                    <div className="space-y-2">
                        {allowedSettingsTabs.includes('general') && <button onClick={() => setSettingsTab('general')} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${settingsTab === 'general' ? 'bg-white text-indigo-700 shadow-md ring-1 ring-black/5' : 'text-gray-600 hover:bg-gray-200/50'}`}>Generelt</button>}
                        {allowedSettingsTabs.includes('services') && <button onClick={() => setSettingsTab('services')} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${settingsTab === 'services' ? 'bg-white text-indigo-700 shadow-md ring-1 ring-black/5' : 'text-gray-600 hover:bg-gray-200/50'}`}>Tjenester</button>}
                        {allowedSettingsTabs.includes('counters') && <button onClick={() => setSettingsTab('counters')} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${settingsTab === 'counters' ? 'bg-white text-indigo-700 shadow-md ring-1 ring-black/5' : 'text-gray-600 hover:bg-gray-200/50'}`}>Skranker</button>}
                        {allowedSettingsTabs.includes('users') && <button onClick={() => setSettingsTab('users')} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${settingsTab === 'users' ? 'bg-white text-indigo-700 shadow-md ring-1 ring-black/5' : 'text-gray-600 hover:bg-gray-200/50'}`}>Brukere</button>}
                        {allowedSettingsTabs.includes('devices') && <button onClick={() => setSettingsTab('devices')} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${settingsTab === 'devices' ? 'bg-white text-indigo-700 shadow-md ring-1 ring-black/5' : 'text-gray-600 hover:bg-gray-200/50'}`}>Enheter</button>}
                    </div>
                </div>

                {/* Settings Content */}
                <div className="flex-1 p-10 bg-white">
                    {settingsTab === 'general' && (
                        <div className="max-w-2xl">
                            <h3 className="text-3xl font-black text-gray-900 mb-8">Generelle innstillinger</h3>
                            <div className="space-y-8">
                                <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                                    <h4 className="font-bold text-gray-900 mb-4 text-lg">Profil og logo</h4>
                                    <div className="space-y-4">
                                        <label className="block text-sm font-bold text-gray-700">Navn ved logo</label>
                                        <input
                                            type="text"
                                            value={branding.brandText}
                                            onChange={(e) => handleBrandTextChange(e.target.value)}
                                            className="w-full bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-bold text-gray-900"
                                        />
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-14 w-14 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden">
                                                    {branding.brandLogoUrl ? (
                                                        <img src={branding.brandLogoUrl} alt="Logo" className="h-full w-full object-contain" />
                                                    ) : (
                                                        <span className="text-xs text-gray-400 font-bold">Ingen logo</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500">Vises på alle skjermer</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <label className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-bold cursor-pointer hover:bg-indigo-100">
                                                    Last opp
                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e.target.files?.[0])} />
                                                </label>
                                                {branding.brandLogoUrl && (
                                                    <button onClick={handleLogoRemove} className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-red-600 border border-gray-200 rounded-lg bg-white">Fjern</button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500">Anbefalt: kvadratisk logo, PNG/SVG, under 500 KB.</p>
                                    </div>
                                </div>
                                <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 space-y-6">
                                    <h4 className="font-bold text-gray-900 text-lg">Bytt passord</h4>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="md:col-span-1">
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Gammelt passord</label>
                                            <input type="password" value={pwdOld} onChange={(e) => setPwdOld(e.target.value)} className="w-full bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none" />
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Nytt passord</label>
                                            <input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} className="w-full bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none" />
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-3">
                                        <button onClick={handleChangePassword} disabled={!pwdNew || pwdStatus === 'saving'} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60">
                                            {pwdStatus === 'saving' ? 'Lagrer...' : 'Oppdater passord'}
                                        </button>
                                        {pwdStatus === 'success' && <span className="text-sm text-green-600 font-medium">Lagret</span>}
                                        {pwdStatus === 'error' && <span className="text-sm text-red-600 font-medium">Kunne ikke lagre</span>}
                                    </div>
                                </div>
                                <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                                    <h4 className="font-bold text-gray-900 mb-4 text-lg">Lyd</h4>
                                    <div className="space-y-4">
                                        <label className="flex items-center justify-between">
                                            <div>
                                                <p className="font-bold text-gray-800">Kiosk lydeffekter</p>
                                                <p className="text-xs text-gray-500">Spill av utskriftslyd på kiosken.</p>
                                            </div>
                                            <input type="checkbox" checked={soundSettings.kioskEffects} onChange={(e) => setSoundSettings({ kioskEffects: e.target.checked })} />
                                        </label>
                                        <label className="flex items-center justify-between">
                                            <div>
                                                <p className="font-bold text-gray-800">Operatør lydeffekter</p>
                                                <p className="text-xs text-gray-500">Varsellyd i operatørpanelet.</p>
                                            </div>
                                            <input type="checkbox" checked={soundSettings.adminEffects} onChange={(e) => setSoundSettings({ adminEffects: e.target.checked })} />
                                        </label>
                                        <label className="flex items-center justify-between">
                                            <div>
                                                <p className="font-bold text-gray-800">Kall-inn lyd</p>
                                                <p className="text-xs text-gray-500">Spill av pling når nummer kalles.</p>
                                            </div>
                                            <input type="checkbox" checked={soundSettings.callChime} onChange={(e) => setSoundSettings({ callChime: e.target.checked })} />
                                        </label>
                                        <label className="flex items-center justify-between">
                                            <div>
                                                <p className="font-bold text-gray-800">Opplesning av nummer</p>
                                                <p className="text-xs text-gray-500">Stemme som leser opp nummer og skranke.</p>
                                            </div>
                                            <input type="checkbox" checked={soundSettings.callVoice} onChange={(e) => setSoundSettings({ callVoice: e.target.checked })} />
                                        </label>
                                    </div>
                                </div>
                                <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                                    <h4 className="font-bold text-gray-900 mb-2 text-lg">Åpne / Steng køsystemet</h4>
                                    <p className="text-sm text-gray-600 mb-4">Stenger alle skjermer (storskjerm og skrankeskjermer) med beskjed til brukere.</p>
                                    <label className="inline-flex items-center gap-3">
                                        <input type="checkbox" checked={!isClosed} onChange={(e) => setSystemClosed(!e.target.checked)} />
                                        <span className="text-sm font-bold text-gray-800">{isClosed ? 'Systemet er stengt' : 'Systemet er åpent'}</span>
                                    </label>
                                </div>
                                <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                                    <h4 className="font-bold text-gray-900 mb-2 text-lg">Kiosk PIN</h4>
                                    <p className="text-sm text-gray-600 mb-4">PIN-kode som må oppgis for å avslutte kioskmodus (5 trykk oppe til høyre).</p>
                                    <input
                                        type="password"
                                        value={kioskExitPin}
                                        onChange={(e) => handleKioskPinChange(e.target.value)}
                                        className="w-full bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none font-mono text-gray-900"
                                        placeholder="F.eks. 1234"
                                    />
                                </div>
                                <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                                    <h4 className="font-bold text-gray-900 mb-2 text-lg">Sikkerhetskopier</h4>
                                    <p className="text-sm text-gray-600 mb-4">Opprett og last ned backup av databasen før større endringer.</p>
                                    <div className="flex flex-wrap items-center gap-3 mb-4">
                                        <button onClick={handleCreateBackup} disabled={backupStatus === 'working'} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60">
                                            Opprett backup
                                        </button>
                                        <button onClick={fetchBackups} disabled={backupsLoading} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 disabled:opacity-60">
                                            Oppdater liste
                                        </button>
                                        {backupStatus === 'working' && <span className="text-sm text-gray-500 font-medium">Jobber...</span>}
                                        {backupStatus === 'success' && backupMessage && <span className="text-sm text-green-600 font-medium">{backupMessage}</span>}
                                        {backupStatus === 'error' && backupMessage && <span className="text-sm text-red-600 font-medium">{backupMessage}</span>}
                                    </div>
                                    <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 bg-gray-50">
                                        {backupsLoading && <div className="px-4 py-3 text-sm text-gray-500">Laster...</div>}
                                        {!backupsLoading && backups.length === 0 && (
                                            <div className="px-4 py-3 text-sm text-gray-500">Ingen backups funnet ennå.</div>
                                        )}
                                        {!backupsLoading && backups.map(b => (
                                            <div key={b.file} className="px-4 py-3 flex items-center justify-between gap-4">
                                                <div>
                                                    <p className="font-bold text-gray-800 text-sm">{b.file}</p>
                                                    <p className="text-xs text-gray-500">{new Date(b.mtime).toLocaleString()}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleDownloadBackup(b.file)}
                                                    className="text-indigo-600 hover:text-indigo-800 text-sm font-bold flex items-center gap-1"
                                                >
                                                    <Download size={14} /> Last ned
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-yellow-50 border-2 border-yellow-100 rounded-2xl p-6">
                                    <h4 className="font-bold text-yellow-900 mb-2 text-lg">Nullstill system</h4>
                                    <p className="text-sm text-yellow-800 mb-6 font-medium">Dette vil slette alle aktive billetter og nullstille køen. Denne handlingen kan ikke angres.</p>
                                    <button onClick={resetSystem} className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-bold text-sm shadow-md transition-colors">Utfør nullstilling</button>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3">Melding på storskjerm</label>
                                    <div className="flex gap-4">
                                        <input 
                                            type="text" 
                                            value={publicMessage}
                                            onChange={(e) => setPublicMessage(e.target.value)}
                                            placeholder="F.eks. Vi har lunsjpause til 12:00..." 
                                            className="flex-1 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-medium text-gray-900"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2 font-medium">Denne teksten vil rulle over bunnen på storskjermen for å informere kunder.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {settingsTab === 'services' && (
                        <div>
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-3xl font-black text-gray-900">Tjenester</h3>
                            </div>
                            
                            {/* Add Service Form */}
                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mb-8 grid grid-cols-1 md:grid-cols-5 gap-4 items-end shadow-sm">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Navn</label>
                                    <input type="text" value={newService.name} onChange={e => setNewService({...newService, name: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none font-bold text-gray-800 bg-white" placeholder="F.eks. Salg" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Prefiks</label>
                                    <input type="text" value={newService.prefix} onChange={e => setNewService({...newService, prefix: e.target.value.toUpperCase()})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none font-bold text-gray-800 bg-white" placeholder="S" maxLength={2} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Estimert tid (min)</label>
                                    <input type="number" min={1} value={newService.estimatedTimePerPersonMinutes ?? 5} onChange={e => setNewService({...newService, estimatedTimePerPersonMinutes: Number(e.target.value) || 1})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none font-bold text-gray-800 bg-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Prioritet</label>
                                    <input type="number" min={1} value={newService.priority ?? 1} onChange={e => setNewService({...newService, priority: Number(e.target.value) || 1})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none font-bold text-gray-800 bg-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Farge</label>
                                    <select value={newService.color} onChange={e => setNewService({...newService, color: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none font-bold text-gray-800 bg-white cursor-pointer">
                                        <option value="bg-blue-600">Blå</option>
                                        <option value="bg-red-600">Rød</option>
                                        <option value="bg-green-600">Grønn</option>
                                        <option value="bg-purple-600">Lilla</option>
                                        <option value="bg-yellow-500">Gul</option>
                                        <option value="bg-pink-600">Rosa</option>
                                        <option value="bg-gray-600">Grå</option>
                                    </select>
                                </div>
                                <button onClick={handleCreateService} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all h-[46px]">Legg til</button>
                            </div>

                            <div className="space-y-3">
                                {services.map(s => (
                                    <div key={s.id} className="p-5 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-200 transition-colors">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-center gap-5">
                                                <div className={`w-12 h-12 rounded-xl ${s.color} text-white flex items-center justify-center font-black text-lg shadow-sm`}>{s.prefix}</div>
                                                <div>
                                                    <p className="font-bold text-gray-900 text-lg">{s.name}</p>
                                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">{s.estimatedTimePerPersonMinutes} min estimert tid</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => removeService(s.id)} className="text-gray-300 hover:text-red-500 p-3 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={20} /></button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Estimert tid (min)</label>
                                                <input type="number" min={1} defaultValue={s.estimatedTimePerPersonMinutes} onBlur={e => updateService(s.id, { estimatedTimePerPersonMinutes: Number(e.target.value) || s.estimatedTimePerPersonMinutes })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Prioritet</label>
                                                <input type="number" min={1} defaultValue={s.priority ?? 1} onBlur={e => updateService(s.id, { priority: Number(e.target.value) || 1 })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                <p className="text-[11px] text-gray-400 mt-1">Høyere tall = høyere prioritet ved innkalling.</p>
                                            </div>
                                            <div className="flex items-end">
                                                <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
                                                    <input type="checkbox" defaultChecked={s.isOpen !== false} onChange={e => updateService(s.id, { isOpen: e.target.checked })} className="h-4 w-4" />
                                                    Åpen
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                          {settingsTab === 'counters' && (
                         <div>
                            <h3 className="text-3xl font-black text-gray-900 mb-8">Skranker</h3>
                            
                            <div className="flex gap-4 mb-10">
                                <input type="text" value={newCounterName} onChange={e => setNewCounterName(e.target.value)} className="border-2 border-gray-200 rounded-xl px-4 py-3 w-72 focus:border-indigo-500 outline-none font-bold text-gray-800 bg-white" placeholder="Navn på skranke..." />
                                <button onClick={handleCreateCounter} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-md">Opprett Skranke</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {counters.map(c => (
                                    <div key={c.id} className="p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-gray-300 transition-all shadow-sm">
                                        <div className="flex justify-between items-start mb-6">
                                            <h4 className="font-bold text-xl text-gray-900">{c.name}</h4>
                                            <div className="flex gap-3">
                                                <button onClick={() => updateCounterStatus(c.id, !c.isOnline)} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${c.isOnline ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                                                    {c.isOnline ? 'Online' : 'Offline'}
                                                </button>
                                                <button onClick={() => removeCounter(c.id)} className="text-gray-300 hover:text-red-500"><X size={20} /></button>
                                            </div>
                                        </div>
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Håndterer tjenester (Klikk for å endre):</p>
                                        <div className="flex flex-wrap gap-2">
                                            {services.map(s => {
                                                const isActive = c.activeServiceIds.includes(s.id);
                                                return (
                                                    <button 
                                                        key={s.id} 
                                                        onClick={() => toggleServiceForCounter(c.id, s.id)}
                                                        className={`px-3 py-1.5 rounded-lg border-2 text-xs font-bold select-none transition-all ${isActive ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' : 'bg-gray-50 border-gray-100 text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                                                    >
                                                        {s.name}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {settingsTab === 'users' && (
                        <div>
                            <h3 className="text-3xl font-black text-gray-900 mb-8">Brukere & Tilgang</h3>
                             <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mb-10 grid grid-cols-1 md:grid-cols-5 gap-4 items-end shadow-sm">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Brukernavn</label>
                                    <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-white font-bold focus:border-indigo-500 outline-none" placeholder="f.eks. anna" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Navn</label>
                                    <input type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-white font-bold focus:border-indigo-500 outline-none" placeholder="Visningsnavn" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Rolle</label>
                                    <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as any})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-white font-bold focus:border-indigo-500 outline-none">
                                        <option value="OPERATOR">Operatør</option>
                                        <option value="ADMIN">Administrator</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Passord</label>
                                    <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-white font-bold focus:border-indigo-500 outline-none" placeholder="Sett passord" />
                                </div>
                                <button onClick={handleCreateUser} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-md h-[46px] disabled:opacity-60" disabled={!newUser.username || !newUser.password}>
                                    Legg til bruker
                                </button>
                            </div>

                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs font-black text-gray-400 uppercase tracking-wider border-b-2 border-gray-100">
                                        <th className="pb-4 pl-4">Brukernavn</th>
                                        <th className="pb-4">Navn</th>
                                        <th className="pb-4">Rolle</th>
                                        <th className="pb-4">Passord</th>
                                        <th className="pb-4 text-right pr-4">Handling</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {users.map(u => {
                                        const draft = getUserDraft(u.id);
                                        return (
                                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="py-3 pl-4">
                                                <input value={draft.username} onChange={e => handleUserDraftChange(u.id, 'username', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                            </td>
                                            <td className="py-3">
                                                <input value={draft.name} onChange={e => handleUserDraftChange(u.id, 'name', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                            </td>
                                            <td className="py-3">
                                                <select value={draft.role} onChange={e => handleUserDraftChange(u.id, 'role', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                                    <option value="OPERATOR">Operatør</option>
                                                    <option value="ADMIN">Administrator</option>
                                                </select>
                                            </td>
                                            <td className="py-3">
                                                <input type="password" value={draft.password || ''} onChange={e => handleUserDraftChange(u.id, 'password', e.target.value)} placeholder="Nytt passord (valgfritt)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                            </td>
                                            <td className="py-3 pr-4 text-right flex items-center justify-end gap-3">
                                                <button onClick={() => handleSaveUser(u.id)} className="text-indigo-600 hover:text-indigo-800 text-sm font-bold">Lagre</button>
                                                <button
                                                    onClick={() => {
                                                        if (u.role === 'ADMIN' && adminCount <= 1) {
                                                            alert('Det må alltid finnes minst én admin. Du kan ikke slette siste admin.');
                                                            return;
                                                        }
                                                        removeUser(u.id);
                                                    }}
                                                    className={`text-sm font-bold ${u.role === 'ADMIN' && adminCount <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:text-red-600'}`}
                                                    disabled={u.role === 'ADMIN' && adminCount <= 1}
                                                >
                                                    Slett
                                                </button>
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {settingsTab === 'devices' && (
                        <div>
                            <h3 className="text-3xl font-black text-gray-900 mb-8">Enheter & Utskrift</h3>
                             
                             {/* Add Printer Form */}
                             <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mb-10 flex flex-col gap-6 shadow-sm">
                                <h4 className="font-bold text-gray-600 uppercase tracking-wide text-xs">Legg til nettverksskriver</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Navn</label>
                                        <input type="text" value={newPrinter.name} onChange={e => setNewPrinter({...newPrinter, name: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-white font-bold focus:border-indigo-500 outline-none" placeholder="Kiosk Printer 1" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">IP Adresse</label>
                                        <input type="text" value={newPrinter.ipAddress} onChange={e => setNewPrinter({...newPrinter, ipAddress: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 bg-white font-mono font-medium focus:border-indigo-500 outline-none" placeholder="192.168.1.100" />
                                    </div>
                                    <button onClick={handleAddPrinter} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-md h-[46px] w-full">Legg til</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Printer List */}
                                <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                                    <h4 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2"><PrinterIcon size={20} /> Konfigurerte Skrivere</h4>
                                    {printers.length === 0 ? <p className="text-gray-400 italic text-sm">Ingen skrivere lagt til.</p> : (
                                        <ul className="space-y-3">
                                            {printers.map(p => (
                                                <li key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                    <div>
                                                        <p className="font-bold text-gray-800">{p.name}</p>
                                                        <p className="text-xs text-gray-500 font-mono">{p.ipAddress}:{p.port}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${p.status === 'ONLINE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                            {p.status === 'ONLINE' ? 'Online' : 'Offline'}
                                                        </span>
                                                        <button onClick={() => removePrinter(p.id)} className="text-gray-300 hover:text-red-500"><X size={16} /></button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {/* Kiosk List */}
                                <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                                    <h4 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2"><Monitor size={20} /> Aktive Kiosker</h4>
                                    {kiosks.length === 0 ? <p className="text-gray-400 italic text-sm">Ingen kiosker oppdaget.</p> : (
                                        <ul className="space-y-4">
                                            {kiosks.map(k => (
                                                <li key={k.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                                    {(() => {
                                                        const online = Date.now() - k.lastSeen < 15000;
                                                        return (
                                                            <>
                                                                <div className="flex justify-between items-start mb-3">
                                                                    <div>
                                                                        <p className="font-bold text-gray-800">{k.name}</p>
                                                                        <p className="text-xs text-gray-400">Sist sett: {new Date(k.lastSeen).toLocaleTimeString()}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                            <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                                            {online ? 'Online' : 'Offline'}
                                                                        </span>
                                                                        <button onClick={() => removeKiosk(k.id)} className="text-gray-400 hover:text-red-600" title="Fjern kiosk">
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Tildelt Skriver</label>
                                                                    <select 
                                                                        value={k.assignedPrinterId || ''} 
                                                                        onChange={(e) => assignPrinterToKiosk(k.id, e.target.value)}
                                                                        className="w-full text-sm border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                    >
                                                                        <option value="">Ingen skriver valgt</option>
                                                                        {printers.map(p => (
                                                                            <option key={p.id} value={p.id}>{p.name} ({p.ipAddress})</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {/* Counter Display List */}
                            <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 mt-8">
                                <h4 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2"><Monitor size={20} /> Aktive Skrankeskjermer</h4>
                                {counterDisplays.length === 0 ? <p className="text-gray-400 italic text-sm">Ingen skrankeskjermer oppdaget.</p> : (
                                    <ul className="space-y-4">
                                        {counterDisplays.map(d => {
                                            const online = Date.now() - d.lastSeen < 15000;
                                            return (
                                                <li key={d.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div>
                                                            <p className="font-bold text-gray-800">{d.name}</p>
                                                            <p className="text-[11px] font-mono text-gray-500">ID: {d.id.slice(-4).toUpperCase()}</p>
                                                            <p className="text-xs text-gray-400">Sist sett: {new Date(d.lastSeen).toLocaleTimeString()}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                                {online ? 'Online' : 'Offline'}
                                                            </span>
                                                            <button onClick={() => removeCounterDisplay(d.id)} className="text-gray-400 hover:text-red-600" title="Fjern skjerm">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                                <div>
                                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Tildelt skranke</label>
                                                                    <select
                                                                        value={d.counterId || ''}
                                                                        onChange={(e) => assignCounterDisplay(d.id, e.target.value || undefined)}
                                                                        className="w-full text-sm border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                    >
                                                                        <option value="">Ikke tildelt</option>
                                                                        {counters.map(c => (
                                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                                        ))}
                                                                    </select>
                                                                    <p className="text-[11px] text-gray-400 mt-1">Endringen push-es umiddelbart til skjermen.</p>
                                                                </div>
                                                                <div className="mt-4">
                                                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Melding på denne skrankeskjermen</label>
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            value={counterDisplayMessages[d.id] ?? ''}
                                                                            onChange={(e) => handleCounterDisplayMessageChange(d.id, e.target.value)}
                                                                            onBlur={() => handleCounterDisplayMessageSave(d.id)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    handleCounterDisplayMessageSave(d.id);
                                                                                }
                                                                            }}
                                                                            placeholder="F.eks. Lunsj 11:30-12:00"
                                                                            className="flex-1 text-sm border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-3 py-2"
                                                                        />
                                                                        <button
                                                                            onClick={() => handleCounterDisplayMessageSave(d.id)}
                                                                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg shadow-sm hover:bg-indigo-700"
                                                                        >
                                                                            Lagre
                                                                        </button>
                                                                    </div>
                                                                    <p className="text-[11px] text-gray-400 mt-1">Vises nederst på denne skrankeskjermen.</p>
                                                                </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </div>
             </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
