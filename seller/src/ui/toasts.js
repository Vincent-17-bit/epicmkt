import { create } from "zustand";

let n = 0;

// Small toast queue. A toast may carry one action (Undo) and stays up long enough to use it.
export const useToasts = create((set, get) => ({
  toasts: [],
  push: ({ message, tone = "info", actionLabel, onAction, ms = 8000 }) => {
    const id = (n += 1);
    set({ toasts: [...get().toasts, { id, message, tone, actionLabel, onAction }] });
    if (ms) setTimeout(() => get().dismiss(id), ms);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  clear: () => set({ toasts: [] }),
}));
