# OAuth / OIDC sign-in

Besides username and password, staff can sign in with **Google (Workspace)** or any **OpenID Connect** provider (Microsoft Entra ID, Keycloak, Authentik, Auth0, Okta …).

External sign-in only works when the browser reaches Q-Flow on the address registered as the callback URL at the provider. In practice that means a domain name with HTTPS behind a reverse proxy (see [INSTALLATION.md](../INSTALLATION.md#reverse-proxy--https)).

## 1. Server settings (`.env`)

```bash
# Required: keeps OAuth state valid across restarts
SESSION_SECRET=<long random value>

# The public callback URLs (must match what you register at the provider exactly)
GOOGLE_CALLBACK_URL=https://queue.example.com/auth/google/callback
OIDC_CALLBACK_URL=https://queue.example.com/auth/oidc/callback

```

Restart the service after changing `.env` (`systemctl restart qflow`).

`GOOGLE_CLIENT_ID/SECRET` and `OIDC_ISSUER_URL/CLIENT_ID/CLIENT_SECRET` in `.env` are only used as starting values on a fresh install. Normally you enter them in the admin panel.

## 2. Admin panel

*Settings → Sign-in methods*:

| Setting | Meaning |
|---|---|
| Enabled | Shows the button on the sign-in page |
| Client ID / Client secret | From the provider. The secret is write-only: it is never sent back to the browser; leave the field empty to keep the stored one |
| Issuer URL (OIDC) | E.g. `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Allowed domains (Google) | E.g. `company.com`; only verified addresses in these domains may sign in |
| Create users automatically | Creates an account at the first sign-in. Off = an admin must create the user first, with the same e-mail address |
| Default role | Role for auto-created users. Use **Operator** and promote people by hand |
| Require verified e-mail (OIDC) | On by default. Turn it off only for providers that do not send `email_verified` (some Entra ID setups) and that you trust |

The page also shows the callback URLs to register at the provider. Changes take effect immediately.

## 3. Registering the application

### Google
1. [Google Cloud Console](https://console.cloud.google.com/) → *APIs & Services* → *OAuth consent screen*: set it up (type *Internal* for Workspace).
2. *Credentials* → *Create credentials* → *OAuth client ID* → *Web application*.
3. Authorised redirect URI: `https://queue.example.com/auth/google/callback`.
4. Copy the client ID and secret into *Settings → Sign-in methods*.

### Microsoft Entra ID
1. *Entra admin center* → *App registrations* → *New registration*, redirect URI (Web): `https://queue.example.com/auth/oidc/callback`.
2. *Certificates & secrets* → new client secret.
3. Issuer URL: `https://login.microsoftonline.com/<tenant-id>/v2.0`.
4. Add the optional claim `email` (and `email_verified` if available) under *Token configuration*, or turn off *Require verified e-mail*.

### Keycloak / Authentik / others
Create a confidential OIDC client with the redirect URI `https://queue.example.com/auth/oidc/callback`. The issuer URL is the address that `/.well-known/openid-configuration` hangs off, e.g. `https://sso.example.com/realms/<realm>`.

## How sign-in works

1. The user presses *Sign in with Google/OIDC* and signs in at the provider.
2. The provider sends the browser back to `/auth/<provider>/callback`. The server checks the answer and finds the user:
   - an account already linked to this external identity, or
   - an account with the same **verified** e-mail address (it is linked now), or
   - a new account if *Create users automatically* is on.
3. The server redirects to the sign-in page with a **single-use code valid for one minute**. The page exchanges it (`POST /api/auth/exchange`) for a normal session. The session token never appears in a URL, browser history or proxy logs.

Accounts created or linked through a provider have no local password. Failed attempts count towards the same per-IP lockout as password sign-in (50 failures in 15 minutes).

## Troubleshooting

| Message on the sign-in page / in the log | Cause |
|---|---|
| `redirect_uri_mismatch` (at the provider) | The callback URL in `.env` and at the provider are not identical (http/https, trailing slash, port) |
| `domain_not_allowed` | The e-mail domain is not in *Allowed domains* |
| `email_not_verified` | The provider did not confirm the e-mail address. See *Require verified e-mail* |
| `user_not_found` | No matching account and *Create users automatically* is off. Create the user with the same e-mail address |
| `oidc_not_configured` / `google_not_configured` | Not enabled, or client ID/secret/issuer missing |
| Discovery error in the log | The server cannot reach the issuer URL (DNS, firewall, certificate) |

The admin log (*Logs*) and `journalctl -u qflow` show each failed attempt with the reason.
