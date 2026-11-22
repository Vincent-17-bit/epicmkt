import { create } from "zustand";
import { TOWNS } from "@epicmkt/shared";
import { coarsenCoords } from "@epicmkt/backend";
import { queryClient } from "../lib/queryClient.js";
import { reversePlace } from "../lib/places.js";

const KEY = "epicmkt.town";
// Set when the shopper clears their location. While it is set we never ask the browser again on our own,
// even if the browser still remembers a "granted" permission. Cleared by any explicit choice.
const OPT_OUT_KEY = "epicmkt.geo.off";

// Query keys that embed a position. Dropped on reset so no stale fix lingers in the cache.
const POSITIONAL_QUERIES = new Set(["nearby", "flash-page", "offers-page", "flash-strip", "similar-items"]);

const validPlace = (p) => p && typeof p.name === "string" && p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

// A chosen place is kept as { name, lat, lng }; a plain town name saved by an older version is still read.
const readTown = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    if (raw.startsWith("{")) {
      const p = JSON.parse(raw);
      return validPlace(p) ? { name: p.name, lat: p.lat, lng: p.lng } : null;
    }
    return TOWNS.find((t) => t.name === raw) ?? null;
  } catch {
    return null;
  }
};

const writeTown = (place) => {
  try {
    if (!place) localStorage.removeItem(KEY);
    else if (TOWNS.some((t) => t.name === place.name && t.lat === place.lat && t.lng === place.lng)) localStorage.setItem(KEY, place.name);
    else localStorage.setItem(KEY, JSON.stringify({ name: place.name, lat: place.lat, lng: place.lng }));
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

const round4 = (n) => Math.round(n * 10000) / 10000;
const isTown = (p) => TOWNS.some((t) => t.name === p.name && t.lat === p.lat && t.lng === p.lng);

// `coords` is the approximate position (about 1 km) that is sent with searches and used for sorting. `exact` (about 10 m) stays on this
// device and is used only to work out how far the shop is and to name the place; it is never sent in a search or stored for a device fix.
const fromTown = (town) => ({
  status: "granted",
  source: "town",
  town: town.name,
  place: null,
  placeFull: null,
  coords: isTown(town) ? { lat: town.lat, lng: town.lng } : coarsenCoords({ lat: town.lat, lng: town.lng }),
  exact: { lat: round4(town.lat), lng: round4(town.lng) }
});

const saved = readTown();

export const useGeoStore = create((set, get) => {
  // Each locate() call gets a ticket. A reset (or a newer call) invalidates older tickets, so a slow browser
  // answer cannot bring back a location the shopper has just cleared.
  let ticket = 0;

  // A failed device lookup must not throw away a town the shopper already chose: keep it, and only
  // record that the device cannot be used so the sheet can say so.
  const failDevice = (status) => {
    if (get().coords) set({ status: "granted", deviceBlocked: true, explaining: true });
    else set({ status, deviceBlocked: true, explaining: true });
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      failDevice("unsupported");
      return;
    }
    const mine = ++ticket;
    set({ status: "asking", deviceBlocked: false });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (mine !== ticket) return;
        // Searches and sorting only ever get the approximate fix (about 1 km). The exact one (about 10 m) is kept in memory for this visit.
        const coords = coarsenCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const exact = { lat: round4(pos.coords.latitude), lng: round4(pos.coords.longitude) };
        if (!coords) {
          failDevice("denied");
          return;
        }
        writeTown(null);
        writeOptOut(false);
        set({ status: "granted", source: "device", town: null, place: null, placeFull: null, coords, exact, deviceBlocked: false, explaining: false });
        // The area name is looked up after the fix is kept, so a slow or failed lookup never delays or blocks the location itself.
        reversePlace(exact).then((found) => {
          const now = get();
          if (mine === ticket && found && now.source === "device" && now.exact?.lat === exact.lat && now.exact?.lng === exact.lng) set({ place: found.area, placeFull: found.label });
        });
      },
      () => {
        if (mine !== ticket) return;
        failDevice("denied");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  return {
    status: saved ? "granted" : "idle",
    source: saved ? "town" : null,
    town: saved?.name ?? null,
    place: null,
    placeFull: null,
    coords: saved ? fromTown(saved).coords : null,
    exact: saved ? fromTown(saved).exact : null,
    deviceBlocked: false,
    explaining: false,
    // Opens the location sheet. It never changes the current location by itself.
    request: () => {
      if (get().status === "asking") return;
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
      get().choosePlace({ name: town.name, lat: town.lat, lng: town.lng });
    },
    // Any area the shopper picked or searched for: { name, lat, lng } (name is what the header shows, e.g. "Kilimani, Nairobi").
    choosePlace: (place) => {
      if (!validPlace(place)) return;
      ticket += 1;
      writeTown(place);
      writeOptOut(false);
      set({ ...fromTown(place), deviceBlocked: false, explaining: false });
    },
    // Forget the location entirely: stored town, in-memory fix, cached results that used it, and any
    // request still in flight. Back to the same state as a first visit, plus the opt-out flag.
    reset: () => {
      ticket += 1;
      writeTown(null);
      writeOptOut(true);
      queryClient.removeQueries({ predicate: (q) => POSITIONAL_QUERIES.has(q.queryKey?.[0]) });
      set({ status: "idle", source: null, town: null, place: null, placeFull: null, coords: null, exact: null, deviceBlocked: false, explaining: false });
    },
    close: () => set({ explaining: false })
  };
});
