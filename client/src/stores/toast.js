import { create } from "zustand";

let counter = 0;
const PROBLEM = /\b(could not|couldn't|can't|cannot|failed|unable|try again|not allowed|limit|error)\b/i;

export const useToastStore = create((set) => ({
  toasts: [],
  // `options` is optional: { action: { label, onClick }, duration, tone }. Plain push(message) is a 4.5 s success toast with no button.
  // The same message pushed again replaces the one showing (tapping Save twice gives one "Saved", not two), and at most three show.
  push: (message, options = {}) => {
    counter += 1;
    const id = counter;
    const action = options.action ?? null;
    const tone = options.tone ?? (PROBLEM.test(String(message)) ? "error" : "success");
    const toast = action ? { id, message, tone, action } : { id, message, tone };
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.message !== message), toast].slice(-3) }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), options.duration ?? 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}));

export const showToast = (message, options) => useToastStore.getState().push(message, options);
