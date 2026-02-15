# OAuth/OIDC Authentication Guide

Q-Flow Pro supports external authentication using Google Workspace and generic OIDC (OpenID Connect) providers.

## Features

- **Google Workspace Authentication**: Allow users to sign in with their Google accounts
- **OIDC Authentication**: Support for enterprise identity providers like Entra ID (Azure AD), Keycloak, Auth0, Okta, and others
- **Admin Configuration**: Configure authentication providers through the admin interface without code changes
- **Auto-provisioning**: Automatically create user accounts on first login
- **Domain Whitelisting**: Restrict Google sign-ins to specific domains (for Google Workspace organizations)
- **Account Linking**: Automatically link external accounts to existing users by email
- **Rate Limiting**: Built-in protection against brute-force attacks

## Configuration

### Option 1: Environment Variables (Recommended for Production)

Add the following to your `.env` file:

```bash
# Session Secret (REQUIRED for OAuth)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=your-generated-secret-here

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-app.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback

# OIDC Provider (optional)
OIDC_ISSUER_URL=https://login.microsoftonline.com/{tenant-id}/v2.0
OIDC_CLIENT_ID=application-id
OIDC_CLIENT_SECRET=client-secret
OIDC_CALLBACK_URL=https://your-domain.com/auth/oidc/callback
```

### Option 2: Admin Interface (Easiest)

1. Log in as an administrator
2. Go to **Settings → General**
3. Scroll to the **Authentication Providers** section
4. Configure Google Workspace or OIDC providers

Changes take effect immediately without restarting the server.

## Setting Up Google Workspace Authentication

### 1. Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API**
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth 2.0 Client ID**
6. Choose **Web application**
7. Add authorized redirect URIs:
   - Development: `http://localhost:3000/auth/google/callback`
   - Production: `https://your-domain.com/auth/google/callback`
8. Save and copy the **Client ID** and **Client Secret**

### 2. Configure in Q-Flow Pro

**Via Admin Interface:**
1. Navigate to **Settings → General → Authentication Providers**
2. Enable **Google Workspace**
3. Enter your **Client ID** and **Client Secret**
4. (Optional) Add allowed domains (e.g., `company.com`) to restrict access
5. Enable **Auto-provision** if you want to automatically create accounts for new users
6. Choose default role for new users: **OPERATOR** or **ADMIN**

**Via Environment:**
```bash
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback
```

Then enable and configure through the admin interface.

## Setting Up OIDC Authentication

OIDC works with many identity providers. Here are examples:

### Microsoft Entra ID (Azure AD)

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory → App registrations**
3. Click **New registration**
4. Set redirect URI: `https://your-domain.com/auth/oidc/callback`
5. After creation, note the **Application (client) ID**
6. Go to **Certificates & secrets** → Create a new client secret
7. Find the **Issuer URL** in **Endpoints**: Usually `https://login.microsoftonline.com/{tenant-id}/v2.0`

Configuration:
```bash
OIDC_ISSUER_URL=https://login.microsoftonline.com/{tenant-id}/v2.0
OIDC_CLIENT_ID={application-id}
OIDC_CLIENT_SECRET={secret-value}
```

### Keycloak

1. In Keycloak admin console, create a new client
2. Set **Access Type** to `confidential`
3. Set **Valid Redirect URIs**: `https://your-domain.com/auth/oidc/callback`
4. Save and go to **Credentials** tab to get the secret
5. Issuer URL format: `https://keycloak-server/auth/realms/{realm-name}`

Configuration:
```bash
OIDC_ISSUER_URL=https://keycloak-server/auth/realms/your-realm
OIDC_CLIENT_ID=qflow-pro
OIDC_CLIENT_SECRET={secret}
```

### Auth0

