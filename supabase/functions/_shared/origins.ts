export const LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

export const parseOrigins = (raw: string | undefined | null): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "*");

export const resolveAllowList = (raw: string | undefined | null, production: boolean): string[] => {
  const list = parseOrigins(raw);
  if (list.length) return list;
  return production ? [] : LOCAL_ORIGINS;
};

export const isAllowedOrigin = (origin: string | null, list: string[]): boolean =>
  !!origin && list.includes(origin);
