import * as backend from "@epicmkt/backend";
import { isLive } from "../flash/mode.js";

// With Supabase configured the /offers page reads the real public offers (an empty marketplace shows none, never demo
// ones). Without it (local dev, tests) the in-memory backend answers.
export const list = async (params) => (isLive() ? (await import("./live.js")).list(params) : backend.getOffers(params));
export const facets = async () => (isLive() ? (await import("./live.js")).facets() : backend.getOfferFacets());
