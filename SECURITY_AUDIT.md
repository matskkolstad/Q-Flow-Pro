# Security Audit Report

## Date: 2026-02-15

## Security Enhancements (Latest Update)

### New Security Features Implemented

#### 1. Forced Password Change on First Login
- **Status**: ✅ Implemented
- **Description**: Default users (admin/operator) are automatically flagged to change their password on first login
- **Impact**: Eliminates risk of using default/weak passwords in production
- **Implementation**: 
  - Backend: `mustChangePassword` flag added to user schema
  - Frontend: Modal enforces password change before continuing
  - Password policy: 8+ characters, uppercase, lowercase, and digit required

#### 2. API Key Authentication
- **Status**: ✅ Implemented  
- **Description**: Optional API key requirement for sensitive endpoints
- **Impact**: Prevents unauthorized access to API endpoints
- **Configuration**: `API_KEYS` environment variable (comma-separated)
- **Protected Endpoints**:
  - `/api/print-ticket` - Server-side printing
  - All `/api/admin/*` endpoints (backup operations)
- **Usage**: Send key via `X-API-Key` header or `?apiKey=` query parameter

#### 3. IP Whitelisting
- **Status**: ✅ Implemented
- **Description**: Optional IP-based access control for API endpoints
- **Impact**: Restricts API access to trusted networks/IPs
- **Configuration**: `ALLOWED_API_IPS` environment variable (comma-separated)
- **Features**:
  - Supports individual IPs: `192.168.1.100`
  - Supports CIDR notation: `192.168.1.0/24`
  - Empty configuration = allow all IPs (default for backwards compatibility)

### Existing Security Features

#### Authentication & Session Management
- **Session-based tokens**: 32-byte random hex tokens with configurable TTL
- **Password hashing**: bcrypt with 10 rounds
- **Password policy**: Minimum 8 characters, requires uppercase, lowercase, and digit
- **Rate limiting**: Login attempts limited to 10 per 15 minutes per IP
- **Legacy hash migration**: Automatic upgrade from SHA256 to bcrypt on login

#### Network Security
- **CORS**: Configurable via `ALLOWED_ORIGINS`
- **Helmet security headers**: XSS protection, frame protection, MIME sniffing prevention
- **Optional CSP**: Can be enabled via `ENABLE_CSP=1`
- **Proxy support**: Respects `X-Forwarded-For` header

#### Data Protection
- **SQLite prepared statements**: Protected against SQL injection
- **Path traversal protection**: Backup downloads validated
- **Request size limits**: JSON body limited to 10MB
- **Secure file operations**: Backup and log files validated

### Known Vulnerabilities

#### esbuild vulnerability (GHSA-67mh-4wv8-2f99)
- **Severity**: Moderate
- **Package**: esbuild <=0.24.2
- **Issue**: esbuild enables any website to send requests to the development server and read the response
- **Impact**: Development-only vulnerability. Does not affect production builds.
- **Status**: Not fixed (requires vite upgrade which is a breaking change)
- **Recommendation**: 
  - Do NOT expose the development server to untrusted networks
  - Only run `npm run dev` on localhost or in trusted development environments
  - Production deployments (`npm run build` + `npm start`) are NOT affected

#### vite dependency chain
- **Severity**: Moderate
- **Package**: vite 0.11.0 - 6.1.6
- **Issue**: Depends on vulnerable versions of esbuild
- **Impact**: Development-only
- **Status**: Not fixed (breaking change)
- **Recommendation**: 
  - Upgrade to vite 7.x+ when ready to handle breaking changes
  - Current version (5.1.6) is functional and safe for production use

### Summary
Both vulnerabilities affect **development dependencies only** and do not pose a risk to production deployments. The application builds and runs safely in production mode.

### Actions Required
- [ ] Monitor for vite 7.x stable release
- [ ] Test application with vite 7.x when available
- [ ] Update dependencies when breaking changes can be accommodated
- [ ] Continue to run development server only on trusted networks

### Mitigation in Place
- Development server is configured to bind to localhost by default
- Production builds use static files served by Node.js/Express
- Helmet security headers are applied in production
- CORS is properly configured with ALLOWED_ORIGINS
