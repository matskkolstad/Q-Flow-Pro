import { sanitizeUser } from './users.js';

// Role-specific projections of the server state. Anything not listed here
// (sessions, password hashes, OAuth secrets, kiosk PIN, device tokens) never leaves the server.

const publicTicket = (t) => ({
  id: t.id,
  number: t.number,
  serviceId: t.serviceId,
  status: t.status,
  createdAt: t.createdAt,
  calledAt: t.calledAt,
  completedAt: t.completedAt,
  counterId: t.counterId,
});

const publicCounterDisplay = (d) => ({
  id: d.id,
  name: d.name,
  counterId: d.counterId,
  message: d.message || '',
  lastSeen: d.lastSeen,
});

export const publicView = (state) => ({
  services: state.services || [],
  counters: state.counters || [],
  tickets: (state.tickets || []).map(publicTicket),
  counterDisplays: (state.counterDisplays || []).map(publicCounterDisplay),
  isClosed: !!state.isClosed,
  publicMessage: state.publicMessage || '',
  branding: state.branding || { brandText: 'Q-Flow Pro', brandLogoUrl: '' },
  soundSettings: state.soundSettings,
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
