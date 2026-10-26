# Pictures: Cloudinary stores them, Supabase keeps the data

Product photos, shop logos and shop covers live in **Cloudinary**. Supabase keeps messages, payments, listings and the *id* of each
picture (`item_media.path`, `businesses.logo_path`, `businesses.cover_path`). Videos, application documents, payment proofs and
message attachments stay in Supabase Storage (they are private or not pictures).

## One-time setup

1. **Create the account** at cloudinary.com. Dashboard > *Settings* > *API Keys*: copy the **Cloud name**, **API Key**, **API Secret**
   (or the one-line `CLOUDINARY_URL`).
2. **Leave "Strict transformations" off** (Settings > Security). The site asks for resized versions by URL
   (`f_auto,q_auto,c_limit,w_480`); with strict mode on, every size would have to be allow-listed.
3. **Supabase secrets** (never in a browser build):
   ```
   supabase secrets set CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
   # optional, see "Upscaling" below
   supabase secrets set CLOUDINARY_AI_UPSCALE=true
   ```
4. **Browser + Vercel**: set `VITE_CLOUDINARY_CLOUD_NAME=<cloud_name>` in `client/.env`, `seller/.env` and in the Vercel projects
   (the cloud name is public; it is in every picture URL). Redeploy: Vercel applies variables only to new deployments.
5. **Database**: apply `supabase/migrations/0047_cloudinary_media.sql`.
6. **Functions**: `supabase functions deploy seller-media-sign seller-media-finalize media-gc`.
7. **Cron**: run the `media-gc` block of `supabase/cron/schedule.sql` once (it is safe to re-run the whole file).
8. **Move existing pictures** (optional, any time; old ones keep working from Supabase until then):
   ```
   npm run migrate:images -- --dry-run     # shows what it would do
   npm run migrate:images -- --limit=50    # try a few
   npm run migrate:images                  # everything; safe to stop and re-run
   ```
   Add `--delete-old` only after you have looked at the site: it removes each file from Supabase once its row points at Cloudinary.
9. **Stop new pictures landing in Supabase** (after step 8): in the SQL editor
   `update storage.buckets set allowed_mime_types = array['video/mp4','video/webm'] where id = 'seller-media';`

## What happens on upload

```
seller browser ──1 sign──▶ seller-media-sign ──▶ records the id in media_uploads, returns a signature for THAT id
seller browser ──2 file──▶ Cloudinary (direct; Supabase never sees the bytes)
                           incoming transformation: scale so the longest side is 3840 px (up or down), q_auto:best
seller browser ──3 done──▶ seller-media-finalize ──▶ checks Cloudinary's signature on the answer, attaches the id to the item
```
* The browser never holds the API secret. Each signature covers one id chosen by the server under the shop's own
  `<businessId>/` prefix, jpg/png/webp only, no overwriting, valid one hour.
* Photos over 9 MB are redrawn once in the browser before sending (Cloudinary's free plan refuses over 10 MB).
* Nothing is deleted by the browser. Removing a photo, replacing a logo or deleting a shop fires a database trigger that
  queues the Cloudinary file in `media_gc`, in the same transaction; the `media-gc` job (every 10 min) deletes it, retrying
  with a growing pause if Cloudinary is down. Uploads that were never finished are queued by the same job after an hour.
  A file something still points at is never deleted.

## Upscaling (what to expect)

Every upload is brought to **3840 px on its longest side**: small pictures are scaled up, big ones down, aspect ratio kept, nothing
cropped. Plain upscaling makes the picture *bigger*, not *sharper*; a 300 px photo becomes a smooth 4K photo, not a detailed one.
For real added detail enable Cloudinary's **AI Upscale** add-on and set `CLOUDINARY_AI_UPSCALE=true`: pictures under 960 px a side
then go through it first (it multiplies each side by 4; it only accepts inputs under 4.2 megapixels, which is why larger pictures use
plain scaling). The add-on is a paid/credit feature; the flag is off by default so uploads can never fail because of it.

## What visitors download

The 4K master is never sent to a card. Delivery URLs are `…/image/upload/f_auto,q_auto:<tier>,c_limit,w_<width>/<id>`:
`f_auto` picks AVIF/WebP/JPEG per browser, widths come from a fixed ladder (96 to 3840), thumbnails (≤ 480 px) use the `eco`
quality tier, so a card image is typically a few KB to a few tens of KB. `LazyImage` builds a `srcset` so a phone gets the small
file and a retina desktop the larger one. URLs are stable per picture, so Cloudinary's CDN, the browser cache and the app's
service worker (`media-images`, CacheFirst) all keep them. The page preconnects to `res.cloudinary.com` while it is still parsing.

## Where Redis fits

Redis (Upstash) does not hold pictures; Cloudinary's CDN does that. Redis keeps the *data that points at them* fast: the browse and
products snapshots (`browse:snapshot:v1`, `products:snapshot:v1`) carry only the short ids, so they stay small, and every Vercel
instance shares one copy instead of asking Supabase. See `docs/browse-performance.md`. A card therefore costs one cached API
page plus CDN-cached image files, with no database or storage call per picture.

## Checks

* `npm run test:shared`, `npm run test:db`, `npm run test:fn`, `npm run test:seller-ui`, `npm run test:client`, `npm run test:ui`.
* After deploy: upload a photo as a seller and open its URL in the network tab: it should be `res.cloudinary.com/.../f_auto,q_auto:...`,
  a few KB to tens of KB. In the Cloudinary Media Library the original should be 3840 px on its long side.
* Remove that photo: within ~10 minutes the asset disappears from Cloudinary (or run the `media-gc` function by hand with the cron secret).
* `select count(*) from media_gc;` should hover near zero; rows with `last_error` set show a failing delete.
