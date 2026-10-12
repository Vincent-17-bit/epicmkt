import { create } from "zustand";

let counter = 0;
export const TOAST_MS = 3500;

export const useToasts = create((set) => ({
  toasts: [],
  push: (message) => {
    counter += 1;
    const id = counter;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TOAST_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] })
}));

export const showToast = (message) => useToasts.getState().push(message);
