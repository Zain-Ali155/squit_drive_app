# SQUID

## Deploy web and API together on Vercel

The root `vercel.json` defines two Vercel Services in this repository: `web` (`apps/web`)
and `api` (`servers/api`). The `/auth/*`, `/health`, and `/drive/*` paths route to the API;
all other paths route to the Next.js web app. The web app calls the API through same-origin
paths, so no service binding is needed.

In the Vercel project settings, select **Services** as the project framework. Vercel
Services availability is account-dependent. Configure the following environment variables
in Vercel's project settings; enter credential values there, never in source control:

- Web build: `NEXT_PUBLIC_API_BASE_URL=/`
- API runtime: `NODE_ENV`, `AUTH_MODE`, `API_HOST`, `API_PORT`, `WEB_ORIGIN`, `LOG_LEVEL`,
  `MONGODB_URI`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
  `SUPABASE_URL`, `SUPABASE_BUCKET`, and `SUPABASE_SECRET_KEY`

Use `AUTH_MODE=google`, a stable HTTPS deployment origin for `WEB_ORIGIN`, and the matching
`/auth/google/callback` URL for `GOOGLE_REDIRECT_URI`. Register that exact callback URL in
the Google OAuth client. Configure Supabase with the existing private bucket and keep its
server secret only in Vercel's API runtime environment.

**Upload limit:** Vercel Functions reject request bodies larger than 4.5 MB. The current
Drive upload endpoint streams file bytes through the API and allows files up to 50,000,000
bytes, so uploads above Vercel's request-body limit will not work through this deployment
configuration. A Vercel-compatible, server-authorized direct-to-private-Supabase upload
flow is required before the full 50 MB upload limit can be supported on Vercel. The existing
local upload flow is unchanged.
