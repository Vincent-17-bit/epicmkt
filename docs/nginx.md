# Nginx edge

Nginx cannot run on Vercel. It runs on a VPS and Vercel stays the origin for the three apps. Supabase, Upstash Redis and PostGIS are untouched: the browser still talks to Supabase directly, and `/api/*` still runs on Vercel.

```
browser ──▶ Nginx (VPS) ──▶ Vercel CDN ──▶ function ──▶ Redis snapshot ──▶ Supabase (PostGIS)
              │ cache, limits, failover, TLS, headers
              └──▶ media.<domain> ──▶ Supabase Storage (seller-media), cached 30 days
```

## Hosts
| Host | Upstream | Notes |
|---|---|---|
| `APP_DOMAIN` | client project | `www.` redirects here |
| `SELLER_DOMAIN` | seller project | `noindex`, HTML never cached |
| `ADMIN_DOMAIN` | admin project | `noindex`, stricter limits, optional IP allow-list in `nginx/allow/admin.conf` |
| `MEDIA_DOMAIN` | Supabase bucket `seller-media` | public images, indexable |

Any other host name gets its connection dropped.

## Set up
1. `cd nginx && cp .env.example .env`, fill in every value. Upstreams are the `*.vercel.app` hosts of each Vercel project.
2. Point DNS for the four hosts and `www` at the VPS. Open TCP 80, TCP 443 and UDP 443 (HTTP/3).
3. `./init-certs.sh` gets one Let's Encrypt certificate for all hosts and starts the stack. The `certbot` service renews it every 12 h.
4. Vercel, client project: set `VITE_SITE_URL=https://<APP_DOMAIN>` and redeploy. Nginx sends the Vercel host to the origin, so without it sitemap, robots and shop previews would carry the `vercel.app` address.
5. Optional: set `VITE_MEDIA_HOSTS=https://<MEDIA_DOMAIN>` in `client/.env` and rebuild, so pictures load through the Nginx cache.

## What it does
**Caching** (cached copies are served if Vercel errors or times out; refreshes happen in the background)
| Path | Nginx TTL |
|---|---|
| `/assets/*` | 365 days |
| root icons and manifest | 1 day |
| `/api/browse` | 30 s |
| `/api/products` | 60 s |
| `/b/*` shop previews | 60 s |
| `/sitemap.xml`, `/robots.txt` | 1 h, 1 d |
| other pages | 5 s |
| `/api/*` (the rest) | not cached |

Cookies and `Authorization` are removed before cached requests reach Vercel. `X-Cache-Status` on every response shows `HIT`, `MISS`, `STALE` or `UPDATING`.

**Rate limits** per IP, answered with `429` and `Retry-After`

| Zone | Rate | Burst |
|---|---|---|
| pages and previews | 40 r/s | 80 |
| `/api/*`, sitemap, robots | 30 r/s | 60 |
| static files | 150 r/s | 300 |
| admin | 5 r/s | 20 |
| media | 200 r/s | 400 |

At most 100 open connections per IP (30 on admin). `/index.html` has no request limit because the shop preview function fetches it through the public domain. Mobile networks in Kenya share IPs between many users, so the limits are set as an abuse ceiling, not a fairness quota.

**Load balancing and failover:** each upstream is a keep-alive pool with `least_conn`, passive health checks (3 failures, 15 s out) and a `backup` server. Set `*_UPSTREAM_BACKUP` to a second Vercel deployment, or to the same host if there is none. The config reloads every 5 minutes, which refreshes upstream DNS and renewed certificates.

**Security:** TLS 1.2/1.3, HTTP/2, HTTP/3, OCSP stapling, HSTS, `nosniff`, referrer and frame headers, only `GET`, `HEAD`, `OPTIONS` allowed, scanner paths (`/.env`, `*.php`, `/wp-*`) and known scanner user agents dropped.

## Not included
* **A gateway in front of Supabase functions.** `clientIp` in `supabase/functions/_shared/http.ts` prefers `cf-connecting-ip`, which would become the VPS address for every visitor and merge all IP-hash abuse limits into one. It needs a code change first.
* **Content-Security-Policy.** It needs the exact list of origins the apps load from; add it once measured.
* **Brotli.** The official Nginx image does not ship the module. Vercel already compresses with Brotli, and Nginx passes it through.
* **Cloudflare in front.** If you add it, add `set_real_ip_from` and `real_ip_header CF-Connecting-IP` to `nginx.conf`, or every limit sees Cloudflare's addresses.
