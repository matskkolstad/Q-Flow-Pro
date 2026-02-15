# Installation and Testing Guide

This guide provides step-by-step instructions for installing, configuring, and testing Q-Flow Pro.

## Prerequisites

### System Requirements
- **Operating System**: Linux, macOS, or Windows (WSL recommended for Windows)
- **Node.js**: Version 18.x or 20.x LTS (required)
- **npm**: Version 9.x or later (bundled with Node.js)
- **Build Tools**: 
  - Linux: `build-essential`, `python3`
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools or windows-build-tools

### Installing Prerequisites

#### Ubuntu/Debian Linux
```bash
sudo apt update
sudo apt install -y nodejs npm build-essential python3
```

#### macOS
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

#### Windows (using WSL)
```bash
# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

## Installation Steps

### 1. Clone the Repository
```bash
git clone https://github.com/matskkolstad/Q-Flow-Pro.git
cd Q-Flow-Pro
```

### 2. Install Dependencies
```bash
npm install
```

**Note**: The `better-sqlite3` package requires native compilation. If you encounter build errors:
- Ensure you have build tools installed (see Prerequisites)
- Try: `npm install --build-from-source`
- On Windows, you may need: `npm install --global windows-build-tools`

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` to customize settings:
```env
HOST=0.0.0.0
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# API Security (Optional but Recommended for Production)
# Generate API keys with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
API_KEYS=
# IP Whitelist (Optional) - Supports CIDR notation
# Example: ALLOWED_API_IPS=192.168.1.0/24,10.0.0.5
ALLOWED_API_IPS=

ENABLE_CSP=0
SESSION_TTL_HOURS=12
LOG_RETENTION_DAYS=14
BACKUP_RETENTION_DAYS=30
```

**Security Notes**:
- `API_KEYS`: Optional comma-separated API keys for additional endpoint protection
- `ALLOWED_API_IPS`: Optional IP whitelist for API access (supports CIDR notation)
- Leave security options empty for development; configure for production

### 4. Build the Application
```bash
npm run build
```

This command:
1. Compiles TypeScript to JavaScript
2. Builds the React frontend with Vite
3. Outputs production files to `dist/` directory

### 5. Start the Server
```bash
npm start
```

The server will start on `http://localhost:3000`

## First-Time Setup

### 1. Access the Application
Open your browser and navigate to `http://localhost:3000`

### 2. Login with Default Credentials

**Default users** (automatically created on first run):
- **Admin Account**: username `admin` / password `admin`
- **Operator Account**: username `operator` / password `operator`

⚠️ **IMPORTANT**: You will be **automatically prompted** to change these passwords on first login. This is a security requirement and cannot be skipped.

### 3. Change Default Passwords (Automatic)

The system will display a password change modal immediately after logging in with a default account:
1. Log in with default credentials
2. A modal will appear requiring password change
3. Enter the current (default) password
4. Enter a new secure password:
   - Minimum 8 characters
   - Must include uppercase letters
   - Must include lowercase letters
   - Must include at least one digit
5. Confirm the new password
6. Click "Change Password"

The password change is enforced and you cannot proceed without completing it.

**Repeat for both admin and operator accounts.**

### 4. Configure Services and Counters
1. Go to Settings → Services
2. Add services (e.g., "Sales", "Support", "General")
3. Set service prefix, color, and estimated time
4. Go to Settings → Counters
5. Create counters and assign services to them

## Testing the System

### Development Mode Testing

For development with hot-reload:
```bash
npm run dev
```

This starts:
- Frontend dev server on `http://localhost:5173`
- Backend API on `http://localhost:3000` (proxied by Vite)

### End-to-End Testing

Run automated E2E tests with Playwright:
```bash
npm run test:e2e
```

**Prerequisites for E2E tests**:
- The server must be running (`npm start` in a separate terminal)
- Default users (admin/Admin123!) must exist

### Manual Testing Checklist

#### 1. Public Display
- Navigate to `/public`
- Verify the display shows "Waiting for the next number..."
- Check that branding (logo/text) appears correctly

#### 2. Kiosk Mode
- Navigate to `/kiosk`
- Select a service and draw a ticket
- Verify ticket number appears on screen
- Test language toggle (English/Norwegian)
- Test exit kiosk mode with PIN (tap top-right corner 5 times)

#### 3. Mobile Client
- Navigate to `/mobile/new`
- Draw a ticket for a service
- Verify ticket status and estimated wait time

#### 4. Counter Display
- Navigate to `/counter-display?counterId=<counter-id>`
- Verify counter name appears
- When a ticket is called, verify it displays correctly

#### 5. Admin Dashboard
- Log in as admin
- Test calling tickets from the queue
- Test marking tickets as complete
- Verify stats update in real-time

#### 6. Admin Settings

**General Settings:**
- [ ] Upload/remove logo
- [ ] Change brand text
- [ ] Toggle sound settings
- [ ] Open/close system
- [ ] Set kiosk PIN
- [ ] Create backup
- [ ] Download backup

**Services:**
- [ ] Add service
- [ ] Edit service (name, prefix, color, ETA)
- [ ] Toggle service open/closed
- [ ] Delete service

