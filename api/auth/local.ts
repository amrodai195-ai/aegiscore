import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { SignJWT } from 'jose';

function hashPassword(password: string) { const salt = crypto.randomBytes(16); const hash = crypto.scryptSync(password, salt, 64); return `local:v1:${salt.toString('hex')}:${hash.toString('hex')}`; }
function verifyPassword(password: string, stored: string) { const [, version, saltHex, hashHex] = stored.split(':'); if (version !== 'v1' || !saltHex || !hashHex) return false; const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64); const expected = Buffer.from(hashHex, 'hex'); return actual.length === expected.length && crypto.timingSafeEqual(actual, expected); }
async function db() { const url = process.env.DATABASE_URL; if (!url) throw new Error('DATABASE_URL is not configured'); return mysql.createConnection(url); }
async function session(userId: number) { const secret = process.env.JWT_SECRET; if (!secret) throw new Error('JWT_SECRET is not configured'); return new SignJWT({ sub: String(userId) }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(new TextEncoder().encode(secret)); }

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Allow', 'POST'); res.end('Method not allowed'); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const action = body.action === 'signup' ? 'signup' : 'login';
    const email = String(body.email ?? '').trim().toLowerCase(); const password = String(body.password ?? ''); const name = String(body.name ?? '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    const connection = await db(); const githubId = `email:${email}`;
    let user: any;
    if (action === 'signup') {
      const [existing] = await connection.execute('SELECT id FROM users WHERE githubId = ? LIMIT 1', [githubId]);
      if ((existing as any[]).length) throw new Error('An account with this email already exists');
      const [result] = await connection.execute('INSERT INTO users (githubId, githubLogin, name, email, githubTokenEncrypted, role, lastSignedIn) VALUES (?, ?, ?, ?, ?, ?, NOW())', [githubId, email, name || email.split('@')[0], email, hashPassword(password), 'user']);
      user = { id: (result as any).insertId, name: name || email.split('@')[0], email };
    } else {
      const [rows] = await connection.execute('SELECT id, name, email, githubTokenEncrypted FROM users WHERE githubId = ? LIMIT 1', [githubId]); const row = (rows as any[])[0];
      if (!row || !verifyPassword(password, row.githubTokenEncrypted || '')) throw new Error('Invalid email or password'); user = row;
      await connection.execute('UPDATE users SET lastSignedIn = NOW() WHERE id = ?', [user.id]);
    }
    await connection.end(); const token = await session(Number(user.id));
    res.setHeader('Set-Cookie', `aegis_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`); res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, user: { id: user.id, name: user.name, email: user.email } }));
  } catch (error) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Authentication failed' })); }
}
