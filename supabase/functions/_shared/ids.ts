export const SAFE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomSafe(length: number): string {
  const n = SAFE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = "";
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out += SAFE_ALPHABET[b % n];
    }
  }
  return out;
}

export const makeSellerId = () => `SLR-${randomSafe(6)}`;

export const makeTempPassword = () => randomSafe(12);

export function slugBase(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  if (s.length >= 3) return s;
  return s ? `${s}-shop` : "shop";
}

export async function uniqueSlug(name: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugBase(name);
  for (let n = 1; n <= 1000; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("slug_exhausted");
}
