# Security best practices

A checklist for running Q-Flow Pro in production. The security model is described in [SECURITY.md](../SECURITY.md).

> Q-Flow Pro is developed with AI assistance and comes without warranty. Test it for your own use and review the settings below before exposing it to the internet.

## Installation

- Install with `scripts/install-lxc.sh` or follow [INSTALLATION.md](../INSTALLATION.md): the service runs as the unprivileged `qflow` user, can only write to `/var/lib/qflow`, and `.env` is `chmod 600`.
- Set `SESSION_SECRET` to a long random value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Set `QFLOW_ADMIN_PASSWORD` or note the generated password in the log, and change it at the first sign-in.
- Keep Node.js on a supported LTS release (22) and update Q-Flow with `scripts/update.sh`.

## Network

- Keep Q-Flow on the internal network if you can. Kiosks, displays and staff usually do not need internet access to it.
- If it must be reachable from outside, put it behind a reverse proxy with HTTPS (Nginx Proxy Manager, Caddy, nginx, Traefik), and:
  - leave `ALLOWED_ORIGINS` at its default unless another site must call the API,
  - set `TRUST_PROXY` correctly: empty when the proxy runs on the same host or a private network, the proxy's address otherwise, `false` with no proxy. A wrong value lets clients fake their IP address and bypass rate limits,
  - consider `HOST=127.0.0.1` when the proxy runs on the same machine, so the port is not reachable directly.
- Firewall the port so only the proxy (or your LAN) reaches it, e.g. with the Proxmox firewall or `nftables`.
- `ENABLE_CSP=1` enables a Content-Security-Policy for the app. Test all screens after turning it on.

## Accounts

- Give people the **Operator** role unless they need to change settings.
- Create one account per person; do not share the admin account.
- Remove accounts for people who leave (*Settings → Users*). Deleting a user signs them out everywhere.
- Shorter sessions: `SESSION_TTL_HOURS=8`.
- With Google/OIDC: use *Allowed domains*, keep *Require verified e-mail* on, and use Operator as the default role for automatically created users.
- Locked out? Use the [user CLI](cli.en.md) with the service stopped.

## Devices

- Set a kiosk PIN (*Settings → Devices*). Activate kiosks with an admin account; the admin session is not kept on the device.
- Remove kiosks that are no longer in use; that revokes their device token.
- Put receipt printers on a network segment that the public cannot reach.

## Integrations (`/api/print-ticket`)

- Only set `API_KEYS` if you use an integration. Generate each key randomly and send it in the `X-API-Key` header.
- `ALLOWED_API_IPS` (comma-separated IPs or IPv4 CIDR ranges) limits `/api/print-ticket` and the backup endpoints to those addresses.

## Backups and monitoring

- Keep the nightly backup on (*Settings → Opening hours & jobs*) and download a copy regularly, or copy `/var/lib/qflow/backups` to another machine.
- Backups contain password hashes and settings. Store them as carefully as the server.
- Look at *Logs* in the admin panel or `journalctl -u qflow` for `ALERT` entries: failed sign-ins, blocked IPs, rejected API calls.

## Checklist

- [ ] `SESSION_SECRET` set, `.env` readable by root only
- [ ] Admin password changed; no shared accounts
- [ ] `TZ` set (correct opening hours and statistics)
- [ ] HTTPS reverse proxy if reachable from outside; `TRUST_PROXY` set to match
- [ ] Kiosk PIN set
- [ ] Nightly backups on, and a copy stored elsewhere
- [ ] Update routine in place (`scripts/update.sh`)
