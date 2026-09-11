# AegisCore — free deployment

This deployment keeps the application code independent from any one cloud provider. The baseline uses Render Web Service, Aiven MySQL, Supabase Storage, GitHub OAuth, GitHub Actions, and Gemini.

## 1. GitHub

Push this repository to GitHub.

Create a GitHub OAuth App from GitHub Settings → Developer settings → OAuth Apps. Use the deployed URL as the Homepage URL and set the Authorization callback URL to:

`https://YOUR-RENDER-DOMAIN/api/auth/github/callback`

GitHub requires the callback URL to match the value registered for the OAuth app unless you intentionally configure wildcard matching.

Create no secret values inside Git. Keep the Client Secret only in the hosting provider's environment variables.

## 2. Aiven MySQL

Create an Aiven MySQL free service. The current free plan is designed for small workloads and is free indefinitely, but it can be powered down after inactivity and is not covered by the paid SLA.

Copy the secure MySQL connection string into `DATABASE_URL`.

Then connect once with a MySQL client and execute:

`drizzle/0000_aegiscore_initial.sql`

## 3. Supabase Storage

Create a Supabase free project and a storage bucket named `aegiscore`.

The application only needs Storage here; MySQL remains the system-of-record database.

Create a server-side key with permission to write/read the bucket and set:

`SUPABASE_URL=https://YOUR_PROJECT.supabase.co`

`SUPABASE_SERVICE_ROLE_KEY=...`

`SUPABASE_STORAGE_BUCKET=aegiscore`

Never expose the service-role key to the browser.

## 4. Gemini

Create a Gemini API key and set:

`GEMINI_API_KEY=...`

Optionally change `GEMINI_MODEL` to a model currently available to your account. AegisCore does not use fake responses when the key is missing.

## 5. Vercel

Import the GitHub repository into Vercel. The included `vercel.json` builds the React app into `dist/public`, routes every `/api/*` request to the Express serverless handler, and rewrites client-side routes to the SPA entry point.

In Project Settings → Environment Variables, add the variables in `.env.example` for **Production**. Set `APP_URL` to the exact production URL, then configure the same URL in the GitHub OAuth app:

`https://YOUR-VERCEL-DOMAIN/api/auth/github/callback`

Vercel deployment does not read the local `.env` file. Do not upload or commit it.

## 6. Render (optional)

Create a Render Web Service from the GitHub repository or use the included `render.yaml` Blueprint.

Use:

Build command:

`pnpm install --frozen-lockfile && pnpm build`

Start command:

`pnpm start`

Health check:

`/api/health`

Set the environment variables listed in `.env.example` / `render.yaml`.

After deployment, set `APP_URL` to the exact HTTPS Render URL and make the same callback URL the GitHub OAuth application uses.

## 7. First login and scan

Open the Render URL and sign in with GitHub.

Open Repositories, choose a GitHub repository, connect it, then run Scan GitHub.

For a local source upload, create/select an upload repository, choose supported text files, upload them, then run Scan uploaded source.

## 8. GitHub Actions security CI

The included `.github/workflows/security.yml` runs Semgrep and Gitleaks for pushes and pull requests. This is a CI safety net in addition to the server-side AegisCore scanner.

## Free-tier reality

Free services have quotas and lifecycle rules. Render free services are suitable for hobby/testing workloads and may sleep. Aiven's free MySQL can be powered off after inactivity. Supabase free projects can be paused after prolonged inactivity. Keep the workload small and stay within published limits.

AegisCore intentionally stores repository metadata and findings in MySQL and source artifacts in object storage, so storage or database providers can be replaced independently later.
