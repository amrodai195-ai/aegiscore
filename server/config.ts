import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? '',
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
  required('DATABASE_URL');
  required('SESSION_SECRET');
  required('GITHUB_CLIENT_ID');
  required('GITHUB_CLIENT_SECRET');
}
