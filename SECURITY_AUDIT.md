# Security Audit Report

## Date: 2026-04-10

## ⚠️ AI Development Disclaimer

**IMPORTANT NOTICE**: This application is entirely developed using Artificial Intelligence (AI).

The owner makes **NO WARRANTIES** of any kind and assumes **NO LIABILITY** for:
- Security vulnerabilities or breaches
- Software defects, bugs, or errors
- Data loss, corruption, or integrity issues
- Compliance with security standards or regulations

**Users are solely responsible for:**
- Conducting independent security assessments
- Implementing appropriate security measures
- Testing and validating all security features
- Ensuring compliance with applicable requirements

**USE AT YOUR OWN RISK.** See [LICENSE](LICENSE) for complete terms.

---

## Security Enhancements (Latest Update)

### Dependency Risk Remediation (2026-04-10)
- **Socket.IO**: Updated `socket.io` / `socket.io-client` to 4.8.3 (pulls `socket.io-parser` >= 4.2.6) to fix high-severity attachment flooding (GHSA-677m-j7p3-52f9)
- **Express routing**: Forced `path-to-regexp` to 0.1.13 to mitigate ReDoS on routes with multiple parameters (GHSA-37ch-88jc-xwx2)
- **Glob matching**: Forced `picomatch` to patched versions (2.3.2 and 4.0.4 for transitive deps) to eliminate method injection/ReDoS risks
- **Build toolchain**: Forced `rollup` to 4.59.1 to close the arbitrary file write advisory (GHSA-mw96-cpmx-2vgc)
- **Status**: `npm audit` now reports **0 high/critical** issues; remaining **2 moderate** advisories are Vite/esbuild dev-only (see Known Vulnerabilities)

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

#### Vite / esbuild (development-only)
- **Severity**: Moderate (2 findings)
- **Packages**: vite <= 6.4.1 (path traversal in `.map` handling), esbuild <= 0.24.2 (dev server request leakage)
- **Impact**: Development-time only; production build artifacts are not affected
- **Status**: Not fixed (requires major Vite upgrade)
- **Recommendations**:
  - Run `npm run dev` only on trusted networks/hosts
  - Prefer production build + `npm start` for any exposed environment
  - Plan upgrade testing to Vite 8.x when feasible to drop these advisories

### Summary
- Runtime dependencies: **no known high/critical vulnerabilities outstanding** after April 2026 updates.
- Development dependencies: **2 moderate** advisories remain (Vite/esbuild) and are isolated to the dev server pipeline.

### Actions Required
- [ ] Schedule a Vite upgrade/migration (target 8.x) and validate build/test matrix
- [ ] Keep running the dev server only on trusted networks until upgrade is complete

### Mitigation in Place
- Development server is configured to bind to localhost by default
- Production builds use static files served by Node.js/Express
- Helmet security headers are applied in production
- CORS is properly configured with ALLOWED_ORIGINS