**Counters:**
- [ ] Add counter
- [ ] Assign services to counter
- [ ] Toggle counter online/offline
- [ ] Delete counter

**Users:**
- [ ] Add new user (admin and operator)
- [ ] Edit user role
- [ ] Change user password
- [ ] Delete user (verify last admin cannot be deleted)

**Devices:**
- [ ] Add printer
- [ ] Assign printer to kiosk
- [ ] Remove printer
- [ ] Assign counter display to counter

### Health Check

Verify the health endpoint:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-14T16:00:00.000Z"
}
```

## Common Issues and Solutions

### Issue: `better-sqlite3` Build Failure

**Solution**:
```bash
# Install build tools
sudo apt-get install -y build-essential python3

# Rebuild the module
npm rebuild better-sqlite3
```

### Issue: Port 3000 Already in Use

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change PORT in .env file
echo "PORT=3001" >> .env
```

### Issue: Database Lock Error

**Solution**:
```bash
# Stop all instances of the server
pkill -f "node server.js"

# Remove lock file if it exists
rm -f data/qflow.db-wal
rm -f data/qflow.db-shm

# Restart server
npm start
```

### Issue: CORS Errors in Browser

**Solution**:
Ensure `ALLOWED_ORIGINS` in `.env` includes your frontend URL:
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://yourdomain.com
```

### Issue: WebSocket Connection Failures

**Solution**:
- Check firewall rules allow connections on port 3000
- Verify ALLOWED_ORIGINS includes the client origin
- For reverse proxy setups, ensure WebSocket upgrade headers are forwarded

## Production Deployment

### Security Checklist

Before deploying to production, complete this security checklist:

- [ ] Changed all default passwords (enforced automatically on first login)
- [ ] Configured `API_KEYS` in `.env` (generate with crypto.randomBytes)
- [ ] Configured `ALLOWED_API_IPS` to restrict API access (if applicable)
- [ ] Set `ALLOWED_ORIGINS` to production domain(s) only
- [ ] Reduced `SESSION_TTL_HOURS` if needed (consider 8 hours for high-security)
- [ ] Deployed behind HTTPS reverse proxy
- [ ] Configured firewall to block direct access to port 3000
- [ ] Set up automated backups
- [ ] Configured log monitoring and retention

For detailed security guidance, see [SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md).

### Option 1: systemd Service (Linux)

See [docs/systemd.en.md](docs/systemd.en.md) for detailed instructions.

Quick setup:
```bash
# Copy service file
sudo cp systemd/qflow.service /etc/systemd/system/

# Create environment file
sudo cp .env /etc/qflow/qflow.env

# Enable and start
sudo systemctl enable qflow.service
sudo systemctl start qflow.service
```

### Option 2: Docker

See [docker-compose.yml](docker-compose.yml) for configuration.

```bash
# Build image
docker build -t qflow-pro .

# Run container
docker run -d -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  qflow-pro

# Or use docker-compose
docker-compose up -d
```

### Option 3: Reverse Proxy (Recommended)

Example Nginx configuration:
```nginx
server {
    listen 80;
    server_name queue.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backup and Restore

### Create Backup via GUI
1. Log in as admin
2. Go to Settings → General
3. Click "Create backup"
4. Download the backup file

### Create Backup via API
```bash
curl -X POST http://localhost:3000/api/admin/backup \
  -H "Authorization: Bearer <your-token>"
```

### Restore Backup
```bash
# Stop the server
sudo systemctl stop qflow.service

# Replace database
cp backup-file.db data/qflow.db

# Start the server
sudo systemctl start qflow.service
```

## User Management via CLI

See [docs/cli.en.md](docs/cli.en.md) for detailed CLI usage.

Quick commands:
```bash
# List all users
npm run user-cli -- list

# Create new admin
npm run user-cli -- create \
  --username newadmin \
  --name "New Administrator" \
  --role ADMIN \
  --password SecurePass123!

# Update user password
npm run user-cli -- update \
  --id u1 \
  --password NewPassword123!
```

## Getting Help

- **Documentation**: Check README.md and docs/ directory
- **Issues**: Report bugs on GitHub Issues
- **Security**: See SECURITY_AUDIT.md for known vulnerabilities

## License and Disclaimer

**Copyright (c) 2026 Mats Kolstad. All rights reserved.**

This software is provided under a **Proprietary License**. See [LICENSE](LICENSE) file for complete terms.

### License Summary

- ✅ **Allowed**: View source, use for personal/internal purposes, modify for own use
- ❌ **Prohibited**: Distribution, selling, sublicensing without written permission
- 📧 **Contact**: matskkolstad via GitHub for licensing inquiries

### AI Development Disclaimer

⚠️ **IMPORTANT**: This entire application has been developed using Artificial Intelligence (AI).

**The owner makes NO WARRANTIES and accepts NO LIABILITY for:**
- Software defects, bugs, or errors
- Security vulnerabilities or breaches
- Data loss or corruption
- Compliance with laws or regulations
- Any damages arising from use

**By using this software, you agree to:**
- Accept full responsibility for testing and validation
- Implement appropriate security measures
- Conduct your own security audits
- Ensure compliance with applicable requirements
- Assume all risks associated with use

**USE AT YOUR OWN RISK.**
