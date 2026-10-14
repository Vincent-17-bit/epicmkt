// SMS length and segment counting for GSM-7 and Unicode (UCS-2) messages.
// Pure and dependency free. Limits: GSM-7 160 septets (153 per part when split), UCS-2 70 units (67 per part).

export type SmsEncoding = "GSM-7" | "UCS-2";

export type SmsInfo = {
  encoding: SmsEncoding;
  /** Characters the person typed, counted as code points. */
  characters: number;
  /** Septets (GSM-7) or UTF-16 code units (UCS-2) the message uses. */
  units: number;
  segments: number;
  /** Capacity of one part for this message: the single-message limit, or the multipart limit once it is split. */
  perSegment: number;
  /** Units still free in the last part. */
  remaining: number;
  /** Characters that force Unicode, each listed once. Empty for GSM-7. */
  unicodeChars: string[];
};

// GSM 03.38 default alphabet. Position 0x1B is the escape to the extension table, so it is not a character.
const BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ" + // 0x00-0x1A
  "ÆæßÉ" + // 0x1C-0x1F
  " !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"; // 0x20-0x7F
const EXTENDED = "\f^{}\\[~]|€"; // each takes two septets (escape + character)

const BASIC_SET = new Set(Array.from(BASIC));
const EXT_SET = new Set(Array.from(EXTENDED));

export const GSM7 = { single: 160, multipart: 153 } as const;
export const UCS2 = { single: 70, multipart: 67 } as const;

const gsmCost = (ch: string): number | null => (BASIC_SET.has(ch) ? 1 : EXT_SET.has(ch) ? 2 : null);
const ucsCost = (ch: string): number => ch.length; // a code point outside the BMP is a surrogate pair: 2 units

export function countSms(text: string): SmsInfo {
  const chars = Array.from(text);
  const unicodeChars = [...new Set(chars.filter((c) => gsmCost(c) === null))];
  const encoding: SmsEncoding = unicodeChars.length ? "UCS-2" : "GSM-7";
  const cost = encoding === "GSM-7" ? (c: string) => gsmCost(c) as number : ucsCost;
  const limits = encoding === "GSM-7" ? GSM7 : UCS2;

  const units = chars.reduce((sum, c) => sum + cost(c), 0);
  if (units === 0) {
    return { encoding, characters: 0, units: 0, segments: 0, perSegment: limits.single, remaining: limits.single, unicodeChars };
  }
  if (units <= limits.single) {
    return { encoding, characters: chars.length, units, segments: 1, perSegment: limits.single, remaining: limits.single - units, unicodeChars };
  }

  // Split into parts. A two-unit character (GSM extension, or an emoji) is never cut between two parts.
  let segments = 1;
  let used = 0;
  for (const c of chars) {
    const w = cost(c);
    if (used + w > limits.multipart) {
      segments += 1;
      used = 0;
    }
    used += w;
  }
  return { encoding, characters: chars.length, units, segments, perSegment: limits.multipart, remaining: limits.multipart - used, unicodeChars };
}

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2013\u2014\u2212]/g, "-"],
  [/\u2026/g, "..."],
  [/[\u00A0\u2007\u202F]/g, " "],
  [/[\u200B\u200C\u200D\uFEFF]/g, ""],
];

/** Swaps smart quotes, dashes, ellipsis and invisible spaces for plain ASCII, the usual reason a message flips to Unicode. */
export function toGsmFriendly(text: string): string {
  return REPLACEMENTS.reduce((s, [re, to]) => s.replace(re, to), text);
}
