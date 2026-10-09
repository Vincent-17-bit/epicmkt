import { create } from "zustand";
import * as api from "../api/index.js";

export const useSession = create((set, get) => ({
  phase: "loading",
  me: null,
  notice: null,
  async init() {
    try {
      set({ me: await api.me(), phase: "authed" });
    } catch {
      set({ me: null, phase: "anon" });
    }
  },
  async refresh() {
    try {
      set({ me: await api.me(), phase: "authed" });
    } catch {
      set({ me: null, phase: "anon" });
    }
  },
  async signIn(sellerId, password) {
    await api.login(sellerId, password);
    set({ me: await api.me(), phase: "authed", notice: null });
  },
  async signOut(notice = null) {
    try {
      await api.logout();
    } finally {
      set({ me: null, phase: "anon", notice });
    }
  },
  clearNotice() {
    set({ notice: null });
  },
  async markAllRead() {
    await api.markRead(null);
    await get().refresh();
  }
}));
