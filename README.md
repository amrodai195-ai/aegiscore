# AegisCore Security Platform v2

AegisCore is a real full-stack security workspace for source-code scanning and assisted remediation. The original Manus runtime has been removed. The product now uses:

- React + Vite for the web UI
- Express + tRPC for the API
- MySQL + Drizzle ORM for persistence
- Supabase Storage for source artifacts
- GitHub OAuth for authentication and repository access
- Aegis static rules + OSV dependency intelligence for scans
- Gemini through a provider boundary for AI explanations and remediation proposals
- GitHub Actions with Semgrep and Gitleaks for repository CI

## Important security behavior

The scanner never executes customer source code. It performs static analysis and dependency queries. Uploaded source is capped per request and stored as objects in R2; MySQL contains metadata and findings rather than the full repository payload.

The AI layer never has a fake fallback. When the provider is not configured, the API returns a clear configuration error.

Automatic patch application requires a GitHub-backed repository. The current patch flow creates a fresh branch, checks that the source file has not changed since proposal generation, commits the approved file, and can open a pull request.

## Local setup

1. Copy `.env.example` to `.env` and fill the values.
2. Create the MySQL database and run `drizzle/0000_aegiscore_initial.sql`.
3. Run `pnpm install`.
4. Build with `pnpm build` and start with `pnpm start`.

For development, start the API with `pnpm run dev:api` and the Vite frontend with `pnpm run dev:web` in separate terminals.

## GitHub OAuth callback

Set the OAuth callback URL to:

`https://YOUR-DOMAIN/api/auth/github/callback`

For local development:

`http://localhost:3000/api/auth/github/callback`

## Free-tier deployment target

A simple first deployment is Render for the web service, Aiven/MySQL-compatible free hosting for MySQL, Supabase Storage for source artifacts, GitHub Actions for CI, and a free-tier AI provider where permitted. Keep credentials in environment variables, never in source control.
