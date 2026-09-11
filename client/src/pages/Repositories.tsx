import { ChangeEvent, useState } from 'react';
import { FileCode2, Github, Play, Shield, UploadCloud } from 'lucide-react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import AegisChat from '../components/AegisChat';
import { startLogin } from '../const';
import { useAuth } from '../hooks/useAuth';

const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.php', '.go', '.rb', '.rs', '.c', '.cpp', '.h', '.cs', '.sql', '.yml', '.yaml', '.json', '.sh', '.bash', '.env', '.txt', '.md', '.html', '.css']);

export default function Repositories() {
  const { user, loading } = useAuth();
  const repos = trpc.repository.list.useQuery(undefined, { enabled: Boolean(user) });
  const githubRepos = trpc.github.repositories.useQuery(undefined, { enabled: Boolean(user) });
  const [selected, setSelected] = useState<number>();
  const [uploadedSource, setUploadedSource] = useState<Record<string, { content: string; mimeType?: string }>>({});
  const activeId = selected ?? repos.data?.[0]?.id;
  const snapshot = trpc.repository.snapshot.useQuery({ repositoryId: activeId! }, { enabled: Boolean(activeId) });
  const connect = trpc.repository.connectGithub.useMutation({ onSuccess: (repo) => { setSelected(repo?.id); repos.refetch(); toast.success('GitHub repository connected'); }, onError: (e) => toast.error('Connect failed', { description: e.message }) });
  const createUploadRepo = trpc.repository.create.useMutation({ onSuccess: (repo) => { setSelected(repo.id); repos.refetch(); toast.success('Upload workspace created'); }, onError: (e) => toast.error('Could not create upload workspace', { description: e.message }) });
  const upload = trpc.repository.uploadFiles.useMutation({ onSuccess: () => snapshot.refetch(), onError: (e) => toast.error('Upload failed', { description: e.message }) });
  const scan = trpc.repository.scanUploaded.useMutation({ onSuccess: () => snapshot.refetch(), onError: (e) => toast.error('Scan failed', { description: e.message }) });
  const trpcUtilsScanGithub = trpc.repository.scanGithub.useMutation();
  const storedScan = trpc.repository.scanStoredUpload.useMutation({ onSuccess: () => snapshot.refetch(), onError: (e) => toast.error('Stored scan failed', { description: e.message }) });

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !activeId) return;
    const files = Array.from(event.target.files).filter((file) => textExtensions.has(file.name.slice(file.name.lastIndexOf('.')).toLowerCase()) && file.size <= 500_000);
    if (!files.length) { toast.error('No supported text files under 500 KB were selected'); return; }
    const payload = await Promise.all(files.map(async (file) => ({ path: file.webkitRelativePath || file.name, content: await file.text(), mimeType: file.type || undefined })));
    setUploadedSource((current) => Object.fromEntries([...Object.entries(current), ...payload.map((item) => [item.path, { content: item.content, mimeType: item.mimeType }])]));
    upload.mutate({ repositoryId: activeId, files: payload });
  };

  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!user) return <div className="min-h-screen grid place-items-center"><button className="rounded-xl bg-primary px-5 py-3 text-primary-foreground" onClick={startLogin}>Sign in with GitHub</button></div>;

  const active = repos.data?.find((repo) => repo.id === activeId);
  const findings = snapshot.data?.findings ?? [];
  const sourceFiles = snapshot.data?.files ?? [];
  const uploadedPayload = sourceFiles.map((file) => uploadedSource[file.path] ? ({ path: file.path, content: uploadedSource[file.path].content, mimeType: uploadedSource[file.path].mimeType }) : null).filter((item): item is { path: string; content: string; mimeType?: string } => Boolean(item));

  return <div className="min-h-screen bg-background p-6 lg:p-10"><div className="mx-auto max-w-7xl space-y-8"><header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-semibold tracking-widest text-muted-foreground">REPOSITORY EXPLORER</div><h1 className="mt-2 text-4xl font-semibold">Bring real code into AegisCore.</h1><p className="mt-2 text-muted-foreground">GitHub repositories are fetched server-side. Uploaded source is stored in R2 and scanned using the same engine.</p></div><Link href="/" className="rounded-xl border px-4 py-2.5 text-sm hover:bg-accent">Dashboard</Link></header>

  <section className="grid gap-6 lg:grid-cols-[340px_1fr]"><aside className="rounded-2xl border bg-card p-4 space-y-5"><div><div className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground">YOUR GITHUB REPOSITORIES</div><div className="max-h-72 space-y-2 overflow-auto">{githubRepos.data?.map((repo) => <button key={repo.id} disabled={connect.isPending} onClick={() => connect.mutate({ owner: repo.owner.login, repo: repo.name, branch: repo.default_branch })} className="w-full rounded-xl border p-3 text-left hover:bg-accent disabled:opacity-50"><div className="flex items-center gap-2"><Github size={15} /><span className="font-medium">{repo.full_name}</span></div><div className="mt-1 text-xs text-muted-foreground">{repo.private ? 'private' : 'public'} · {repo.default_branch}</div></button>)}{!githubRepos.data?.length ? <p className="text-sm text-muted-foreground">GitHub did not return repositories. Reconnect or check your OAuth scope.</p> : null}</div></div><div className="border-t pt-5"><div className="mb-2 flex items-center justify-between text-xs font-semibold tracking-widest text-muted-foreground"><span>CONNECTED</span><button disabled={createUploadRepo.isPending} onClick={() => createUploadRepo.mutate({ name: `Upload workspace ${new Date().toLocaleDateString()}` })} className="rounded-lg border px-2 py-1 text-[10px] tracking-normal hover:bg-accent disabled:opacity-50">+ Upload workspace</button></div><div className="space-y-2">{repos.data?.map((repo) => <button key={repo.id} onClick={() => setSelected(repo.id)} className={`w-full rounded-xl border p-3 text-left ${activeId === repo.id ? 'border-primary/50 bg-primary/5' : 'hover:bg-accent'}`}><div className="font-medium">{repo.name}</div><div className="text-xs text-muted-foreground">{repo.sourceType} · {repo.branch}</div></button>)}</div></div></aside>

  <main className="space-y-6"><section className="rounded-2xl border bg-card p-5"><div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 text-sm text-muted-foreground"><Shield size={15} /> Active source</div><h2 className="mt-1 text-2xl font-semibold">{active?.name ?? 'Select a repository'}</h2></div><div className="flex gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm hover:bg-accent"><UploadCloud size={15} /> Upload files<input type="file" multiple className="hidden" onChange={onFiles} /></label><button disabled={!activeId || scan.isPending || storedScan.isPending || (uploadedPayload.length === 0 && sourceFiles.length === 0) || active?.sourceType === 'github'} onClick={() => { if (!activeId) return; if (uploadedPayload.length) scan.mutate({ repositoryId: activeId, files: uploadedPayload }); else storedScan.mutate({ repositoryId: activeId }); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"><Play size={15} /> {scan.isPending || storedScan.isPending ? 'Scanning…' : 'Scan uploaded source'}</button><button disabled={!activeId || scan.isPending || active?.sourceType !== 'github'} onClick={async () => { if (!activeId) return; try { const result = await trpcUtilsScanGithub.mutateAsync({ repositoryId: activeId }); if (result) snapshot.refetch(); toast.success('GitHub scan complete', { description: `${result.findings?.length ?? 0} findings stored.` }); } catch (error) { toast.error('GitHub scan failed', { description: error instanceof Error ? error.message : 'Unknown error' }); } }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm hover:bg-accent disabled:opacity-50"><Github size={15} /> Scan GitHub</button></div></div><p className="mt-4 rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">For uploaded files, select and upload source files first. The browser sends source text over HTTPS to the API; the server stores it in R2 and does the scan. GitHub scans do not require sending source through the browser.</p></section>

  <section className="rounded-2xl border bg-card p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Files in scan scope</h2><span className="text-sm text-muted-foreground">{sourceFiles.length} files</span></div><div className="grid gap-2">{sourceFiles.slice(0, 300).map((file) => <div key={file.id} className="flex items-center justify-between rounded-xl border p-3"><div className="flex items-center gap-3"><FileCode2 size={16} /><span className="text-sm">{file.path}</span></div><span className="text-xs text-muted-foreground">{Math.max(file.sizeBytes / 1024, .1).toFixed(1)} KB</span></div>)}{!sourceFiles.length ? <div className="py-10 text-center text-sm text-muted-foreground">No files stored yet.</div> : null}</div></section>

  <section className="rounded-2xl border bg-card p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Latest findings</h2><span className="rounded-full border px-2.5 py-1 text-xs">{findings.length}</span></div><div className="space-y-3">{findings.map((finding) => <div key={finding.id} className="rounded-xl border p-4"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><div className="font-medium">{finding.title}</div><div className="mt-1 text-xs text-muted-foreground">{finding.code} · {finding.filename}:{finding.lineNumber} · {finding.scanner}</div></div><span className="rounded-full border px-2 py-1 text-xs capitalize">{finding.severity}</span></div><p className="mt-3 text-sm text-muted-foreground">{finding.description}</p>{finding.remediation ? <p className="mt-2 text-sm"><span className="font-medium">Remediation:</span> {finding.remediation}</p> : null}</div>)}{!findings.length ? <div className="py-10 text-center text-sm text-muted-foreground">Run a scan to see real findings.</div> : null}</div></section></main></section><AegisChat repositoryId={activeId} /></div></div>;
}
