export enum TicketStatus {
  WAITING = 'WAITING',
  SERVING = 'SERVING',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
  CANCELLED = 'CANCELLED',
}

export interface Service {
  id: string;
  name: string;
  prefix: string; // e.g., "A", "B"
  color: string; // hex (#2563eb) or legacy Tailwind class (bg-blue-600)
  estimatedTimePerPersonMinutes: number;
  isOpen: boolean;
  priority?: number;
}

export interface User {
  id: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR';
  username: string;
  hasPassword?: boolean; // Has a local password (hashes never leave the server)
  mustChangePassword?: boolean; // Force password change on next login
  email?: string; // Email from external auth provider
  provider?: 'local' | 'google' | 'oidc'; // Authentication provider
}

export interface Ticket {
  id: string;
  number: string; // e.g., "A001"
  serviceId: string;
  status: TicketStatus;
  createdAt: number;
  calledAt?: number;
  finishedAt?: number;
  completedAt?: number;
  counterId?: string; // Counter that called it
  recallCount?: number;
  transferredFrom?: string;
  source?: 'kiosk' | 'mobile' | 'staff';
}

export interface Counter {
  id: string;
  name: string;
  activeServiceIds: string[]; // Services this counter handles (empty = all)
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
  brandLogoUrl?: string; // /api/branding/logo?v=… for uploaded logos, or an external URL
  primaryColor?: string; // hex, empty = default
  ticketFooter?: string;
}

export interface SoundSettings {
  kioskEffects: boolean;
  adminEffects: boolean;
  callChime: boolean;
  callVoice: boolean;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DaySchedule {
  enabled: boolean;
  open: string; // HH:MM
  close: string; // HH:MM
}

export interface ScheduleSettings {
  enabled: boolean;
  days: Record<Weekday, DaySchedule>;
}

export interface DailyJob {
  enabled: boolean;
  time: string; // HH:MM
}

export interface KioskSettings {
  autoReturnSeconds: number;
  showQr: boolean;
  printQr: boolean;
}

export interface AppSettings {
  schedule: ScheduleSettings;
  autoReset?: DailyJob;
  backup?: DailyJob;
  kiosk: KioskSettings;
  announcements?: { no: string; en: string };
  publicUrl: string;
}

export interface AuthProviderConfig {
  google: {
    enabled: boolean;
    clientId: string;
    clientSecret?: string; // write-only: sent to the server, never received
    clientSecretSet?: boolean;
    allowedDomains?: string[]; // Optional: restrict to specific Google Workspace domains
    autoProvision: boolean; // Auto-create users on first login
    defaultRole: 'ADMIN' | 'OPERATOR'; // Default role for auto-provisioned users
  };
  oidc: {
    enabled: boolean;
    issuerUrl: string;
    clientId: string;
    clientSecret?: string; // write-only: sent to the server, never received
    clientSecretSet?: boolean;
    autoProvision: boolean;
    defaultRole: 'ADMIN' | 'OPERATOR';
    requireVerifiedEmail?: boolean; // Only link/provision accounts when the provider verified the e-mail
  };
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'INFO' | 'ACTION' | 'ALERT';
}

export interface StatsSummary {
  total: number;
  completed: number;
  noShow: number;
  cancelled: number;
  avgWaitMinutes: number | null;
  avgServiceMinutes: number | null;
  waitingNow?: number;
  servingNow?: number;
}

export interface StatsGroup extends StatsSummary {
  key: string;
  label: string;
}

export interface StatsResponse {
  from: string;
  to: string;
  totals: StatsSummary;
  byService: StatsGroup[];
  byCounter: StatsGroup[];
  byDay: StatsGroup[];
  byHour: { hour: number; tickets: number }[];
}

export type ClientRole = 'PUBLIC' | 'KIOSK' | 'OPERATOR' | 'ADMIN';

// Who the server considers this browser to be (sent on connect and when it changes).
export interface SessionInfo {
  role: ClientRole;
  kioskId?: string | null;
  mustChangePassword?: boolean;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// ok=true comes with the created ticket and the owner key (to follow/cancel it), ok=false with an error code.
export interface AddTicketResult {
  ok: boolean;
  ticket?: Ticket;
  ownerKey?: string;
  error?: string;
  printing?: boolean;
}

export interface CallResult extends ActionResult {
  ticket?: Ticket | null;
}

export interface SettingsUpdate {
  isClosed?: boolean;
  soundSettings?: Partial<SoundSettings>;
  publicMessage?: string;
  branding?: Partial<BrandingConfig>;
  kioskExitPin?: string;
  authProviders?: Partial<{ google: Partial<AuthProviderConfig['google']>; oidc: Partial<AuthProviderConfig['oidc']> }>;
  settings?: Partial<Omit<AppSettings, 'schedule' | 'kiosk'>> & { schedule?: Partial<ScheduleSettings>; kiosk?: Partial<KioskSettings> };
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
  settings: AppSettings;
  kioskExitPinSet: boolean;
  authProviders: AuthProviderConfig;
  todaySummary: StatsSummary | null;
  jobs: { lastResetDay?: string; lastBackupDay?: string };
  session: SessionInfo | null;
  isConnected: boolean;

  // Settings (admin)
  updateSettings: (updates: SettingsUpdate) => Promise<ActionResult>;

  // Tickets
  addTicket: (serviceId: string, language?: 'en' | 'no') => Promise<AddTicketResult>;
  cancelOwnTicket: (ticketId: string, key: string) => Promise<ActionResult>;
  callNext: (counterId: string) => Promise<CallResult>;
  callTicket: (ticketId: string, counterId: string) => Promise<CallResult>;
  recallTicket: (counterId: string) => Promise<ActionResult>;
  completeTicket: (counterId: string) => Promise<ActionResult>;
  noShowTicket: (counterId: string) => Promise<ActionResult>;
  requeueTicket: (counterId: string) => Promise<ActionResult>;
  transferTicket: (counterId: string, serviceId: string) => Promise<ActionResult>;
  cancelTicket: (ticketId: string) => Promise<ActionResult>;
  resetSystem: () => Promise<ActionResult>;

  // Admin CRUD
  saveService: (service: Partial<Service>) => Promise<ActionResult>;
  deleteService: (id: string) => Promise<ActionResult>;
  saveCounter: (counter: Partial<Counter>) => Promise<ActionResult>;
  deleteCounter: (id: string) => Promise<ActionResult>;
  saveUser: (user: Partial<User> & { password?: string }) => Promise<ActionResult>;
  deleteUser: (id: string) => Promise<ActionResult>;
  savePrinter: (printer: Partial<Printer>) => Promise<ActionResult>;
  deletePrinter: (id: string) => Promise<ActionResult>;
  testPrinter: (id: string) => Promise<ActionResult>;

  // Devices
  registerKiosk: () => void;
  activateKiosk: () => Promise<ActionResult>;
  verifyKioskPin: (pin: string) => Promise<ActionResult>;
  assignPrinterToKiosk: (kioskId: string, printerId: string) => Promise<ActionResult>;
  removeKiosk: (kioskId: string) => Promise<ActionResult>;
  registerCounterDisplay: (id: string, name: string, counterId?: string) => void;
  assignCounterDisplay: (displayId: string, counterId?: string) => Promise<ActionResult>;
  removeCounterDisplay: (displayId: string) => Promise<ActionResult>;
  setCounterDisplayMessage: (displayId: string, message: string) => Promise<ActionResult>;

  reportError: (message: string) => void;
  getWaitTime: (serviceId: string) => number;
}
