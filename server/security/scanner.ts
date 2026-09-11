import crypto from 'node:crypto';
import path from 'node:path';
import { scanDependencies } from './vulnerabilities';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

type SourceFile = { path: string; content: string; sizeBytes: number; language?: string };

type RawFinding = {
  code: string;
  title: string;
  severity: Severity;
  confidence: number;
  filename: string;
  lineNumber: number;
  lineEnd: number;
  description: string;
  remediation: string;
  evidence: string;
  scanner: string;
};

const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.7z', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.eot', '.exe', '.dll', '.so', '.dylib']);
const MAX_FILE_BYTES = 500_000;
const MAX_FILES = 1000;
const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', 'coverage', '.next', '.turbo']);

function languageFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = { '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript', '.py': 'python', '.java': 'java', '.php': 'php', '.go': 'go', '.rb': 'ruby', '.rs': 'rust', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.cs': 'csharp', '.sql': 'sql', '.yml': 'yaml', '.yaml': 'yaml', '.json': 'json', '.env': 'dotenv', '.sh': 'shell', '.bash': 'shell' };
  return map[ext] ?? undefined;
}

function isCandidate(filePath: string, content: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return false;
  if (content.includes('\u0000')) return false;
  return content.length <= MAX_FILE_BYTES;
}

function fingerprint(finding: RawFinding) {
  return crypto.createHash('sha256').update(`${finding.code}|${finding.filename}|${finding.lineNumber}|${finding.evidence}`).digest('hex');
}

function addFinding(items: RawFinding[], file: SourceFile, lineNumber: number, finding: Omit<RawFinding, 'filename' | 'lineNumber' | 'lineEnd' | 'evidence' | 'scanner'> & { evidence: string }) {
  items.push({ ...finding, filename: file.path, lineNumber, lineEnd: lineNumber, scanner: 'aegis-static' });
}

