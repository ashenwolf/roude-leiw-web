---
name: pwa-caching
description: Service-worker runtime caching rules for /assets/lessons/. Why we don't blanket-CacheFirst the directory, and how to invalidate stale entries on deploy.
metadata:
  type: project
---

`vite-plugin-pwa` (Workbox) is configured in `vite.config.ts`. The runtime caching rules for `/assets/lessons/` matter because that's where the lesson manifest and `.letz` content live, and they get updated independently of the app shell.

## The trap we hit (2026-05-21)

Originally a single rule blanket-cached the whole directory:

```ts
{
  urlPattern: /^\/assets\/lessons\//,
  handler: "CacheFirst",
  options: { cacheName: "lessons-cache", expiration: { maxAgeSeconds: 60*60*24*7 } },
},
```

After pushing a new `manifest.json`, returning users still saw the old lesson list for **up to 7 days**. `registerType: "autoUpdate"` only refreshes the precached app shell (JS/CSS/HTML); it does not invalidate runtime-cached entries. `CacheFirst` never hits the network when a cached entry exists and isn't expired.

## Current rules (post-fix)

```ts
runtimeCaching: [
  {
    // Index file — must be fresh.
    urlPattern: /^\/assets\/lessons\/manifest\.json$/,
    handler: "NetworkFirst",
    options: {
      cacheName: "lessons-manifest-v2",
      networkTimeoutSeconds: 3,
      expiration: { maxEntries: 1, maxAgeSeconds: 60*60*24 },
    },
  },
  {
    // Content files — change rarely per file, OK to serve stale and revalidate.
    urlPattern: /^\/assets\/lessons\/.+\.letz$/,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "lessons-content-v2",
      expiration: { maxEntries: 100, maxAgeSeconds: 60*60*24*7 },
    },
  },
  { urlPattern: /^\/api\//, handler: "NetworkOnly" },
],
```

## Rules of thumb

- **Never `CacheFirst` an index file.** If a URL is "the list of things", it must be `NetworkFirst` or `StaleWhileRevalidate`. Otherwise newly added items take days to appear.
- **`CacheFirst` is for content addressed by stable identifier**, where "if I have it, it's correct" holds. `.letz` files are borderline — the slug is stable but the contents can be edited. We picked `StaleWhileRevalidate` to get instant load + background freshness.
- **Bump `cacheName` when changing strategy.** Workbox's expiration plugin only manages caches it currently owns; renaming the cache is the cleanest way to invalidate stale entries on the next SW activation rather than waiting out the old TTL. Old caches sit dangling but are harmless.
- **`runtimeCaching` rules match in order.** Put the more specific pattern (manifest) before the broader one (`*.letz` or `/assets/lessons/`).

## How updates propagate

1. Deploy → new SW shipped alongside new app shell.
2. On next visit, browser fetches the new SW, installs it in the background, and activates on next navigation (default `skipWaiting: false` behavior of `autoUpdate`). Workbox precache picks up new app shell hashes; runtime caches are reset for renamed `cacheName`s.
3. From activation onward, manifest fetches go through `NetworkFirst` and serve fresh content within `networkTimeoutSeconds`.

If a user is stuck on a stale SW (e.g., never closes the tab), the only escape is DevTools → Application → Service Workers → Unregister, or two hard reloads. Don't rely on this — design the cache rules so it's not needed.
