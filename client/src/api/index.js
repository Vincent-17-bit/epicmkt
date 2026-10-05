import * as backend from "@epicmkt/backend";

export const getCategories = () => backend.getCategories();
export const getCounties = () => backend.getCounties();
export const searchBusinesses = (params) => backend.searchBusinesses(params);
export const getSearchFacets = (params) => backend.getSearchFacets(params);
export const getSuggestions = (prefix, limit) => backend.getSuggestions(prefix, limit);
export const getBusiness = (ref, origin) => backend.getBusiness(ref, origin);
export const getFeaturedBusinesses = (params) => backend.getFeaturedBusinesses(params);
export const getNearbyBusinesses = (params) => backend.getNearbyBusinesses(params);
export const getSimilarBusinesses = (ref, limit) => backend.getSimilarBusinesses(ref, limit);
export const getTopSearches = (limit) => backend.getTopSearches(limit);
export const logSearch = (term) => backend.logSearch(term);
export const logContactEvent = (event) => backend.logContactEvent(event);
export const resolveShortcode = (code) => backend.resolveShortcode(code);
export const reportBusiness = (report) => backend.reportBusiness(report);
export const getTowns = () => backend.getTowns();
export const logEvent = (name, payload) => backend.logEvent(name, payload);
export const getServerTime = () => backend.getServerTime();
export const items = {
  getDetail: (itemId, opts) => backend.getItemDetail(itemId, opts),
  getStoreSelective: (businessId, opts) => backend.getStoreSelective(businessId, opts)
};
export const flash = {
  getForItem: (itemId, businessId) => backend.getFlashForItem(itemId, businessId),
  list: (params) => backend.getFlashSales(params),
  facets: () => backend.getFlashFacets()
};
export const offers = {
  list: (params) => backend.getOffers(params),
  facets: () => backend.getOfferFacets()
};
