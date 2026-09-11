import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requiredUrl(name: string): string {
  const value = required(name);
  try {
    new URL(value);
  } catch {
    throw new Error(`Environment variable ${name} must be an absolute URL`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    scopes: process.env.GITHUB_OAUTH_SCOPES ?? 'read:user user:email repo',
  },
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'aegiscore',
  },
  ai: {
    provider: process.env.AI_PROVIDER ?? 'gemini',
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  },
};

export function assertProductionConfig() {
  if (config.nodeEnv !== 'production') return;
  const databaseUrl = required('DATABASE_URL');
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== 'mysql:' || !url.hostname) throw new Error();
  } catch {
    throw new Error('DATABASE_URL must be a valid mysql:// connection URL');
  }
  required('SESSION_SECRET');
  required('JWT_SECRET');
  required('GITHUB_CLIENT_ID');
  required('GITHUB_CLIENT_SECRET');
  requiredUrl('SUPABASE_URL');
  required('SUPABASE_SERVICE_ROLE_KEY');
  required('SUPABASE_STORAGE_BUCKET');
  required('GEMINI_API_KEY');
  requiredUrl('APP_URL');
}
