import { create } from "zustand";

let seq = 0;

export const useToasts = create((set, get) => ({
  items: [],
  push: ({ message, actionLabel, onAction, onExpire, ms = 6000 }) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      get().drop(id);
      onExpire?.();
    }, ms);
    set((s) => ({ items: [...s.items, { id, message, actionLabel, timer, onAction: () => {
      clearTimeout(timer);
      get().drop(id);
      onAction?.();
    } }] }));
    return id;
  },
  drop: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = (message, opts = {}) => useToasts.getState().push({ message, ...opts });
