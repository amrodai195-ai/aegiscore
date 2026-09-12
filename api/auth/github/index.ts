import crypto from 'node:crypto';

export default function handler(_req: any, res: any) {
  const clientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
  if (!clientId) {
    res.statusCode = 503;
    res.end('GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Vercel.');
    return;
  }
  const state = crypto.randomBytes(32).toString('hex');
  const appUrl = String(process.env.APP_URL || 'https://aegiscore-lac.vercel.app').replace(/\/$/, '');
  const scopes = process.env.GITHUB_OAUTH_SCOPES || 'read:user user:email repo';
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${appUrl}/api/auth/github/callback`);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', state);
  res.setHeader('Set-Cookie', `aegis_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}
