import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import * as oidc from 'openid-client';

const SESSION_COOKIE = 'knote_session';
const TRANSACTION_COOKIE = 'knote_oidc_transaction';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const TRANSACTION_TTL_SECONDS = 10 * 60;
const MAX_COOKIE_VALUE_LENGTH = 3_600;
const PRODUCTION_CALLBACK = 'https://knote.karmancos.space/auth/callback';
const LOCAL_CALLBACK = 'http://localhost:5173/auth/callback';

export interface KarmancosProfile {
  subject: string;
  username: string | null;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
  picture: string | null;
}

interface RuntimeSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: URL;
  sessionSecret: string;
}

interface CookieEnvelope {
  expiresAt: number;
}

interface OidcTransaction extends CookieEnvelope {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

interface KNoteSession extends CookieEnvelope {
  profile: KarmancosProfile;
}

interface RuntimeEnvironment {
  KARMANCOSID_ISSUER?: string;
  KARMANCOSID_CLIENT_ID?: string;
  KARMANCOSID_CLIENT_SECRET?: string;
  KARMANCOSID_REDIRECT_URI?: string;
  KNOTE_SESSION_SECRET?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
}

class AuthConfigurationError extends Error {}

let cachedConfiguration: {
  key: string;
  promise: Promise<oidc.Configuration>;
} | undefined;

function environment(): RuntimeEnvironment {
  return process.env;
}

function defaultRedirectUri(env: RuntimeEnvironment): string {
  if (env.VERCEL === '1') {
    return env.VERCEL_ENV === 'production' ? PRODUCTION_CALLBACK : '';
  }
  return LOCAL_CALLBACK;
}

function getRuntimeSettings(): RuntimeSettings {
  const env = environment();
  const issuer = env.KARMANCOSID_ISSUER?.trim() ?? '';
  const clientId = env.KARMANCOSID_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.KARMANCOSID_CLIENT_SECRET?.trim() ?? '';
  const sessionSecret = env.KNOTE_SESSION_SECRET?.trim() ?? '';
  const redirectValue = env.KARMANCOSID_REDIRECT_URI?.trim() || defaultRedirectUri(env);

  if (!issuer || !clientId || !clientSecret || !sessionSecret || !redirectValue) {
    throw new AuthConfigurationError('Karmancos ID aún no está configurado en el servidor.');
  }
  if (sessionSecret.length < 32) {
    throw new AuthConfigurationError('La clave de sesión del servidor debe tener al menos 32 caracteres.');
  }

  let issuerUrl: URL;
  let redirectUri: URL;
  try {
    issuerUrl = new URL(issuer);
    redirectUri = new URL(redirectValue);
  } catch {
    throw new AuthConfigurationError('El issuer o el callback de Karmancos ID no tiene un formato válido.');
  }

  if (issuerUrl.protocol !== 'https:' || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash) {
    throw new AuthConfigurationError('El issuer de Karmancos ID debe ser un emisor HTTPS válido.');
  }
  if (redirectUri.protocol !== 'https:' && !(redirectUri.protocol === 'http:' && isLoopback(redirectUri.hostname))) {
    throw new AuthConfigurationError('El callback de Karmancos ID debe usar HTTPS.');
  }
  if (redirectUri.pathname !== '/auth/callback' || redirectUri.search || redirectUri.hash) {
    throw new AuthConfigurationError('El callback debe ser la URI exacta registrada en Karmancos ID.');
  }

  return { issuer, clientId, clientSecret, redirectUri, sessionSecret };
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isConfigured(): boolean {
  try {
    getRuntimeSettings();
    return true;
  } catch {
    return false;
  }
}

function cookieKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from('knote-karmancosid-v1', 'utf8'),
    Buffer.from(`cookie:${purpose}`, 'utf8'),
    32,
  ));
}

