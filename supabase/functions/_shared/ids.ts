// Random identifiers from an alphabet without look-alike characters (no 0/O, 1/I).
// Uses crypto.getRandomValues with rejection sampling, so every character is equally likely.
import { passwordProblems } from "./synced/password.js";

/** 32 characters: A-Z without I and O, digits 2-9. The same alphabet as public.generate_reference_no(). */
export const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RandomBytes = (n: number) => Uint8Array;
const systemBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function randomId(length: number, alphabet: string = SAFE_ALPHABET, bytes: RandomBytes = systemBytes): string {
  if (!Number.isInteger(length) || length < 1 || length > 256) throw new RangeError("length must be 1 to 256");
  const chars = Array.from(alphabet);
  if (chars.length < 2 || chars.length > 256) throw new RangeError("alphabet must have 2 to 256 characters");
  if (new Set(chars).size !== chars.length) throw new RangeError("alphabet has repeated characters");
  const limit = 256 - (256 % chars.length); // bytes at or above this would favour the first characters
  let out = "";
  for (let round = 0; out.length < length; round++) {
    if (round > 1000) throw new Error("random source is not producing usable bytes");
    const buf = bytes(Math.max(16, (length - out.length) * 2));
    for (const b of buf) {
      if (b >= limit) continue;
      out += chars[b % chars.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Unbiased integer in [0, max) for max <= 256. */
const randomIndex = (max: number, bytes: RandomBytes = systemBytes): number => {
  const limit = 256 - (256 % max);
  for (let round = 0; round < 1000; round++) {
    for (const b of bytes(16)) if (b < limit) return b % max;
  }
  throw new Error("random source is not producing usable bytes");
};

export const REFERENCE_RE = /^EPM-\d{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/** Application reference, e.g. EPM-2026-K7M3QX. The year is the EAT year, like the database default. */
export function generateReferenceNo(now: Date = new Date(), bytes?: RandomBytes): string {
  const year = new Date(now.getTime() + 3 * 3_600_000).getUTCFullYear();
  return `EPM-${year}-${randomId(6, SAFE_ALPHABET, bytes)}`;
}

export const SELLER_ID_RE = /^ES[1-9]\d{5}$/;

/** Seller ID, e.g. ES482913. Same shape the activation script has always produced: ES + 100000..999999. */
export function generateSellerId(bytes?: RandomBytes): string {
  return `ES${randomId(1, "123456789", bytes)}${randomId(5, "0123456789", bytes)}`;
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";

/** A temporary password that passes the seller password rules (10+ characters, upper, lower, number). */
export function generatePassword(context: { sellerId?: string; phone?: string } = {}, length = 14, bytes?: RandomBytes): string {
  if (!Number.isInteger(length) || length < 10 || length > 128) throw new RangeError("length must be 10 to 128");
  const all = UPPER + LOWER + DIGIT;
  for (let attempt = 0; attempt < 50; attempt++) {
    const chars = [randomId(1, UPPER, bytes), randomId(1, LOWER, bytes), randomId(1, DIGIT, bytes)];
    while (chars.length < length) chars.push(randomId(1, all, bytes));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1, bytes);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const password = chars.join("");
    if (passwordProblems(password, context).length === 0) return password;
  }
  throw new Error("could not generate a valid password");
}
