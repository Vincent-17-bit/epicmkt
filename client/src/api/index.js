import * as backend from "@epicmkt/backend";

export const getCategories = () => backend.getCategories();
export const getCounties = () => backend.getCounties();
export const searchBusinesses = (params) => backend.searchBusinesses(params);
export const getSuggestions = (prefix, limit) => backend.getSuggestions(prefix, limit);
export const getBusiness = (ref, origin) => backend.getBusiness(ref, origin);
export const getFeaturedBusinesses = (params) => backend.getFeaturedBusinesses(params);
export const getNearbyBusinesses = (params) => backend.getNearbyBusinesses(params);
export const getSimilarBusinesses = (ref, limit) => backend.getSimilarBusinesses(ref, limit);
export const getTopSearches = (limit) => backend.getTopSearches(limit);
export const logSearch = (term) => backend.logSearch(term);
export const logContactEvent = (event) => backend.logContactEvent(event);
