import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Request, Response } from 'express';
import { config } from './config';
import { getUserById, upsertGithubUser } from './db';

const COOKIE_NAME = 'aegis_session';
const STATE_COOKIE = 'aegis_oauth_state';
const SESSION_DAYS = 7;

function secretKey() {
  if (!config.jwtSecret) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(config.jwtSecret);
}

export function setOauthState(res: Response, state: string) {
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  });
}

export function clearOauthState(res: Response) {
  res.clearCookie(STATE_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.nodeEnv === 'production', path: '/' });
}

function parseCookies(req: Request) {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key) out[key] = decodeURIComponent(value.join('='));
  }
  return out;
}

export function getOauthState(req: Request) {
  return parseCookies(req)[STATE_COOKIE];
}

export function createOauthState() {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: number) {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function setSession(res: Response, userId: number) {
  const token = await createSession(userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.nodeEnv === 'production', path: '/' });
}

export async function getSessionUser(req: Request) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const userId = Number(verified.payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return getUserById(userId);
  } catch {
    return null;
  }
}

function tokenKey() {
  if (!config.sessionSecret) throw new Error('SESSION_SECRET is not configured');
  return crypto.createHash('sha256').update(config.sessionSecret).digest();
}

export function encryptGithubToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptGithubToken(payload: string) {
  const [ivRaw, tagRaw, ciphertextRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Invalid encrypted token');
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export async function exchangeGithubCode(code: string, stateExpected: string, stateActual: string | undefined, req: Request, res: Response) {
  if (!stateActual || Buffer.byteLength(stateExpected) !== Buffer.byteLength(stateActual) || !crypto.timingSafeEqual(Buffer.from(stateExpected), Buffer.from(stateActual))) {
    throw new Error('Invalid OAuth state');
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
      redirect_uri: `${config.appUrl}/api/auth/github/callback`,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`GitHub token exchange failed (${tokenResponse.status})`);
  const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenData.access_token) throw new Error(tokenData.error_description ?? tokenData.error ?? 'GitHub did not return an access token');

  const githubHeaders = { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const [profileResponse, emailResponse] = await Promise.all([
    fetch('https://api.github.com/user', { headers: githubHeaders }),
    fetch('https://api.github.com/user/emails', { headers: githubHeaders }),
  ]);
  if (!profileResponse.ok) throw new Error('Unable to load the GitHub profile');
  const profile = (await profileResponse.json()) as { id: number; login: string; name?: string | null; email?: string | null; avatar_url?: string };
  const emails = emailResponse.ok ? ((await emailResponse.json()) as Array<{ email: string; primary: boolean; verified: boolean }>) : [];
  const primaryEmail = emails.find((entry) => entry.primary && entry.verified)?.email ?? profile.email ?? `${profile.login}@users.noreply.github.com`;

  const user = await upsertGithubUser({
    githubId: String(profile.id),
    githubLogin: profile.login,
    name: profile.name ?? profile.login,
    email: primaryEmail,
    avatarUrl: profile.avatar_url ?? null,
    githubTokenEncrypted: encryptGithubToken(tokenData.access_token),
  });

  await setSession(res, user.id);
  clearOauthState(res);
  void req;
}

export async function getGithubTokenForUser(userId: number) {
  const user = await getUserById(userId);
  if (!user?.githubTokenEncrypted) throw new Error('GitHub account is not connected');
  return decryptGithubToken(user.githubTokenEncrypted);
}

export { COOKIE_NAME };
