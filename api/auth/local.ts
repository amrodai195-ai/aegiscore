export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('Method not allowed'); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const action = body.action === 'signup' ? 'signup' : 'login';
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const name = String(body.name ?? '');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    const { createLocalUser, verifyLocalUser } = await import('../../server/localAuth');
    const { createSession } = await import('../../server/auth');
    const user = action === 'signup' ? await createLocalUser(email, name, password) : await verifyLocalUser(email, password);
    const session = await createSession(user.id);
    res.setHeader('Set-Cookie', `aegis_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, user: { id: user.id, name: user.name, email: user.email } }));
  } catch (error) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Authentication failed' }));
  }
}
