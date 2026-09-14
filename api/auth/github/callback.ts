import crypto from 'node:crypto';
import type { Request, Response } from 'express';
function cookies(req: Request) { return Object.fromEntries(String(req.headers.cookie ?? '').split(';').filter(Boolean).map((part: string) => { const [key, ...value] = part.trim().split('='); return [key, decodeURIComponent(value.join('='))]; })); }
function reply(res: Response, code: number, message: string) { res.statusCode = code; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(message); }
export default async function handler(req: Request, res: Response) {
  try {
    const code = String(req.query?.code ?? ''); const state = String(req.query?.state ?? ''); const expected = cookies(req).aegis_oauth_state;
    if (!code || !state || !expected || Buffer.byteLength(state) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return reply(res, 400, 'Invalid OAuth state or callback parameters. Please restart GitHub sign-in.');
    const { config } = await import('../../../server/config');
    const { encryptGithubToken, createSession } = await import('../../../server/auth');
    const { upsertGithubUser } = await import('../../../server/db');
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: config.github.clientId, client_secret: config.github.clientSecret, code, redirect_uri: `${config.appUrl}/api/auth/github/callback` }) });
    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokenData.access_token) throw new Error(tokenData.error_description ?? tokenData.error ?? 'GitHub did not return an access token');
    const headers = { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const [profileResponse, emailResponse] = await Promise.all([fetch('https://api.github.com/user', { headers }), fetch('https://api.github.com/user/emails', { headers })]);
    if (!profileResponse.ok) throw new Error('Unable to load the GitHub profile');
    const profile = await profileResponse.json() as { id: number; login: string; name?: string | null; email?: string | null; avatar_url?: string };
    const emails = emailResponse.ok ? await emailResponse.json() as Array<{ email: string; primary: boolean; verified: boolean }> : [];
    const email = emails.find((entry) => entry.primary && entry.verified)?.email ?? profile.email ?? `${profile.login}@users.noreply.github.com`;
    const user = await upsertGithubUser({ githubId: String(profile.id), githubLogin: profile.login, name: profile.name ?? profile.login, email, avatarUrl: profile.avatar_url ?? null, githubTokenEncrypted: encryptGithubToken(tokenData.access_token) });
    const session = await createSession(user.id); res.setHeader('Set-Cookie', [`aegis_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`, 'aegis_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']); res.statusCode = 302; res.setHeader('Location', '/'); res.end();
  } catch (error) { reply(res, 503, error instanceof Error ? error.message : 'GitHub login failed'); }
}
