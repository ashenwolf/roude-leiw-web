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

If you need environment variables:

1. **Via Dashboard**: Cloudflare Pages → Your Project → Settings → Environment Variables
2. **Via Wrangler**: Add to `wrangler.toml`:
   ```toml
   [vars]
   VITE_API_URL = "https://api.example.com"
   ```

   Note: In Vite, environment variables must be prefixed with `VITE_` to be exposed to the client.

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

