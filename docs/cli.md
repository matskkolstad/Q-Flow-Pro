# Bruker-CLI for Q-Flow Pro

CLI-et lar deg administrere brukere (liste, opprette, oppdatere, slette) uten å starte appen. Alle endringer lagres i `db.json`.

## Forutsetninger
- Node er installert.
- Kjør kommandoene fra rotmappen (`/opt/qflow`).
- Hvis serveren kjører, restart etter endringer så nye brukere/roller/passord lastes inn.
- (Valgfritt) Installer lokal bin: `npm install -g .` eller `npm link` fra prosjektmappen. Deretter kan du kjøre `qflow-cli` direkte.

## Kjøring
- Interaktiv modus (anbefalt):
  - Start med `qflow-cli`. Du får prompten `qflow>` og kan skrive kommandoer uten prefiks.
  - Skriv `help` for oversikt og `exit` eller `quit` for å avslutte.
  - Bruk anførselstegn rundt verdier med mellomrom, f.eks. `--name "Maria Admin"`.
- Enkeltkommando (one-shot):
  - `qflow-cli <kommando> ...`
  - Alternativt uten global install: `node scripts/user-cli.js <kommando> ...`

## Kommandoer
- `list` — viser alle brukere (id, brukernavn, rolle)
- `create --username <u> --name <navn> --role <ADMIN|OPERATOR> --password <pw>`
- `update --id <id> [--name <navn>] [--role <ADMIN|OPERATOR>] [--password <pw>]`
- `delete --id <id>`
- `help`, `exit`, `quit`

## Eksempler
- Interaktiv økt:
  ```
  qflow-cli
  qflow> list
  qflow> create --username maria --name "Maria Admin" --role ADMIN --password hemmelig
  qflow> update --id u1 --name "Ny Admin"
  qflow> delete --id u2
  qflow> exit
  ```
- Enkeltkommandoer:
  ```
  qflow-cli list
  qflow-cli create --username maria --name "Maria Admin" --role ADMIN --password hemmelig
  qflow-cli update --id u1 --password nyttpass
  qflow-cli delete --id u2
  ```

## Tips
- `id` finner du fra `list`-kommandoen.
- Roller må være `ADMIN` eller `OPERATOR` (store bokstaver).
- Du kan ikke fjerne siste admin; forsøk vil gi feilen `at_least_one_admin_required`.
- Husk restart av `server.js` etter endringer hvis den allerede kjører.
