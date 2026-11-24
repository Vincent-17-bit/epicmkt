// Social links for a team member: X, Instagram, LinkedIn, Reddit and Facebook.
//
// A seller may type a handle ("@jane"), a short link ("instagram.com/jane") or paste the whole address from the browser bar. Whatever
// they give is turned into ONE canonical https address on the platform's own website (or refused with a plain explanation), and only
// that canonical address is stored and shown. So a link can never lead anywhere but the platform it is labelled with, never carries a
// script or tracking tail, and the same rule runs in the seller form, in the database (migration 0155 holds the same patterns as a
// check constraint) and again on the customer page before a link is drawn.
//
// If you change a pattern here, change the matching one in supabase/migrations/0155_staff_socials.sql.

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

const RESERVED = {
  x: new Set(["home", "i", "intent", "share", "search", "explore", "settings", "login", "hashtag", "messages", "notifications", "compose", "tos", "privacy"]),
  instagram: new Set(["p", "reel", "reels", "explore", "accounts", "stories", "direct", "tv", "about", "developer", "legal", "directory"]),
  facebook: new Set(["sharer", "sharer.php", "share", "share.php", "groups", "pages", "watch", "marketplace", "events", "login", "dialog", "plugins", "people", "photo", "photo.php", "permalink.php", "story.php", "hashtag", "gaming", "help"])
};

const fail = (message) => ({ ok: false, error: message });
const good = (url, handle) => ({ ok: true, url, handle });

// Each platform says how to read the path of an address (segments) into a canonical address, or returns null when the path is not a
// profile. `bare` is true when the seller typed no address at all, only a handle.
export const SOCIAL_PLATFORMS = [
  {
    key: "x",
    label: "X",
    hosts: ["x.com", "twitter.com"],
    placeholder: "@yourname or x.com/yourname",
    hint: "Your X handle, like @yourname, or the link to your profile.",
    read(segments) {
      const h = (segments[0] ?? "").replace(/^@/, "");
      if (!HANDLE.test(h) || RESERVED.x.has(h.toLowerCase())) return null;
      return good(`https://x.com/${h}`, `@${h}`);
    }
  },
  {
    key: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "instagr.am"],
    placeholder: "@yourname or instagram.com/yourname",
    hint: "Your Instagram handle, like @yourname, or the link to your profile.",
    read(segments) {
      const h = (segments[0] ?? "").replace(/^@/, "");
      if (!/^[A-Za-z0-9._]{1,30}$/.test(h) || /^\.|\.$|\.\./.test(h) || RESERVED.instagram.has(h.toLowerCase())) return null;
      return good(`https://www.instagram.com/${h}/`, `@${h}`);
    }
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    hosts: ["linkedin.com"],
    placeholder: "linkedin.com/in/yourname",
    hint: "The link to your LinkedIn profile or company page (linkedin.com/in/yourname).",
    read(segments, { bare }) {
      let [kind, slug] = segments;
      if (bare && segments.length === 1) {
        slug = kind.replace(/^@/, "");
        kind = "in";
      }
      kind = String(kind ?? "").toLowerCase();
      if (!["in", "company", "school"].includes(kind) || !/^[A-Za-z0-9_%.-]{3,100}$/.test(slug ?? "")) return null;
      return good(`https://www.linkedin.com/${kind}/${slug}`, `${kind}/${slug}`);
    }
  },
  {
    key: "reddit",
    label: "Reddit",
    hosts: ["reddit.com"],
    placeholder: "u/yourname or reddit.com/user/yourname",
    hint: "Your Reddit username, like u/yourname, or the link to your profile or community.",
    read(segments, { bare }) {
      let [kind, name] = segments;
      if (bare && segments.length === 1) {
        name = kind.replace(/^@/, "");
        kind = "u";
      }
      kind = String(kind ?? "").toLowerCase();
      if (kind === "u" || kind === "user") return /^[A-Za-z0-9_-]{3,20}$/.test(name ?? "") ? good(`https://www.reddit.com/user/${name}`, `u/${name}`) : null;
      if (kind === "r") return /^[A-Za-z0-9_]{2,21}$/.test(name ?? "") ? good(`https://www.reddit.com/r/${name}`, `r/${name}`) : null;
      return null;
    }
  },
  {
    key: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "fb.com"],
    placeholder: "facebook.com/yourpage",
    hint: "The link to your Facebook profile or page (facebook.com/yourpage).",
    read(segments, { query }) {
      const first = segments[0] ?? "";
      if (first.toLowerCase() === "profile.php") return /^[0-9]{1,20}$/.test(query.get("id") ?? "") ? good(`https://www.facebook.com/profile.php?id=${query.get("id")}`, `profile ${query.get("id")}`) : null;
      const h = first.replace(/^@/, "");
      if (!/^[A-Za-z0-9.]{5,50}$/.test(h) || /^\.|\.$|\.\./.test(h) || RESERVED.facebook.has(h.toLowerCase())) return null;
      return good(`https://www.facebook.com/${h}`, h);
    }
  }
];

