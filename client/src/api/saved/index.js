import { isLive } from "../flash/mode.js";

// Live: ids that are real database ids are read from Supabase; any other id (the demo's) is answered by the demo backend, as everywhere else.
// Demo mode (no Supabase): the demo backend answers for all of them. Both give { items, redirects, shops, now, fetchedAt }.
export async function getSaved(ids) {
  const mock = () => import("../flash/mock.js");
  if (!isLive()) return (await mock()).getSavedItems(ids);
  const live = await import("./live.js");
  const real = ids.filter(live.isLiveId);
  const demo = ids.filter((id) => !live.isLiveId(id));
  const [a, b] = await Promise.all([real.length ? live.getSavedLive(real) : null, demo.length ? mock().then((m) => m.getSavedItems(demo)) : null]);
  const out = { items: {}, redirects: {}, shops: {}, now: Date.now(), fetchedAt: Date.now() };
  for (const part of [a, b]) if (part) { Object.assign(out.items, part.items); Object.assign(out.redirects, part.redirects); Object.assign(out.shops, part.shops); out.now = part.now; }
  return out;
}
