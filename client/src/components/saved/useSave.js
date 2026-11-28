import { useCallback, useEffect, useMemo } from "react";
import { savedList, lineKey } from "../../lib/savedList.js";
import { useIsSaved } from "../../stores/saved.js";
import { showToast } from "../../stores/toast.js";
import { announce } from "../../stores/savedAnnounce.js";
import { t } from "../../i18n/index.js";
import { fill } from "./text.js";
import { requestSavedOpen } from "../../stores/savedUi.js";

const loadEntry = () => import("./entry.js");
let warmed = false;
// Ask the browser to fetch the entry builder when it has nothing better to do, so the first tap on a heart is instant.
const warm = () => {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  (window.requestIdleCallback ?? ((fn) => window.setTimeout(fn, 1500)))(() => loadEntry().catch(() => {}));
};

const say = (list) => announce(list.count() === 1 ? t("saved.liveSavedOne") : fill("saved.liveSavedMany", { n: String(list.count()) }));

/** The wishlist toast: the product's picture and name under "Added to your wishlist", and a View wishlist button. */
export const wishlistToast = (entry, open) => ({
  icon: "heart",
  detail: entry?.snap?.name || undefined,
  image: entry?.snap?.image || undefined,
  action: { label: t("saved.viewWishlist"), onClick: open }
});

/** save / remove with the toasts, undo and announcements the Saved list promises. `open` shows the drawer (the toast's "View list"). */
export function useSaveActions() {
  const open = requestSavedOpen;
  const save = useCallback(
    async (args, { toast = true, chooseLater = false, entry } = {}) => {
      const list = savedList();
      // The item page passes the line it already built; a card builds it here (the builder loads on first use).
      const res = list.add(entry ?? (await loadEntry()).entryFor(args));
      if (!res.ok) {
        showToast(res.reason === "full" ? t("saved.full") : t("saved.toastChooseLater"));
        return res;
      }
      say(list);
      if (toast) showToast(t(chooseLater ? "saved.toastWishlistOptions" : "saved.toastWishlist"), wishlistToast(res.entry ?? entry, open));
      return res;
    },
    [open]
  );
  const removeLines = useCallback((keys, { detail } = {}) => {
    const list = savedList();
    const gone = [];
    for (const key of keys) {
      const r = list.remove(key);
      if (r) gone.push(r);
    }
    if (!gone.length) return;
    announce(t("saved.liveRemoved"));
    const last = gone.at(-1)?.entry;
    showToast(t("saved.toastWishlistRemoved"), {
      duration: 6000,
      icon: "heart-off",
      detail: detail || (gone.length === 1 ? last?.snap?.name || undefined : `${gone.length} items`),
      image: gone.length === 1 ? last?.snap?.image || undefined : undefined,
      action: {
        label: t("saved.undo"),
        // Back where they were: put the last removed back first so every position is still right.
        onClick: () => {
          for (const r of [...gone].reverse()) list.restore(r.entry, r.position);
          announce(t("saved.toastAddedBack"));
        }
      }
    });
  }, []);
  const removeItem = useCallback((itemId) => removeLines(savedList().list().filter((e) => e.itemId === itemId).map((e) => e.key)), [removeLines]);
  return useMemo(() => ({ save, removeLines, removeItem }), [save, removeLines, removeItem]);
}

/** What a card's heart needs: { saved, onToggle, label }. Saved means any line of this item is in the list. */
export function useSaveAction(item) {
  const saved = useIsSaved(item?.id);
  useEffect(warm, []);
  const { save, removeItem } = useSaveActions();
  const withShop = Boolean(item?.id && (item.businessId || item.business?.id));
  return useMemo(() => {
    if (!withShop) return null;
    return {
      saved,
      label: fill(saved ? "saved.removeItem" : "saved.saveItem", { name: item.name }),
      onToggle: () => (saved ? removeItem(item.id) : save({ item }))
    };
  }, [item, withShop, saved, save, removeItem]);
}

export { lineKey };