export const SOCIAL_KEYS = SOCIAL_PLATFORMS.map((p) => p.key);
export const socialPlatform = (key) => SOCIAL_PLATFORMS.find((p) => p.key === key) ?? null;

const hostMatches = (host, hosts) => hosts.some((h) => host === h || host.endsWith(`.${h}`));

const problem = (platform) => `That does not look like a ${platform.label} profile. ${platform.hint}`;

// Read what the seller typed for one platform.
//   { ok: true, empty: true }              nothing typed (the link is simply not set)
//   { ok: true, url, handle }              the canonical address to store and the short name to show
//   { ok: false, error }                   a sentence for the seller
export function parseSocial(key, input) {
  const platform = socialPlatform(key);
  if (!platform) return fail("Unknown social network.");
  const text = String(input ?? "").trim();
  if (!text) return { ok: true, empty: true };
  if (text.length > 300 || /[\s<>"'`\\\u0000-\u001f\u007f]/.test(text)) return fail(problem(platform));

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  if (hasScheme && !/^https?:\/\//i.test(text)) return fail(problem(platform));
  const startsWithHost = /^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(text) && hostMatches(text.split(/[/?#]/)[0].toLowerCase(), platform.hosts);

  if (hasScheme || startsWithHost) {
    let url;
    try {
      url = new URL(hasScheme ? text : `https://${text}`);
    } catch {
      return fail(problem(platform));
    }
    if (url.username || url.password || (url.port && url.port !== "443" && url.port !== "80")) return fail(problem(platform));
    if (!hostMatches(url.hostname.toLowerCase(), platform.hosts)) return fail(`That link is not on ${platform.hosts[0]}. ${platform.hint}`);
    const segments = url.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s.replace(/%(?![0-9a-f]{2})/gi, "%25")));
    const made = segments.length ? platform.read(segments, { bare: false, query: url.searchParams }) : null;
    return made ?? fail(problem(platform));
  }

  // Not an address: a handle, or a short path such as "in/jane" or "u/jane".
  const segments = text.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
  if (segments.some((s) => !s)) return fail(problem(platform));
  const made = platform.read(segments, { bare: true, query: new URLSearchParams() });
  return made ?? fail(problem(platform));
}

// Check every network at once: raw is { x: "@jane", instagram: "https://instagram.com/jane?igsh=..." , ... } as typed.
//   value   the cleaned object to store: only the networks that were filled in, each as its canonical address
//   errors  { key: sentence } for each one that could not be read
export function normalizeSocials(raw) {
  const value = {};
  const errors = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const found = parseSocial(platform.key, raw?.[platform.key]);
    if (!found.ok) errors[platform.key] = found.error;
    else if (!found.empty) value[platform.key] = found.url;
  }
  return { ok: Object.keys(errors).length === 0, value, errors };
}

// The address of a stored link if (and only if) it is still a clean canonical one, otherwise null. Used before a link is drawn, so a
// value that got into the data some other way can never become a link.
export function safeSocialUrl(key, stored) {
  if (typeof stored !== "string") return null;
  const found = parseSocial(key, stored);
  return found.ok && !found.empty && found.url === stored ? found.url : null;
}

// What a page draws: the filled-in networks in a fixed order, each with its label, address and short name.
export function socialsList(stored) {
  const out = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const found = typeof stored?.[platform.key] === "string" ? parseSocial(platform.key, stored[platform.key]) : null;
    if (found?.ok && !found.empty && found.url === stored[platform.key]) out.push({ key: platform.key, label: platform.label, url: found.url, handle: found.handle });
  }
  return out;
}

// What a seller sees in the form for a stored link: the short name they would type (so editing starts from something readable).
export function socialInputOf(key, stored) {
  const found = typeof stored === "string" ? parseSocial(key, stored) : null;
  return found?.ok && !found.empty ? found.url.replace(/^https:\/\/(www\.)?/, "") : "";
}
