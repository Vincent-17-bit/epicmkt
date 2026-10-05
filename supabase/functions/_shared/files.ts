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
