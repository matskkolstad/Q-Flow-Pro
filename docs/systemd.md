# Kjøre Q-Flow Pro med systemd

`scripts/install-lxc.sh` setter opp alt dette automatisk. Denne siden beskriver oppsettet, for manuell installasjon og feilsøking.

## Oppsett

| Sti | Innhold | Eier |
|---|---|---|
| `/opt/Q-Flow-Pro` | Koden og det bygde grensesnittet (`dist/`) | root |
| `/opt/Q-Flow-Pro/.env` | Innstillinger (`chmod 600`) | root |
| `/var/lib/qflow` | `qflow.db`, `logs/`, `backups/`, `server.pid` | `qflow` |
| `/etc/systemd/system/qflow.service` | Tjenesten (kopi av `systemd/qflow.service`) | root |

Tjenesten kjører som systembrukeren `qflow` uten spesielle rettigheter, og kan bare skrive til `/var/lib/qflow`.

## Manuelt oppsett

```sh
useradd --system --home /var/lib/qflow --shell /usr/sbin/nologin qflow
mkdir -p /var/lib/qflow && chown -R qflow:qflow /var/lib/qflow
cp /opt/Q-Flow-Pro/systemd/qflow.service /etc/systemd/system/qflow.service
# Hvis `command -v node` ikke er /usr/bin/node, endre ExecStart i den kopierte fila.
systemctl daemon-reload
systemctl enable --now qflow
```

Tjenesten setter `NODE_ENV=production` og `QFLOW_DATA_DIR=/var/lib/qflow`, og leser deretter `/opt/Q-Flow-Pro/.env`; verdier i `.env` vinner. Alle innstillinger er beskrevet i [.env.example](../.env.example). Husk `TZ=Europe/Oslo` (eller din sone): åpningstider, nattlig nullstilling og statistikk bruker serverens lokale tid.

## Drift

```sh
systemctl status qflow           # status
journalctl -u qflow -f           # følg loggen (Ctrl+C avslutter bare visningen)
journalctl -u qflow -n 100       # siste 100 linjer
systemctl restart qflow          # start på nytt
bash /opt/Q-Flow-Pro/scripts/update.sh   # oppdater til nyeste versjon
```

Ved `systemctl stop`/`restart` lagrer serveren tilstanden og lukker databasen ryddig, så `qflow.db` er en komplett kopi etterpå.

## Feilsøking

- `status=203/EXEC`: feil sti til `node` i `ExecStart`.
- `EACCES` / `SQLITE_READONLY`: `chown -R qflow:qflow /var/lib/qflow`.
- `EADDRINUSE`: en annen prosess bruker porten (en gammel `npm start` i en terminal?). `ss -ltnp | grep 3000` viser hvilken.
- Tjenesten starter på nytt hele tiden: `journalctl -u qflow -n 50 --no-pager` viser feilen.
