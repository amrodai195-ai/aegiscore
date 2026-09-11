import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { config, assertProductionConfig } from './config';
import { appRouter } from './routers';
import { createContext } from './context';
import { clearOauthState, createOauthState, exchangeGithubCode, getOauthState, setOauthState } from './auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  assertProductionConfig();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '25mb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.nodeEnv === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'aegiscore', version: '2.0.0', timestamp: new Date().toISOString() }));

  app.get('/api/auth/github', (_req, res) => {
    if (!config.github.clientId) return res.status(503).send('GitHub OAuth is not configured.');
    const state = createOauthState();
    setOauthState(res, state);
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', config.github.clientId);
    url.searchParams.set('redirect_uri', `${config.appUrl}/api/auth/github/callback`);
    url.searchParams.set('scope', config.github.scopes);
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  });

  app.get('/api/auth/github/callback', async (req, res) => {
    try {
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      if (!code || !state) return res.status(400).send('Missing OAuth callback parameters.');
      const expected = getOauthState(req);
      await exchangeGithubCode(code, state, expected, req, res);
      res.redirect('/');
    } catch (error) {
      clearOauthState(res);
      res.status(400).send(error instanceof Error ? error.message : 'GitHub login failed');
    }
  });

  app.use('/api/trpc', createExpressMiddleware({ router: appRouter, createContext }));

  const staticPath = path.resolve(__dirname, 'public');
  app.use(express.static(staticPath, { index: 'index.html' }));
  app.get('*', (_req, res) => res.sendFile(path.join(staticPath, 'index.html')));

  app.listen(config.port, '0.0.0.0', () => console.log(`AegisCore listening on :${config.port}`));
}

startServer().catch((error) => { console.error(error); process.exit(1); });
