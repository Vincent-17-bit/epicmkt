import { create } from "zustand";

// One polite live region (in the header heart) says what happened to the Saved list: "Saved. 5 items in your list.", "Removed.", new totals.
let flip = false;
export const useAnnounce = create((set) => ({
  message: "",
  say: (message) => {
    flip = !flip;
    // A trailing space makes the same words read out again when they repeat.
    set({ message: flip ? message : `${message} ` });
  }
}));
export const announce = (message) => useAnnounce.getState().say(message);
