# systemd service setup

This file describes how to run the app via systemd.

## Setup
1. Copy the unit to the system directory:
   ```sh
   sudo cp systemd/qflow.service /etc/systemd/system/qflow.service
   ```
2. (Done here) A dedicated system user `qflow` has been created and the unit runs as this user. Owns /opt/qflow and /etc/qflow.
3. Environment variables are in `/etc/qflow/qflow.env` (HOST, PORT, NODE_ENV, ALLOWED_ORIGINS, ENABLE_CSP). Update ALLOWED_ORIGINS to your domains.
4. Reload systemd and enable:
   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable qflow.service
   ```
5. Start the service:
   ```sh
   sudo systemctl start qflow.service
   ```

## Operations
- Status:
  ```sh
  systemctl status qflow.service
  ```
- Logs (follow):
  ```sh
  journalctl -u qflow.service -f
  ```
- Restart after code changes or upgrades:
  ```sh
  sudo systemctl restart qflow.service
  ```
