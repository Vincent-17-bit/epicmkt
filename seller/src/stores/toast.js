import { create } from "zustand";

let counter = 0;
const timers = new Map();

export const useToastStore = create((set, get) => ({
  toasts: [],
  push: ({ message, action, duration = 6000, tone = "info" }) => {
    counter += 1;
    const id = counter;
    timers.forEach((t) => window.clearTimeout(t));
    timers.clear();
    set({ toasts: [{ id, message, action, tone, duration }] });
    timers.set(id, window.setTimeout(() => get().dismiss(id), duration));
    return id;
  },
  dismiss: (id) => {
    window.clearTimeout(timers.get(id));
    timers.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clear: () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers.clear();
    set({ toasts: [] });
  }
}));

export const showToast = (message, options = {}) => useToastStore.getState().push({ message, ...options });
