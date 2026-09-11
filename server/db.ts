import { desc, eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
import { auditLogs, chatMessages, findings, patches, repositories, repositoryFiles, scans, users, type InsertUser } from '../drizzle/schema';
import { config } from './config';

let db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!db && config.databaseUrl) db = drizzle(config.databaseUrl);
  return db;
}

export async function getUserById(id: number) {
  const connection = await getDb();
  if (!connection) return undefined;
  const rows = await connection.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function upsertGithubUser(input: { githubId: string; githubLogin: string; name?: string | null; email?: string | null; avatarUrl?: string | null; githubTokenEncrypted: string }) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  const values: InsertUser = { ...input, role: 'user', lastSignedIn: new Date() };
  await connection.insert(users).values(values).onDuplicateKeyUpdate({ set: {
    githubLogin: input.githubLogin,
    name: input.name ?? null,
    email: input.email ?? null,
    avatarUrl: input.avatarUrl ?? null,
    githubTokenEncrypted: input.githubTokenEncrypted,
    lastSignedIn: new Date(),
  }});
  const rows = await connection.select().from(users).where(eq(users.githubId, input.githubId)).limit(1);
  if (!rows[0]) throw new Error('Failed to create user');
  return rows[0];
}

export async function getRepositoryForUser(repositoryId: number, userId: number) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  const rows = await connection.select().from(repositories).where(and(eq(repositories.id, repositoryId), eq(repositories.ownerId, userId))).limit(1);
  return rows[0];
}

export async function listRepositoriesForUser(userId: number) {
  const connection = await getDb();
  if (!connection) return [];
  return connection.select().from(repositories).where(eq(repositories.ownerId, userId)).orderBy(desc(repositories.id));
}

export async function getOrCreateRepository(userId: number, workspaceSlug: string, name = 'Uploaded repository') {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  const existing = await connection.select().from(repositories).where(and(eq(repositories.ownerId, userId), eq(repositories.workspaceSlug, workspaceSlug))).limit(1);
  if (existing[0]) return existing[0];
  const result = await connection.insert(repositories).values({ ownerId: userId, workspaceSlug, name, branch: 'main', sourceType: 'upload' });
  const rows = await connection.select().from(repositories).where(eq(repositories.id, Number(result[0].insertId))).limit(1);
  if (!rows[0]) throw new Error('Failed to create repository');
  return rows[0];
}

