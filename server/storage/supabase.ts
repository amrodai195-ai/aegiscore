import { config } from '../config';

function assertConfig() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey || !config.supabase.bucket) throw new Error('Supabase Storage is not configured');
}

function objectUrl(key: string) {
  return `${config.supabase.url.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(config.supabase.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function putObject(key: string, body: Uint8Array | Buffer | string, contentType = 'application/octet-stream') {
  assertConfig();
  const response = await fetch(objectUrl(key), { method: 'POST', headers: { Authorization: `Bearer ${config.supabase.serviceRoleKey}`, apikey: config.supabase.serviceRoleKey, 'content-type': contentType, 'x-upsert': 'true' }, body: body as any });
  if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return key;
}

export async function getObjectText(key: string) {
  assertConfig();
  const response = await fetch(objectUrl(key), { headers: { Authorization: `Bearer ${config.supabase.serviceRoleKey}`, apikey: config.supabase.serviceRoleKey }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Supabase Storage download failed (${response.status})`);
  return response.text();
}
