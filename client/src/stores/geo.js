import { create } from "zustand";
import { TOWNS } from "@epicmkt/shared";

const KEY = "epicmkt.town";

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

const fromTown = (town) => ({
  status: "granted",
  source: "town",
  town: town.name,
  coords: { lat: town.lat, lng: town.lng }
});

const saved = readTown();

export const useGeoStore = create((set, get) => {
  const locate = () => {
    if (!("geolocation" in navigator)) {
      set({ status: "unsupported", explaining: true });
      return;
    }
    set({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        writeTown(null);
        set({
          status: "granted",
          source: "device",
          town: null,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          explaining: false
        });
      },
      () => set({ status: "denied", explaining: true }),
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
      if (get().coords || get().status === "asking") return;
      try {
        const result = await navigator.permissions?.query({ name: "geolocation" });
        if (result?.state === "granted") locate();
      } catch {
        return;
      }
    },
    allow: () => {
      set({ explaining: false });
      locate();
    },
    chooseTown: (name) => {
      const town = TOWNS.find((t) => t.name === name);
      if (!town) return;
      writeTown(town.name);
      set({ ...fromTown(town), explaining: false });
    },
    close: () => set({ explaining: false })
  };
});
