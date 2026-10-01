import { create } from "zustand";

export const useUiStore = create((set) => ({
  menuOpen: false,
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => set({ menuOpen: false })
}));
