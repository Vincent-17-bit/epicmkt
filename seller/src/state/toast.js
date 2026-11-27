import { create } from "zustand";

let counter = 0;
export const TOAST_MS = 3500;
const PROBLEM = /\b(could not|couldn't|can't|cannot|failed|unable|try again|not allowed|limit|error)\b/i;

export const useToasts = create((set) => ({
  toasts: [],
  push: (message) => {
    counter += 1;
    const id = counter;
    const tone = PROBLEM.test(String(message)) ? "error" : "success";
    // The same message pushed again replaces the one showing instead of stacking.
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== message).slice(-2), { id, message, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TOAST_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] })
}));

export const showToast = (message) => useToasts.getState().push(message);
