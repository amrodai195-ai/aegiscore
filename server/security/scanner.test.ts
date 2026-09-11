import { describe, expect, it } from 'vitest';
import { scanSource } from './scanner';

describe('AegisCore static scanner', () => {
  it('detects hardcoded secrets', () => {
    const result = scanSource([{ path: 'config.py', content: 'API_KEY = "sk_live_123456789012345"\n', sizeBytes: 40 }]);
    expect(result.findings.some((finding) => finding.code === 'AE-SEC-001')).toBe(true);
  });

  it('detects shell execution sinks', () => {
    const result = scanSource([{ path: 'tools.py', content: 'subprocess.run(command, shell=True)\n', sizeBytes: 40 }]);
    expect(result.findings.some((finding) => finding.code === 'AE-INJ-002')).toBe(true);
  });

  it('does not flag binary-looking content', () => {
    const result = scanSource([{ path: 'image.png', content: '\u0000\u0001\u0002', sizeBytes: 3 }]);
    expect(result.findings).toHaveLength(0);
  });
});
