import { parseMediaPath } from "./synced/media.js";

export const BUCKET = "seller-media";

export type Store = any;

// Every object a media row points at: the main file, the poster and each responsive variant.
export const rowPaths = (row: any): string[] =>
  [...new Set([row.path, row.poster_path, ...Object.values(row.variants ?? {})].filter((x) => typeof x === "string"))] as string[];

// A path is only ours to touch when it is <this business>/<this item>/<this media>/<file>.
export const ownedBy = (path: string, businessId: string, itemId: string, mediaId?: string) => {
  const parts = parseMediaPath(path, { businessId, itemId });
  return parts && (mediaId === undefined || parts.mediaId === mediaId) ? parts : null;
};

export async function removeObjects(store: Store, paths: string[]): Promise<boolean> {
  const list = [...new Set(paths)];
  if (!list.length) return true;
  try {
    const out = await store.remove(list);
    return !out?.error;
  } catch {
    return false;
  }
}

// Objects directly under a folder. Used to sweep strays a crashed upload left behind.
export async function listFolder(store: Store, folder: string): Promise<{ files: string[]; folders: string[] }> {
  try {
    const out = await store.list(folder, { limit: 1000 });
    const rows: any[] = out?.data ?? [];
    return {
      files: rows.filter((r) => r.id !== null && r.id !== undefined).map((r) => `${folder}/${r.name}`),
      folders: rows.filter((r) => r.id === null || r.id === undefined).map((r) => `${folder}/${r.name}`),
    };
  } catch {
    return { files: [], folders: [] };
  }
}

// Every object under <business>/<item>/ or <business>/<item>/<media>/, however deep it was left.
export async function sweepFolder(store: Store, folder: string, depth = 2): Promise<string[]> {
  const { files, folders } = await listFolder(store, folder);
  if (depth <= 0) return files;
  const nested = await Promise.all(folders.map((f) => sweepFolder(store, f, depth - 1)));
  return [...files, ...nested.flat()];
}
