import * as backend from "@epicmkt/backend";
import { isLive } from "../flash/mode.js";

// With Supabase configured, browse data comes from public_businesses / categories.
// Without it (local dev, tests) the in-memory backend is used.
const adapter = () => (isLive() ? import("./live.js") : Promise.resolve(backend));

export const getCategories = async (...args) => (await adapter()).getCategories(...args);
export const getTowns = async (...args) => (await adapter()).getTowns(...args);
export const getCounties = async (...args) => (await adapter()).getCounties(...args);
export const searchBusinesses = async (...args) => (await adapter()).searchBusinesses(...args);
export const getSearchFacets = async (...args) => (await adapter()).getSearchFacets(...args);
export const getSuggestions = async (...args) => (await adapter()).getSuggestions(...args);
export const getFeaturedBusinesses = async (...args) => (await adapter()).getFeaturedBusinesses(...args);
export const getNearbyBusinesses = async (...args) => (await adapter()).getNearbyBusinesses(...args);
export const getSimilarBusinesses = async (...args) => (await adapter()).getSimilarBusinesses(...args);
export const getTopSearches = async (...args) => (await adapter()).getTopSearches(...args);
export const logSearch = async (...args) => (await adapter()).logSearch(...args);
