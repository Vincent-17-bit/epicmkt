// Moves pictures that still live in the Supabase "seller-media" bucket into Cloudinary, and repoints the database at them.
// Safe to stop and run again: a row is only changed after Cloudinary has stored the picture, and a converted row no longer
// looks like a legacy path, so the next run skips it. Nothing is deleted from Supabase unless asked (deleteOld).

import { isCloudinaryId } from "../../shared/src/seller/images.js";
import { signParams, verifyResponseSignature } from "../../shared/src/seller/cloudinarySign.js";
import { UPLOAD_FORMATS, uploadTransformation } from "../../shared/src/seller/images.js";

const EXT = /\.([A-Za-z0-9]{2,5})$/;
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

/** "<biz>/<item>/<uuid>.jpg" -> "<biz>/<item>/<uuid>"; null for anything that is not a legacy image path. */
export const toCloudinaryId = (path) => {
  if (typeof path !== "string") return null;
  const m = EXT.exec(path);
  if (!m || !IMAGE_EXT.has(m[1].toLowerCase()) || path.includes("..") || isCloudinaryId(path)) return null;
  const id = path.slice(0, -m[0].length);
  return isCloudinaryId(id) ? id : null;
};

export const legacyUrl = (supabaseUrl, path) => `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/seller-media/${path.split("/").map(encodeURIComponent).join("/")}`;

/** Asks Cloudinary to fetch the picture from its public Supabase url and store it as the 4K master. Returns the verified response. */
export async function uploadFromUrl({ cloud, url, publicId, doFetch = fetch, now = () => Date.now() }) {
  const params = {
    allowed_formats: UPLOAD_FORMATS.join(","),
    overwrite: "false",
    public_id: publicId,
    timestamp: String(Math.floor(now() / 1000)),
    transformation: uploadTransformation({ aiUpscale: cloud.aiUpscale }),
  };
  const body = new URLSearchParams({ ...params, file: url, api_key: cloud.apiKey, signature: await signParams(params, cloud.apiSecret) });
  const res = await doFetch(`https://api.cloudinary.com/v1_1/${cloud.cloudName}/image/upload`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.public_id !== publicId) throw new Error(data?.error?.message ?? `cloudinary_${res.status}`);
  if (!(await verifyResponseSignature({ publicId: data.public_id, version: data.version, signature: data.signature }, cloud.apiSecret))) throw new Error("bad_response_signature");
  return data;
}

/**
 * db: a supabase-js client with the service role key. cloud: { cloudName, apiKey, apiSecret, aiUpscale }.
 * Options: dryRun, limit (pictures this run), deleteOld (remove the Supabase file after the row is repointed), log.
 */
export async function migrateImages({ db, cloud, supabaseUrl, dryRun = false, limit = Infinity, deleteOld = false, log = console.log, doFetch = fetch }) {
  const stats = { converted: 0, failed: 0, skipped: 0, vanished: 0 };
  const done = () => stats.converted + stats.failed >= limit;

  const handle = async (path, repoint) => {
    const id = toCloudinaryId(path);
    if (!id) return void (stats.skipped += 1);
    if (dryRun) return void log(`would move ${path} -> ${id}`), void (stats.converted += 1);
    try {
      const hosted = await uploadFromUrl({ cloud, url: legacyUrl(supabaseUrl, path), publicId: id, doFetch });
      const changed = await repoint(id, hosted);
      if (!changed) {
        // The seller removed it while we were copying: the copy has no owner, so queue it for deletion.
        await db.rpc("media_gc_enqueue", { p_ids: [id], p_reason: "migrated_but_removed" });
        stats.vanished += 1;
        return;
      }
      if (deleteOld) await db.storage.from("seller-media").remove([path]);
      stats.converted += 1;
      log(`moved ${path} -> ${id}`);
    } catch (e) {
      stats.failed += 1;
      log(`FAILED ${path}: ${e.message}`);
    }
  };

  // Item photos, in id order so a stopped run resumes where it left off without scanning from the start.
  let after = "00000000-0000-0000-0000-000000000000";
  while (!done()) {
    const { data, error } = await db.from("item_media").select("id, path").eq("kind", "image").gt("id", after).order("id").limit(200);
    if (error) throw new Error(`read item_media: ${error.message}`);
    if (!data.length) break;
    for (const row of data) {
      after = row.id;
      if (done()) break;
      await handle(row.path, async (id, hosted) => {
        const upd = await db.from("item_media")
          .update({ path: id, width: hosted.width, height: hosted.height, size_bytes: hosted.bytes })
          .eq("id", row.id).eq("path", row.path).select("id");
        if (upd.error) throw new Error(upd.error.message);
        return upd.data.length > 0;
      });
    }
  }

  // Shop logos and covers.
  for (const column of ["logo_path", "cover_path"]) {
    if (done()) break;
    const { data, error } = await db.from("businesses").select(`id, ${column}`).not(column, "is", null);
    if (error) throw new Error(`read businesses: ${error.message}`);
    for (const row of data) {
      if (done()) break;
      await handle(row[column], async (id) => {
        const upd = await db.from("businesses").update({ [column]: id }).eq("id", row.id).eq(column, row[column]).select("id");
        if (upd.error) throw new Error(upd.error.message);
        return upd.data.length > 0;
      });
    }
  }
  return stats;
}
