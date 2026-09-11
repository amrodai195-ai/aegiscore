type DependencyFinding = {
  code: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  filename: string;
  lineNumber: number;
  lineEnd: number;
  description: string;
  remediation: string;
  evidence: string;
  fingerprint: string;
  scanner: string;
};

async function queryOsv(ecosystem: string, name: string, version: string) {
  const response = await fetch('https://api.osv.dev/v1/query', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: { ecosystem, name }, version }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return [] as Array<{ id: string; summary?: string; database_specific?: { severity?: string }; aliases?: string[] }>;
  const body = (await response.json()) as { vulns?: Array<{ id: string; summary?: string; database_specific?: { severity?: string }; aliases?: string[] }> };
  return body.vulns ?? [];
}

function severity(value?: string): DependencyFinding['severity'] {
  const normalized = value?.toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium' || normalized === 'moderate') return 'medium';
  if (normalized === 'low') return 'low';
  return 'medium';
}

function packageJsonDependencies(content: string) {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  const entries: Array<[string, string]> = [];
  for (const section of sections) {
    const map = parsed[section];
    if (map && typeof map === 'object') for (const [name, version] of Object.entries(map as Record<string, unknown>)) if (typeof version === 'string') entries.push([name, version.replace(/^[~^<>= ]+/, '')]);
  }
  return entries;
}

function requirements(content: string) {
  return content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*==\s*([0-9][A-Za-z0-9.+-]*)/);
    return match ? ([match[1], match[2]] as [string, string]) : null;
  }).filter((value): value is [string, string] => Boolean(value));
}

export async function scanDependencies(files: Array<{ path: string; content: string }>) {
  const results: DependencyFinding[] = [];
  const jobs: Array<Promise<void>> = [];
  for (const file of files) {
    let ecosystem = '';
    let packages: Array<[string, string]> = [];
    if (file.path.endsWith('package.json')) { ecosystem = 'npm'; try { packages = packageJsonDependencies(file.content); } catch { packages = []; } }
    if (file.path.endsWith('requirements.txt')) { ecosystem = 'PyPI'; packages = requirements(file.content); }
    if (!ecosystem) continue;
    for (const [name, version] of packages.slice(0, 50)) {
      jobs.push((async () => {
        try {
          const vulns = await queryOsv(ecosystem, name, version);
          for (const vuln of vulns.slice(0, 10)) {
            const sev = severity(vuln.database_specific?.severity);
            results.push({
              code: `OSV-${vuln.id}`,
              title: `Known dependency vulnerability: ${name}`,
              severity: sev,
              confidence: 98,
              filename: file.path,
              lineNumber: 1,
              lineEnd: 1,
              description: vuln.summary ?? `${name}@${version} matches a known vulnerability recorded in OSV.`,
              remediation: `Upgrade ${name} to a fixed version listed by the vulnerability advisory and regenerate the lockfile.`,
              evidence: `${name}@${version} · ${vuln.aliases?.join(', ') ?? vuln.id}`,
              fingerprint: `${vuln.id}|${file.path}|${name}|${version}`,
              scanner: 'osv',
            });
          }
        } catch {
          // An external advisory outage must not make the whole scan fail.
        }
      })());
    }
  }
  await Promise.all(jobs);
  return results;
}
