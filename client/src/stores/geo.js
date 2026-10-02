import { create } from "zustand";

export const useGeoStore = create((set, get) => ({
  status: "idle",
  coords: null,
  request: () => {
    if (get().status === "asking" || get().status === "granted") return;
    if (!("geolocation" in navigator)) {
      set({ status: "unsupported" });
      return;
    }
    set({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (pos) => set({ status: "granted", coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => set({ status: "denied" }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }
}));
