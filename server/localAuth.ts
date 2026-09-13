import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users } from '../drizzle/schema';
import { getDb } from './db';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `local:v1:${salt.toString('hex')}:${hash.toString('hex')}`;
};
const verifyPassword = (password: string, stored: string) => {
  const [, version, saltHex, hashHex] = stored.split(':');
  if (version !== 'v1' || !saltHex || !hashHex) return false;
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

export async function getLocalUser(email: string) {
  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');
  const rows = await db.select().from(users).where(eq(users.githubId, `email:${normalizeEmail(email)}`)).limit(1);
  return rows[0];
}

export async function createLocalUser(email: string, name: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');
  const normalized = normalizeEmail(email);
  const githubId = `email:${normalized}`;
  const existing = await getLocalUser(normalized);
  if (existing) throw new Error('An account with this email already exists');
  const rows = await db.insert(users).values({ githubId, githubLogin: normalized, name: name.trim() || normalized.split('@')[0], email: normalized, githubTokenEncrypted: hashPassword(password), role: 'user', lastSignedIn: new Date() }).returning();
  if (!rows[0]) throw new Error('Failed to create account');
  return rows[0];
}

export async function verifyLocalUser(email: string, password: string) {
  const user = await getLocalUser(email);
  if (!user || !user.githubTokenEncrypted || !verifyPassword(password, user.githubTokenEncrypted)) throw new Error('Invalid email or password');
  return user;
}
