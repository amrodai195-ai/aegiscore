import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  githubId: varchar('githubId', { length: 64 }).notNull().unique(),
  githubLogin: varchar('githubLogin', { length: 128 }).notNull(),
  githubTokenEncrypted: text('githubTokenEncrypted'),
  name: text('name'),
  email: varchar('email', { length: 320 }),
  avatarUrl: varchar('avatarUrl', { length: 1024 }),
  role: mysqlEnum('role', ['user', 'admin']).default('user').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp('lastSignedIn').defaultNow().notNull(),
});

export const repositories = mysqlTable('repositories', {
  id: int('id').autoincrement().primaryKey(),
  ownerId: int('ownerId').notNull(),
  workspaceSlug: varchar('workspaceSlug', { length: 128 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  branch: varchar('branch', { length: 128 }).default('main').notNull(),
  githubOwner: varchar('githubOwner', { length: 128 }),
  githubRepo: varchar('githubRepo', { length: 255 }),
  githubDefaultBranch: varchar('githubDefaultBranch', { length: 128 }),
  sourceType: mysqlEnum('sourceType', ['github', 'upload']).default('upload').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});

export const repositoryFiles = mysqlTable('repositoryFiles', {
  id: int('id').autoincrement().primaryKey(),
  repositoryId: int('repositoryId').notNull(),
  path: varchar('path', { length: 1024 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mimeType', { length: 128 }),
  sizeBytes: int('sizeBytes').default(0).notNull(),
  sha: varchar('sha', { length: 128 }),
  storageKey: varchar('storageKey', { length: 1024 }),
  language: varchar('language', { length: 64 }),
  status: mysqlEnum('status', ['ready', 'scanning', 'complete', 'error']).default('ready').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});

export const scans = mysqlTable('scans', {
  id: int('id').autoincrement().primaryKey(),
  repositoryId: int('repositoryId').notNull(),
  status: mysqlEnum('status', ['queued', 'running', 'completed', 'failed']).default('queued').notNull(),
  engineVersion: varchar('engineVersion', { length: 64 }).notNull().default('aegis-static-1'),
  filesScanned: int('filesScanned').default(0).notNull(),
  findingsCount: int('findingsCount').default(0).notNull(),
  criticalCount: int('criticalCount').default(0).notNull(),
  highCount: int('highCount').default(0).notNull(),
  mediumCount: int('mediumCount').default(0).notNull(),
  lowCount: int('lowCount').default(0).notNull(),
  errorMessage: text('errorMessage'),
  startedAt: timestamp('startedAt'),
  completedAt: timestamp('completedAt'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const findings = mysqlTable('findings', {
  id: int('id').autoincrement().primaryKey(),
  scanId: int('scanId').notNull(),
  code: varchar('code', { length: 64 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  severity: mysqlEnum('severity', ['critical', 'high', 'medium', 'low', 'info']).notNull(),
  confidence: int('confidence').default(80).notNull(),
  filename: varchar('filename', { length: 1024 }).notNull(),
  lineNumber: int('lineNumber').default(0).notNull(),
  lineEnd: int('lineEnd').default(0).notNull(),
  description: text('description').notNull(),
  remediation: text('remediation'),
  evidence: text('evidence'),
  fingerprint: varchar('fingerprint', { length: 128 }).notNull(),
  scanner: varchar('scanner', { length: 64 }).notNull().default('aegis-static'),
  status: mysqlEnum('status', ['open', 'resolved', 'ignored']).default('open').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const chatMessages = mysqlTable('chatMessages', {
  id: int('id').autoincrement().primaryKey(),
  repositoryId: int('repositoryId'),
  userId: int('userId'),
  role: mysqlEnum('role', ['user', 'assistant', 'system']).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const patches = mysqlTable('patches', {
  id: int('id').autoincrement().primaryKey(),
  repositoryId: int('repositoryId').notNull(),
  findingId: int('findingId').notNull(),
  path: varchar('path', { length: 1024 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  explanation: text('explanation').notNull(),
  originalContent: text('originalContent').notNull(),
  proposedContent: text('proposedContent').notNull(),
  diff: text('diff').notNull(),
  status: mysqlEnum('status', ['proposed', 'approved', 'rejected', 'applied']).default('proposed').notNull(),
  githubCommitSha: varchar('githubCommitSha', { length: 128 }),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  approvedAt: timestamp('approvedAt'),
});

export const auditLogs = mysqlTable('auditLogs', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId'),
  repositoryId: int('repositoryId'),
  action: varchar('action', { length: 128 }).notNull(),
  target: varchar('target', { length: 1024 }),
  metadata: text('metadata'),
  success: boolean('success').default(true).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Repository = typeof repositories.$inferSelect;
export type RepositoryFile = typeof repositoryFiles.$inferSelect;
export type Scan = typeof scans.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Patch = typeof patches.$inferSelect;
