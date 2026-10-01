import { create } from "zustand";
import { applyMode, readMode, saveMode } from "../lib/theme.js";

export const useUiStore = create((set) => ({
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  theme: readMode(),
  setTheme: (theme) => {
    saveMode(theme);
    applyMode(theme, true);
    set({ theme });
  }
}));
