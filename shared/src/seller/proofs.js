export const PROOF_MAX_BYTES = 8 * 1024 * 1024;
export const PROOF_MAX_FILES = 3;
export const PROOF_TYPES = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};
export const PROOF_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";
export const REPLY_MIN = 2;
export const REPLY_MAX = 500;

const ext = (name) => (String(name).includes(".") ? String(name).split(".").pop().toLowerCase() : "");

/** Quick feedback in the browser. The edge functions re-check everything from the real bytes. */
export function checkProofFile(file) {
  if (!file || !PROOF_TYPES[file.type] || !PROOF_TYPES[file.type].includes(ext(file.name))) return "type_not_allowed";
  if (file.size > PROOF_MAX_BYTES) return "file_too_large";
  if (file.size === 0) return "file_empty";
  return null;
}

export function checkProofBatch(files, alreadyAttached = 0) {
  if (files.length + alreadyAttached > PROOF_MAX_FILES) return { error: "attachments_limit" };
  for (const f of files) {
    const error = checkProofFile(f);
    if (error) return { error, file: f.name };
  }
  return { error: null };
}

export function checkReply(text) {
  const t = String(text ?? "").trim();
  if (t.length < REPLY_MIN) return "reply_too_short";
  if (t.length > REPLY_MAX) return "reply_too_long";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t)) return "invalid_reply";
  return null;
}

export function sniffProof(bytes) {
  const at = (i, ...v) => v.every((x, k) => bytes[i + k] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

const PDF_BAD = ["/Encrypt", "/JavaScript", "/JS", "/OpenAction", "/AA", "/Launch", "/EmbeddedFile", "/RichMedia"];

/** Same rules as the seller-proof-finalize function; the mock API uses it. */
export function inspectProof(bytes, declaredType) {
  if (!bytes.length || bytes.length > PROOF_MAX_BYTES) return "file_too_large";
  const real = sniffProof(bytes);
  if (!real) return "type_not_allowed";
  if (real !== declaredType) return "type_mismatch";
  if (real === "application/pdf") {
    const text = new TextDecoder("latin1").decode(bytes);
    if (text.includes("/Encrypt")) return "pdf_encrypted";
    if (PDF_BAD.some((k) => text.includes(k))) return "pdf_active_content";
  }
  return null;
}

export const PROOF_ERRORS = {
  type_not_allowed: "Only JPG, PNG, WebP or PDF files can be sent.",
  type_mismatch: "That file is not what its name says. Send the original photo or PDF.",
  file_too_large: "Each file must be 8 MB or smaller.",
  file_empty: "That file is empty.",
  pdf_encrypted: "That PDF is password protected. Send one without a password.",
  pdf_active_content: "That PDF contains scripts or embedded content. Send a plain PDF or a photo instead.",
  attachments_limit: "You can attach up to 3 files.",
  file_not_uploaded: "The upload did not finish. Try again.",
  reply_too_short: "Write at least 2 characters.",
  reply_too_long: "Keep your reply to 500 characters or fewer.",
  invalid_reply: "Your reply has characters we cannot accept.",
};
