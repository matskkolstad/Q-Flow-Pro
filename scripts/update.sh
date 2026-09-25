#!/usr/bin/env bash
# Updates an installation made with install-lxc.sh (or the same layout). Run as root:
#   bash /opt/Q-Flow-Pro/scripts/update.sh            # current branch
#   BRANCH=main bash /opt/Q-Flow-Pro/scripts/update.sh
# Builds first while the server keeps running, takes a backup of the data, then restarts.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$INSTALL_DIR"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
DATA_DIR="$(grep -E '^QFLOW_DATA_DIR=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
DATA_DIR="${DATA_DIR:-/var/lib/qflow}"
PORT="$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
PORT="${PORT:-3000}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Run this script as root."
# Older installs kept the data next to the code or ran without the qflow user; install-lxc.sh migrates those.
if ! id qflow >/dev/null 2>&1 || { [ ! -f "$DATA_DIR/qflow.db" ] && [ -f "$INSTALL_DIR/data/qflow.db" ]; }; then
  die "This install uses the old layout. Run once instead: BRANCH=$BRANCH bash $INSTALL_DIR/scripts/install-lxc.sh"
fi

log "Fetching $BRANCH"
OLD_REV="$(git rev-parse --short HEAD)"
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git pull --quiet --ff-only origin "$BRANCH"
NEW_REV="$(git rev-parse --short HEAD)"
echo "$OLD_REV -> $NEW_REV"

log "Installing dependencies and building"
npm ci --include=dev --no-audit --no-fund
npm run build

log "Stopping the service and backing up $DATA_DIR"
systemctl stop qflow
if [ -f "$DATA_DIR/qflow.db" ]; then
  mkdir -p "$DATA_DIR/backups"
  STAMP="$(date +%Y-%m-%dT%H-%M-%S)"
  cp "$DATA_DIR/qflow.db" "$DATA_DIR/backups/qflow-pre-update-$STAMP.db"
  chown -R qflow:qflow "$DATA_DIR/backups" 2>/dev/null || true
  echo "Backup: $DATA_DIR/backups/qflow-pre-update-$STAMP.db"
fi

# The unit file may have changed
if ! cmp -s <(sed -e "s#/opt/Q-Flow-Pro#$INSTALL_DIR#g" -e "s#/var/lib/qflow#$DATA_DIR#g" -e "s#/usr/bin/node#$(command -v node)#g" systemd/qflow.service) /etc/systemd/system/qflow.service; then
  log "Updating the systemd unit"
  sed -e "s#/opt/Q-Flow-Pro#$INSTALL_DIR#g" -e "s#/var/lib/qflow#$DATA_DIR#g" -e "s#/usr/bin/node#$(command -v node)#g" \
    systemd/qflow.service > /etc/systemd/system/qflow.service
  systemctl daemon-reload
fi

log "Starting the service"
systemctl start qflow
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    log "Updated to $NEW_REV and running"
    exit 0
  fi
  sleep 1
done
journalctl -u qflow -n 40 --no-pager
die "The server did not come back. Restore with: systemctl stop qflow; cp <backup> $DATA_DIR/qflow.db; git checkout $OLD_REV; npm ci --include=dev; npm run build; systemctl start qflow"
