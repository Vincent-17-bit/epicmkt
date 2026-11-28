import { isLive } from "../flash/mode.js";

// Live: the ids are database ids and are read from Supabase. A live site never shows demo data (and its build does not ship the demo backend),
// so an id that is not a database id is simply not listed: the drawer says "No longer available" and keeps the line.
// Demo mode (no Supabase): the demo backend answers. Both give { items, redirects, shops, now, fetchedAt }.
export async function getSaved(ids) {
  if (!isLive()) return (await import("../flash/mock.js")).getSavedItems(ids);
  const live = await import("./live.js");
  const real = ids.filter(live.isLiveId);
  const out = real.length ? await live.getSavedLive(real) : { items: {}, redirects: {}, shops: {}, now: Date.now(), fetchedAt: Date.now() };
  for (const id of ids) if (!(id in out.items)) out.items[id] = null;
  return out;
}
