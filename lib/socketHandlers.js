import { hashPassword, verifyPassword } from './users.js';
import { generateToken, hashToken } from './security.js';
import {
  cleanText,
  isSafeId,
  randomId,
  isHexColor,
  isHttpUrl,
  sanitizeService,
  sanitizeCounter,
  sanitizeUser,
  sanitizePrinter,
  sanitizeSettings,
} from './validators.js';
import { printTicket } from './printer.js';

const MAX_KIOSKS = 100;
const MAX_COUNTER_DISPLAYS = 200;
const SOUND_KEYS = ['kioskEffects', 'adminEffects', 'callChime', 'callVoice'];
const STAFF = ['ADMIN', 'OPERATOR'];
const ADMIN = ['ADMIN'];

const ownTicketView = (ticket) => {
  const { ownerKeyHash, servedBy, ...rest } = ticket;
  return rest;
};

const mergeProvider = (current = {}, incoming = {}, extraBooleans = []) => {
  const next = { ...current };
  if (typeof incoming.enabled === 'boolean') next.enabled = incoming.enabled;
  if (typeof incoming.clientId === 'string') next.clientId = cleanText(incoming.clientId, 512);
  // Secrets are write-only: an empty value means "keep the stored secret".
  if (typeof incoming.clientSecret === 'string' && incoming.clientSecret.trim()) next.clientSecret = incoming.clientSecret.trim().slice(0, 1024);
  if (typeof incoming.autoProvision === 'boolean') next.autoProvision = incoming.autoProvision;
  if (incoming.defaultRole !== undefined) next.defaultRole = incoming.defaultRole === 'ADMIN' ? 'ADMIN' : 'OPERATOR';
  extraBooleans.forEach((key) => {
    if (typeof incoming[key] === 'boolean') next[key] = incoming[key];
  });
  return next;
};

/**
 * Registers every socket event. Events that change data answer through the
 * acknowledgement callback with { ok: true, ... } or { ok: false, error }.
 */
