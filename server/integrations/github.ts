import { getGithubTokenForUser } from '../auth';

const API = 'https://api.github.com';
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

async function githubFetch(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${url}`, { ...init, headers: { ...headers(token), ...(init.headers ?? {}) } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text.slice(0, 500)}`);
  }
  return response;
}

export async function listUserRepositories(userId: number) {
  const token = await getGithubTokenForUser(userId);
  const response = await githubFetch(token, '/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member');
  return (await response.json()) as Array<{ id: number; full_name: string; name: string; owner: { login: string }; default_branch: string; private: boolean; html_url: string }>;
}

export async function getRepositoryTree(userId: number, owner: string, repo: string, branch: string) {
  const token = await getGithubTokenForUser(userId);
  const response = await githubFetch(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  return (await response.json()) as { tree: Array<{ path: string; type: string; sha: string; size?: number }> };
}

export async function getFileContent(userId: number, owner: string, repo: string, filePath: string, ref: string) {
  const token = await getGithubTokenForUser(userId);
  const response = await githubFetch(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  const body = (await response.json()) as { type: string; encoding?: string; content?: string; sha?: string; size?: number };
  if (body.type !== 'file' || !body.content) throw new Error(`GitHub path is not a readable file: ${filePath}`);
  return { content: Buffer.from(body.content.replace(/\n/g, ''), 'base64').toString('utf8'), sha: body.sha ?? '', size: body.size ?? 0 };
}

export async function createBranch(userId: number, owner: string, repo: string, baseBranch: string, branch: string) {
  const token = await getGithubTokenForUser(userId);
  const refResponse = await githubFetch(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  const base = (await refResponse.json()) as { object: { sha: string } };
  await githubFetch(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }) });
  return branch;
}

export async function commitFile(userId: number, owner: string, repo: string, branch: string, filePath: string, content: string, sha: string, message: string) {
  const token = await getGithubTokenForUser(userId);
  const response = await githubFetch(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, content: Buffer.from(content, 'utf8').toString('base64'), branch, sha }) });
  return (await response.json()) as { commit?: { sha?: string; html_url?: string } };
}


export async function createPullRequest(userId: number, owner: string, repo: string, input: { title: string; head: string; base: string; body: string }) {
  const token = await getGithubTokenForUser(userId);
  const response = await githubFetch(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = (await response.json()) as { number: number; html_url: string };
  return { number: result.number, html_url: result.html_url };
}
