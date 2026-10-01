import { create } from "zustand";

export const useUiStore = create((set) => ({
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen })
}));
