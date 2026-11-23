import { useCallback, useMemo } from "react";
import { coverUrl } from "@epicmkt/ui";
import { savedList, lineKey } from "../../lib/savedList.js";
import { useIsSaved } from "../../stores/saved.js";
import { showToast } from "../../stores/toast.js";
import { announce } from "../../stores/savedAnnounce.js";
import { quantityInfo } from "../../lib/itemView.js";
import { isServiceItem } from "../../lib/listing.js";
import { t } from "../../i18n/index.js";
import { fill } from "./model.js";
import { requestSavedOpen } from "../../stores/savedUi.js";

const unitNow = (item, override) => {
  if (Number.isFinite(override)) return override;
  const p = item?.pricing;
  if (Number.isFinite(p?.salePrice)) return p.salePrice;
  return Number.isFinite(p?.regularPrice) ? p.regularPrice : null;
};

/** The line to store: ids, the option, the quantity and a small snapshot (never anything the buyer typed). */
export function entryFor({ item, business, optionParam = "", optionLabel = "", qty = 1, unit }) {
  const shop = business ?? item?.business ?? {};
  const info = quantityInfo(item);
  const measure = info?.mode === "measure" ? { min: info.rules.min, step: info.rules.step, unit: info.unit } : null;
  return {
    itemId: item.id,
    businessId: item.businessId || shop.id,
    businessSlug: item.businessSlug || shop.slug || "",
    optionParam,
    optionLabel,
    kind: isServiceItem(item) ? "service" : "product",
    qty,
    snap: { name: item.name, image: coverUrl(item) || null, unit: unitNow(item, unit), businessName: shop.name || "", mode: measure ? "measure" : "units", measure }
  };
}

const say = (list) => announce(list.count() === 1 ? t("saved.liveSavedOne") : fill("saved.liveSavedMany", { n: String(list.count()) }));

/** save / remove with the toasts, undo and announcements the Saved list promises. `open` shows the drawer (the toast's "View list"). */
export function useSaveActions() {
  const open = requestSavedOpen;
  const save = useCallback(
    (args, { toast = true, chooseLater = false } = {}) => {
      const list = savedList();
      const res = list.add(entryFor(args));
      if (!res.ok) {
        showToast(res.reason === "full" ? t("saved.full") : t("saved.toastChooseLater"));
        return res;
      }
      say(list);
      if (toast) showToast(chooseLater ? t("saved.toastChooseLater") : t("saved.toastSaved"), { action: { label: t("saved.viewList"), onClick: open } });
      return res;
    },
    [open]
  );
  const removeLines = useCallback((keys) => {
    const list = savedList();
    const gone = [];
    for (const key of keys) {
      const r = list.remove(key);
      if (r) gone.push(r);
    }
    if (!gone.length) return;
    announce(t("saved.liveRemoved"));
    showToast(t("saved.toastRemoved"), {
      duration: 6000,
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
