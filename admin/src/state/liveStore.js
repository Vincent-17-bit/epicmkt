import { create } from "zustand";

const SOUND_KEY = "epicmkt-admin-sound";
const SNOOZE_KEY = "epicmkt-admin-snoozed";
const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage blocked: the choice lasts until reload */ } };

function loadSnoozed() {
  try {
    const saved = JSON.parse(read(SNOOZE_KEY, "{}"));
    const now = Date.now();
    return Object.fromEntries(Object.entries(saved).filter(([, until]) => Number(until) > now));
  } catch { return {}; }
}

/** Small client-side state for the live parts of the admin: sound, connection, the notifications drawer and snoozes. */
export const useLiveStore = create((set, get) => ({
  soundOn: read(SOUND_KEY, "off") === "on",
  connection: "connecting", // "connecting" | "live" | "offline"
  drawerOpen: false,
  snoozed: loadSnoozed(), // { [queueRowId]: untilMs }, kept in this browser only
  // Notification kinds a page handles itself (for example the applications queue shows its own "new application"
  // toast), so the layout does not show a second one. Counted, so two pages mounting in a row cannot clear each other.
  quiet: {},
  hush: (kind) => { const quiet = get().quiet; set({ quiet: { ...quiet, [kind]: (quiet[kind] ?? 0) + 1 } }); return () => { const q = get().quiet; set({ quiet: { ...q, [kind]: Math.max(0, (q[kind] ?? 1) - 1) } }); }; },

  setSound: (on) => { write(SOUND_KEY, on ? "on" : "off"); set({ soundOn: on }); },
  setConnection: (connection) => set({ connection }),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  snooze: (id, ms = 3_600_000) => {
    const snoozed = { ...get().snoozed, [id]: Date.now() + ms };
    write(SNOOZE_KEY, JSON.stringify(snoozed));
    set({ snoozed });
  },
  unsnooze: (id) => {
    const { [id]: _gone, ...snoozed } = get().snoozed;
    write(SNOOZE_KEY, JSON.stringify(snoozed));
    set({ snoozed });
  },
}));