export const registerSocketHandlers = (socket, ctx) => {
  const { queue, addLog } = ctx;
  const state = () => ctx.state;
  const actor = () => ctx.actorLabel(socket);

  // on(event, roles, handler): roles=null means anyone may send it.
  const on = (event, roles, handler) => {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (roles && !ctx.requireRole(socket, roles)) {
        addLog(`Avvist ${event} fra ${actor()} (mangler rolle)`, 'ALERT');
        reply({ ok: false, error: socket.data.mustChangePassword ? 'password_change_required' : 'unauthorized' });
        return;
      }
      try {
        const result = await handler(payload && typeof payload === 'object' ? payload : {});
        reply(result ?? { ok: true });
      } catch (err) {
        addLog(`Feil i ${event}: ${err?.message || err}`, 'ALERT');
        reply({ ok: false, error: 'server_error' });
      }
    });
  };

  const saveAndBroadcast = () => {
    queue.syncCounters();
    ctx.save();
    ctx.broadcastState();
  };

  // ---------------------------------------------------------------- tickets

  on('add-ticket', null, async ({ serviceId, language, origin }) => {
    ctx.refreshSocket(socket);
    const role = socket.data.authRole;
    if (role === 'PUBLIC') {
      const { publicTicketsBySocket, publicTicketsByIp } = ctx.limits;
      if (!publicTicketsBySocket.hit(socket.id) || !publicTicketsByIp.hit(socket.data.ip)) {
        addLog(`Billett avvist for ${socket.data.ip}: for mange billetter på kort tid`, 'ALERT');
        return { ok: false, error: 'rate_limited' };
      }
    }
    const source = socket.data.kioskId ? 'kiosk' : (role === 'ADMIN' || role === 'OPERATOR' ? 'staff' : 'mobile');
    const result = queue.addTicket({ serviceId: typeof serviceId === 'string' ? serviceId : '', source });
    if (!result.ok) {
      if (result.error !== 'closed') addLog(`Billett avvist (${result.error})`, 'ALERT');
      return result;
    }

    const { ticket, ownerKey, service } = result;
    const base = state().settings?.publicUrl || (isHttpUrl(origin) ? String(origin).replace(/\/+$/, '') : '');
    const trackUrl = base ? `${base}/#/ticket/${ticket.id}?k=${ownerKey}` : '';
    const kioskId = socket.data.kioskId;
    let printing = false;
    if (kioskId) {
      // Only an activated kiosk device can make the server print, and only on its own printer.
      // Printing runs in the background so the kiosk shows the number right away.
      printing = ctx.kioskHasPrinter(kioskId);
      ctx.printForKiosk(kioskId, ticket, service, { language: language === 'en' ? 'en' : 'no', qrUrl: trackUrl });
    }
    return { ok: true, ticket: ownTicketView(ticket), ownerKey, printing };
  });

  on('ticket:cancel-own', null, ({ ticketId, key }) => queue.cancelOwn(ticketId, key));

  on('ticket:call-next', STAFF, ({ counterId }) => queue.callNext(counterId, socket.data.userId));
  on('ticket:call', STAFF, ({ ticketId, counterId }) => queue.callTicket(ticketId, counterId, socket.data.userId));
  on('ticket:recall', STAFF, ({ counterId }) => queue.recall(counterId));
  on('ticket:complete', STAFF, ({ counterId }) => queue.complete(counterId));
  on('ticket:no-show', STAFF, ({ counterId }) => queue.noShow(counterId));
  on('ticket:requeue', STAFF, ({ counterId }) => queue.requeue(counterId));
  on('ticket:transfer', STAFF, ({ counterId, serviceId }) => queue.transfer(counterId, serviceId));
  on('ticket:cancel', STAFF, ({ ticketId }) => queue.cancel(ticketId, actor()));

  on('reset-system', ADMIN, () => {
    queue.reset(`manuelt av ${actor()}`);
    return { ok: true };
  });

  // ---------------------------------------------------------------- services / counters

  on('service:save', ADMIN, ({ service }) => {
    const result = sanitizeService(service, state().services);
    if (result.error) return { ok: false, error: result.error };
    const idx = state().services.findIndex((s) => s.id === result.value.id);
    if (idx === -1) state().services.push(result.value);
    else state().services[idx] = result.value;
    addLog(`Tjeneste ${idx === -1 ? 'opprettet' : 'oppdatert'}: ${result.value.name} av ${actor()}`, 'ACTION');
    saveAndBroadcast();
    return { ok: true, service: result.value };
  });

  on('service:delete', ADMIN, ({ id }) => {
    const service = state().services.find((s) => s.id === id);
    if (!service) return { ok: false, error: 'unknown_service' };
    // Open tickets of the service are cancelled so they do not linger without a service.
    state().tickets
      .filter((t) => t.serviceId === id && (t.status === 'WAITING' || t.status === 'SERVING'))
      .forEach((t) => queue.cancel(t.id, actor()));
    state().services = state().services.filter((s) => s.id !== id);
    state().counters.forEach((c) => {
      c.activeServiceIds = (c.activeServiceIds || []).filter((sid) => sid !== id);
    });
    addLog(`Tjeneste slettet: ${service.name} av ${actor()}`, 'ACTION');
    saveAndBroadcast();
    return { ok: true };
  });

  on('counter:save', ADMIN, ({ counter }) => {
    const result = sanitizeCounter(counter, state().counters, state().services);
    if (result.error) return { ok: false, error: result.error };
    const idx = state().counters.findIndex((c) => c.id === result.value.id);
    if (idx === -1) state().counters.push(result.value);
    else state().counters[idx] = result.value;
    addLog(`Skranke ${idx === -1 ? 'opprettet' : 'oppdatert'}: ${result.value.name} av ${actor()}`, 'ACTION');
    saveAndBroadcast();
    return { ok: true, counter: result.value };
  });

  on('counter:delete', ADMIN, ({ id }) => {
    const counter = state().counters.find((c) => c.id === id);
    if (!counter) return { ok: false, error: 'unknown_counter' };
    // A ticket being served there goes back to the front of the queue.
    queue.requeue(id);
    state().counters = state().counters.filter((c) => c.id !== id);
    state().counterDisplays.forEach((d) => {
      if (d.counterId === id) d.counterId = undefined;
    });
    addLog(`Skranke slettet: ${counter.name} av ${actor()}`, 'ACTION');
    saveAndBroadcast();
    return { ok: true };
  });

  // ---------------------------------------------------------------- users

  on('user:save', ADMIN, ({ user }) => {
    const users = state().users;
    const result = sanitizeUser(user, users);
    if (result.error) return { ok: false, error: result.error };
    const next = result.value;
    const idx = users.findIndex((u) => u.id === next.id);
    const nextUsers = idx === -1 ? [...users, next] : users.map((u) => (u.id === next.id ? next : u));
    if (!nextUsers.some((u) => u.role === 'ADMIN')) return { ok: false, error: 'must_have_admin' };
    state().users = nextUsers;
    // Password or role changes sign the user out elsewhere (never the acting admin's own session).
    if (result.credentialsChanged) ctx.deleteUserSessions(next.id, socket.data.sessionKey);
    addLog(`Bruker ${idx === -1 ? 'opprettet' : 'oppdatert'}: ${next.username} (${next.role}) av ${actor()}`, 'ACTION');
    ctx.save();
    ctx.refreshAllSockets();
    ctx.broadcastState();
    return { ok: true, user: { id: next.id, username: next.username } };
  });

  on('user:delete', ADMIN, ({ id }) => {
    const users = state().users;
    const target = users.find((u) => u.id === id);
    if (!target) return { ok: false, error: 'unknown_user' };
    if (id === socket.data.userId) return { ok: false, error: 'cannot_delete_self' };
    if (target.role === 'ADMIN' && users.filter((u) => u.role === 'ADMIN').length <= 1) return { ok: false, error: 'must_have_admin' };
    state().users = users.filter((u) => u.id !== id);
    ctx.deleteUserSessions(id);
    addLog(`Bruker slettet: ${target.username} av ${actor()}`, 'ACTION');
    ctx.save();
    ctx.refreshAllSockets();
    ctx.broadcastState();
    return { ok: true };
  });

  // ---------------------------------------------------------------- printers

  on('printer:save', ADMIN, ({ printer }) => {
    const result = sanitizePrinter(printer, state().printers);
    if (result.error) return { ok: false, error: result.error };
    const idx = state().printers.findIndex((p) => p.id === result.value.id);
    if (idx === -1) state().printers.push(result.value);
    else state().printers[idx] = result.value;
    addLog(`Skriver ${idx === -1 ? 'lagt til' : 'oppdatert'}: ${result.value.name} (${result.value.ipAddress}:${result.value.port}) av ${actor()}`, 'ACTION');
    ctx.save();
    ctx.broadcastStaffState();
    ctx.checkPrinters().catch(() => {});
    return { ok: true, printer: result.value };
  });

  on('printer:delete', ADMIN, ({ id }) => {
    const printer = state().printers.find((p) => p.id === id);
    if (!printer) return { ok: false, error: 'unknown_printer' };
    state().printers = state().printers.filter((p) => p.id !== id);
    Object.keys(state().kioskPrinterAssignments).forEach((kioskId) => {
      if (state().kioskPrinterAssignments[kioskId] === id) delete state().kioskPrinterAssignments[kioskId];
    });
    state().kiosks.forEach((k) => {
      if (k.assignedPrinterId === id) k.assignedPrinterId = undefined;
    });
    addLog(`Skriver fjernet: ${printer.name} av ${actor()}`, 'ACTION');
    ctx.save();
    ctx.broadcastStaffState();
    return { ok: true };
  });

  on('printer:test', ADMIN, async ({ id }) => {
    const printer = state().printers.find((p) => p.id === id);
    if (!printer) return { ok: false, error: 'unknown_printer' };
    const result = await printTicket({
      printer,
      ticket: { number: 'TEST' },
      serviceName: 'Testutskrift / Test print',
      language: 'no',
      brandText: state().branding?.brandText,
      brandLogoUrl: state().branding?.brandLogoData || state().branding?.brandLogoUrl,
      footer: state().branding?.ticketFooter,
      log: addLog,
    });
    return result.ok ? { ok: true, method: result.method } : { ok: false, error: result.error || 'print_failed' };
  });

  // ---------------------------------------------------------------- settings

  on('update-settings', ADMIN, (next) => {
    const changes = [];
    const fail = (error) => {
      addLog(`Innstillinger avvist for ${actor()}: ${error}`, 'ALERT');
      socket.emit('settings-error', { error });
      return { ok: false, error };
    };

    // Validate everything before applying anything, so a bad field cannot leave a half-applied update.
    let settings = null;
    if (next.settings) {
      const result = sanitizeSettings(next.settings, state().settings);
      if (result.error) return fail(result.error);
      settings = result.value;
    }
    let pinHash = null;
    if (Object.prototype.hasOwnProperty.call(next, 'kioskExitPin')) {
      const pin = typeof next.kioskExitPin === 'string' ? next.kioskExitPin.trim() : '';
      if (pin && !/^\d{4,12}$/.test(pin)) return fail('invalid_pin');
      pinHash = pin ? hashPassword(pin) : '';
    }
    const branding = next.branding && typeof next.branding === 'object' ? next.branding : null;
    if (branding) {
      if (branding.brandLogoUrl !== undefined && branding.brandLogoUrl !== '' && !isHttpUrl(branding.brandLogoUrl)) return fail('invalid_logo');
      if (branding.primaryColor !== undefined && branding.primaryColor !== '' && !isHexColor(branding.primaryColor)) return fail('invalid_color');
    }
    const issuer = next.authProviders?.oidc?.issuerUrl;
    if (typeof issuer === 'string' && issuer.trim() && !isHttpUrl(issuer.trim())) return fail('invalid_issuer_url');

    if (next.isClosed !== undefined) {
      state().isClosed = !!next.isClosed;
      changes.push(state().isClosed ? 'stengt' : 'åpnet');
    }
    if (next.soundSettings && typeof next.soundSettings === 'object') {
      const sound = { ...state().soundSettings };
      SOUND_KEYS.forEach((key) => {
        if (typeof next.soundSettings[key] === 'boolean') sound[key] = next.soundSettings[key];
      });
      state().soundSettings = sound;
    }
    if (next.publicMessage !== undefined) state().publicMessage = String(next.publicMessage || '').slice(0, 500);
    if (branding) {
      const current = { ...state().branding };
      if (typeof branding.brandText === 'string') current.brandText = branding.brandText.slice(0, 60);
      if (typeof branding.ticketFooter === 'string') current.ticketFooter = cleanText(branding.ticketFooter, 120);
      if (typeof branding.primaryColor === 'string') current.primaryColor = branding.primaryColor;
      if (typeof branding.brandLogoUrl === 'string') {
        // An external logo URL replaces an uploaded logo (and '' removes it).
        current.brandLogoUrl = branding.brandLogoUrl;
        if (branding.brandLogoUrl) {
          current.brandLogoData = undefined;
          current.logoVersion = undefined;
        }
      }
      state().branding = current;
      changes.push('merkevare');
    }
    if (settings) {
      state().settings = settings;
      changes.push('innstillinger');
    }
    if (pinHash !== null) {
      state().kioskExitPinHash = pinHash;
      changes.push('kiosk-pin');
    }
    if (next.authProviders && typeof next.authProviders === 'object') {
      const providers = state().authProviders;
      const before = JSON.stringify(providers);
      const incomingGoogle = next.authProviders.google && typeof next.authProviders.google === 'object' ? next.authProviders.google : {};
      const google = mergeProvider(providers.google, incomingGoogle);
      if (Array.isArray(incomingGoogle.allowedDomains)) {
        google.allowedDomains = incomingGoogle.allowedDomains
          .filter((d) => typeof d === 'string' && d.trim().length > 0)
          .map((d) => d.trim().toLowerCase().slice(0, 253));
      }
      const incomingOidc = next.authProviders.oidc && typeof next.authProviders.oidc === 'object' ? next.authProviders.oidc : {};
      const oidc = mergeProvider(providers.oidc, incomingOidc, ['requireVerifiedEmail']);
      if (typeof incomingOidc.issuerUrl === 'string') oidc.issuerUrl = incomingOidc.issuerUrl.trim();
      state().authProviders = { ...providers, google, oidc };
      if (JSON.stringify(state().authProviders) !== before) {
        ctx.reinitPassport();
        changes.push('innloggingsmetoder');
      }
    }

    ctx.save();
    ctx.broadcastState();
    addLog(`Innstillinger oppdatert av ${actor()}${changes.length ? ` (${changes.join(', ')})` : ''}`, 'ACTION');
    return { ok: true };
  });

  // ---------------------------------------------------------------- kiosk devices

  // An admin turns the current browser into a kiosk. The kiosk gets its own device token,
  // so no admin session has to stay on a public device.
  on('activate-kiosk', ADMIN, ({ kioskId: requested, name: requestedName }) => {
    const kioskId = typeof requested === 'string' && /^kiosk_[a-z0-9]{4,32}$/.test(requested) ? requested : `kiosk_${randomId()}`;
    const name = cleanText(requestedName, 80) || `Kiosk ${kioskId.slice(-4).toUpperCase()}`;
    ctx.revokeKioskDevices(kioskId);
    const deviceToken = generateToken(32);
    state().devices[hashToken(deviceToken)] = { kioskId, name, createdAt: Date.now(), createdBy: socket.data.userId };
    if (!state().kiosks.some((k) => k.id === kioskId)) {
      state().kiosks.push({ id: kioskId, name, lastSeen: 0, assignedPrinterId: state().kioskPrinterAssignments[kioskId] });
    }
    ctx.save();
    ctx.broadcastStaffState();
    addLog(`Kiosk ${name} (${kioskId}) aktivert av ${actor()}`, 'ACTION');
    return { ok: true, deviceToken, kioskId };
  });

  on('register-kiosk', null, () => {
    ctx.refreshSocket(socket);
    const kioskId = socket.data.kioskId;
    if (!kioskId) return { ok: false, error: 'not_a_kiosk' };
    const device = ctx.getDevice(socket.data.deviceToken);
    const name = device?.name || `Kiosk ${kioskId.slice(-4).toUpperCase()}`;
    const existing = state().kiosks.find((k) => k.id === kioskId);
    if (existing) {
      existing.name = name;
      existing.assignedPrinterId = existing.assignedPrinterId || state().kioskPrinterAssignments[kioskId];
      existing.lastSeen = Date.now();
    } else {
      if (state().kiosks.length >= MAX_KIOSKS) return { ok: false, error: 'too_many_kiosks' };
      state().kiosks.push({ id: kioskId, name, lastSeen: Date.now(), assignedPrinterId: state().kioskPrinterAssignments[kioskId] });
      addLog(`Kiosk online: ${name}`, 'INFO');
    }
    // Heartbeats are not persisted to save IO; only staff see kiosk status.
    ctx.broadcastStaffState();
    return { ok: true };
  });

  on('verify-kiosk-pin', null, ({ pin }) => {
    ctx.refreshSocket(socket);
    const kioskId = socket.data.kioskId;
    if (!kioskId) return { ok: false, error: 'not_a_kiosk' };
    if (!ctx.limits.kioskPinAttempts.hit(kioskId)) {
      addLog(`For mange PIN-forsøk på kiosk ${kioskId}`, 'ALERT');
      return { ok: false, error: 'rate_limited' };
    }
    const value = typeof pin === 'string' ? pin.trim() : '';
    if (!state().kioskExitPinHash || !verifyPassword(value, state().kioskExitPinHash)) {
      addLog(`Feil PIN ved avslutning av kiosk ${kioskId}`, 'ALERT');
      return { ok: false, error: state().kioskExitPinHash ? 'invalid_pin' : 'pin_not_set' };
    }
    ctx.limits.kioskPinAttempts.reset(kioskId);
    // Leaving kiosk mode deactivates the device; an admin has to activate it again.
    ctx.revokeKioskDevices(kioskId);
    state().kiosks = state().kiosks.filter((k) => k.id !== kioskId);
    ctx.save();
    addLog(`Kiosk ${kioskId} avsluttet med PIN`, 'ACTION');
    setImmediate(() => {
      ctx.refreshAllSockets();
      ctx.broadcastStaffState();
    });
    return { ok: true };
  });

  on('delete-kiosk', ADMIN, ({ kioskId }) => {
    const before = state().kiosks.length;
    state().kiosks = state().kiosks.filter((k) => k.id !== kioskId);
    const revoked = ctx.revokeKioskDevices(kioskId);
    if (state().kiosks.length === before && revoked === 0) return { ok: false, error: 'unknown_kiosk' };
    addLog(`Kiosk fjernet: ${kioskId} av ${actor()}${revoked ? ' (enheten er deaktivert)' : ''}`, 'ACTION');
    ctx.save();
    ctx.refreshAllSockets();
    ctx.broadcastStaffState();
    return { ok: true };
  });

  on('assign-printer', ADMIN, ({ kioskId, printerId }) => {
    if (!isSafeId(kioskId)) return { ok: false, error: 'unknown_kiosk' };
    if (printerId && !state().printers.some((p) => p.id === printerId)) return { ok: false, error: 'unknown_printer' };
    if (printerId) state().kioskPrinterAssignments[kioskId] = printerId;
    else delete state().kioskPrinterAssignments[kioskId];
    const kiosk = state().kiosks.find((k) => k.id === kioskId);
    if (kiosk) kiosk.assignedPrinterId = printerId || undefined;
    ctx.save();
    addLog(`Skriver ${printerId || 'ingen'} tilordnet kiosk ${kioskId} av ${actor()}`, 'ACTION');
    ctx.broadcastStaffState();
    return { ok: true };
  });

  // ---------------------------------------------------------------- counter displays

  on('register-counter-display', null, ({ id, name, counterId }) => {
    if (!isSafeId(id)) return { ok: false, error: 'invalid_display' };
    const displayName = cleanText(name, 80);
    if (!displayName) return { ok: false, error: 'invalid_display' };
    const existing = state().counterDisplays.find((d) => d.id === id);
    const now = Date.now();
    if (existing) {
      // Heartbeat: assignment and message are controlled from the admin panel only.
      existing.name = displayName;
      existing.lastSeen = now;
      ctx.broadcastStaffState();
      return { ok: true };
    }
    if (state().counterDisplays.length >= MAX_COUNTER_DISPLAYS || !ctx.limits.counterDisplayRegistrations.hit(socket.data.ip)) {
      addLog(`Ny skrankeskjerm avvist fra ${socket.data.ip} (grense nådd)`, 'ALERT');
      return { ok: false, error: 'rate_limited' };
    }
    const validCounterId = typeof counterId === 'string' && state().counters.some((c) => c.id === counterId) ? counterId : undefined;
    state().counterDisplays.push({ id, name: displayName, counterId: validCounterId, message: '', lastSeen: now });
    addLog(`Ny skrankeskjerm: ${displayName}`, 'INFO');
    ctx.save();
    ctx.broadcastState();
    return { ok: true };
  });

  on('assign-counter-display', ADMIN, ({ displayId, counterId }) => {
    const display = state().counterDisplays.find((d) => d.id === displayId);
    if (!display) return { ok: false, error: 'unknown_display' };
    display.counterId = typeof counterId === 'string' && state().counters.some((c) => c.id === counterId) ? counterId : undefined;
    ctx.save();
    addLog(`Skrankeskjerm ${displayId} koblet til skranke ${display.counterId || 'ingen'} av ${actor()}`, 'ACTION');
    ctx.broadcastState();
    return { ok: true };
  });

  on('set-counter-display-message', ADMIN, ({ displayId, message }) => {
    const display = state().counterDisplays.find((d) => d.id === displayId);
    if (!display) return { ok: false, error: 'unknown_display' };
    display.message = typeof message === 'string' ? message.slice(0, 300) : '';
    ctx.save();
    addLog(`Oppdatert melding for skrankeskjerm ${displayId} av ${actor()}`, 'ACTION');
    ctx.broadcastState();
    return { ok: true };
  });

  on('delete-counter-display', ADMIN, ({ displayId }) => {
    const before = state().counterDisplays.length;
    state().counterDisplays = state().counterDisplays.filter((d) => d.id !== displayId);
    if (state().counterDisplays.length === before) return { ok: false, error: 'unknown_display' };
    addLog(`Skrankeskjerm fjernet: ${displayId} av ${actor()}`, 'ACTION');
    ctx.save();
    ctx.broadcastState();
    return { ok: true };
  });
};
