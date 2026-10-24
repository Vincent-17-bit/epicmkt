import { create } from "zustand";
import { TOWNS } from "@epicmkt/shared";
import { coarsenCoords } from "@epicmkt/backend";
import { queryClient } from "../lib/queryClient.js";

const KEY = "epicmkt.town";
// Set when the shopper clears their location. While it is set we never ask the browser again on our own,
// even if the browser still remembers a "granted" permission. Cleared by any explicit choice.
const OPT_OUT_KEY = "epicmkt.geo.off";

// Query keys that embed a position. Dropped on reset so no stale fix lingers in the cache.
const POSITIONAL_QUERIES = new Set(["nearby", "flash-page", "offers-page", "flash-strip"]);

const readTown = () => {
  try {
    return TOWNS.find((t) => t.name === localStorage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
};

const writeTown = (name) => {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    return;
  }
};

const readOptOut = () => {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
};

const writeOptOut = (on) => {
  try {
    if (on) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    return;
  }
};

const fromTown = (town) => ({
  status: "granted",
  source: "town",
  town: town.name,
  coords: { lat: town.lat, lng: town.lng }
});

const saved = readTown();

export const useGeoStore = create((set, get) => {
  // Each locate() call gets a ticket. A reset (or a newer call) invalidates older tickets, so a slow browser
  // answer cannot bring back a location the shopper has just cleared.
  let ticket = 0;

  const locate = () => {
    if (!("geolocation" in navigator)) {
      set({ status: "unsupported", explaining: true });
      return;
    }
    const mine = ++ticket;
    set({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (mine !== ticket) return;
        // Only an approximate fix (about 1 km) is kept: enough for "how far", too coarse to locate a person.
        const coords = coarsenCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!coords) {
          set({ status: "denied", explaining: true });
          return;
        }
        writeTown(null);
        writeOptOut(false);
        set({ status: "granted", source: "device", town: null, coords, explaining: false });
      },
      () => {
        if (mine !== ticket) return;
        set({ status: "denied", explaining: true });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return {
    status: saved ? "granted" : "idle",
    source: saved ? "town" : null,
    town: saved?.name ?? null,
    coords: saved ? { lat: saved.lat, lng: saved.lng } : null,
    explaining: false,
    request: () => {
      if (get().status === "asking") return;
      if (!("geolocation" in navigator)) {
        set({ status: "unsupported", explaining: true });
        return;
      }
      set({ explaining: true });
    },
    restore: async () => {
      if (get().coords || get().status === "asking" || readOptOut()) return;
      try {
        const result = await navigator.permissions?.query({ name: "geolocation" });
        if (result?.state === "granted" && !readOptOut()) locate();
      } catch {
        return;
      }
    },
    allow: () => {
      set({ explaining: false });
      writeOptOut(false);
      locate();
    },
    chooseTown: (name) => {
      const town = TOWNS.find((t) => t.name === name);
      if (!town) return;
      ticket += 1;
      writeTown(town.name);
      writeOptOut(false);
      set({ ...fromTown(town), explaining: false });
    },
    // Forget the location entirely: stored town, in-memory fix, cached results that used it, and any
    // request still in flight. Back to the same state as a first visit, plus the opt-out flag.
    reset: () => {
      ticket += 1;
      writeTown(null);
      writeOptOut(true);
      queryClient.removeQueries({ predicate: (q) => POSITIONAL_QUERIES.has(q.queryKey?.[0]) });
      set({ status: "idle", source: null, town: null, coords: null, explaining: false });
    },
    close: () => set({ explaining: false })
  };
});
