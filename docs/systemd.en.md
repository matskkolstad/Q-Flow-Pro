# Running Q-Flow Pro with systemd

`scripts/install-lxc.sh` sets all of this up automatically. This page describes the layout, for manual installs and troubleshooting.

## Layout

| Path | Contents | Owner |
|---|---|---|
| `/opt/Q-Flow-Pro` | Code and the built frontend (`dist/`) | root |
| `/opt/Q-Flow-Pro/.env` | Settings (`chmod 600`) | root |
| `/var/lib/qflow` | `qflow.db`, `logs/`, `backups/`, `server.pid` | `qflow` |
| `/etc/systemd/system/qflow.service` | The unit (copy of `systemd/qflow.service`) | root |

The service runs as the unprivileged system user `qflow`, which can only write to `/var/lib/qflow`.

## Manual setup

```sh
useradd --system --home /var/lib/qflow --shell /usr/sbin/nologin qflow
mkdir -p /var/lib/qflow && chown -R qflow:qflow /var/lib/qflow
cp /opt/Q-Flow-Pro/systemd/qflow.service /etc/systemd/system/qflow.service
# If `command -v node` is not /usr/bin/node, change ExecStart in the copied unit.
systemctl daemon-reload
systemctl enable --now qflow
```

The unit sets `NODE_ENV=production` and `QFLOW_DATA_DIR=/var/lib/qflow`, then loads `/opt/Q-Flow-Pro/.env`; values in `.env` win. All settings are described in [.env.example](../.env.example). Remember `TZ=Europe/Oslo` (or your zone): opening hours, the nightly reset and the statistics use the server's local time.

## Operation

```sh
systemctl status qflow           # status
journalctl -u qflow -f           # follow the log (Ctrl+C only stops the viewing)
journalctl -u qflow -n 100       # last 100 lines
systemctl restart qflow          # restart
bash /opt/Q-Flow-Pro/scripts/update.sh   # update to the newest version
```

On `systemctl stop`/`restart` the server saves the state and closes the database cleanly, so `qflow.db` is a complete copy afterwards.

## Troubleshooting

- `status=203/EXEC`: wrong path to `node` in `ExecStart`.
- `EACCES` / `SQLITE_READONLY`: `chown -R qflow:qflow /var/lib/qflow`.
- `EADDRINUSE`: another process uses the port (an old `npm start` in a terminal?). `ss -ltnp | grep 3000` shows which.
- The service keeps restarting: `journalctl -u qflow -n 50 --no-pager` shows the error.
