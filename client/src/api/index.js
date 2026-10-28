import * as backend from "@epicmkt/backend";
import { looksLikeCoordinates, scrubPayload } from "@epicmkt/backend";
import * as flashApi from "./flash/index.js";
import * as browse from "./browse/index.js";
import * as offersApi from "./offers/index.js";
import * as products from "./products/index.js";

export const getCategories = () => browse.getCategories();
export const getCounties = () => browse.getCounties();
export const searchBusinesses = (params) => browse.searchBusinesses(params);
export const getSearchFacets = (params) => browse.getSearchFacets(params);
export const getSuggestions = (prefix, limit) => browse.getSuggestions(prefix, limit);
export const getBusiness = (ref, origin) => flashApi.getBusiness(ref, origin);
export const getFeaturedBusinesses = (params) => browse.getFeaturedBusinesses(params);
export const getNearbyBusinesses = (params) => browse.getNearbyBusinesses(params);
export const getSimilarBusinesses = (ref, limit) => browse.getSimilarBusinesses(ref, limit);
export const getTopSearches = (limit) => browse.getTopSearches(limit);
// Search terms and event payloads are the only things the app logs. Neither may carry a position, whichever adapter is live.
export const logSearch = (term) => (looksLikeCoordinates(term) ? Promise.resolve({ ok: false }) : quiet(() => browse.logSearch(term)));
// Analytics must never surface an error to the visitor, so these swallow failures (sync throws and rejected promises alike).
const quiet = (fn) => {
  try {
    const out = fn();
    return out && typeof out.catch === "function" ? out.catch(() => ({ ok: false })) : out;
  } catch {
    return { ok: false };
  }
};
export const logContactEvent = (event) => quiet(() => backend.logContactEvent(event));
export const resolveShortcode = (code) => flashApi.resolveShortcode(code);
export const reportBusiness = (report) => backend.reportBusiness(report);
export const getTowns = () => browse.getTowns();
export const logEvent = (name, payload) => quiet(() => backend.logEvent(name, scrubPayload(payload)));
export const getServerTime = () => flashApi.getServerTime();
export const items = {
  getDetail: (itemId, opts) => flashApi.getItemDetail(itemId, opts),
  getStoreSelective: (businessId, opts) => flashApi.getStoreSelective(businessId, opts),
  // Items like this one from other stores of the same category, ranked; [] when none or on any failure.
  getSimilar: (itemId, opts) => flashApi.getSimilarItems(itemId, opts),
  getAll: () => flashApi.getAllProducts(),
  // The home grid asks the server for one page at a time, plus the filter options and live option counts.
  getPage: (filters, opts) => products.getPage(filters, opts),
  getFacets: () => products.getFacets(),
  getCounts: (filters) => products.getCounts(filters),
  getShowcase: (businessIds, opts) => flashApi.getShowcaseProducts(businessIds, opts)
};
export const flash = flashApi.flash;
export const offers = {
  list: (params) => offersApi.list(params),
  facets: () => offersApi.facets()
};
