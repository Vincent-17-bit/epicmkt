// Cloudinary, server side. The API secret exists only here (an edge function secret); the browser gets one short-lived,
// single-purpose signature per upload and never the secret.
//
// What a signature allows: ONE upload to ONE public id (chosen by the server, under the seller's own business prefix),
// as jpg / png / webp, run through the 4K upscale transformation before it is stored, never overwriting an existing file,
// and only for an hour (Cloudinary rejects a signature whose timestamp is older than that).

import { signParams, verifyResponseSignature } from "./synced/cloudinarySign.js";
import { UPLOAD_FORMATS, uploadTransformation } from "./synced/images.js";

export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string; aiUpscale: boolean };

export type SignedUpload = { uploadUrl: string; fields: Record<string, string> };
export type Destroyed = { deleted: string[]; failed: { id: string; reason: string }[] };

// What the handlers depend on. Tests pass a fake; production passes makeCloudinary().
export interface CloudinaryClient {
  cloudName: string;
  signUpload(publicId: string): Promise<SignedUpload>;
  verifyResponse(args: { publicId: string; version: number | string; signature: string }): Promise<boolean>;
  destroy(publicIds: string[]): Promise<Destroyed>;
}

const API = "https://api.cloudinary.com/v1_1";

export function cloudinaryConfigFromEnv(get: (name: string) => string | undefined): CloudinaryConfig | null {
  // CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> is what the Cloudinary dashboard hands out.
  const url = get("CLOUDINARY_URL");
  let cloudName = get("CLOUDINARY_CLOUD_NAME") ?? "";
  let apiKey = get("CLOUDINARY_API_KEY") ?? "";
  let apiSecret = get("CLOUDINARY_API_SECRET") ?? "";
  if (url) {
    const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim());
    if (m) [, apiKey, apiSecret, cloudName] = m;
  }
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret, aiUpscale: (get("CLOUDINARY_AI_UPSCALE") ?? "").toLowerCase() === "true" };
}

export function makeCloudinary(cfg: CloudinaryConfig, doFetch: typeof fetch = fetch, now: () => number = () => Date.now()): CloudinaryClient {
  const transformation = uploadTransformation({ aiUpscale: cfg.aiUpscale });
  return {
    cloudName: cfg.cloudName,
    async signUpload(publicId) {
      // Everything here is signed, so the browser cannot change the id, the formats or the transformation.
      const params: Record<string, string> = {
        allowed_formats: UPLOAD_FORMATS.join(","),
        overwrite: "false",
        public_id: publicId,
        timestamp: String(Math.floor(now() / 1000)),
        transformation,
      };
      const signature = await signParams(params, cfg.apiSecret);
      return { uploadUrl: `${API}/${cfg.cloudName}/image/upload`, fields: { ...params, api_key: cfg.apiKey, signature } };
    },
    verifyResponse: ({ publicId, version, signature }) => verifyResponseSignature({ publicId, version, signature }, cfg.apiSecret),
    async destroy(publicIds) {
      const out: Destroyed = { deleted: [], failed: [] };
      const one = async (id: string) => {
        try {
          const params: Record<string, string> = { invalidate: "true", public_id: id, timestamp: String(Math.floor(now() / 1000)) };
          const body = new URLSearchParams({ ...params, api_key: cfg.apiKey, signature: await signParams(params, cfg.apiSecret) });
          const res = await doFetch(`${API}/${cfg.cloudName}/image/destroy`, { method: "POST", body, signal: AbortSignal.timeout(15_000) });
          const data = await res.json().catch(() => ({}));
          // "not found" means it is already gone, which is exactly what we wanted.
          if (res.ok && (data.result === "ok" || data.result === "not found")) out.deleted.push(id);
          else out.failed.push({ id, reason: String(data?.error?.message ?? data?.result ?? `http_${res.status}`).slice(0, 200) });
        } catch (e) {
          out.failed.push({ id, reason: String((e as Error)?.message ?? e).slice(0, 200) });
        }
      };
      // A few at a time: fast enough for a batch, gentle enough not to trip Cloudinary's rate limits.
      const queue = [...publicIds];
      await Promise.all(Array.from({ length: Math.min(5, queue.length) }, async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) await one(id);
      }));
      return out;
    },
  };
}
