import crypto from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from './trpc';
import { config } from './config';
import { clearOauthState, createOauthState, getOauthState, exchangeGithubCode, setOauthState, clearSession } from './auth';
import { createPatch, createScan, finishScan, getPatchForUser, getOrCreateRepository, getRepositoryForUser, getRepositorySnapshot, listChatMessages, listRepositoriesForUser, replaceRepositoryFiles, saveChatTurn, updatePatch, upsertRepositoryFromGithub, writeAuditLog } from './db';
import { listUserRepositories, getRepositoryTree, getFileContent, createBranch, commitFile, createPullRequest } from './integrations/github';
import { askGemini } from './integrations/gemini';
import { lineDiff } from './security/diff';
import { scanRepositoryFiles, shouldSkipPath } from './security/scanner';
import { getObjectText, putObject } from './storage/supabase';

const sourceFileSchema = z.object({ path: z.string().min(1).max(1024), content: z.string().max(500_000), mimeType: z.string().max(128).optional() });

export const appRouter = router({
  system: router({ health: publicProcedure.query(() => ({ ok: true, service: 'aegiscore-api', version: '2.0.0' })) }),
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { clearSession(ctx.res); return { success: true as const }; }),
  }),
  github: router({
    beginLogin: publicProcedure.mutation(({ ctx }) => {
      if (!config.github.clientId) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'GitHub OAuth is not configured.' });
      const state = createOauthState();
      setOauthState(ctx.res, state);
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', config.github.clientId);
      url.searchParams.set('redirect_uri', `${config.appUrl}/api/auth/github/callback`);
      url.searchParams.set('scope', config.github.scopes);
      url.searchParams.set('state', state);
      return { url: url.toString() };
    }),
    repositories: protectedProcedure.query(({ ctx }) => listUserRepositories(ctx.user.id)),
  }),
  repository: router({
    list: protectedProcedure.query(({ ctx }) => listRepositoriesForUser(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(255) })).mutation(({ ctx, input }) => getOrCreateRepository(ctx.user.id, `${Date.now()}-${input.name}`, input.name)),
    connectGithub: protectedProcedure.input(z.object({ owner: z.string().min(1), repo: z.string().min(1), branch: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const repo = await upsertRepositoryFromGithub(ctx.user.id, { owner: input.owner, repo: input.repo, name: input.repo, branch: input.branch });
      await writeAuditLog({ userId: ctx.user.id, repositoryId: repo.id, action: 'REPOSITORY_CONNECTED', target: `${input.owner}/${input.repo}` });
      return repo;
    }),
    snapshot: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive() })).query(({ ctx, input }) => getRepositorySnapshot(input.repositoryId, ctx.user.id)),
    uploadFiles: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive(), files: z.array(sourceFileSchema).min(1).max(200) })).mutation(async ({ ctx, input }) => {
      const repo = await getRepositoryForUser(input.repositoryId, ctx.user.id);
      if (!repo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Repository not found' });
      if (input.files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0) > 20_000_000) throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Upload is limited to 20 MB of source text per request.' });
      const stored = [];
      for (const file of input.files) {
        const key = `repositories/${ctx.user.id}/${repo.id}/${crypto.randomUUID()}-${file.path.replace(/[^a-zA-Z0-9._/-]/g, '_')}`;
        await putObject(key, file.content, file.mimeType ?? 'text/plain');
        stored.push({ path: file.path, filename: file.path.split('/').pop() ?? file.path, mimeType: file.mimeType, sizeBytes: Buffer.byteLength(file.content, 'utf8'), storageKey: key, language: undefined });
      }
      const files = await replaceRepositoryFiles(repo.id, stored);
      await writeAuditLog({ userId: ctx.user.id, repositoryId: repo.id, action: 'SOURCE_UPLOADED', metadata: JSON.stringify({ count: files.length }) });
      return files;
    }),
    scanStoredUpload: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const repo = await getRepositoryForUser(input.repositoryId, ctx.user.id);
      if (!repo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Repository not found' });
      const snapshot = await getRepositorySnapshot(input.repositoryId, ctx.user.id);
      const files: Array<{ path: string; content: string; sizeBytes: number; language?: string }> = [];
      for (const file of snapshot.files.slice(0, 300)) {
        if (!file.storageKey || file.sizeBytes > 500_000) continue;
        try { files.push({ path: file.path, content: await getObjectText(file.storageKey), sizeBytes: file.sizeBytes }); } catch { /* ignore unreadable object */ }
      }
      if (!files.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No stored source files are available. Upload source files again.' });
      const scan = await createScan(repo.id, 'aegis-static-1');
      try {
        const result = await scanRepositoryFiles(files);
        const persisted = result.findings.map((finding) => ({ scanId: scan.id, ...finding }));
        const finished = await finishScan(scan.id, { filesScanned: result.filesScanned, findings: persisted });
        return finished ? { scan: finished, findings: result.findings } : null;
      } catch (error) {
        return finishScan(scan.id, { filesScanned: 0, findings: [], errorMessage: error instanceof Error ? error.message : 'Scan failed' });
      }
    }),
    scanUploaded: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive(), files: z.array(sourceFileSchema).min(1).max(200) })).mutation(async ({ ctx, input }) => {
      const repo = await getRepositoryForUser(input.repositoryId, ctx.user.id);
      if (!repo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Repository not found' });
      const scan = await createScan(repo.id, 'aegis-static-1');
      try {
        const result = await scanRepositoryFiles(input.files.map((file) => ({ path: file.path, content: file.content, sizeBytes: Buffer.byteLength(file.content, 'utf8'), language: undefined })));
        const persisted = result.findings.map((finding) => ({ scanId: scan.id, ...finding }));
        const finished = await finishScan(scan.id, { filesScanned: result.filesScanned, findings: persisted });
        await writeAuditLog({ userId: ctx.user.id, repositoryId: repo.id, action: 'SCAN_COMPLETED', metadata: JSON.stringify({ scanId: scan.id, files: result.filesScanned, findings: result.findings.length }) });
        return finished ? { scan: finished, findings: result.findings } : null;
      } catch (error) {
        const finished = await finishScan(scan.id, { filesScanned: 0, findings: [], errorMessage: error instanceof Error ? error.message : 'Scan failed' });
        return finished;
      }
    }),
    scanGithub: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const repo = await getRepositoryForUser(input.repositoryId, ctx.user.id);
      if (!repo || !repo.githubOwner || !repo.githubRepo) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Connect a GitHub repository first.' });
      const scan = await createScan(repo.id, 'aegis-static-1');
      try {
        const tree = await getRepositoryTree(ctx.user.id, repo.githubOwner, repo.githubRepo, repo.githubDefaultBranch ?? repo.branch);
        const files: Array<{ path: string; filename: string; mimeType?: string; sizeBytes: number; sha?: string; language?: string }> = [];
        const source: Array<{ path: string; content: string; sizeBytes: number; language?: string }> = [];
        for (const item of tree.tree) {
          if (item.type !== 'blob' || shouldSkipPath(item.path) || (item.size ?? 0) > 500_000) continue;
          if (source.length >= 300 || source.reduce((n, f) => n + f.sizeBytes, 0) > 30_000_000) break;
          try {
            const file = await getFileContent(ctx.user.id, repo.githubOwner, repo.githubRepo, item.path, repo.githubDefaultBranch ?? repo.branch);
            source.push({ path: item.path, content: file.content, sizeBytes: file.size });
            files.push({ path: item.path, filename: item.path.split('/').pop() ?? item.path, sizeBytes: file.size, sha: file.sha, language: undefined });
          } catch {
            // Skip files that cannot be decoded as text.
          }
        }
        await replaceRepositoryFiles(repo.id, files);
        const result = await scanRepositoryFiles(source);
        const persisted = result.findings.map((finding) => ({ scanId: scan.id, ...finding }));
        const finished = await finishScan(scan.id, { filesScanned: result.filesScanned, findings: persisted });
        await writeAuditLog({ userId: ctx.user.id, repositoryId: repo.id, action: 'GITHUB_SCAN_COMPLETED', target: `${repo.githubOwner}/${repo.githubRepo}`, metadata: JSON.stringify({ scanId: scan.id, files: result.filesScanned, findings: result.findings.length }) });
        return finished ? { scan: finished, findings: result.findings } : null;
      } catch (error) {
        const finished = await finishScan(scan.id, { filesScanned: 0, findings: [], errorMessage: error instanceof Error ? error.message : 'GitHub scan failed' });
        return finished;
      }
    }),
  }),
  chat: router({
    history: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive().optional() })).query(({ ctx, input }) => listChatMessages(ctx.user.id, input.repositoryId)),
    ask: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive().optional(), question: z.string().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
      let context = 'No repository context was supplied.';
      if (input.repositoryId) {
        const snapshot = await getRepositorySnapshot(input.repositoryId, ctx.user.id);
        context = JSON.stringify({ repository: snapshot.repository, latestScan: snapshot.latestScan, findings: snapshot.findings.slice(0, 30).map(({ id, code, title, severity, filename, lineNumber, description, remediation }) => ({ id, code, title, severity, filename, lineNumber, description, remediation })) });
      }
      const answer = await askGemini('You are Aegis Copilot, a security engineering assistant. Ground answers in the supplied findings. Never claim a test ran if it did not. Never invent file contents. Give actionable remediation and explain uncertainty. Do not request or reveal secrets.', `Workspace context:\n${context}\n\nUser question:\n${input.question}`);
      const messages = await saveChatTurn(ctx.user.id, input.repositoryId, input.question, answer);
      await writeAuditLog({ userId: ctx.user.id, repositoryId: input.repositoryId, action: 'AI_QUESTION', metadata: JSON.stringify({ chars: input.question.length }) });
      return { answer, messages };
    }),
  }),
  patch: router({
    propose: protectedProcedure.input(z.object({ repositoryId: z.number().int().positive(), findingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const snapshot = await getRepositorySnapshot(input.repositoryId, ctx.user.id);
      const finding = snapshot.findings.find((item) => item.id === input.findingId);
      if (!finding) throw new TRPCError({ code: 'NOT_FOUND', message: 'Finding not found' });
      let original = '';
      if (snapshot.repository.githubOwner && snapshot.repository.githubRepo) {
        original = (await getFileContent(ctx.user.id, snapshot.repository.githubOwner, snapshot.repository.githubRepo, finding.filename, snapshot.repository.githubDefaultBranch ?? snapshot.repository.branch)).content;
      } else {
        const stored = snapshot.files.find((file) => file.path === finding.filename);
        if (!stored?.storageKey) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Source content for this upload is not available.' });
        original = await getObjectText(stored.storageKey);
      }
      const line = Math.max(1, finding.lineNumber);
      const lines = original.split(/\r?\n/);
      const start = Math.max(0, line - 8);
      const end = Math.min(lines.length, line + 7);
      const bounded = lines.slice(start, end).join('\n');
      const response = await askGemini('You generate secure source-code remediation. Return JSON with keys proposedContent and explanation. proposedContent must be the COMPLETE FILE CONTENT, not a diff. Preserve behavior except what is needed for the finding. Never add fake tests or secrets.', `Finding: ${JSON.stringify(finding)}\nFile path: ${finding.filename}\nRelevant context:\n${bounded}\n\nComplete current file:\n${original}`);
      const match = response.match(/\{[\s\S]*\}/);
      if (!match) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI did not return the required JSON patch format.' });
      const parsed = JSON.parse(match[0]) as { proposedContent?: string; explanation?: string };
      if (typeof parsed.proposedContent !== 'string' || typeof parsed.explanation !== 'string') throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI patch response was invalid.' });
      const patch = await createPatch({ repositoryId: input.repositoryId, findingId: input.findingId, path: finding.filename, title: `Remediate ${finding.code}`, explanation: parsed.explanation, originalContent: original, proposedContent: parsed.proposedContent, diff: lineDiff(original, parsed.proposedContent) });
      await writeAuditLog({ userId: ctx.user.id, repositoryId: input.repositoryId, action: 'PATCH_PROPOSED', target: finding.filename, metadata: JSON.stringify({ findingId: finding.id, patchId: patch?.id }) });
      return patch;
    }),
    approveAndApply: protectedProcedure.input(z.object({ patchId: z.number().int().positive(), createPr: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const record = await getPatchForUser(input.patchId, ctx.user.id);
      if (!record) throw new TRPCError({ code: 'NOT_FOUND', message: 'Patch not found' });
      const patch = record.patch;
      if (patch.status !== 'proposed') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Patch is no longer pending approval.' });
      if (!record.repository.githubOwner || !record.repository.githubRepo) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Automatic apply currently requires a connected GitHub repository.' });
      const branch = `aegiscore/fix-${patch.id}-${Date.now()}`;
      await createBranch(ctx.user.id, record.repository.githubOwner, record.repository.githubRepo, record.repository.githubDefaultBranch ?? record.repository.branch, branch);
      const current = await getFileContent(ctx.user.id, record.repository.githubOwner, record.repository.githubRepo, patch.path, record.repository.githubDefaultBranch ?? record.repository.branch);
      if (current.content !== patch.originalContent) throw new TRPCError({ code: 'CONFLICT', message: 'The file changed since the patch was generated. Re-scan and regenerate the patch.' });
      const commit = await commitFile(ctx.user.id, record.repository.githubOwner, record.repository.githubRepo, branch, patch.path, patch.proposedContent, current.sha, `fix(security): remediate ${patch.title}`);
      let pullRequest: { number: number; html_url: string } | null = null;
      if (input.createPr) {
        pullRequest = await createPullRequest(ctx.user.id, record.repository.githubOwner, record.repository.githubRepo, { title: patch.title, head: branch, base: record.repository.githubDefaultBranch ?? record.repository.branch, body: `AegisCore security remediation for finding #${patch.findingId}.\n\n${patch.explanation}` });
      }
      await updatePatch(patch.id, { status: 'applied', githubCommitSha: commit.commit?.sha ?? null, approvedAt: new Date() });
      await writeAuditLog({ userId: ctx.user.id, repositoryId: patch.repositoryId, action: 'PATCH_APPLIED', target: patch.path, metadata: JSON.stringify({ patchId: patch.id, branch, commitSha: commit.commit?.sha, pullRequest: pullRequest?.number ?? null }) });
      return { branch, commitSha: commit.commit?.sha ?? null, commitUrl: commit.commit?.html_url ?? null, pullRequest };
    }),
  }),
});

export type AppRouter = typeof appRouter;

export { getOauthState, clearOauthState, exchangeGithubCode, setOauthState, createOauthState };
export { clearSession };
