export function lineDiff(before: string, after: string) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const rows: string[] = ['@@ proposed file change @@'];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) rows.push(`  ${a[i] ?? ''}`);
    else {
      if (a[i] !== undefined) rows.push(`- ${a[i]}`);
      if (b[i] !== undefined) rows.push(`+ ${b[i]}`);
    }
  }
  return rows.join('\n');
}
