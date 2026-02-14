# systemd service setup

Denne fila beskriver hvordan du kjører appen via systemd.

## Oppsett
1. Kopier enheten til systemkatalogen:
   ```sh
   sudo cp systemd/qflow.service /etc/systemd/system/qflow.service
   ```
2. (Ferdig her) En dedikert system-bruker `qflow` er opprettet og enheten kjører som denne. Eier /opt/qflow og /etc/qflow.
3. Miljøvariabler ligger i `/etc/qflow/qflow.env` (HOST, PORT, NODE_ENV, ALLOWED_ORIGINS, ENABLE_CSP). Oppdater ALLOWED_ORIGINS til dine domener.
4. Last inn systemd på nytt og aktiver:
   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable qflow.service
   ```
5. Start tjenesten:
   ```sh
   sudo systemctl start qflow.service
   ```

## Drift
- Status:
  ```sh
  systemctl status qflow.service
  ```
- Logger (følgende):
  ```sh
  journalctl -u qflow.service -f
  ```
- Restart etter kodeendring eller oppgradering:
  ```sh
  sudo systemctl restart qflow.service
  ```
