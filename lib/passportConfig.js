import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Issuer, Strategy as OpenIDStrategy } from 'openid-client';
import crypto from 'crypto';

let googleStrategy = null;
let oidcStrategy = null;
let oidcClient = null;

// Initialize passport strategies based on configuration
export const initializePassport = (state, createSessionForUser, addLog) => {
  // Clear existing strategies
  passport.unuse('google');
  passport.unuse('oidc');
  
  const authProviders = state.authProviders || {};
  
  // Configure Google OAuth
  if (authProviders.google?.enabled && authProviders.google?.clientId && authProviders.google?.clientSecret) {
    const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';
    
    googleStrategy = new GoogleStrategy(
      {
        clientID: authProviders.google.clientId,
        clientSecret: authProviders.google.clientSecret,
        callbackURL: callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const googleId = profile.id;
          
          // Check if allowed domains are configured
          if (authProviders.google.allowedDomains && authProviders.google.allowedDomains.length > 0) {
            if (!email) {
              return done(null, false, { message: 'Email required for domain validation' });
            }
            const emailDomain = email.split('@')[1];
            if (!authProviders.google.allowedDomains.includes(emailDomain)) {
              return done(null, false, { message: 'Domain not allowed' });
            }
          }
          
          // Find existing user by Google ID or email
          let user = state.users.find(u => u.externalId === googleId && u.provider === 'google');
          
          if (!user && email) {
            // Try to find by email
            user = state.users.find(u => u.email === email);
            if (user) {
              // Link existing user to Google account
              const idx = state.users.findIndex(u => u.id === user.id);
              if (idx !== -1) {
                state.users[idx] = {
                  ...user,
                  externalId: googleId,
                  provider: 'google',
                  email: email
                };
                user = state.users[idx];
              }
            }
          }
          
          // Auto-provision new user if enabled
          if (!user && authProviders.google.autoProvision) {
            const newUser = {
              id: `u_google_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
              name: profile.displayName || email || 'Google User',
              username: email || `google_${googleId}`,
              email: email,
              role: authProviders.google.defaultRole || 'OPERATOR',
              externalId: googleId,
              provider: 'google',
            };
            state.users.push(newUser);
            user = newUser;
          }
          
          if (!user) {
            return done(null, false, { message: 'User not found and auto-provisioning is disabled' });
          }
          
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
      .then(issuer => {
        oidcClient = new issuer.Client({
          client_id: authProviders.oidc.clientId,
          client_secret: authProviders.oidc.clientSecret,
          redirect_uris: [callbackURL],
          response_types: ['code'],
        });
        
        oidcStrategy = new OpenIDStrategy(
          {
            client: oidcClient,
            params: {
              scope: 'openid profile email',
            },
          },
          async (tokenSet, userInfo, done) => {
            try {
              const oidcSub = userInfo.sub;
              const email = userInfo.email;
              const name = userInfo.name || userInfo.preferred_username || email || 'OIDC User';
              
              // Find existing user by OIDC sub or email
              let user = state.users.find(u => u.externalId === oidcSub && u.provider === 'oidc');
              
              if (!user && email) {
                // Try to find by email
                user = state.users.find(u => u.email === email);
                if (user) {
                  // Link existing user to OIDC account
                  const idx = state.users.findIndex(u => u.id === user.id);
                  if (idx !== -1) {
                    state.users[idx] = {
                      ...user,
                      externalId: oidcSub,
                      provider: 'oidc',
                      email: email
                    };
                    user = state.users[idx];
                  }
                }
              }
              
              // Auto-provision new user if enabled
              if (!user && authProviders.oidc.autoProvision) {
                const newUser = {
                  id: `u_oidc_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
                  name: name,
                  username: email || `oidc_${oidcSub}`,
                  email: email,
                  role: authProviders.oidc.defaultRole || 'OPERATOR',
                  externalId: oidcSub,
                  provider: 'oidc',
                };
                state.users.push(newUser);
                user = newUser;
              }
              
              if (!user) {
                return done(null, false, { message: 'User not found and auto-provisioning is disabled' });
              }
              
              return done(null, user);
            } catch (err) {
              return done(err);
            }
          }
        );
        
        passport.use('oidc', oidcStrategy);
      })
      .catch(err => {
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
    const user = state.users.find(u => u.id === id);
    done(null, user);
  });
};

export const isGoogleConfigured = (state) => {
  const authProviders = state.authProviders || {};
  return authProviders.google?.enabled && 
         authProviders.google?.clientId && 
         authProviders.google?.clientSecret;
};

export const isOIDCConfigured = (state) => {
  const authProviders = state.authProviders || {};
  return authProviders.oidc?.enabled && 
         authProviders.oidc?.issuerUrl && 
         authProviders.oidc?.clientId && 
         authProviders.oidc?.clientSecret;
};
