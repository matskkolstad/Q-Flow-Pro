# Security

## Reporting a vulnerability

Please report security problems privately through GitHub: **Security → Report a vulnerability** on this repository (private vulnerability reporting). Do not open a public issue for them.
Include the version (commit), how to reproduce it and what an attacker can achieve.

Q-Flow Pro is a hobby project developed with AI assistance and comes without warranty (see [LICENSE](LICENSE)); reports are handled on a best-effort basis.

## Security model

Q-Flow runs on a local network or behind a reverse proxy. Three kinds of clients connect:

| Client | How it authenticates | What it receives |
|---|---|---|
| Public screens (display, counter display, mobile ticket) | Nothing | Only the queue: ticket numbers, services, counter names, messages, branding |
| Kiosks | A device token created when an admin activates the device | The public view plus its own printer assignment |
| Staff (operator/admin) | Username + password or Google/OIDC, then a session token | Operators: the queue and the log. Admins: also settings, users, devices and backups |

Rules the server enforces:
- All queue changes are decided on the server; the browser only sends commands. Every command checks the role.
- Real-time data is split into role-filtered socket rooms, so public clients never receive users, sessions, secrets, device tokens or logs.
- Passwords are bcrypt-hashed. Session and device tokens are 256-bit random values stored only as SHA-256 hashes.
- A forced password change (first admin, reset passwords, known default passwords) blocks every staff action until done.
- OAuth sign-in returns a single-use one-minute code instead of a token in the URL; accounts are only linked by e-mail when the provider has verified the address.
- OAuth client secrets and the kiosk PIN are write-only in the admin panel.
- Rate limits cover sign-in (per user and per IP), ticket creation, kiosk PIN attempts, anonymous socket events and the HTTP API. `X-Forwarded-For` is only trusted from proxies in `TRUST_PROXY`.
- Mobile tickets can only be cancelled with the secret key in the ticket link.
- Uploaded logos are limited in size and type and served with their own restrictive Content-Security-Policy; backups are checked to be Q-Flow SQLite databases before they can be restored.
- CSV exports neutralise spreadsheet formulas.

Known limits:
- There is no HTTPS in the server itself. Use a reverse proxy with TLS when anything leaves your LAN.
- Anyone who can reach a public screen URL can see the queue and draw tickets (by design). Use `MAX_WAITING_TICKETS` and network rules if that matters.
- The content security policy for the app itself is off by default (`ENABLE_CSP=1` turns it on).

## Hardening

See [docs/security-best-practices.md](docs/security-best-practices.md).
