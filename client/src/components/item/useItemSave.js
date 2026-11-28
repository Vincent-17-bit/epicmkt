import { choiceToParam } from "@epicmkt/shared";
import { savedList, lineKey } from "../../lib/savedList.js";
import { useIsSaved } from "../../stores/saved.js";
import { showToast } from "../../stores/toast.js";
import { announce } from "../../stores/savedAnnounce.js";
import { t } from "../../i18n/index.js";
import { entryFor } from "../saved/entry.js";
import { useSaveActions, wishlistToast } from "../saved/useSave.js";
import { fill } from "../saved/text.js";
import { requestSavedOpen } from "../../stores/savedUi.js";

/**
 * Save on the item page: the item exactly as the buyer chose it (option and quantity). Not shown in the seller's preview.
 *   - Options not finished: saved without an option; the toast says to choose them any time in the list.
 *   - A line without an option already exists and an option is now chosen: that line is converted (setOption), not doubled.
 *   - Tapping again removes it, with Undo.
 */
export function useItemSave(ctx) {
  const { item, option, qty, business, preview, line } = ctx;
  const hasOptions = Array.isArray(item?.options) && item.options.length > 0;
  const finished = !hasOptions || Boolean(option?.variant && !option.unmatched);
  const param = hasOptions && finished ? choiceToParam(option.axes, option.choice) : "";
  const optionLabel = hasOptions && finished ? option.label || "" : "";
  const saved = useIsSaved(item?.id, param);
  const { save, removeLines } = useSaveActions();
  const open = requestSavedOpen;
  if (preview || !item?.id) return null;

  const toggle = () => {
    const key = lineKey(item.id, param);
    if (saved) {
      removeLines([key]);
      return;
    }
    const list = savedList();
    const bare = param ? list.get(lineKey(item.id, "")) : null;
    const args = { item, business, optionParam: param, optionLabel, qty, unit: line?.unit ?? undefined };
    if (bare) {
      const moved = list.setOption(bare.key, param, optionLabel, entryFor(args).snap);
      if (moved) {
        list.setQty(moved.key, qty);
        announce(fill("saved.liveSavedMany", { n: String(list.count()) }));
        showToast(t("saved.toastWishlist"), wishlistToast(moved, open));
        return;
      }
    }
    save(args, { chooseLater: hasOptions && !finished, entry: entryFor(args) });
  };
  return { saved, toggle, label: fill(saved ? "saved.removeItem" : "saved.saveItem", { name: item.name }) };
}
