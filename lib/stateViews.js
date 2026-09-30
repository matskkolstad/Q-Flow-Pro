import { sanitizeUser } from './users.js';

// Role-specific projections of the server state. Anything not listed here
// (sessions, password hashes, OAuth secrets, kiosk PIN, device tokens, ticket owner keys,
// raw logo data) never leaves the server.

const publicTicket = (t) => ({
  id: t.id,
  number: t.number,
  serviceId: t.serviceId,
  status: t.status,
  createdAt: t.createdAt,
  calledAt: t.calledAt,
  finishedAt: t.finishedAt,
  completedAt: t.completedAt,
  counterId: t.counterId,
  recallCount: t.recallCount || 0,
});

const publicCounterDisplay = (d) => ({
  id: d.id,
  name: d.name,
  counterId: d.counterId,
  message: d.message || '',
  lastSeen: d.lastSeen,
});

// Branding as clients see it: an uploaded logo is served from /api/branding/logo.
export const publicBranding = (branding = {}) => ({
  brandText: branding.brandText ?? 'Q-Flow Pro',
  brandLogoUrl: branding.brandLogoData
    ? `/api/branding/logo?v=${branding.logoVersion || '1'}`
    : (branding.brandLogoUrl || ''),
  primaryColor: branding.primaryColor || '',
  ticketFooter: branding.ticketFooter || '',
});

const publicSettings = (settings = {}) => ({
  kiosk: settings.kiosk,
  schedule: settings.schedule,
  publicUrl: settings.publicUrl || '',
});

export const publicView = (state) => ({
  services: state.services || [],
  counters: state.counters || [],
  tickets: (state.tickets || []).map(publicTicket),
  counterDisplays: (state.counterDisplays || []).map(publicCounterDisplay),
  isClosed: !!state.isClosed,
  publicMessage: state.publicMessage || '',
  branding: publicBranding(state.branding),
  soundSettings: state.soundSettings,
  settings: publicSettings(state.settings),
});

export const staffView = (state) => ({
  ...publicView(state),
  printers: (state.printers || []).map((p) => ({
    id: p.id,
    name: p.name,
    ipAddress: p.ipAddress,
    port: p.port,
    type: p.type,
    status: p.status,
  })),
  kiosks: (state.kiosks || []).map((k) => ({
    id: k.id,
    name: k.name,
    assignedPrinterId: k.assignedPrinterId,
    lastSeen: k.lastSeen,
  })),
  logs: state.logs || [],
  todaySummary: state.todaySummary || null,
});

const sanitizeProvider = (provider = {}, fields) => {
  const out = { clientSecretSet: !!provider.clientSecret };
  fields.forEach((f) => { out[f] = provider[f]; });
  return out;
};

export const adminView = (state) => {
  const providers = state.authProviders || {};
  return {
    ...staffView(state),
    users: (state.users || []).map(sanitizeUser),
    kioskExitPinSet: !!state.kioskExitPinHash,
    settings: state.settings,
    jobs: state.jobs || {},
    authProviders: {
      google: sanitizeProvider(providers.google, ['enabled', 'clientId', 'allowedDomains', 'autoProvision', 'defaultRole']),
      oidc: sanitizeProvider(providers.oidc, ['enabled', 'issuerUrl', 'clientId', 'autoProvision', 'defaultRole', 'requireVerifiedEmail']),
    },
  };
};

export const viewForRole = (state, role) => {
  if (role === 'ADMIN') return adminView(state);
  if (role === 'OPERATOR') return staffView(state);
  return publicView(state);
};
