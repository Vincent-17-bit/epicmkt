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
  for (const id of [...new Set(ids)].slice(0, 200)) {
    try {
      const detail = await backend.getItemDetail(id);
      items[id] = detail;
      if (detail?.business?.id) shops[detail.business.id] = detail.business;
    } catch {
      items[id] = null;
    }
  }
  return { items, redirects: {}, shops, now: Date.now(), fetchedAt: Date.now() };
}
