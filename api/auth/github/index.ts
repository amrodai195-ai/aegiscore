import crypto from 'node:crypto';
import { config } from '../../../server/config';

export default function handler(_req: any, res: any) {
  if (!config.github.clientId) return res.status(503).send('GitHub OAuth is not configured.');
  const state = crypto.randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie', `aegis_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.github.clientId);
  url.searchParams.set('redirect_uri', `${config.appUrl}/api/auth/github/callback`);
  url.searchParams.set('scope', config.github.scopes);
  url.searchParams.set('state', state);
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}
