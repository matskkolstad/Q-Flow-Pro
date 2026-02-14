import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type SupportedLanguage = 'en' | 'no';

type TranslationDict = Record<string, string>;
type Translations = Record<SupportedLanguage, TranslationDict>;

type I18nContextType = {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  translations: Translations;
};

const translations: Translations = {
  en: {
    'common.loading': 'Loading…',
    'common.logout': 'Log out',
    'common.notLoggedIn': 'Not signed in',
    'role.admin': 'Admin',
    'role.operator': 'Operator',
    'common.language.english': 'English',
    'common.language.norwegian': 'Norwegian',
    'common.language': 'Language',
    'common.save': 'Save',
    'admin.language.help': 'Choose interface language. Applies to this browser.',

    // Home
    'home.title': 'Welcome',
    'home.subtitle': 'Sign in to manage the queue. Public displays are available without login.',
    'home.card.login.title': 'Sign in',
    'home.card.login.desc': 'Access operator and admin tools.',
    'home.card.kiosk.title': 'Kiosk / Tickets',
    'home.card.kiosk.desc': 'Touch screen for drawing queue tickets.',
    'home.card.display.title': 'Public display',
    'home.card.display.desc': 'Shows the current queue status.',
    'home.card.admin.title': 'Operator / Admin',
    'home.card.admin.desc': 'Manage queues and call the next ticket.',
    'home.card.mobile.title': 'Mobile client',
    'home.card.mobile.desc': 'Simulate a user on mobile.',
    'home.card.counter.title': 'Counter display',
    'home.card.counter.desc': 'Screen above a counter for assigned numbers.',
    'home.footer': 'Built for efficient queue management.',

    // Kiosk
    'kiosk.printing': 'Printing…',
    'kiosk.printingTicket': 'Printing ticket…',
    'kiosk.noPrinter': 'No printer assigned to this kiosk',
    'kiosk.ticket.welcome': 'Welcome',
    'kiosk.ticket.yourNumber': 'Your number',
    'kiosk.ticket.estimated': 'Estimated time',
    'kiosk.ticket.ahead': 'Ahead in line',
    'kiosk.ticket.instructions': 'Bring the ticket and watch the screens.',
    'kiosk.ticket.done': 'Done',
    'kiosk.chooseService': 'Choose a service to draw a ticket',
    'kiosk.waitPrinting': 'Please wait a moment',
    'kiosk.service.estimated': 'Est. wait: {{minutes}} min',
    'kiosk.footer.id': 'Kiosk ID',
    'kiosk.closed.title': 'Closed',
    'kiosk.closed.subtitle': 'The queue system is closed right now. Please wait until we open again.',
    'kiosk.pin.title': 'Exit kiosk mode',
    'kiosk.pin.subtitle': 'Enter the PIN to exit kiosk mode.',
    'kiosk.pin.placeholder': 'PIN',
    'kiosk.pin.cancel': 'Cancel',
    'kiosk.pin.confirm': 'Confirm',
    'kiosk.pin.error': 'Incorrect PIN code',

    // Mobile
    'mobile.title': 'Draw ticket',
    'mobile.demo': 'Demo mobile view',
    'mobile.exit': 'Exit',
    'mobile.waitTime': '~{{minutes}} min wait',
    'mobile.closed.title': 'Closed',
    'mobile.closed.subtitle': 'The queue system is temporarily closed. Please wait until it opens again.',
    'mobile.ticket.yourTurn.title': 'It’s your turn!',
    'mobile.ticket.yourTurn.subtitle': 'Please go to the counter.',
    'mobile.ticket.yourNumber': 'Your ticket',
    'mobile.ticket.estimated': 'Est. wait',
    'mobile.ticket.ahead': 'Ahead in line',
    'mobile.ticket.notify': 'We will notify you when it is your turn.',

    // Public Display
    'display.nowServing': 'Now serving',
    'display.waitingList': 'Next in line',
    'display.waitingEmpty': 'No one in queue',
    'display.waitingForNext': 'Waiting for the next number…',
    'display.goTo': 'Go to',
    'display.qr.title': 'Draw digitally',
    'display.qr.subtitle': 'Scan the code to use your mobile',
    'display.closed.title': 'Closed',
    'display.closed.subtitle': 'The queue system is temporarily closed. Please wait until we open again.',

    // Counter Display
    'counter.title': 'Counter display',
    'counter.subtitle': 'Counter',
    'counter.assigned': 'Assigned counter',
    'counter.unassigned': 'Not assigned yet',
    'counter.online': 'Online',
    'counter.goTo': 'Go to {{counter}}',
    'counter.callingNow': 'Number is called now',
    'counter.waitingNext': 'Waiting for the next number…',
    'counter.waitingCount': '{{count}} in queue for this counter.',
    'counter.assignInAdmin': 'Assign counter in Admin to show numbers.',
    'counter.closed.system.title': 'Closed',
    'counter.closed.system.subtitle': 'The queue system is temporarily closed. Please wait.',
    'counter.closed.counter.title': 'Counter closed',
    'counter.closed.counter.subtitle': 'This counter is offline. Please use another counter or wait.',

    // Admin nav / header
    'admin.nav.dashboard': 'Overview',
    'admin.nav.logs': 'Logs',
    'admin.nav.settings': 'Settings',
    'admin.header.counter': 'Counter',
    'admin.header.noCounters': 'No counters',
    'admin.header.logout': 'Log out',

    // Admin dashboard
    'admin.dashboard.nowServing': 'Now serving',
    'admin.dashboard.callAgain': 'Call again',
    'admin.dashboard.complete': 'Complete case',
    'admin.dashboard.ready': 'Ready for next?',
    'admin.dashboard.waiting': 'There are {{count}} people waiting.',
    'admin.dashboard.callNext': 'Call next',
    'admin.dashboard.voiceCall': 'Number {{number}}, to {{counter}}',
    'admin.dashboard.stats.waiting': 'In queue',
    'admin.dashboard.stats.waitTime': 'Wait time',
    'admin.dashboard.stats.total': 'Total today',
    'admin.dashboard.stats.online': 'Online',
    'admin.queue.title': 'Queue overview',
    'admin.queue.empty': 'No waiting customers',
    'admin.queue.call': 'Call',
    'admin.queue.deleteTitle': 'Delete from queue',

    // Admin logs
    'admin.logs.title': 'System log',
    'admin.logs.export': 'Export CSV',
    'admin.logs.live': 'Live log (admin)',
    'admin.logs.liveDesc': 'Real-time monitoring of all events',
    'admin.logs.pause': 'Pause autoscroll',
    'admin.logs.follow': 'Follow live',
    'admin.logs.table.time': 'Time',
    'admin.logs.table.type': 'Type',
    'admin.logs.table.message': 'Message',
    'admin.logs.empty': 'No events yet.',
    'admin.logs.lines': '{{count}} lines',

    // Admin settings sidebar
    'admin.settings.title': 'Configuration',
    'admin.settings.general': 'General',
    'admin.settings.services': 'Services',
    'admin.settings.counters': 'Counters',
    'admin.settings.users': 'Users',
    'admin.settings.devices': 'Devices',

    // Admin general tab
    'admin.general.title': 'General settings',
    'admin.general.profile': 'Profile and logo',
    'admin.general.brandName': 'Name next to logo',
    'admin.general.noLogo': 'No logo',
    'admin.general.logoHelp': 'Shown on all screens',
    'admin.general.upload': 'Upload',
    'admin.general.remove': 'Remove',
    'admin.general.logoHint': 'Recommended: square logo, PNG/SVG, under 500 KB.',
    'admin.general.password.title': 'Change password',
    'admin.general.password.old': 'Old password',
    'admin.general.password.new': 'New password',
    'admin.general.password.update': 'Update password',
    'admin.general.password.saving': 'Saving...',
    'admin.general.password.saved': 'Saved',
    'admin.general.password.error': 'Could not save',
    'admin.general.sound.title': 'Sound',
    'admin.general.sound.kiosk': 'Kiosk sound effects',
    'admin.general.sound.kioskDesc': 'Play print sound on the kiosk.',
    'admin.general.sound.admin': 'Operator sound effects',
    'admin.general.sound.adminDesc': 'Alert sound in operator panel.',
    'admin.general.sound.call': 'Call chime',
    'admin.general.sound.callDesc': 'Play chime when calling numbers.',
    'admin.general.sound.voice': 'Voice announcements',
    'admin.general.sound.voiceDesc': 'Voice reads number and counter.',
    'admin.general.close.title': 'Open / Close queue system',
    'admin.general.close.desc': 'Closes all displays with a notice to users.',
    'admin.general.close.closed': 'System is closed',
    'admin.general.close.open': 'System is open',
    'admin.general.pin.title': 'Kiosk PIN',
    'admin.general.pin.desc': 'PIN required to exit kiosk mode (5 taps top right).',
    'admin.general.pin.placeholder': 'E.g. 1234',
    'admin.general.backup.title': 'Backups',
    'admin.general.backup.desc': 'Create and download database backups before big changes.',
    'admin.general.backup.create': 'Create backup',
    'admin.general.backup.refresh': 'Refresh list',
    'admin.general.backup.creating': 'Creating backup...',
    'admin.general.backup.working': 'Working...',
    'admin.general.backup.fetchError': 'Could not fetch backup list',
    'admin.general.backup.failed': 'Backup failed',
    'admin.general.backup.createdWithFile': 'Backup created: {{file}}',
    'admin.general.backup.created': 'Backup completed',
    'admin.general.backup.downloaded': 'Downloaded {{file}}',
    'admin.general.backup.downloadError': 'Could not download backup',
    'admin.general.backup.loading': 'Loading...',
    'admin.general.backup.none': 'No backups found yet.',
    'admin.general.backup.download': 'Download',
    'admin.general.reset.title': 'Reset system',
    'admin.general.reset.desc': 'This will delete all active tickets and reset the queue. This cannot be undone.',
    'admin.general.reset.button': 'Perform reset',
    'admin.general.marquee.label': 'Public display message',
    'admin.general.marquee.placeholder': 'E.g. Lunch break until 12:00...',
    'admin.general.marquee.help': 'This text scrolls across the public display to inform customers.',

    // Admin services
    'admin.services.title': 'Services',
    'admin.services.name': 'Name',
    'admin.services.prefix': 'Prefix',
    'admin.services.eta': 'Estimated time (min)',
    'admin.services.etaLabel': '{{minutes}} min estimated time',
    'admin.services.priority': 'Priority',
    'admin.services.color': 'Color',
    'admin.services.add': 'Add',
    'admin.services.prioHelp': 'Higher number = higher priority when calling.',
    'admin.services.open': 'Open',
    'admin.services.namePlaceholder': 'e.g. Sales',
    'admin.services.prefixPlaceholder': 'S',
    'admin.services.color.blue': 'Blue',
    'admin.services.color.red': 'Red',
    'admin.services.color.green': 'Green',
    'admin.services.color.purple': 'Purple',
    'admin.services.color.yellow': 'Yellow',
    'admin.services.color.pink': 'Pink',
    'admin.services.color.gray': 'Gray',

    // Admin counters
    'admin.counters.title': 'Counters',
    'admin.counters.placeholder': 'Counter name...',
    'admin.counters.create': 'Create counter',
    'admin.counters.handles': 'Handles services (Click to change):',
    'admin.counters.online': 'Online',
    'admin.counters.offline': 'Offline',

    // Admin users
    'admin.users.title': 'Users & Access',
    'admin.users.username': 'Username',
    'admin.users.name': 'Name',
    'admin.users.role': 'Role',
    'admin.users.password': 'Password',
    'admin.users.add': 'Add user',
    'admin.users.action': 'Action',
    'admin.users.save': 'Save',
    'admin.users.delete': 'Delete',
    'admin.users.usernamePlaceholder': 'e.g. anna',
    'admin.users.namePlaceholder': 'Display name',
    'admin.users.setPasswordPlaceholder': 'Set password',
    'admin.users.passwordPlaceholder': 'New password (optional)',
    'admin.users.cannotDeleteAdmin': 'There must always be at least one admin. You cannot delete the last admin.',
    'admin.users.cannotDemoteAdmin': 'There must be at least one admin. You cannot demote the last admin.',

    // Admin devices
    'admin.devices.title': 'Devices & Printing',
    'admin.devices.addPrinter': 'Add network printer',
    'admin.devices.printerName': 'Name',
    'admin.devices.printerIp': 'IP Address',
    'admin.devices.printerAdd': 'Add',
    'admin.devices.printerNamePlaceholder': 'Kiosk Printer 1',
    'admin.devices.printerIpPlaceholder': '192.168.1.100',
    'admin.devices.configuredPrinters': 'Configured printers',
    'admin.devices.noPrinters': 'No printers added.',
    'admin.devices.activeKiosks': 'Active kiosks',
    'admin.devices.noKiosks': 'No kiosks detected.',
    'admin.devices.lastSeen': 'Last seen',
    'admin.devices.removeKiosk': 'Remove kiosk',
    'admin.devices.assignedPrinter': 'Assigned printer',
    'admin.devices.noneSelected': 'No printer selected',
    'admin.devices.online': 'Online',
    'admin.devices.offline': 'Offline',
    'admin.devices.counterDisplays': 'Active counter displays',
    'admin.devices.noCounterDisplays': 'No counter displays detected.',
    'admin.devices.assignedCounter': 'Assigned counter',
    'admin.devices.notAssigned': 'Not assigned',
    'admin.devices.removeDisplay': 'Remove display',
    'admin.devices.assignHint': 'Changes are pushed immediately to the display.',
    'admin.devices.messageLabel': 'Message on this counter display',
    'admin.devices.messagePlaceholder': 'E.g. Lunch 11:30-12:00',
    'admin.devices.messageHelp': 'Shown at the bottom of this counter display.',
  },
  no: {
    'common.loading': 'Laster…',
    'common.logout': 'Logg ut',
    'common.notLoggedIn': 'Ikke innlogget',
    'role.admin': 'Admin',
    'role.operator': 'Operatør',
    'common.language.english': 'Engelsk',
    'common.language.norwegian': 'Norsk',
    'common.language': 'Språk',
    'common.save': 'Lagre',
    'admin.language.help': 'Velg grensesnittspråk. Gjelder for denne nettleseren.',

    // Home
    'home.title': 'Velkommen',
    'home.subtitle': 'Logg inn for å styre køen. Offentlige visninger er tilgjengelig uten innlogging.',
    'home.card.login.title': 'Logg inn',
    'home.card.login.desc': 'Få tilgang til operatør- og adminverktøy.',
    'home.card.kiosk.title': 'Kiosk / Trekking',
    'home.card.kiosk.desc': 'Touch-skjerm for å trekke kølapper.',
    'home.card.display.title': 'Storskjerm',
    'home.card.display.desc': 'Visning av nåværende køstatus.',
    'home.card.admin.title': 'Operatør / Admin',
    'home.card.admin.desc': 'Administrer køer og kall inn neste.',
    'home.card.mobile.title': 'Mobilbruker',
    'home.card.mobile.desc': 'Simuler en bruker på mobil.',
    'home.card.counter.title': 'Skrankeskjerm',
    'home.card.counter.desc': 'Skjerm over skranke for tildelt nummer.',
    'home.footer': 'Utviklet for effektiv køhåndtering.',

    // Kiosk
    'kiosk.printing': 'Skriver ut…',
    'kiosk.printingTicket': 'Skriver ut kølapp...',
    'kiosk.noPrinter': 'Ingen skriver tilordnet denne kiosken',
    'kiosk.ticket.welcome': 'Velkommen til oss',
    'kiosk.ticket.yourNumber': 'Ditt nummer',
    'kiosk.ticket.estimated': 'Estimert tid',
    'kiosk.ticket.ahead': 'Foran i kø',
    'kiosk.ticket.instructions': 'Ta med lappen og følg med på skjermene.',
    'kiosk.ticket.done': 'Ferdig',
    'kiosk.chooseService': 'Velg tjeneste for å trekke kølapp',
    'kiosk.waitPrinting': 'Vennligst vent et øyeblikk',
    'kiosk.service.estimated': 'Est. ventetid: {{minutes}} min',
    'kiosk.footer.id': 'Kiosk ID',
    'kiosk.closed.title': 'Stengt',
    'kiosk.closed.subtitle': 'Køsystemet er stengt akkurat nå. Vennligst vent til vi åpner igjen.',
    'kiosk.pin.title': 'Avslutt kioskmodus',
    'kiosk.pin.subtitle': 'Skriv inn PIN-koden for å avslutte kioskmodus.',
    'kiosk.pin.placeholder': 'PIN',
    'kiosk.pin.cancel': 'Avbryt',
    'kiosk.pin.confirm': 'Bekreft',
    'kiosk.pin.error': 'Feil PIN-kode',

    // Mobile
    'mobile.title': 'Trekk kølapp',
    'mobile.demo': 'Demo Mobilvisning',
    'mobile.exit': 'Avslutt',
    'mobile.waitTime': '~{{minutes}} min ventetid',
    'mobile.closed.title': 'Stengt',
    'mobile.closed.subtitle': 'Køsystemet er midlertidig stengt. Vennligst vent til det åpnes igjen.',
    'mobile.ticket.yourTurn.title': 'Det er din tur!',
    'mobile.ticket.yourTurn.subtitle': 'Vennligst gå til skranken.',
    'mobile.ticket.yourNumber': 'Ditt kønummer',
    'mobile.ticket.estimated': 'Est. ventetid',
    'mobile.ticket.ahead': 'Foran i kø',
    'mobile.ticket.notify': 'Vi varsler deg når det er din tur',

    // Public Display
    'display.nowServing': 'Nå betjenes',
    'display.waitingList': 'Neste i køen',
    'display.waitingEmpty': 'Ingen i køen',
    'display.waitingForNext': 'Venter på neste nummer...',
    'display.goTo': 'Gå til',
    'display.qr.title': 'Trekk digitalt',
    'display.qr.subtitle': 'Skann koden for å bruke mobilen',
    'display.closed.title': 'Stengt',
    'display.closed.subtitle': 'Køsystemet er midlertidig stengt. Vennligst vent til vi åpner igjen.',

    // Counter Display
    'counter.title': 'Skrankeskjerm',
    'counter.subtitle': 'Skranke',
    'counter.assigned': 'Tildelt skranke',
    'counter.unassigned': 'Ikke tildelt ennå',
    'counter.online': 'Online',
    'counter.goTo': 'Gå til {{counter}}',
    'counter.callingNow': 'Nummer kalles nå',
    'counter.waitingNext': 'Venter på neste nummer...',
    'counter.waitingCount': '{{count}} i kø for denne skranken.',
    'counter.assignInAdmin': 'Tildel skranke i Admin for å vise numre.',
    'counter.closed.system.title': 'Stengt',
    'counter.closed.system.subtitle': 'Køsystemet er midlertidig stengt. Vennligst vent.',
    'counter.closed.counter.title': 'Skranke stengt',
    'counter.closed.counter.subtitle': 'Denne skranken er offline. Vennligst bruk annen skranke eller vent.',

    // Admin nav / header
    'admin.nav.dashboard': 'Oversikt',
    'admin.nav.logs': 'Logg',
    'admin.nav.settings': 'Innstillinger',
    'admin.header.counter': 'Skranke',
    'admin.header.noCounters': 'Ingen skranker',
    'admin.header.logout': 'Logg ut',

    // Admin dashboard
    'admin.dashboard.nowServing': 'Nå betjenes',
    'admin.dashboard.callAgain': 'Kall igjen',
    'admin.dashboard.complete': 'Fullfør sak',
    'admin.dashboard.ready': 'Klar for neste?',
    'admin.dashboard.waiting': 'Det er totalt {{count}} personer som venter.',
    'admin.dashboard.callNext': 'Kall inn neste',
    'admin.dashboard.voiceCall': 'Nummer {{number}}, til {{counter}}',
    'admin.dashboard.stats.waiting': 'I kø',
    'admin.dashboard.stats.waitTime': 'Ventetid',
    'admin.dashboard.stats.total': 'Totalt i dag',
    'admin.dashboard.stats.online': 'Online',
    'admin.queue.title': 'Kø-oversikt',
    'admin.queue.empty': 'Ingen ventende kunder',
    'admin.queue.call': 'Hent',
    'admin.queue.deleteTitle': 'Slett fra kø',

    // Admin logs
    'admin.logs.title': 'Systemlogg',
    'admin.logs.export': 'Eksporter CSV',
    'admin.logs.live': 'Live logg (admin)',
    'admin.logs.liveDesc': 'Sanntidsovervåkning av alle hendelser',
    'admin.logs.pause': 'Pause autoscroll',
    'admin.logs.follow': 'Følg sanntid',
    'admin.logs.table.time': 'Tidspunkt',
    'admin.logs.table.type': 'Type',
    'admin.logs.table.message': 'Melding',
    'admin.logs.empty': 'Ingen hendelser ennå.',
    'admin.logs.lines': '{{count}} linjer',

    // Admin settings sidebar
    'admin.settings.title': 'Konfigurasjon',
    'admin.settings.general': 'Generelt',
    'admin.settings.services': 'Tjenester',
    'admin.settings.counters': 'Skranker',
    'admin.settings.users': 'Brukere',
    'admin.settings.devices': 'Enheter',

    // Admin general tab
    'admin.general.title': 'Generelle innstillinger',
    'admin.general.profile': 'Profil og logo',
    'admin.general.brandName': 'Navn ved logo',
    'admin.general.noLogo': 'Ingen logo',
    'admin.general.logoHelp': 'Vises på alle skjermer',
    'admin.general.upload': 'Last opp',
    'admin.general.remove': 'Fjern',
    'admin.general.logoHint': 'Anbefalt: kvadratisk logo, PNG/SVG, under 500 KB.',
    'admin.general.password.title': 'Bytt passord',
    'admin.general.password.old': 'Gammelt passord',
    'admin.general.password.new': 'Nytt passord',
    'admin.general.password.update': 'Oppdater passord',
    'admin.general.password.saving': 'Lagrer...',
    'admin.general.password.saved': 'Lagret',
    'admin.general.password.error': 'Kunne ikke lagre',
    'admin.general.sound.title': 'Lyd',
    'admin.general.sound.kiosk': 'Kiosk lydeffekter',
    'admin.general.sound.kioskDesc': 'Spill av utskriftslyd på kiosken.',
    'admin.general.sound.admin': 'Operatør lydeffekter',
    'admin.general.sound.adminDesc': 'Varsellyd i operatørpanelet.',
    'admin.general.sound.call': 'Kall-inn lyd',
    'admin.general.sound.callDesc': 'Spill av pling når nummer kalles.',
    'admin.general.sound.voice': 'Opplesning av nummer',
    'admin.general.sound.voiceDesc': 'Stemme som leser opp nummer og skranke.',
    'admin.general.close.title': 'Åpne / Steng køsystemet',
    'admin.general.close.desc': 'Stenger alle skjermer (storskjerm og skrankeskjermer) med beskjed til brukere.',
    'admin.general.close.closed': 'Systemet er stengt',
    'admin.general.close.open': 'Systemet er åpent',
    'admin.general.pin.title': 'Kiosk PIN',
    'admin.general.pin.desc': 'PIN-kode som må oppgis for å avslutte kioskmodus (5 trykk oppe til høyre).',
    'admin.general.pin.placeholder': 'F.eks. 1234',
    'admin.general.backup.title': 'Sikkerhetskopier',
    'admin.general.backup.desc': 'Opprett og last ned backup av databasen før større endringer.',
    'admin.general.backup.create': 'Opprett backup',
    'admin.general.backup.refresh': 'Oppdater liste',
    'admin.general.backup.creating': 'Oppretter backup...',
    'admin.general.backup.working': 'Jobber...',
    'admin.general.backup.fetchError': 'Kunne ikke hente backup-liste',
    'admin.general.backup.failed': 'Backup feilet',
    'admin.general.backup.createdWithFile': 'Backup laget: {{file}}',
    'admin.general.backup.created': 'Backup fullført',
    'admin.general.backup.downloaded': 'Lastet ned {{file}}',
    'admin.general.backup.downloadError': 'Kunne ikke laste ned backup',
    'admin.general.backup.loading': 'Laster...',
    'admin.general.backup.none': 'Ingen backups funnet ennå.',
    'admin.general.backup.download': 'Last ned',
    'admin.general.reset.title': 'Nullstill system',
    'admin.general.reset.desc': 'Dette vil slette alle aktive billetter og nullstille køen. Denne handlingen kan ikke angres.',
    'admin.general.reset.button': 'Utfør nullstilling',
    'admin.general.marquee.label': 'Melding på storskjerm',
    'admin.general.marquee.placeholder': 'F.eks. Vi har lunsjpause til 12:00...',
    'admin.general.marquee.help': 'Denne teksten vil rulle over bunnen på storskjermen for å informere kunder.',

    // Admin services
    'admin.services.title': 'Tjenester',
    'admin.services.name': 'Navn',
    'admin.services.prefix': 'Prefiks',
    'admin.services.eta': 'Estimert tid (min)',
    'admin.services.etaLabel': '{{minutes}} min estimert tid',
    'admin.services.priority': 'Prioritet',
    'admin.services.color': 'Farge',
    'admin.services.add': 'Legg til',
    'admin.services.prioHelp': 'Høyere tall = høyere prioritet ved innkalling.',
    'admin.services.open': 'Åpen',
    'admin.services.namePlaceholder': 'F.eks. Salg',
    'admin.services.prefixPlaceholder': 'S',
    'admin.services.color.blue': 'Blå',
    'admin.services.color.red': 'Rød',
    'admin.services.color.green': 'Grønn',
    'admin.services.color.purple': 'Lilla',
    'admin.services.color.yellow': 'Gul',
    'admin.services.color.pink': 'Rosa',
    'admin.services.color.gray': 'Grå',

    // Admin counters
    'admin.counters.title': 'Skranker',
    'admin.counters.placeholder': 'Navn på skranke...',
    'admin.counters.create': 'Opprett skranke',
    'admin.counters.handles': 'Håndterer tjenester (Klikk for å endre):',
    'admin.counters.online': 'Online',
    'admin.counters.offline': 'Offline',

    // Admin users
    'admin.users.title': 'Brukere & Tilgang',
    'admin.users.username': 'Brukernavn',
    'admin.users.name': 'Navn',
    'admin.users.role': 'Rolle',
    'admin.users.password': 'Passord',
    'admin.users.add': 'Legg til bruker',
    'admin.users.action': 'Handling',
    'admin.users.save': 'Lagre',
    'admin.users.delete': 'Slett',
    'admin.users.usernamePlaceholder': 'f.eks. anna',
    'admin.users.namePlaceholder': 'Visningsnavn',
    'admin.users.setPasswordPlaceholder': 'Sett passord',
    'admin.users.passwordPlaceholder': 'Nytt passord (valgfritt)',
    'admin.users.cannotDeleteAdmin': 'Det må alltid finnes minst én admin. Du kan ikke slette siste admin.',
    'admin.users.cannotDemoteAdmin': 'Det må være minst én admin. Du kan ikke nedgradere siste admin.',

    // Admin devices
    'admin.devices.title': 'Enheter & Utskrift',
    'admin.devices.addPrinter': 'Legg til nettverksskriver',
    'admin.devices.printerName': 'Navn',
    'admin.devices.printerIp': 'IP Adresse',
    'admin.devices.printerAdd': 'Legg til',
    'admin.devices.printerNamePlaceholder': 'Kiosk Printer 1',
    'admin.devices.printerIpPlaceholder': '192.168.1.100',
    'admin.devices.configuredPrinters': 'Konfigurerte skrivere',
    'admin.devices.noPrinters': 'Ingen skrivere lagt til.',
    'admin.devices.activeKiosks': 'Aktive kiosker',
    'admin.devices.noKiosks': 'Ingen kiosker oppdaget.',
    'admin.devices.lastSeen': 'Sist sett',
    'admin.devices.removeKiosk': 'Fjern kiosk',
    'admin.devices.assignedPrinter': 'Tildelt skriver',
    'admin.devices.noneSelected': 'Ingen skriver valgt',
    'admin.devices.online': 'Online',
    'admin.devices.offline': 'Offline',
    'admin.devices.counterDisplays': 'Aktive skrankeskjermer',
    'admin.devices.noCounterDisplays': 'Ingen skrankeskjermer oppdaget.',
    'admin.devices.assignedCounter': 'Tildelt skranke',
    'admin.devices.notAssigned': 'Ikke tildelt',
    'admin.devices.removeDisplay': 'Fjern skjerm',
    'admin.devices.assignHint': 'Endringen push-es umiddelbart til skjermen.',
    'admin.devices.messageLabel': 'Melding på denne skrankeskjermen',
    'admin.devices.messagePlaceholder': 'F.eks. Lunsj 11:30-12:00',
    'admin.devices.messageHelp': 'Vises nederst på denne skrankeskjermen.',
  },
};

const defaultLanguage = (): SupportedLanguage => {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('qflow_lang');
  if (stored === 'no' || stored === 'en') return stored;
  const navigatorLang = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
  if (navigatorLang.startsWith('no') || navigatorLang.startsWith('nb') || navigatorLang.startsWith('nn')) return 'no';
  return 'en';
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const format = (value: string, vars?: Record<string, string | number>) => {
  if (!vars) return value;
  return Object.keys(vars).reduce((acc, key) => acc.replace(new RegExp(`{{${key}}}`, 'g'), String(vars[key])), value);
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(defaultLanguage);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('qflow_lang', language);
  }, [language]);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const dict = translations[language] || translations.en;
    const fallback = translations.en[key] || key;
    return format(dict[key] ?? fallback, vars);
  }, [language]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang);
  }, []);

  const value = useMemo<I18nContextType>(() => ({ language, setLanguage, t, translations }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};
