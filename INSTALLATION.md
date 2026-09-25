# Installation Guide – Q-Flow Pro

This guide covers installing, updating and running Q-Flow Pro on a Linux server – for example a Debian LXC on Proxmox.

1. [Requirements](#requirements)
2. [Option A: install script (recommended)](#option-a-install-script-recommended)
3. [Option B: manual installation](#option-b-manual-installation)
4. [First sign-in and setup](#first-sign-in-and-setup)
5. [Updating](#updating)
6. [Upgrading from an older version](#upgrading-from-an-older-version)
7. [Backups and restore](#backups-and-restore)
8. [Reverse proxy / HTTPS](#reverse-proxy--https)
9. [Docker](#docker)
10. [Troubleshooting](#troubleshooting)
11. [Testing checklist](#testing-checklist)

## Requirements

- Debian 12/13 or Ubuntu 22.04+ (container or VM). 1 CPU and 512 MB RAM are enough.
- **Node.js 20.9 or newer (22 LTS recommended)**. Debian 12's own `nodejs` package (18.x) is too old; the install script installs Node 22 from NodeSource.
- Network access from kiosks, displays and phones to the server port (default 3000).
- Optional: network receipt printers (Epson ESC/POS on port 9100).

## Option A: install script (recommended)

As root on the server:

```bash
curl -fsSL https://raw.githubusercontent.com/matskkolstad/Q-Flow-Pro/main/scripts/install-lxc.sh | bash
```

or from a checkout:

```bash
git clone https://github.com/matskkolstad/Q-Flow-Pro.git /opt/Q-Flow-Pro
bash /opt/Q-Flow-Pro/scripts/install-lxc.sh
```

The script:
- installs git, build tools and Node.js 22 (if needed),
- clones/updates the code in `/opt/Q-Flow-Pro` and builds it,
- creates the system user `qflow` and the data directory `/var/lib/qflow`,
- writes `/opt/Q-Flow-Pro/.env` with a random `SESSION_SECRET` and your time zone (an existing `.env` is kept),
- installs and starts the systemd service `qflow`,
- prints the address and the first admin password.

Options (environment variables): `INSTALL_DIR`, `DATA_DIR`, `BRANCH`, `PORT`, `ADMIN_PASSWORD`, `REPO_URL`. Example:

```bash
BRANCH=main PORT=8080 ADMIN_PASSWORD='My-Strong-Pass1' bash scripts/install-lxc.sh
```

## Option B: manual installation

```bash
# 1. Node.js 22 (skip if `node -v` already shows v20.9+)
apt update && apt install -y curl ca-certificates git build-essential python3
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 2. Code and build
git clone https://github.com/matskkolstad/Q-Flow-Pro.git /opt/Q-Flow-Pro
cd /opt/Q-Flow-Pro
npm ci --include=dev
npm run build

# 3. Service user and data directory
useradd --system --home /var/lib/qflow --shell /usr/sbin/nologin qflow
mkdir -p /var/lib/qflow && chown -R qflow:qflow /var/lib/qflow

# 4. Configuration
cp .env.example .env
nano .env          # at least: SESSION_SECRET, TZ, QFLOW_DATA_DIR=/var/lib/qflow
chmod 600 .env

# 5. systemd
cp systemd/qflow.service /etc/systemd/system/qflow.service
systemctl daemon-reload
systemctl enable --now qflow
systemctl status qflow
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

The server does **not** read `.env` by itself; systemd loads it (`EnvironmentFile`). To run it by hand for testing: `node --env-file=.env server.js`.

### Important `.env` settings

| Setting | Recommendation |
|---|---|
| `TZ` | Your time zone, e.g. `Europe/Oslo` – opening hours, the nightly reset and statistics use it |
| `QFLOW_DATA_DIR` | `/var/lib/qflow` (must be writable by the `qflow` user) |
| `SESSION_SECRET` | A long random value |
| `HOST` | `0.0.0.0` listens on all addresses. If you set a specific IP, the server does not answer on `localhost` |
| `ALLOWED_ORIGINS` | Only needed if another site or the Vite dev server calls the API; pages served by Q-Flow always work |
| `TRUST_PROXY` | Leave empty for no proxy or a proxy on your LAN; set the proxy address if it is on a public IP |
| `QFLOW_ADMIN_PASSWORD` | Optional password for the first admin (fresh installs only) |

## First sign-in and setup

1. Open `http://<server-ip>:3000` and sign in as `admin`.
   - Password: `QFLOW_ADMIN_PASSWORD`, or the generated one: `journalctl -u qflow | grep -A2 "first admin"`.
   - A generated password must be changed right away.
2. **Settings → Design**: name, logo, main colour, ticket footer.
3. **Settings → Services** and **Counters**: what customers can choose and which counter handles what.
4. **Settings → Users**: create operator accounts.
5. **Settings → Opening hours & jobs**: opening hours (optional), nightly reset, nightly backup.
6. **Settings → Devices**:
   - Add network printers (IP + port 9100) and use *Test print*.
   - Set a **kiosk PIN**.
   - On each kiosk device: open `/#/kiosk`, sign in as admin, press **Activate kiosk** (you are signed out; the device keeps its own access). Then assign a printer to it here.
   - On each counter screen: open `/#/counter-display` and assign it to a counter here.
7. Open `/#/display` on the TV and tap once to allow sound.

A Norwegian step-by-step guide for daily use: [docs/brukerveiledning.md](docs/brukerveiledning.md).

## Updating

```bash
bash /opt/Q-Flow-Pro/scripts/update.sh
```

It pulls the latest code for the current branch (or `BRANCH=...`), installs dependencies, builds while the old version keeps running, copies the database to `backups/qflow-pre-update-*.db`, updates the systemd unit if needed and restarts the service.

Manual equivalent:

```bash
cd /opt/Q-Flow-Pro
git pull
npm ci --include=dev && npm run build
systemctl restart qflow
```

## Upgrading from an older version

The first start of a new version migrates the data automatically:

- **Everyone is signed out once** (old session tokens were exposed by versions before the security update).
- Accounts that still use a default password (`Admin123!`, `Operator123!`, their username, `Changeme1`) must change it.
- **Kiosks must be activated once** by an admin on each device (`/#/kiosk` → *Activate kiosk*). The kiosk PIN is kept.
- Finished tickets already in the database are copied into the statistics, and numbering continues where it was.
- Data that was stored next to the code (`/opt/Q-Flow-Pro/data`) is moved to `/var/lib/qflow` by the install script. If you install by hand, copy it yourself:
  `cp -a /opt/Q-Flow-Pro/data/. /var/lib/qflow/ && chown -R qflow:qflow /var/lib/qflow`

Take a copy of the data directory before upgrading: `cp -a /var/lib/qflow /root/qflow-backup-$(date +%F)`.

## Backups and restore

- Automatic: every night at the time set under *Settings → Opening hours & jobs* (default 02:30). The newest `BACKUP_KEEP` (14) are kept, and none older than `BACKUP_RETENTION_DAYS` (30).
- Manual: *Settings → Backups → Create backup*.
- Download a backup there to keep a copy elsewhere (recommended).
- **Restore**: *Settings → Backups → Restore*. The current data is saved first (`qflow-pre-restore-*.db`); signed-in users stay signed in.
- **Move to another server**: download a backup, install Q-Flow on the new server, *Upload backup*, then *Restore*.
- From the shell (service stopped): `cp /var/lib/qflow/backups/<file>.db /var/lib/qflow/qflow.db && chown qflow:qflow /var/lib/qflow/qflow.db`.

## Reverse proxy / HTTPS

Put Q-Flow behind a reverse proxy (Nginx Proxy Manager, Caddy, nginx, Traefik) when it is reachable from the internet. WebSockets must be allowed.

nginx example:

```nginx
server {
  server_name queue.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Then set in `.env`:
- `TRUST_PROXY=` empty if the proxy runs on the same host or on a private network; otherwise the proxy's address.
- In the admin panel, *Settings → Design → Public address*: `https://queue.example.com` (used for QR codes).
- For Google/OIDC: `GOOGLE_CALLBACK_URL` / `OIDC_CALLBACK_URL` with the public address.

## Docker

```bash
docker compose up -d
docker compose logs qflow    # first admin password on a fresh install
```

Data is stored in `./data` on the host. Settings are passed as environment variables in `docker-compose.yml` or an `.env` file next to it.

## Troubleshooting

| Problem | Solution |
|---|---|
| `systemctl status qflow` shows *failed* | `journalctl -u qflow -n 50 --no-pager` shows the error |
| `EADDRINUSE` | Something else uses the port (an old `npm start`?) |
| `EACCES` / permission denied | `chown -R qflow:qflow /var/lib/qflow` |
| Errors about `sharp` or `better-sqlite3` | Node is too old, or rerun `npm ci --include=dev` |
| `curl http://localhost:3000` fails but the browser works | `HOST` is set to a specific IP; use that IP or `HOST=0.0.0.0` |
| Opening hours / nightly reset at the wrong time | Set `TZ=Europe/Oslo` (or your zone) in `.env` and restart |
| No sound on the display | Tap the screen once (browser rule); check *Settings → General → Sound* |
| Kiosk shows “not a kiosk” | Activate it: sign in as admin on the device and open `/#/kiosk` |
| Everyone locked out | Stop the service and use the [user CLI](docs/cli.en.md): `sudo -u qflow QFLOW_DATA_DIR=/var/lib/qflow node scripts/user-cli.js update --username admin --password 'New-Pass1'` |

## Testing checklist

After installing or updating:

1. `curl http://<host>:<port>/health` returns `{"status":"ok",...}`.
2. Sign in as admin; the forced password change appears for a generated password.
3. Draw a ticket on `/#/mobile/new`; it appears in the operator panel and on `/#/display`.
4. *Call next* in the operator panel: the display highlights the number and plays the chime/voice (after a tap).
5. *Complete*, *Did not show up*, *Back to queue* and *Transfer* work; the statistics page counts the finished tickets.
6. Activate a kiosk, draw a ticket, check printing (or the on-screen number + QR code), exit with the PIN.
7. *Settings → Backups*: create a backup and download it.
