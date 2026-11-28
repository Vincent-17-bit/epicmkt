import * as backend from "@epicmkt/backend";

export const getServerTime = () => backend.getServerTime();
export const list = (params) => backend.getFlashSales(params);
export const getForItem = (itemId, businessId) => backend.getFlashForItem(itemId, businessId);
export const facets = () => backend.getFlashFacets();

// The Saved drawer in demo mode: the same shape as the live read (api/saved.js): { items, redirects, shops, now, fetchedAt }. An id the demo does
// not know is null, which the drawer shows as "No longer available".
export async function getSavedItems(ids) {
  const items = {};
  const shops = {};
  // All at once: the demo backend waits a moment per item, and a long list must not wait for each in turn.
  const list = [...new Set(ids)].slice(0, 200);
  const found = await Promise.all(list.map((id) => backend.getItemDetail(id).catch(() => null)));
  list.forEach((id, i) => {
    const detail = found[i];
    items[id] = detail;
    if (detail?.business?.id) shops[detail.business.id] = detail.business;
  });
  return { items, redirects: {}, shops, now: Date.now(), fetchedAt: Date.now() };
}