export async function upsertRepositoryFromGithub(userId: number, input: { owner: string; repo: string; name: string; branch: string }) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  const slug = `${input.owner}-${input.repo}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 128);
  const existing = await connection.select().from(repositories).where(and(eq(repositories.ownerId, userId), eq(repositories.githubOwner, input.owner), eq(repositories.githubRepo, input.repo))).limit(1);
  if (existing[0]) return existing[0];
  const result = await connection.insert(repositories).values({ ownerId: userId, workspaceSlug: slug, name: input.name, branch: input.branch, githubOwner: input.owner, githubRepo: input.repo, githubDefaultBranch: input.branch, sourceType: 'github' });
  const rows = await connection.select().from(repositories).where(eq(repositories.id, Number(result[0].insertId))).limit(1);
  if (!rows[0]) throw new Error('Failed to create GitHub repository');
  return rows[0];
}

export async function replaceRepositoryFiles(repositoryId: number, files: Array<{ path: string; filename: string; mimeType?: string; sizeBytes: number; sha?: string; storageKey?: string; language?: string }>) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  await connection.delete(repositoryFiles).where(eq(repositoryFiles.repositoryId, repositoryId));
  if (files.length) await connection.insert(repositoryFiles).values(files.map((file) => ({ repositoryId, ...file })));
  return connection.select().from(repositoryFiles).where(eq(repositoryFiles.repositoryId, repositoryId)).orderBy(repositoryFiles.id);
}

export async function getRepositorySnapshot(repositoryId: number, userId: number) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  const repository = await getRepositoryForUser(repositoryId, userId);
  if (!repository) throw new Error('Repository not found');
  const files = await connection.select().from(repositoryFiles).where(eq(repositoryFiles.repositoryId, repository.id)).orderBy(repositoryFiles.id);
  const latestScan = (await connection.select().from(scans).where(eq(scans.repositoryId, repository.id)).orderBy(desc(scans.id)).limit(1))[0] ?? null;
  const latestFindings = latestScan ? await connection.select().from(findings).where(eq(findings.scanId, latestScan.id)).orderBy(desc(findings.id)) : [];
  return { repository, files, latestScan, findings: latestFindings };
}

export async function createScan(repositoryId: number, engineVersion = 'aegis-static-1') {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  const result = await connection.insert(scans).values({ repositoryId, status: 'running', engineVersion, startedAt: new Date() });
  const scan = (await connection.select().from(scans).where(eq(scans.id, Number(result[0].insertId))).limit(1))[0];
  if (!scan) throw new Error('Failed to create scan');
  await connection.update(repositoryFiles).set({ status: 'scanning' }).where(eq(repositoryFiles.repositoryId, repositoryId));
  return scan;
}

export async function finishScan(scanId: number, input: { filesScanned: number; findings: Array<typeof findings.$inferInsert>; errorMessage?: string }) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  if (input.findings.length) await connection.insert(findings).values(input.findings);
  const counts = input.findings.reduce((acc, finding) => { acc[finding.severity] = (acc[finding.severity] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const status = input.errorMessage ? 'failed' : 'completed';
  await connection.update(scans).set({ status, filesScanned: input.filesScanned, findingsCount: input.findings.length, criticalCount: counts.critical ?? 0, highCount: counts.high ?? 0, mediumCount: counts.medium ?? 0, lowCount: counts.low ?? 0, errorMessage: input.errorMessage, completedAt: new Date() }).where(eq(scans.id, scanId));
  const scan = (await connection.select().from(scans).where(eq(scans.id, scanId)).limit(1))[0];
  if (scan) await connection.update(repositoryFiles).set({ status: status === 'completed' ? 'complete' : 'error' }).where(eq(repositoryFiles.repositoryId, scan.repositoryId));
  return scan;
}

export async function listChatMessages(userId: number, repositoryId?: number) {
  const connection = await getDb();
  if (!connection) return [];
  const rows = repositoryId ? await connection.select().from(chatMessages).where(and(eq(chatMessages.userId, userId), eq(chatMessages.repositoryId, repositoryId))).orderBy(chatMessages.id) : await connection.select().from(chatMessages).where(eq(chatMessages.userId, userId)).orderBy(chatMessages.id);
  return rows;
}

export async function saveChatTurn(userId: number, repositoryId: number | undefined, question: string, answer: string) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  await connection.insert(chatMessages).values([{ userId, repositoryId, role: 'user', content: question }, { userId, repositoryId, role: 'assistant', content: answer }]);
  return listChatMessages(userId, repositoryId);
}

export async function createPatch(input: typeof patches.$inferInsert) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  const result = await connection.insert(patches).values(input);
  return (await connection.select().from(patches).where(eq(patches.id, Number(result[0].insertId))).limit(1))[0];
}

export async function getPatchForUser(patchId: number, userId: number) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  const rows = await connection.select({ patch: patches, repository: repositories }).from(patches).innerJoin(repositories, eq(patches.repositoryId, repositories.id)).where(and(eq(patches.id, patchId), eq(repositories.ownerId, userId))).limit(1);
  return rows[0];
}

export async function updatePatch(patchId: number, values: Partial<typeof patches.$inferInsert>) {
  const connection = await getDb();
  if (!connection) throw new Error('DATABASE_URL is not configured');
  await connection.update(patches).set(values).where(eq(patches.id, patchId));
  return (await connection.select().from(patches).where(eq(patches.id, patchId)).limit(1))[0];
}

export async function writeAuditLog(input: typeof auditLogs.$inferInsert) {
  const connection = await getDb();
  if (!connection) return;
  await connection.insert(auditLogs).values(input);
}
