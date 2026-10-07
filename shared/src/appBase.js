export const normalizeBase = (raw) => {
  const trimmed = String(raw ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
};

export const viteBase = (raw) => {
  const base = normalizeBase(raw);
  return base ? `${base}/` : "/";
};

export const withBase = (base, path = "/") => {
  const prefix = normalizeBase(base);
  const tail = `/${String(path).replace(/^\/+/, "")}`;
  return `${prefix}${tail}`.replace(/\/{2,}/g, "/") || "/";
};

export const stripBase = (base, pathname) => {
  const prefix = normalizeBase(base);
  if (!prefix) return pathname || "/";
  if (pathname === prefix) return "/";
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
};

export const joinUrl = (origin, path = "") => {
  const root = String(origin ?? "").trim().replace(/\/+$/, "");
  const tail = String(path ?? "").trim();
  if (!tail) return root;
  return `${root}/${tail.replace(/^\/+/, "")}`;
};
