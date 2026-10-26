// Cloudinary request and response signatures, with nothing but WebCrypto (Node 20+, Deno, browsers).
// Used by the edge functions; kept in shared/ so it can be unit tested with the vectors from Cloudinary's documentation.
//
// Upload signature: sort the parameters by name, join "name=value" with "&", append the API secret, hash, hex.
// `file`, `cloud_name`, `resource_type` and `api_key` are never part of the string. Cloudinary accepts SHA-1 and SHA-256.

const NOT_SIGNED = new Set(["file", "cloud_name", "resource_type", "api_key", "signature"]);

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const digest = async (algorithm, text) => hex(await crypto.subtle.digest(algorithm === "sha1" ? "SHA-1" : "SHA-256", new TextEncoder().encode(text)));

export function signingString(params) {
  return Object.keys(params)
    .filter((k) => !NOT_SIGNED.has(k) && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${Array.isArray(params[k]) ? params[k].join(",") : params[k]}`)
    .join("&");
}

export const signParams = (params, secret, algorithm = "sha256") => digest(algorithm, signingString(params) + secret);

// Constant time, so a wrong guess does not reveal how much of it was right.
const same = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Proves an upload response really came from Cloudinary for this public id and version: the response carries
 * hash("public_id=<id>&version=<version>" + secret). Cloudinary signs with SHA-1 or SHA-256, so either is accepted.
 */
export async function verifyResponseSignature({ publicId, version, signature }, secret) {
  if (!publicId || version === undefined || version === null || !signature || !secret) return false;
  const base = `public_id=${publicId}&version=${version}${secret}`;
  const [a, b] = await Promise.all([digest("sha1", base), digest("sha256", base)]);
  return same(signature, a) || same(signature, b);
}
