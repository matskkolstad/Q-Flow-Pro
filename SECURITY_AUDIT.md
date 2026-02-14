# Security Audit Report

## Date: 2026-02-14

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
