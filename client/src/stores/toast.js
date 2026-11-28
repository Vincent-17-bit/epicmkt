import { create } from "zustand";

let counter = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  // `options` is optional: { action: { label, onClick }, duration }. Plain push(message) behaves exactly as before (4.5 s, no button).
  push: (message, options = {}) => {
    counter += 1;
    const id = counter;
    const action = options.action ?? null;
    set((s) => ({ toasts: [...s.toasts, action ? { id, message, action } : { id, message }] }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), options.duration ?? 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}));

export const showToast = (message, options) => useToastStore.getState().push(message, options);
