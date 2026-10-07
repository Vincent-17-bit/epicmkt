# EpicMKT

Workspaces: `client` (customer site), `seller`, `admin`, `shared`, `backend`, `admin-backend`, `supabase`.

```
npm install
npm run dev:client   # :5173
npm run dev:seller   # :5174
npm run dev:admin    # :5175
npm test
npm run build
```

## App addresses

| Variable | Used by | Local default | Production |
|---|---|---|---|
| `VITE_SELLER_URL` | client | `http://localhost:5174` | `https://business.epicmkt.co.ke` |
| `VITE_ADMIN_URL` | client | `http://localhost:5175` | `https://admin.epicmkt.co.ke` |
| `VITE_SELLER_LOGIN_PATH` | client | `/login` | `/login` |
| `VITE_BASE_PATH` | seller, admin | empty (root) | empty, or `/business` |

The client footer "Seller login" link is `seller_url + seller_login_path`. Values in the `site_config` table (`seller_url`, `admin_url`, `seller_login_path`) override the env values at runtime, so an admin can change them without a deploy. `/business/*` and `/admin/*` on the customer site redirect to the configured addresses, keeping the rest of the path, query and hash.

## Base path

`VITE_BASE_PATH` sets both the Vite `base` and the router `basename` of the seller and admin apps. Build once per target:

- Subdomain root: leave it empty. Routes: `/login`, `/forgot-password`, `/first-login`.
- Under a path: `VITE_BASE_PATH=/business npm run build -w seller`. Routes: `/business/login`, `/business/forgot-password`, `/business/first-login`.

Use router `<Link>`/`navigate` for internal links (they add the basename). For non-router URLs use `withBase(BASE_PATH, path)` from `@epicmkt/shared`. The PWA `start_url` and `scope` follow the base. The base is fixed at build time, so each deployment path needs its own build.

## PWAs and sessions

Each app is its own PWA: own manifest file, `id`, `start_url`, `scope` and service worker file (`sw.js`, `seller-sw.js`, `admin-sw.js`). Supabase sessions live in the browser storage of each origin, so signing in on one subdomain does not sign you in on another. Under a shared origin (for example `/business` on the main site) storage is shared, so prefer subdomains.

## Manual steps after deploying

1. Supabase, Authentication, URL Configuration: set Site URL to `https://epicmkt.co.ke` and add redirect URLs for `https://epicmkt.co.ke/**`, `https://business.epicmkt.co.ke/**`, `https://admin.epicmkt.co.ke/**` and the local `http://localhost:5173/**`, `:5174/**`, `:5175/**`.
2. Cloudflare Turnstile, widget settings: add `epicmkt.co.ke`, `business.epicmkt.co.ke`, `admin.epicmkt.co.ke` (and `localhost` for development) to allowed hostnames.
3. Supabase secrets: set `ALLOWED_ORIGINS` (see `supabase/.env.example`), then `supabase secrets set --env-file supabase/.env` and redeploy the edge functions.
4. Run `supabase db push` for `0004_site_config.sql`.
5. DNS and hosting: point `business.epicmkt.co.ke` and `admin.epicmkt.co.ke` at their builds, with SPA fallback to `index.html`.
6. Set the `VITE_*` variables above in each host's build settings.
