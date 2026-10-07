import { create } from "zustand";

let counter = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  push: (message) => {
    counter += 1;
    const id = counter;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}));

export const showToast = (message) => useToastStore.getState().push(message);
