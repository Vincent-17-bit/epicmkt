import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { useToast } from "../components/Toast.jsx";
import { describeError } from "../lib/applications.js";
import { UNDO_MS, deletedMessage, removeRows, restoreRows } from "../lib/activityDelete.js";

// Ids that are hidden while their delete is waiting out the Undo window or is on its way to the server. They are
// kept per QueryClient and outside React state, so the 60 second refetch (or leaving the page and coming back) can
// not bring a row back that the admin has just removed.
const stores = new WeakMap();
function storeFor(client) {
  let store = stores.get(client);
  if (!store) {
    const listeners = new Set();
    store = {
      ids: new Set(),
      snapshot: new Set(),
      listeners,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      set(update) {
        const next = new Set(store.ids);
        update(next);
        store.ids = next;
        store.snapshot = next;
        listeners.forEach((fn) => fn());
      },
    };
    stores.set(client, store);
  }
  return store;
}

/**
 * Single delete with Undo, for the Live activity list.
 *
 *   const { remove, hiddenIds } = useActivityDelete({ queryKey });
 *   remove(row)   // the row leaves the list now; the server call is made once the Undo window (5 s) has passed
 *
 * Why the call waits: a notification is deleted for good, so "Undo" has to happen before the delete is sent.
 * Nothing needs to be restored on the server, and closing the tab inside the window simply keeps the row.
 * If the call fails, the row goes back into the list and an error toast says why.
 */
export function useActivityDelete({ queryKey, undoMs = UNDO_MS }) {
  const client = useQueryClient();
  const toast = useToast();
  const store = storeFor(client);
  const hiddenIds = useSyncExternalStore(store.subscribe, () => store.snapshot);

  const hide = useCallback((ids) => store.set((set) => ids.forEach((id) => set.add(id))), [store]);
  const unhide = useCallback((ids) => store.set((set) => ids.forEach((id) => set.delete(id))), [store]);

  const putBack = useCallback((row) => {
    unhide([row.id]);
    client.setQueryData(queryKey, (current) => restoreRows(current, [row]));
  }, [client, queryKey, unhide]);

  const remove = useCallback((row) => {
    hide([row.id]);
    client.setQueryData(queryKey, (current) => removeRows(current, [row.id]));
    // Stop an in-flight refetch from writing the old list over the optimistic one.
    client.cancelQueries({ queryKey });

    let settled = false; // true once Undo was pressed or the call has started
    const commit = async () => {
      if (settled) return;
      settled = true;
      try {
        await api.deleteAdminActivity({ ids: [row.id] });
        unhide([row.id]);
        client.invalidateQueries({ queryKey }); // the next older row takes the empty place
      } catch (error) {
        putBack(row);
        toast.push({ tone: "error", message: `Could not delete that item. ${describeError(error)}`, duration: 8000 });
      }
    };
    // Not cleared on unmount: leaving the page inside the window must not cancel a delete the admin asked for.
    const timer = setTimeout(commit, undoMs);

    toast.push({
      message: deletedMessage(row),
      actionLabel: "Undo",
      duration: undoMs,
      onAction: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        putBack(row);
      },
    });
  }, [client, queryKey, hide, unhide, putBack, toast, undoMs]);

  return useMemo(() => ({ remove, hiddenIds }), [remove, hiddenIds]);
}
