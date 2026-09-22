# Cloudflare Deployment Guide

This project is configured for deployment to Cloudflare Pages, which is the recommended approach for React SPAs.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://www.cloudflare.com/)
2. **Wrangler CLI**: Install globally or use via npm scripts
   ```bash
   npm install -g wrangler
   # OR use the local version via npm scripts
   ```

## Deployment Options

### Option 1: Cloudflare Pages (Recommended) ⭐

**Best for**: Automatic deployments, CI/CD integration, and easy management.

#### Method A: Via Cloudflare Dashboard (Easiest)

1. **Push your code to GitHub/GitLab/Bitbucket**
2. **Go to Cloudflare Dashboard** → Pages → Create a project
3. **Connect your repository**
4. **Configure build settings**:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (or leave empty)
   - **Node version**: `18` or `20` (recommended)
5. **Save and Deploy**

Your site will automatically deploy on every push to your main branch!

#### Method B: Via Wrangler CLI

1. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

2. **Deploy**:
   ```bash
   npm run deploy
   ```

   This will:
   - Build your project (`npm run build`)
   - Deploy the `dist` folder to Cloudflare Pages

3. **First-time setup**: You'll be prompted to create a new Pages project if one doesn't exist.

### Option 2: Cloudflare Workers Sites

If you need more control or want to use Workers features:

```bash
npm run deploy:workers
```

## Configuration Files

- **`wrangler.toml`**: Cloudflare configuration
  - `site.bucket`: Points to `dist` (Vite's output directory)
  - Note: For Pages deployments via dashboard, SPA routing is handled automatically

- **`vite.config.ts`**: 
  - Cloudflare plugin enabled
  - Build output set to `dist`

## Environment Variables

`VITE_`-prefixed variables are **inlined into the bundle at build time**, so they must be
present wherever the build runs. Local `.env` is gitignored, so a Pages CI build (Method A)
does *not* see it — the variable has to be set on the Pages project.

### Required for the frontend build

| Variable | Value | Consequence if missing |
|---|---|---|
| `VITE_PUBLIC_POSTHOG_KEY` | PostHog project key (`phc_…` — public, write-only ingestion key) | Analytics silently off; `src/main.tsx` skips `posthog.init` |
| `VITE_PUBLIC_POSTHOG_HOST` | PostHog API host, e.g. `https://eu.i.posthog.com` | Same as above |

Set both in **Cloudflare Pages → Your Project → Settings → Variables and secrets**, for
**Production *and* Preview** (Preview builds are separate; a var set only on Production
leaves every PR preview tokenless). A Pages env-var change only takes effect on the *next*
build — retry the latest deployment after saving.

Keep the same two keys in your local `.env` so `npm run deploy` (Method B) and `npm run dev`
behave like prod. If you add a new PostHog host, extend `script-src`/`connect-src` in
`public/_headers` in the same change.

Other options:

1. **Via Wrangler** (`wrangler.toml`, non-sensitive values only):
   ```toml
   [vars]
   VITE_API_URL = "https://api.example.com"
   ```
2. **Worker secrets** (server-side, never `VITE_`-prefixed): `npx wrangler secret put NAME`.

## Custom Domain

1. Go to Cloudflare Pages → Your Project → Custom domains
2. Add your domain
3. Follow DNS configuration instructions

## Troubleshooting

### Build fails
- Check Node version (use 18 or 20)
- Ensure all dependencies are in `package.json` (not just `package-lock.json`)

### 404 errors on routes
- The `not_found_handling = "single-page-application"` in `wrangler.toml` should handle this
- Verify your routing is client-side only

### Assets not loading
- Ensure all assets are in the `public/` folder or imported correctly
- Check that paths are relative (not absolute)

## Quick Deploy Commands

```bash
# Build only
npm run build

# Deploy to Cloudflare Pages
npm run deploy

# Preview build locally
npm run preview
```

## Continuous Deployment

Cloudflare Pages automatically deploys when you:
- Push to your main/master branch
- Create a pull request (creates preview deployment)
- Merge a pull request

No additional CI/CD setup needed!

