export enum TicketStatus {
  WAITING = 'WAITING',
  SERVING = 'SERVING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface Service {
  id: string;
  name: string;
  prefix: string; // e.g., "A", "B"
  color: string;
  estimatedTimePerPersonMinutes: number;
  isOpen: boolean;
  priority?: number;
}

export interface User {
  id: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR';
  username: string;
  passwordHash?: string; // stored hashed
  pinCode?: string; // legacy
}

export interface Ticket {
  id: string;
  number: string; // e.g., "A001"
  serviceId: string;
  status: TicketStatus;
  createdAt: number;
  calledAt?: number;
  completedAt?: number;
  counterId?: string; // Who called it
}

export interface Counter {
  id: string;
  name: string;
  activeServiceIds: string[]; // Services this counter handles
  isOnline: boolean;
  currentTicketId?: string;
}

export interface Printer {
  id: string;
  name: string;
  ipAddress: string;
  port: number; // Default 9100 for Epson
  type: 'EPSON_IP' | 'GENERIC_NETWORK';
  status: 'ONLINE' | 'OFFLINE';
}

export interface KioskConfig {
  id: string;
  name: string;
  assignedPrinterId?: string;
  lastSeen: number;
}

export interface CounterDisplay {
  id: string;
  name: string;
  counterId?: string;
  lastSeen: number;
  message?: string;
}

export interface BrandingConfig {
  brandText: string;
  brandLogoUrl?: string; // data URL or hosted asset
}

export interface SoundSettings {
  kioskEffects: boolean;
  adminEffects: boolean;
  callChime: boolean;
  callVoice: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'INFO' | 'ACTION' | 'ALERT';
}

export interface QueueContextType {
  services: Service[];
  counters: Counter[];
  tickets: Ticket[];
  logs: LogEntry[];
  users: User[];
  printers: Printer[];
  kiosks: KioskConfig[];
  counterDisplays: CounterDisplay[];
  isClosed: boolean;
  soundSettings: SoundSettings;
  publicMessage: string;
  branding: BrandingConfig;
  kioskExitPin: string;
  setPublicMessage: (msg: string) => void;
  setSoundSettings: (settings: Partial<SoundSettings>) => void;
  setBranding: (branding: Partial<BrandingConfig>) => void;
  setKioskExitPin: (pin: string) => void;
  
  // Ticket Actions
  addTicket: (serviceId: string) => Promise<Ticket>;
  updateTicketStatus: (ticketId: string, status: TicketStatus, counterId?: string) => void;
  callNextTicket: (counterId: string) => void;
  callSpecificTicket: (ticketId: string, counterId: string) => void;
  deleteTicket: (ticketId: string) => void;
  
  // Admin Actions
  addService: (service: Omit<Service, 'id'>) => void;
  removeService: (id: string) => void;
  updateService: (id: string, updates: Partial<Service>) => void;
  addCounter: (counter: Omit<Counter, 'id'>) => void;
  updateCounter: (id: string, updates: Partial<Counter>) => void;
  removeCounter: (id: string) => void;
  updateCounterStatus: (counterId: string, isOnline: boolean) => void;
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: string, updates: Partial<User> & { password?: string }) => void;
  removeUser: (id: string) => void;
  
  // Printer/Device Actions
  addPrinter: (printer: Omit<Printer, 'id' | 'status'>) => void;
  removePrinter: (id: string) => void;
  registerKiosk: (id: string, name: string) => void;
  assignPrinterToKiosk: (kioskId: string, printerId: string) => void;
  removeKiosk: (id: string) => void;
  registerCounterDisplay: (id: string, name: string, counterId?: string) => void;
  assignCounterDisplay: (displayId: string, counterId?: string) => void;
  removeCounterDisplay: (displayId: string) => void;
  setCounterDisplayMessage: (displayId: string, message: string) => void;
  setSystemClosed: (closed: boolean) => void;
  triggerSound: (payload: { type: 'ding' | 'print' | 'alert', text?: string }) => void;
  reportError: (message: string) => void;
  
  addLog: (message: string, type?: 'INFO' | 'ACTION' | 'ALERT') => void;
  getWaitTime: (serviceId: string) => number;
  resetSystem: () => void;
}