1. Create a new application in [Auth0 Dashboard](https://manage.auth0.com/)
2. Choose **Regular Web Application**
3. Add callback URL: `https://your-domain.com/auth/oidc/callback`
4. Note your **Client ID** and **Client Secret**
5. Issuer URL format: `https://{tenant}.auth0.com/`

Configuration:
```bash
OIDC_ISSUER_URL=https://your-tenant.auth0.com/
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-secret
```

### Okta

1. In Okta admin, go to **Applications → Create App Integration**
2. Choose **OIDC - OpenID Connect** and **Web Application**
3. Add sign-in redirect URI: `https://your-domain.com/auth/oidc/callback`
4. Note the **Client ID** and **Client Secret**
5. Issuer URL format: `https://{domain}.okta.com/oauth2/default`

Configuration:
```bash
OIDC_ISSUER_URL=https://your-domain.okta.com/oauth2/default
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-secret
```

## Security Considerations

### Rate Limiting
All OAuth endpoints are rate-limited using the same mechanism as password-based login:
- Maximum 10 attempts per IP address within 15 minutes
- Automatic blocking after exceeding the limit

### Domain Whitelisting (Google)
For Google Workspace organizations, you can restrict authentication to specific domains:
```
Allowed domains: company.com, partner-company.no
```

This prevents users with personal Gmail accounts from signing in.

### Auto-Provisioning
When enabled, new users are automatically created on their first successful login. Configure the default role carefully:
- **OPERATOR**: Can serve tickets, view dashboard, but cannot modify settings or manage users
- **ADMIN**: Full access to all features

### Account Linking
If a user signs in with an external provider and an account with the same email already exists:
1. The external ID is automatically linked to the existing account
2. The user can then sign in using either method (password or OAuth)
3. This prevents duplicate accounts

### Session Management
- OAuth sessions use express-session with secure cookies
- Session secret must be persistent (set `SESSION_SECRET` in production)
- Sessions expire after 24 hours
- All sessions are invalidated on server restart if SESSION_SECRET changes

## Troubleshooting

### Google Authentication Not Working

**Error: "Redirect URI mismatch"**
- Ensure the callback URL in Google Cloud Console exactly matches your configuration
- Check for trailing slashes or http vs https mismatches

**Error: "Access blocked: This app's request is invalid"**
- Verify that the Google+ API is enabled in your Google Cloud project
- Check that your OAuth consent screen is properly configured

**Error: "Domain not allowed"**
- Check the allowed domains list in Q-Flow Pro admin panel
- Ensure the user's email domain is in the allowed list

### OIDC Authentication Not Working

**Error: "OIDC authentication not configured"**
- Verify the issuer URL is correct and accessible
- Check that OIDC is enabled in the admin panel
- Look for OIDC discovery errors in server logs

**Error: "Failed to discover OIDC provider"**
- Ensure the issuer URL ends with `/.well-known/openid-configuration` endpoint
- Check network connectivity from the server to the OIDC provider
- Verify SSL certificates are valid

**Error: "Invalid client"**
- Double-check the Client ID and Client Secret
- Ensure the client is properly configured in your identity provider

### Auto-Provisioning Not Working

**Users are not created automatically**
- Verify that "Auto-provision" is enabled in the admin panel
- Check server logs for authentication errors
- Ensure the user's email is available in the OAuth response

## Admin Panel Configuration

### Viewing Configuration

Navigate to **Settings → General → Authentication Providers** to see:
- Current status of Google and OIDC providers
- Callback URLs for configuring external services
- Auto-provisioning settings
- Domain restrictions

### Making Changes

All changes through the admin panel:
1. Take effect immediately (no restart required)
2. Are persisted to the database
3. Override environment variable settings
4. Are logged in the system logs

### Callback URLs

The admin panel displays the callback URLs you need to configure in your OAuth providers:
```
Google: https://your-domain.com/auth/google/callback
OIDC: https://your-domain.com/auth/oidc/callback
```

Copy these exactly when setting up your OAuth applications.

## User Experience

### Login Flow

1. Users visit the login page
2. If OAuth is configured, they see additional login buttons:
   - "Continue with Google" (if Google is enabled)
   - "Continue with OIDC" (if OIDC is enabled)
3. Users can choose between:
   - Traditional username/password login
   - OAuth provider login
4. After successful OAuth authentication, users are redirected back and logged in
5. A session token is created, just like password-based login

### First-Time Users (Auto-Provisioning Enabled)

1. User clicks OAuth login button
2. Authenticates with external provider
3. Q-Flow Pro checks if an account exists:
   - If yes: User is logged in
   - If no: New account is created automatically with configured default role
4. User is redirected to the dashboard

### Existing Users (Account Linking)

1. Administrator creates a user account with email: `user@company.com`
2. User clicks "Continue with Google"
3. Signs in with `user@company.com` Google account
4. Q-Flow Pro links the Google account to existing user
5. User can now sign in using either:
   - Username/password (if set)
   - Google OAuth

## Best Practices

1. **Always set SESSION_SECRET in production**
   - Use a cryptographically secure random string
   - Never commit it to version control
   - Keep it persistent across deployments

2. **Use Domain Whitelisting for Google Workspace**
   - Prevents unauthorized personal account access
   - Enforces organizational control

3. **Configure Default Roles Carefully**
   - Start with OPERATOR role for auto-provisioning
   - Manually promote users to ADMIN as needed

4. **Use HTTPS in Production**
   - OAuth requires HTTPS in production
   - Configure SSL certificates before enabling OAuth

5. **Monitor Authentication Logs**
   - Check logs for failed authentication attempts
   - Watch for OIDC discovery errors
   - Review auto-provisioned user accounts

6. **Test with a Limited User First**
   - Before rolling out, test with a non-admin account
   - Verify auto-provisioning works as expected
   - Confirm proper role assignment

## Migration from Password-Only

To add OAuth to an existing deployment:

1. **Backup your database**
   ```bash
   curl -X POST http://localhost:3000/api/admin/backup \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. **Set up OAuth provider** (Google or OIDC)

3. **Add credentials** via admin panel or environment variables

4. **Test with your own account** first

5. **Enable auto-provisioning** if desired

6. **Communicate changes** to users

7. **Keep password authentication** enabled as fallback

## Support and Further Help

- Check server logs in `data/logs/` for detailed error messages
- Review the main [README.md](../README.md) for general system documentation
- Ensure your `.env` file has all required settings
- Verify OAuth credentials in your identity provider's admin panel

## Security Audit Notes

- All OAuth routes include rate limiting
- User IDs are generated using cryptographically secure random bytes
- Session secrets should be persistent and secure
- OIDC discovery failures are logged as alerts
- All authentication attempts are logged with IP addresses
- Domain whitelisting prevents unauthorized access
- Auto-provisioning can be disabled for tighter control
