# Brukeradministrasjon fra kommandolinjen (user CLI)

`scripts/user-cli.js` administrerer brukere (liste, opprette, endre, slette) direkte i databasen. Den er først og fremst ment for når alle administratorer er låst ute; til vanlig administrerer du brukere under *Innstillinger → Brukere* i adminpanelet.

## Viktig: stopp serveren først

Serveren holder sin egen kopi av dataene i minnet og ville overskrevet endringer gjort med CLI-en.
CLI-en nekter derfor å opprette, endre eller slette brukere mens serveren kjører (den sjekker `server.pid` i datamappen). Stopp tjenesten først:

```sh
systemctl stop qflow
# ... kjør CLI-en ...
systemctl start qflow
```

`--force` hopper over sjekken. Bruk det bare hvis du er sikker på at serveren ikke kjører (for eksempel en gammel `server.pid`).

## Kjøring

Kjør CLI-en som tjenestebrukeren, med samme datamappe som tjenesten:

```sh
cd /opt/Q-Flow-Pro
sudo -u qflow QFLOW_DATA_DIR=/var/lib/qflow node scripts/user-cli.js list
```

- Enkeltkommando: `node scripts/user-cli.js <kommando> ...` (eller `npm run user-cli -- <kommando> ...`).
- Interaktivt: `node scripts/user-cli.js` uten kommando gir en `qflow>`-prompt. Skriv `help` for oversikt og `exit` for å avslutte.
- Bruk anførselstegn rundt verdier med mellomrom eller spesialtegn: `--name "Maria Admin"`, `--password 'Mitt-Pass1!'` (enkle anførselstegn hindrer at skallet tolker `!`).

## Kommandoer

| Kommando | Beskrivelse |
|---|---|
| `list` | Alle brukere: id, brukernavn, rolle, innloggingsmetode, om passordbytte kreves |
| `create --username <u> [--name <n>] [--role ADMIN\|OPERATOR] --password <p> [--must-change yes]` | Ny lokal bruker (rolle er `OPERATOR` som standard) |
| `update (--id <id> \| --username <u>) [--name <n>] [--role ...] [--password <p>] [--must-change yes\|no]` | Endre en bruker. Nytt passord eller ny rolle logger brukeren ut overalt |
| `delete (--id <id> \| --username <u>)` | Slett en bruker og brukerens innlogginger |
| `help`, `exit`, `quit` | |

Regler:
- Passord må ha minst 8 tegn, med store og små bokstaver og et tall.
- Roller er `ADMIN` eller `OPERATOR`.
- Den siste administratoren kan ikke slettes eller nedgraderes.
- `--must-change yes` gjør at brukeren må velge nytt passord ved neste innlogging.

## Eksempler

```sh
# Nullstill admin-passordet (brukeren må velge nytt ved neste innlogging)
systemctl stop qflow
sudo -u qflow QFLOW_DATA_DIR=/var/lib/qflow node scripts/user-cli.js update --username admin --password 'Midlertidig1' --must-change yes
systemctl start qflow

# Opprett en ny administrator
sudo -u qflow QFLOW_DATA_DIR=/var/lib/qflow node scripts/user-cli.js create --username maria --name "Maria Admin" --role ADMIN --password 'Sterkt-Pass1'
```

Uten `QFLOW_DATA_DIR` bruker CLI-en `./data` ved siden av koden, som ikke er der en systemd-installasjon lagrer dataene.