export function scanSource(filesInput: SourceFile[]) {
  const files = filesInput.slice(0, MAX_FILES).filter((file) => isCandidate(file.path, file.content));
  const findings: RawFinding[] = [];

  const secretPatterns: Array<{ code: string; title: string; regex: RegExp; severity: Severity; remediation: string }> = [
    { code: 'AE-SEC-001', title: 'Hardcoded API token or secret', regex: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["'][^"'\n]{12,}["']/i, severity: 'critical', remediation: 'Move the value to a secret manager or environment variable, rotate the exposed credential, and remove it from source control.' },
    { code: 'AE-SEC-002', title: 'Private key material in source', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, severity: 'critical', remediation: 'Revoke the exposed key and keep private key material outside the repository.' },
    { code: 'AE-SEC-003', title: 'GitHub token in source', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/, severity: 'critical', remediation: 'Revoke the token and inject credentials at runtime using a secure secret store.' },
    { code: 'AE-SEC-004', title: 'Bearer credential in source', regex: /Authorization\s*[:=]\s*["']Bearer\s+[A-Za-z0-9._=-]{16,}["']/i, severity: 'high', remediation: 'Do not commit bearer tokens. Store them as secrets and issue short-lived credentials.' },
  ];

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of secretPatterns) {
        const match = line.match(rule.regex);
        if (match) addFinding(findings, file, i + 1, { code: rule.code, title: rule.title, severity: rule.severity, confidence: 96, description: 'A credential-like value was detected directly in source code.', remediation: rule.remediation, evidence: match[0].slice(0, 220) });
      }

      if (/\beval\s*\(/.test(line) || /new Function\s*\(/.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-INJ-001', title: 'Dynamic code execution', severity: 'high', confidence: 93, description: 'Dynamic code execution can turn attacker-controlled strings into executable code.', remediation: 'Remove eval/new Function and use explicit parsing or safe dispatch tables.', evidence: line.trim().slice(0, 220) });
      }
      if (/child_process\.(?:exec|execSync)\s*\(/.test(line) || /subprocess\.(?:Popen|run|call)\([^\n]*shell\s*=\s*True/i.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-INJ-002', title: 'Potential command injection sink', severity: 'high', confidence: 88, description: 'A shell command execution API is used in a form that can become injectable when arguments are user-controlled.', remediation: 'Prefer argument arrays without a shell, validate inputs, and avoid string interpolation into commands.', evidence: line.trim().slice(0, 220) });
      }
      if (/(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\+\s*[A-Za-z_$]/i.test(line) && /(query|execute|sql)/i.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-INJ-003', title: 'Potential SQL injection', severity: 'high', confidence: 82, description: 'SQL appears to be assembled using string concatenation instead of parameter binding.', remediation: 'Use prepared statements or the parameterized query APIs provided by your database driver/ORM.', evidence: line.trim().slice(0, 220) });
      }
      if (/http:\/\//i.test(line) && !/localhost|127\.0\.0\.1/i.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-CRYPTO-001', title: 'Plain HTTP endpoint', severity: 'medium', confidence: 90, description: 'A non-local HTTP URL was detected and can expose credentials or sensitive traffic in transit.', remediation: 'Use HTTPS for external network communication and verify certificate validation is enabled.', evidence: line.trim().slice(0, 220) });
      }
      if (/(?:md5|sha1)\s*\(/i.test(line) || /createHash\(["'](?:md5|sha1)["']\)/i.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-CRYPTO-002', title: 'Weak cryptographic hash', severity: 'medium', confidence: 94, description: 'A legacy hash algorithm was detected.', remediation: 'Use SHA-256 or a password-specific KDF such as Argon2id/bcrypt/scrypt where appropriate.', evidence: line.trim().slice(0, 220) });
      }
      if (/cors\s*\([^)]*origin\s*:\s*["']\*["']/i.test(line) || /Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*["']/i.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-CONFIG-001', title: 'Wildcard CORS policy', severity: 'medium', confidence: 85, description: 'Cross-origin access appears to be allowed from every origin.', remediation: 'Allow only trusted origins and avoid wildcard CORS when credentials or sensitive APIs are involved.', evidence: line.trim().slice(0, 220) });
      }
      if (/(?:DEBUG|debug)\s*=\s*True\b/.test(line) || /NODE_ENV\s*=\s*["']development["']/i.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-CONFIG-002', title: 'Development mode committed', severity: 'low', confidence: 90, description: 'A development/debug configuration appears to be hardcoded.', remediation: 'Load environment-specific settings at runtime and keep production configuration separate from source.', evidence: line.trim().slice(0, 220) });
      }
      if (/(?:pickle\.loads|yaml\.load\s*\((?!.*SafeLoader)|ObjectInputStream)/.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-INJ-004', title: 'Unsafe deserialization primitive', severity: 'high', confidence: 83, description: 'A deserialization primitive can execute or instantiate attacker-controlled data in unsafe contexts.', remediation: 'Use safe loaders and explicit schemas; never deserialize untrusted data with executable object semantics.', evidence: line.trim().slice(0, 220) });
      }
      if (/\.innerHTML\s*=/.test(line) || /dangerouslySetInnerHTML\s*=/.test(line)) {
        addFinding(findings, file, i + 1, { code: 'AE-XSS-001', title: 'Raw HTML injection sink', severity: 'medium', confidence: 76, description: 'Raw HTML assignment can introduce cross-site scripting when content is not trusted and sanitized.', remediation: 'Prefer text rendering or sanitize HTML with a maintained allowlist-based sanitizer.', evidence: line.trim().slice(0, 220) });
      }
    }
  }

  return { filesScanned: files.length, findings: findings.map((finding) => ({ ...finding, fingerprint: fingerprint(finding) })) };
}

export async function scanRepositoryFiles(files: SourceFile[]) {
  const sourceResult = scanSource(files);
  const dependencyResult = await scanDependencies(files);
  return { ...sourceResult, findings: [...sourceResult.findings, ...dependencyResult] };
}

export function shouldSkipPath(filePath: string) {
  return filePath.split('/').some((part) => SKIP_DIRS.has(part));
}
