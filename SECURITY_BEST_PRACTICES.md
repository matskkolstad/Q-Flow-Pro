# Security Best Practices for Q-Flow Pro

This guide provides security recommendations for deploying and operating Q-Flow Pro in production environments.

## ⚠️ Critical Disclaimer

**This application is entirely developed using Artificial Intelligence (AI).**

- ❌ The owner makes **NO WARRANTIES** and accepts **NO LIABILITY**
- ❌ No guarantee of security, reliability, or fitness for purpose
- ❌ Use at your own risk with full responsibility

**Before deploying in production:**
1. ✅ Conduct independent security audits
2. ✅ Perform comprehensive penetration testing
3. ✅ Implement additional security measures as needed
4. ✅ Ensure compliance with your security requirements
5. ✅ Have qualified personnel review all security aspects

See [LICENSE](LICENSE) for complete terms.

---

## Table of Contents
1. [Initial Setup](#initial-setup)
2. [Network Security](#network-security)
3. [API Security](#api-security)
4. [User Management](#user-management)
5. [Monitoring & Maintenance](#monitoring--maintenance)
6. [Deployment Checklist](#deployment-checklist)

## Initial Setup

### First-Time Installation

1. **Change Default Passwords Immediately**
   - Default users (admin/operator) are automatically prompted to change passwords on first login
   - Use strong, unique passwords for each user
   - Never reuse passwords across different systems

2. **Configure Environment Variables**
   Create a `.env` file (or `/etc/qflow/qflow.env` for systemd):
   ```bash
   # Production binding
   HOST=127.0.0.1  # Bind to localhost if behind reverse proxy
   PORT=3000
   NODE_ENV=production
   
   # CORS - Add your production domain
   ALLOWED_ORIGINS=https://yourdomain.com
   
   # Security - Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   API_KEYS=your_secure_api_key_here
   
   # IP Whitelist - Restrict to your network
   ALLOWED_API_IPS=192.168.1.0/24,10.0.0.5
   
   # Sessions
   SESSION_TTL_HOURS=8  # Consider shorter sessions for high-security environments
   
   # Enable CSP when assets are compatible
   ENABLE_CSP=1
   ```

3. **Set Proper File Permissions**
   ```bash
   chmod 640 /etc/qflow/qflow.env
   chown qflow:qflow /etc/qflow/qflow.env
   chmod 700 /opt/qflow/data
   ```

## Network Security

### Reverse Proxy Configuration

**Always** run Q-Flow Pro behind a reverse proxy like Nginx or Caddy. Never expose the Node.js server directly to the internet.

#### Nginx Example
```nginx
server {
    listen 443 ssl http2;
    server_name qflow.yourdomain.com;
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Rate limiting for login endpoint
    location /api/login {
        limit_req zone=login_limit burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # All other requests
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Rate limiting zone definition (add to http block)
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=10r/m;
```

### Firewall Configuration

1. **Allow only necessary ports**
   ```bash
   # UFW example
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow 22/tcp  # SSH
   sudo ufw allow 80/tcp  # HTTP (redirect to HTTPS)
   sudo ufw allow 443/tcp # HTTPS
   sudo ufw enable
   ```

2. **Restrict SSH access**
   - Use key-based authentication only
   - Disable root login
   - Consider changing the default SSH port
   - Use fail2ban to block brute force attempts

## API Security

### API Key Management

1. **Generate Strong Keys**
   ```bash
   # Generate a secure 256-bit key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Rotate Keys Regularly**
   - Change API keys every 90 days
   - Update keys immediately if compromise is suspected
   - Use multiple keys for different services/clients if needed

3. **Protect Key Storage**
   - Never commit keys to version control
   - Store in environment variables or secure vaults
   - Use different keys for development and production

### IP Whitelisting

Configure `ALLOWED_API_IPS` to restrict API access:

```bash
# Single IP
ALLOWED_API_IPS=192.168.1.100

# Multiple IPs
ALLOWED_API_IPS=192.168.1.100,10.0.0.5

# CIDR notation for networks
ALLOWED_API_IPS=192.168.1.0/24,10.0.0.0/8

# Mixed
ALLOWED_API_IPS=192.168.1.0/24,203.0.113.42
```

**Note**: Leave empty to allow all IPs (not recommended for production).

### CORS Configuration

Restrict `ALLOWED_ORIGINS` to your actual domains:

```bash
# Production
ALLOWED_ORIGINS=https://qflow.yourdomain.com

# Multiple domains
ALLOWED_ORIGINS=https://qflow.yourdomain.com,https://queue.company.com
```

Never use wildcards (`*`) in production.

## User Management

### Password Policy

The system enforces:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit

**Recommendations**:
- Encourage passphrases (e.g., "MyQueue2024!Ready")
- Consider using a password manager
- Never share passwords
- Change passwords if compromise suspected

### Role-Based Access

- **ADMIN**: Full system access - Use sparingly, only for configuration
- **OPERATOR**: Day-to-day queue management - Use for regular staff

**Best Practices**:
- Create individual accounts for each user
- Use OPERATOR role by default
- Reserve ADMIN for IT staff only
- Remove accounts immediately when staff leaves

### Account Security

1. **Regular Audits**
   ```bash
   # List all users via CLI
   npm run user-cli -- list
   ```

2. **Remove Inactive Accounts**
   ```bash
   npm run user-cli -- delete --id <userId>
   ```

3. **Monitor Login Attempts**
   - Check logs regularly for failed login attempts
   - Investigate suspicious activity immediately

## Monitoring & Maintenance

### Log Management

1. **Regular Log Review**
   ```bash
   # View recent logs
   tail -f data/logs/app-$(date +%Y-%m-%d).log
   
   # Search for alerts
   grep "ALERT" data/logs/*.log
   
   # Monitor failed logins
   grep "Innlogging feilet" data/logs/*.log
   ```

2. **Log Retention**
   - Default: 14 days
   - Configure via `LOG_RETENTION_DAYS`
   - Export logs to external SIEM if available

### Backup Strategy

1. **Automated Backups**
   - Default retention: 30 days
   - Configure via `BACKUP_RETENTION_DAYS`
   - Backups stored in `data/backups/`

2. **Offsite Backups**
   ```bash
   # Rsync to remote server (add to cron)
   rsync -avz /opt/qflow/data/backups/ backup-server:/backups/qflow/
   ```

3. **Backup Verification**
   - Test restore procedures quarterly
   - Verify backup integrity regularly

### Updates & Patches

1. **Dependency Updates**
   ```bash
   # Check for updates
   npm outdated
   
   # Update dependencies
   npm update
   
   # Rebuild
   npm run build
   ```

2. **Security Patches**
   - Subscribe to GitHub security advisories
   - Apply critical patches within 7 days
   - Test in staging before production

## Deployment Checklist

Use this checklist before going live:

### Pre-Production
- [ ] Changed all default passwords
- [ ] Generated and configured API keys
- [ ] Set up IP whitelisting (if applicable)
- [ ] Configured CORS with production domains
- [ ] Set appropriate `SESSION_TTL_HOURS`
- [ ] Created individual user accounts
- [ ] Removed or disabled test accounts
- [ ] Set proper file permissions
- [ ] Configured environment variables

### Infrastructure
- [ ] Deployed behind reverse proxy
- [ ] HTTPS/TLS configured and tested
- [ ] Firewall rules configured
- [ ] SSH hardened (key-only, no root)
- [ ] fail2ban configured
- [ ] Log rotation working
- [ ] Automated backups configured
- [ ] Offsite backup tested

### Testing
- [ ] Login with ADMIN account works
- [ ] Login with OPERATOR account works
- [ ] Password change enforcement tested
- [ ] API key protection verified
- [ ] IP whitelist tested (if configured)
- [ ] WebSocket connections working
- [ ] All main features functional
- [ ] Mobile/responsive views tested

### Monitoring
- [ ] Log monitoring configured
- [ ] Backup alerts configured
- [ ] Disk space monitoring
- [ ] Uptime monitoring
- [ ] Performance baseline established

### Documentation
- [ ] Admin credentials documented (encrypted)
- [ ] Network diagram created
- [ ] Runbook prepared
- [ ] Escalation contacts listed
- [ ] Recovery procedures documented

## Incident Response

### Security Incident Procedure

1. **Immediate Actions**
   - Change all passwords
   - Rotate API keys
   - Review recent logs
   - Identify affected systems

2. **Investigation**
   - Preserve logs for analysis
   - Identify attack vector
   - Assess data exposure
   - Document timeline

3. **Recovery**
   - Restore from clean backup if needed
   - Patch vulnerabilities
   - Update security measures
   - Monitor for recurrence

4. **Post-Incident**
   - Update documentation
   - Improve security measures
   - Train staff if needed
   - Consider external security audit

## Additional Resources

- **GitHub Security Advisories**: Check your repository's security tab for advisories
- **OWASP Security Guidelines**: https://owasp.org/
- **Node.js Security Best Practices**: https://nodejs.org/en/docs/guides/security/

## Support

For security concerns or questions:
- Open a GitHub issue in your repository (for non-sensitive matters)
- Contact maintainers directly for security vulnerabilities
- Follow responsible disclosure practices
