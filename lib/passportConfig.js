import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Issuer, Strategy as OpenIDStrategy } from 'openid-client';
import crypto from 'crypto';

// Error codes passed back to the login page (see Login.tsx).
export const AUTH_ERRORS = {
  domainNotAllowed: 'domain_not_allowed',
  emailNotVerified: 'email_not_verified',
  userNotFound: 'user_not_found',
};

const isTrue = (value) => value === true || value === 'true';

/**
 * Finds the local user for an external identity, links by e-mail when the provider
 * vouches for the address, or auto-provisions a new user when enabled.
 * Users created or linked here never receive a local password.
 */
const resolveExternalUser = (state, { provider, externalId, email, emailVerified, name, config }) => {
  let user = state.users.find((u) => u.externalId === externalId && u.provider === provider);

  // Linking by e-mail is only safe when the provider has verified the address;
  // otherwise anyone could register the address elsewhere and take over the account.
  const trustedEmail = email && emailVerified ? email : null;

  if (!user && trustedEmail) {
    const idx = state.users.findIndex((u) => typeof u.email === 'string' && u.email.toLowerCase() === trustedEmail.toLowerCase());
    if (idx !== -1) {
      state.users[idx] = { ...state.users[idx], externalId, provider, email: trustedEmail };
      user = state.users[idx];
    }
  }

  if (!user && config.autoProvision) {
    const newUser = {
      id: `u_${provider}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      name: name || trustedEmail || `${provider} user`,
      username: trustedEmail || `${provider}_${externalId}`,
      email: trustedEmail || undefined,
      role: config.defaultRole === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
      externalId,
      provider,
      passwordHash: '',
      mustChangePassword: false,
    };
    state.users.push(newUser);
    user = newUser;
  }

  return user || null;
};

// Initialize passport strategies based on configuration
export const initializePassport = (state, createSessionForUser, addLog) => {
  // Clear existing strategies
  passport.unuse('google');
  passport.unuse('oidc');

  const authProviders = state.authProviders || {};

  // Configure Google OAuth
  if (authProviders.google?.enabled && authProviders.google?.clientId && authProviders.google?.clientSecret) {
    const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

    const googleStrategy = new GoogleStrategy(
      {
        clientID: authProviders.google.clientId,
        clientSecret: authProviders.google.clientSecret,
        callbackURL,
        // Binds the callback to the browser session that started the login (CSRF protection).
        state: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const config = state.authProviders?.google || {};
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const emailVerified = isTrue(profile._json?.email_verified) || isTrue(profile.emails?.[0]?.verified);

          if (config.allowedDomains && config.allowedDomains.length > 0) {
            if (!email || !emailVerified) {
              return done(null, false, { message: AUTH_ERRORS.emailNotVerified });
            }
            const emailDomain = email.split('@')[1]?.toLowerCase();
            const allowed = config.allowedDomains.map((d) => String(d).trim().toLowerCase());
            if (!allowed.includes(emailDomain)) {
              return done(null, false, { message: AUTH_ERRORS.domainNotAllowed });
            }
          }

          const user = resolveExternalUser(state, {
            provider: 'google',
            externalId: profile.id,
            email,
            emailVerified,
            name: profile.displayName,
            config,
          });
          if (!user) return done(null, false, { message: AUTH_ERRORS.userNotFound });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    );

    passport.use('google', googleStrategy);
  }

  // Configure OIDC
  if (authProviders.oidc?.enabled && authProviders.oidc?.issuerUrl && authProviders.oidc?.clientId && authProviders.oidc?.clientSecret) {
    const callbackURL = process.env.OIDC_CALLBACK_URL || 'http://localhost:3000/auth/oidc/callback';

    // Discover OIDC configuration and create strategy
    Issuer.discover(authProviders.oidc.issuerUrl)
      .then((issuer) => {
        const oidcClient = new issuer.Client({
          client_id: authProviders.oidc.clientId,
          client_secret: authProviders.oidc.clientSecret,
          redirect_uris: [callbackURL],
          response_types: ['code'],
        });

        // openid-client's strategy stores state/nonce/PKCE in the session.
        const oidcStrategy = new OpenIDStrategy(
          {
            client: oidcClient,
            params: {
              scope: 'openid profile email',
            },
            usePKCE: true,
          },
          async (tokenSet, userInfo, done) => {
            try {
              const config = state.authProviders?.oidc || {};
              const email = userInfo.email;
              // Some providers (e.g. Entra ID) omit email_verified; admins can opt out explicitly.
              const emailVerified = config.requireVerifiedEmail === false ? !!email : isTrue(userInfo.email_verified);
              const user = resolveExternalUser(state, {
                provider: 'oidc',
                externalId: userInfo.sub,
                email,
                emailVerified,
                name: userInfo.name || userInfo.preferred_username || email,
                config,
              });
              if (!user) return done(null, false, { message: AUTH_ERRORS.userNotFound });
              return done(null, user);
            } catch (err) {
              return done(err);
            }
          }
        );

        passport.use('oidc', oidcStrategy);
      })
      .catch((err) => {
        console.error('Failed to discover OIDC provider:', err);
        if (addLog) {
          addLog(`OIDC discovery failed for ${authProviders.oidc.issuerUrl}: ${err.message || err}`, 'ALERT');
        }
      });
  }

  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser((id, done) => {
    const user = state.users.find((u) => u.id === id);
    done(null, user);
  });
};

export const isGoogleConfigured = (state) => {
  const authProviders = state.authProviders || {};
  return !!(authProviders.google?.enabled
    && authProviders.google?.clientId
    && authProviders.google?.clientSecret);
};

export const isOIDCConfigured = (state) => {
  const authProviders = state.authProviders || {};
  return !!(authProviders.oidc?.enabled
    && authProviders.oidc?.issuerUrl
    && authProviders.oidc?.clientId
    && authProviders.oidc?.clientSecret);
};
