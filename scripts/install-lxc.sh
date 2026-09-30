#!/usr/bin/env bash
# Q-Flow Pro installer for Debian/Ubuntu (for example a Proxmox LXC). Run as root:
#   curl -fsSL https://raw.githubusercontent.com/matskkolstad/Q-Flow-Pro/main/scripts/install-lxc.sh | bash
# or from a checkout: bash scripts/install-lxc.sh
#
# Options (environment variables):
#   INSTALL_DIR  where the code goes           (default /opt/Q-Flow-Pro)
#   DATA_DIR     database, logs and backups    (default /var/lib/qflow)
#   BRANCH       git branch or tag to install  (default main)
#   REPO_URL     git repository                (default https://github.com/matskkolstad/Q-Flow-Pro.git)
#   PORT         HTTP port                     (default 3000)
#   ADMIN_PASSWORD  password for the first admin on a new install (default: generated)
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/Q-Flow-Pro}"
DATA_DIR="${DATA_DIR:-/var/lib/qflow}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/matskkolstad/Q-Flow-Pro.git}"
PORT="${PORT:-3000}"
SERVICE_USER="qflow"
NODE_MAJOR=22

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this script as root."
command -v apt-get >/dev/null || die "This script supports Debian/Ubuntu (apt) only."

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates git build-essential python3 >/dev/null

node_ok() {
  command -v node >/dev/null || return 1
  local version major minor
  version="$(node -v | sed 's/^v//')"
  major="${version%%.*}"
  minor="$(echo "$version" | cut -d. -f2)"
  [ "$major" -gt 20 ] || { [ "$major" -eq 20 ] && [ "$minor" -ge 9 ]; }
}

if ! node_ok; then
  log "Installing Node.js ${NODE_MAJOR} (NodeSource)"
  apt-get remove -y -qq nodejs npm >/dev/null 2>&1 || true
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node $(node -v), npm $(npm -v)"

if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating existing checkout in $INSTALL_DIR ($BRANCH)"
  git -C "$INSTALL_DIR" fetch --quiet origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout --quiet "$BRANCH"
  git -C "$INSTALL_DIR" pull --quiet --ff-only origin "$BRANCH"
else
  log "Cloning $REPO_URL ($BRANCH) into $INSTALL_DIR"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

log "Installing dependencies and building (this takes a minute)"
cd "$INSTALL_DIR"
npm ci --include=dev --no-audit --no-fund
npm run build

ENV_FILE="$INSTALL_DIR/.env"
# An existing .env decides the port and data directory unless they were given explicitly
if [ -f "$ENV_FILE" ]; then
  ENV_PORT="$(grep -E '^PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  PORT="${ENV_PORT:-$PORT}"
  ENV_DATA_DIR="$(grep -E '^QFLOW_DATA_DIR=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  if [ -n "$ENV_DATA_DIR" ] && [ "$ENV_DATA_DIR" != "$INSTALL_DIR/data" ]; then DATA_DIR="$ENV_DATA_DIR"; fi
fi

# Stop a running server so its data is copied in a consistent state
systemctl stop qflow >/dev/null 2>&1 || true

log "Creating service user and data directory"
id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$DATA_DIR"
# Data from an older install that kept it next to the code
if [ -f "$INSTALL_DIR/data/qflow.db" ] && [ ! -f "$DATA_DIR/qflow.db" ]; then
  log "Moving existing data from $INSTALL_DIR/data to $DATA_DIR"
  cp -a "$INSTALL_DIR/data/." "$DATA_DIR/"
  mv "$INSTALL_DIR/data" "$INSTALL_DIR/data.moved-to-$(basename "$DATA_DIR")"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"

if [ ! -f "$ENV_FILE" ]; then
  log "Creating $ENV_FILE"
  TZ_NAME="$(cat /etc/timezone 2>/dev/null || timedatectl show -p Timezone --value 2>/dev/null || echo UTC)"
  IP_ADDR="$(hostname -I 2>/dev/null | awk '{print $1}')"
  cat > "$ENV_FILE" <<ENV
# Q-Flow Pro settings (see .env.example for all options)
HOST=0.0.0.0
PORT=$PORT
NODE_ENV=production
TZ=$TZ_NAME
QFLOW_DATA_DIR=$DATA_DIR
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
QFLOW_ADMIN_USERNAME=admin
QFLOW_ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
ALLOWED_ORIGINS=http://localhost:$PORT${IP_ADDR:+,http://$IP_ADDR:$PORT}
SESSION_TTL_HOURS=12
LOG_RETENTION_DAYS=14
BACKUP_RETENTION_DAYS=30
BACKUP_KEEP=14
ENV
else
  log "Keeping existing $ENV_FILE"
  if grep -q '^QFLOW_DATA_DIR=' "$ENV_FILE"; then
    sed -i "s#^QFLOW_DATA_DIR=.*#QFLOW_DATA_DIR=$DATA_DIR#" "$ENV_FILE"
  else
    echo "QFLOW_DATA_DIR=$DATA_DIR" >> "$ENV_FILE"
  fi
  grep -q '^TZ=' "$ENV_FILE" || echo "TZ=$(cat /etc/timezone 2>/dev/null || timedatectl show -p Timezone --value 2>/dev/null || echo UTC)" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

log "Installing systemd service"
NODE_BIN="$(command -v node)"
sed -e "s#/opt/Q-Flow-Pro#$INSTALL_DIR#g" -e "s#/var/lib/qflow#$DATA_DIR#g" -e "s#/usr/bin/node#$NODE_BIN#g" \
  "$INSTALL_DIR/systemd/qflow.service" > /etc/systemd/system/qflow.service
systemctl daemon-reload
systemctl enable --quiet qflow
systemctl restart qflow

log "Waiting for the server"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 || { journalctl -u qflow -n 40 --no-pager; die "The server did not start."; }

IP_ADDR="$(hostname -I 2>/dev/null | awk '{print $1}')"
log "Q-Flow Pro is running: http://${IP_ADDR:-<server-ip>}:$PORT"
if journalctl -u qflow --no-pager | grep -q "first admin account created"; then
  echo "First admin account (shown once, change it after login):"
  journalctl -u qflow --no-pager | grep -A2 "first admin account created" | tail -2
fi
echo "Logs:    journalctl -u qflow -f"
echo "Update:  bash $INSTALL_DIR/scripts/update.sh"
