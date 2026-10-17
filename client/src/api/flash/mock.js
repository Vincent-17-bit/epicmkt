import * as backend from "@epicmkt/backend";

export const getServerTime = () => backend.getServerTime();
export const list = (params) => backend.getFlashSales(params);
export const getForItem = (itemId, businessId) => backend.getFlashForItem(itemId, businessId);
export const facets = () => backend.getFlashFacets();
