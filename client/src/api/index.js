import * as backend from "@epicmkt/backend";
import * as flashApi from "./flash/index.js";
import * as browse from "./browse/index.js";

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
export const logSearch = (term) => browse.logSearch(term);
export const logContactEvent = (event) => backend.logContactEvent(event);
export const resolveShortcode = (code) => flashApi.resolveShortcode(code);
export const reportBusiness = (report) => backend.reportBusiness(report);
export const getTowns = () => browse.getTowns();
export const logEvent = (name, payload) => backend.logEvent(name, payload);
export const getServerTime = () => flashApi.getServerTime();
export const items = {
  getDetail: (itemId, opts) => flashApi.getItemDetail(itemId, opts),
  getStoreSelective: (businessId, opts) => flashApi.getStoreSelective(businessId, opts)
};
export const flash = flashApi.flash;
export const offers = {
  list: (params) => backend.getOffers(params),
  facets: () => backend.getOfferFacets()
};
