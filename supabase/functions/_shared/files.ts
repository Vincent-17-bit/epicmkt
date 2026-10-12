export type Kind = "pdf" | "jpg" | "png" | "webp";

export function sniff(bytes: Uint8Array): Kind | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => bytes[i + k] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  return null;
}

const PDF_BAD = ["/Encrypt", "/JavaScript", "/JS", "/OpenAction", "/AA", "/Launch", "/EmbeddedFile", "/RichMedia"];

export function pdfIsSafe(bytes: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(bytes);
  return !PDF_BAD.some((k) => text.includes(k));
}

export type PdfProblem = "pdf_encrypted" | "pdf_active_content";

export function pdfProblem(bytes: Uint8Array): PdfProblem | null {
  const text = new TextDecoder("latin1").decode(bytes);
  if (text.includes("/Encrypt")) return "pdf_encrypted";
  return PDF_BAD.some((k) => text.includes(k)) ? "pdf_active_content" : null;
}

export const PROOF_MAX_BYTES = 8 * 1024 * 1024;
export const PROOF_MAX_FILES = 3;
export const PROOF_TYPES: Record<Kind, { mime: string; ext: string[] }> = {
  pdf: { mime: "application/pdf", ext: ["pdf"] },
  jpg: { mime: "image/jpeg", ext: ["jpg", "jpeg"] },
  png: { mime: "image/png", ext: ["png"] },
  webp: { mime: "image/webp", ext: ["webp"] },
};
