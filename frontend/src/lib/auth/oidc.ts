// OIDC authorization-code + PKCE flow.
//
// Replaces the previous implicit flow (`response_type=id_token`), which is
// removed in OAuth 2.1 and returned a cluster credential in the URL fragment.
// The token minted here is sent verbatim to the Kubernetes API as a bearer
// token, so it is a cluster credential and is treated as one: no refresh token
// is requested, and nothing is persisted beyond the tab's sessionStorage.

export interface OidcConfig {
  /** Issuer base URL, e.g. https://auth.drj.ninja */
  issuer: string;
  clientId: string;
  /** Space-delimited. Must include openid; groups/email drive K8s RBAC. */
  scopes: string;
  /** Same-origin path that nginx proxies to the issuer's token endpoint. */
  tokenPath: string;
  /** Kubernetes clusters this console fronts; each key maps to an nginx route. */
  clusters?: { key: string; label: string }[];
}

const CONFIG_URL = '/config.json';
const VERIFIER_KEY = 'oidc_code_verifier';
const STATE_KEY = 'oidc_state';
const NONCE_KEY = 'oidc_nonce';

let cached: OidcConfig | null = null;

export async function loadConfig(): Promise<OidcConfig> {
  if (cached) return cached;
  const r = await fetch(CONFIG_URL, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Cannot load ${CONFIG_URL}: HTTP ${r.status}`);
  const c = (await r.json()) as OidcConfig;
  for (const k of ['issuer', 'clientId', 'scopes', 'tokenPath'] as const) {
    if (!c[k]) throw new Error(`${CONFIG_URL} is missing "${k}"`);
  }
  cached = c;
  return c;
}

function randomString(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return base64UrlEncode(a.buffer);
}

function base64UrlEncode(buf: ArrayBuffer): string {
  const b = String.fromCharCode(...new Uint8Array(buf));
  return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

export function redirectUri(): string {
  return location.origin + '/login';
}

/** Build the authorization URL and stash the PKCE verifier + state. */
export async function beginLogin(cfg: OidcConfig): Promise<string> {
  const verifier = randomString();
  const state = randomString(16);
  const nonce = randomString(16);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(NONCE_KEY, nonce);

  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    scope: cfg.scopes,
    state,
    nonce,
    code_challenge: await s256(verifier),
    code_challenge_method: 'S256',
  });
  return `${cfg.issuer.replace(/\/$/, '')}/oauth2/auth?${q.toString()}`;
}

/**
 * Exchange an authorization code for an ID token.
 * Returns the raw id_token; the caller is responsible for storing it.
 */
export async function completeLogin(cfg: OidcConfig, code: string, state: string): Promise<string> {
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const nonce = sessionStorage.getItem(NONCE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(NONCE_KEY);

  if (!expectedState || state !== expectedState) throw new Error('OIDC state mismatch — possible CSRF, login aborted');
  if (!verifier) throw new Error('Missing PKCE verifier — start the login again');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: cfg.clientId,
    code_verifier: verifier,
  });

  const r = await fetch(cfg.tokenPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) throw new Error(`Token exchange failed: HTTP ${r.status}: ${await r.text()}`);

  const tok = await r.json();
  if (!tok.id_token) throw new Error('Token response contained no id_token');

  // The nonce binds this ID token to the authorization request we started.
  const claims = decodeClaims(tok.id_token);
  if (nonce && claims.nonce && claims.nonce !== nonce) throw new Error('OIDC nonce mismatch — login aborted');

  return tok.id_token as string;
}

export function decodeClaims(jwt: string): Record<string, any> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(pad + '='.repeat((4 - (pad.length % 4)) % 4)));
}