function seal<T extends CookieEnvelope>(value: T, secret: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(secret, purpose), iv);
  cipher.setAAD(Buffer.from(`knote:${purpose}:v1`, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

function unseal<T extends CookieEnvelope>(value: string, secret: string, purpose: string): T | null {
  try {
    const payload = Buffer.from(value, 'base64url');
    if (payload.length < 29 || value.length > MAX_COOKIE_VALUE_LENGTH) return null;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(secret, purpose), iv);
    decipher.setAAD(Buffer.from(`knote:${purpose}:v1`, 'utf8'));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const decoded = JSON.parse(plaintext) as T;
    if (!Number.isSafeInteger(decoded.expiresAt) || decoded.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  const matches = header.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  return matches[0].slice(name.length + 1) || null;
}

function cookieHeader(request: Request, name: string, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function clearCookie(request: Request, name: string): string {
  const secure = new URL(request.url).protocol === 'https:';
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`;
}

function baseHeaders(contentType?: string): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (contentType) headers.set('Content-Type', contentType);
  return headers;
}

function redirect(location: string, cookies: string[] = [], status = 303): Response {
  const headers = baseHeaders();
  headers.set('Location', location);
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status, headers });
}

function safeReturnPath(value: string | null, origin: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function appRedirect(settings: RuntimeSettings, returnTo: string, error?: string): string {
  const url = new URL(returnTo, settings.redirectUri.origin);
  if (error) url.searchParams.set('authError', error);
  return url.href;
}

function safeText(value: unknown, maxLength = 180): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safePicture(value: unknown): string | null {
  const candidate = safeText(value, 1_024);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function mapProfile(claims: Record<string, unknown>): KarmancosProfile {
  const subject = safeText(claims.sub, 256);
  if (!subject) throw new Error('El token de identidad no contiene un subject válido.');

  const givenName = safeText(claims.given_name);
  const familyName = safeText(claims.family_name);
  const nameFromParts = [givenName, familyName].filter((part): part is string => Boolean(part)).join(' ');
  return {
    subject,
    username: safeText(claims.preferred_username) ?? safeText(claims.username) ?? safeText(claims.nickname),
    givenName,
    familyName,
    fullName: safeText(claims.name) ?? (nameFromParts || null),
    picture: safePicture(claims.picture),
  };
}

async function oidcConfiguration(settings: RuntimeSettings): Promise<oidc.Configuration> {
  const key = `${settings.issuer}\u0000${settings.clientId}\u0000${settings.clientSecret}`;
  if (cachedConfiguration?.key === key) return cachedConfiguration.promise;

  const promise = oidc.discovery(
    new URL(settings.issuer),
    settings.clientId,
    undefined,
    oidc.ClientSecretBasic(settings.clientSecret),
  ).then((configuration) => {
    if (configuration.serverMetadata().issuer !== settings.issuer) {
      throw new Error('El issuer de Discovery no coincide con la configuración.');
    }
    return configuration;
  });
  cachedConfiguration = { key, promise };
  try {
    return await promise;
  } catch (error) {
    if (cachedConfiguration?.key === key) cachedConfiguration = undefined;
    throw error;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: baseHeaders('application/json; charset=utf-8'),
  });
}

/** Returns the authenticated KNote identity from the encrypted, HttpOnly cookie. */
export function getAuthenticatedProfile(request: Request): KarmancosProfile | null {
  try {
    const settings = getRuntimeSettings();
    const value = readCookie(request, SESSION_COOKIE);
    const session = value ? unseal<KNoteSession>(value, settings.sessionSecret, 'session') : null;
    const profile = session?.profile;
    return profile && typeof profile.subject === 'string' && profile.subject.length > 0 ? profile : null;
  } catch {
    return null;
  }
}

export async function handleSession(request: Request): Promise<Response> {
  if (request.method !== 'GET') return jsonResponse({ error: 'Método no permitido.' }, 405);
  if (!isConfigured()) return jsonResponse({ configured: false, profile: null });

  try {
    getRuntimeSettings();
    return jsonResponse({ configured: true, profile: getAuthenticatedProfile(request) });
  } catch {
    return jsonResponse({ configured: false, profile: null });
  }
}

export async function handleLogin(request: Request): Promise<Response> {
  if (request.method !== 'GET') return jsonResponse({ error: 'Método no permitido.' }, 405);

  let settings: RuntimeSettings;
  try {
    settings = getRuntimeSettings();
  } catch {
    return redirect('/?authError=configuration', [], 302);
  }

  try {
    const configuration = await oidcConfiguration(settings);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const returnTo = safeReturnPath(new URL(request.url).searchParams.get('returnTo'), settings.redirectUri.origin);
    const transaction: OidcTransaction = {
      state,
      nonce,
      codeVerifier,
      returnTo,
      expiresAt: Math.floor(Date.now() / 1000) + TRANSACTION_TTL_SECONDS,
    };
    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      response_type: 'code',
      redirect_uri: settings.redirectUri.href,
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return redirect(authorizationUrl.href, [
      cookieHeader(request, TRANSACTION_COOKIE, seal(transaction, settings.sessionSecret, 'transaction'), TRANSACTION_TTL_SECONDS),
    ], 302);
  } catch {
    return redirect(appRedirect(settings, '/', 'provider'), [], 302);
  }
}

export async function handleCallback(request: Request): Promise<Response> {
  if (request.method !== 'GET') return jsonResponse({ error: 'Método no permitido.' }, 405);

  let settings: RuntimeSettings;
  try {
    settings = getRuntimeSettings();
  } catch {
    return redirect('/', [clearCookie(request, TRANSACTION_COOKIE)], 302);
  }

  const cookieValue = readCookie(request, TRANSACTION_COOKIE);
  const transaction = cookieValue
    ? unseal<OidcTransaction>(cookieValue, settings.sessionSecret, 'transaction')
    : null;
  const incomingCallback = new URL(request.url);
  const callbackUrl = new URL(settings.redirectUri.href);
  incomingCallback.searchParams.forEach((value, key) => callbackUrl.searchParams.append(key, value));
  const responseState = callbackUrl.searchParams.get('state');
  const clearTransaction = clearCookie(request, TRANSACTION_COOKIE);

  if (!transaction || !responseState || !constantTimeEqual(transaction.state, responseState)) {
    return redirect(appRedirect(settings, '/', 'state'), [clearTransaction], 302);
  }
  if (callbackUrl.searchParams.has('error')) {
    return redirect(appRedirect(settings, transaction.returnTo, 'provider'), [clearTransaction], 302);
  }

  try {
    const configuration = await oidcConfiguration(settings);
    const tokens = await oidc.authorizationCodeGrant(configuration, callbackUrl, {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
    const idTokenClaims = tokens.claims() as Record<string, unknown> | undefined;
    if (!idTokenClaims) throw new Error('No se pudo validar el ID token.');

    let userInfoClaims: Record<string, unknown> | undefined;
    if (tokens.access_token && configuration.serverMetadata().userinfo_endpoint && typeof idTokenClaims.sub === 'string') {
      try {
        userInfoClaims = await oidc.fetchUserInfo(
          configuration,
          tokens.access_token,
          idTokenClaims.sub,
        ) as Record<string, unknown>;
      } catch {
        // The signature-verified ID token remains a safe source for standard profile claims.
      }
    }

    const profile = mapProfile({ ...idTokenClaims, ...userInfoClaims });
    let sessionValue = seal<KNoteSession>({
      profile,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }, settings.sessionSecret, 'session');
    if (sessionValue.length > MAX_COOKIE_VALUE_LENGTH) {
      sessionValue = seal<KNoteSession>({
        profile: { ...profile, picture: null },
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      }, settings.sessionSecret, 'session');
    }
    if (sessionValue.length > MAX_COOKIE_VALUE_LENGTH) throw new Error('El perfil supera el tamaño de sesión permitido.');

    return redirect(appRedirect(settings, transaction.returnTo), [
      clearTransaction,
      cookieHeader(request, SESSION_COOKIE, sessionValue, SESSION_TTL_SECONDS),
    ]);
  } catch (error) {
    logCallbackFailure(error);
    return redirect(appRedirect(settings, transaction.returnTo, callbackFailureCode(error)), [clearTransaction], 302);
  }
}

export async function handleLogout(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  try {
    const settings = getRuntimeSettings();
    const requestOrigin = new URL(request.url).origin;
    if (request.headers.get('origin') !== requestOrigin || requestOrigin !== settings.redirectUri.origin) {
      return jsonResponse({ error: 'Origen no permitido.' }, 403);
    }
  } catch {
    const originHeader = request.headers.get('origin');
    if (!originHeader || originHeader !== new URL(request.url).origin) {
      return jsonResponse({ error: 'Origen no permitido.' }, 403);
    }
  }

  const headers = baseHeaders('application/json; charset=utf-8');
  headers.append('Set-Cookie', clearCookie(request, SESSION_COOKIE));
  headers.append('Set-Cookie', clearCookie(request, TRANSACTION_COOKIE));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function callbackFailureCode(error: unknown): 'credentials' | 'grant' | 'callback' {
  if (!(error instanceof oidc.ResponseBodyError)) return 'callback';
  if (error.error === 'invalid_client' || error.error === 'unauthorized_client') return 'credentials';
  if (error.error === 'invalid_grant') return 'grant';
  return 'callback';
}

function logCallbackFailure(error: unknown): void {
  const details = error instanceof oidc.ResponseBodyError
    ? { errorType: error.name, oauthError: error.error, status: error.status }
    : { errorType: error instanceof Error ? error.name : 'UnknownError' };
  console.error('[Karmancos ID] Callback processing failed', details);
}

export async function handleAuthRequest(request: Request, route: string): Promise<Response> {
  switch (route) {
    case '/auth/login':
    case '/api/auth/login':
      return handleLogin(request);
    case '/auth/callback':
    case '/api/auth/callback':
      return handleCallback(request);
    case '/auth/session':
    case '/api/auth/session':
      return handleSession(request);
    case '/auth/logout':
    case '/api/auth/logout':
      return handleLogout(request);
    default:
      return jsonResponse({ error: 'Ruta no encontrada.' }, 404);
  }
}
