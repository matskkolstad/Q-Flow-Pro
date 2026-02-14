<div align="center">
  <h1>Q-Flow Pro</h1>
  <p>Kø- og skrankesystem med sanntid, offentlige visninger, kiosk, skrankeskjermer og administrasjon.</p>
</div>

## Innhold
- [Funksjoner](#funksjoner)
- [Arkitektur](#arkitektur)
- [Krav](#krav)
- [Kjappstart (lokalt)](#kjappstart-lokalt)
- [Miljøvariabler](#miljøvariabler)
- [Bygg for produksjon](#bygg-for-produksjon)
- [Kjøre som systemd-tjeneste](#kjøre-som-systemd-tjeneste)
- [Docker / Compose](#docker--compose)
- [Testing](#testing)
- [Admin-funksjoner](#admin-funksjoner)
- [Tilpasning av branding](#tilpasning-av-branding)
- [Datastruktur og persistens](#datastruktur-og-persistens)

## Funksjoner
- Trekk kølapper via kiosk, mobilklient eller operatør.
- Sanntid via Socket.IO (køstatus, kall, meldinger).
- Offentlig display for “nå betjenes” og venteliste, samt skrankeskjerm for innkalling.
- Administrasjonspanel for tjenester, skranker, brukere, skrivere, meldinger, lyd og stenging.
- Sikkerhet: sessions med TTL, passordpolicy, helmet-headere, sanitiserte innstillinger, valgfri CSP.
- Backups av SQLite DB, loggrotasjon og helsesjekk-endepunkt.

## Arkitektur
- Frontend: React + Vite (TypeScript), kjører på samme server i produksjon (build til `dist`).
- Backend: Node.js + Express + Socket.IO, persistens i SQLite (`data/qflow.db`).
- State og logging håndteres på server; klienter mottar “init-state” + “state-update”.

## Krav
- Node.js 18+ (anbefalt LTS).
- NPM (følger med Node).
- SQLite (inkludert i runtime, ingen ekstra installasjon nødvendig).
- På server: systemd (valgfritt for drift) og tilgang til port 3000 (standard).

## Kjappstart (lokalt)
```sh
npm install
cp .env.example .env   # juster ved behov
npm run dev             # Vite dev (frontend) og API via proxy til 3000
```
- Dev-frontend kjører på http://localhost:5173. Backend på http://localhost:3000.
- Standard admin-brukere settes ved første oppstart (se `db.json` defaults: admin/Admin123!, operator/Operator123!). Bytt passord etter innlogging.

## Miljøvariabler
Se [.env.example](.env.example). Viktige nøkler:
- `HOST` / `PORT`: binding (default 0.0.0.0:3000).
- `ALLOWED_ORIGINS`: kommaseparerte URLer for CORS/WebSocket (legg til ditt domene ved drift).
- `ENABLE_CSP`: sett `1` når frontend er verifisert for Content Security Policy.
- `SESSION_TTL_HOURS`: levetid på session tokens.
- `LOG_RETENTION_DAYS`, `BACKUP_RETENTION_DAYS`: rotasjon av logg/backup.

## Bygg for produksjon
```sh
npm install
npm run build    # tsc + vite build → dist/
npm start        # node server.js (leser dist/ for statiske filer)
```
Serveren leser `ALLOWED_ORIGINS` for CORS/Socket.IO. Helse: `GET /health`.

## Kjøre som systemd-tjeneste
1. Kopier unit: `sudo cp systemd/qflow.service /etc/systemd/system/qflow.service`
2. Opprett miljø: `/etc/qflow/qflow.env` (se .env.example) og sikre rettigheter (640, eier qflow).
3. Lag bruker og eierskap (hvis ikke gjort): `sudo useradd --system --home /opt/qflow --shell /usr/sbin/nologin qflow` og `sudo chown -R qflow:qflow /opt/qflow /etc/qflow`.
4. Reload og start: `sudo systemctl daemon-reload && sudo systemctl enable --now qflow.service`
5. Status/logg: `systemctl status qflow.service` og `journalctl -u qflow.service -f`

Uniten kjører som bruker `qflow`, peker til `/opt/qflow`, laster `/etc/qflow/qflow.env`, restarter on-failure.

## Docker / Compose
Bygg image:
```sh
docker build -t qflow-pro .
```
Kjør med docker-compose (se `docker-compose.yml`):
```sh
docker-compose up -d
```
Eksponerer port 3000. Juster miljøvariabler i compose-fila eller `.env` som refereres der.

## Testing
- E2E med Playwright: `npm run test:e2e`
- Basis helsesjekk: `curl http://localhost:3000/health`

## Admin-funksjoner
- Logg inn på / (root) med admin-konto.
- Oppdater tjenester, skranker, brukere, skrivere, meldinger, lyd, stenging.
- Backup: POST `/api/admin/backup` (via UI eller direkte), liste `/api/admin/backups`, nedlasting `/api/admin/backup/:file`.

## Tilpasning av branding
- I Admin → Generelt: sett `brandText` og `brandLogoUrl` (base64/url). Tom `brandText` skjuler teksten.
- Logo-komponenten tillater egen logo + tekst; fallback er “Q-Flow Pro” hvis feltet er tomt/ikke satt.
- Tekstfarger styres av `textClass` der komponenten brukes; mørke bakgrunner bruker hvit tekst.

## Datastruktur og persistens
- SQLite DB i `data/qflow.db`; backups i `data/backups/`; logger i `data/logs/` (ignorert i git).
- Server state lastes fra DB ved oppstart og lagres ved endringer (innstillinger, billetter, brukere m.m.).
- Sessions lagres i state med TTL (konfigurerbar via `SESSION_TTL_HOURS`).

## Driftstips
- Sett `ALLOWED_ORIGINS` til faktiske domener før prod.
- Plasser bak en HTTPS reverse proxy (Nginx/Caddy) med TLS og ev. HSTS.
- Vurder å aktivere CSP (ENABLE_CSP=1) når alle assets er kompatible.
- Rotasjon av backups/logg er på plass; verifiser diskplass og ta offsite-kopi etter behov.
