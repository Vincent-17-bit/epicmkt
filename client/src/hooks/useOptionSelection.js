import { useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { choiceFromParam, choiceLabel, choiceToParam, reconcileSelection, variantForChoice } from "@epicmkt/shared";

// The buyer's choice among an item's option axes (colour, size, storage, style...). Returns null for an item with no options, so every
// caller can skip it and the item behaves exactly as before.
//
// The choice is always whole and consistent: it is reconciled against the sellable combinations on every render, so a seller's edit
// that arrives with a refetch can never leave a value that no longer exists. Start: the link's ?v= (value ids in axis order,
// "grey.256"), else the seller's default variant, else the cheapest in stock. Picking a value keeps the other axes where they still
// fit (switching Style keeps 128 GB when the other style has it) and writes ?v= with replace, so the link shares the exact choice and
// the back button is not filled with option clicks. ?v= belongs to the item it was written for: a different item starts afresh.
export function useOptionSelection(item, itemId) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const axes = item?.options;
  const variants = item?.optionVariants;
  const live = Array.isArray(axes) && axes.length > 0 && Array.isArray(variants) && variants.length > 0;

  // The link's value, read once per item (the first render for it), never again: later changes to the URL are our own.
  const fromUrl = useRef({ itemId, text: params.get("v") });
  if (fromUrl.current.itemId !== itemId) fromUrl.current = { itemId, text: null };
  const [picked, setPicked] = useState({ itemId: null, raw: null, axisKey: null, n: 0 });

  const raw = picked.itemId === itemId ? picked.raw : live ? choiceFromParam(axes, fromUrl.current.text) : null;
  const defaultVariantId = item?.defaultVariantId ?? null;
  const choice = useMemo(() => (live ? reconcileSelection(axes, variants, raw ?? {}, defaultVariantId) : null), [live, axes, variants, raw, defaultVariantId]);

  return useMemo(() => {
    if (!live) return null;
    const variant = variantForChoice(axes, variants, choice);
    return {
      axes,
      variants,
      choice,
      variant,
      // The option type the buyer picked last (null until they pick): its photo is the one the gallery shows. `n` counts the picks.
      lastAxisKey: picked.itemId === itemId ? picked.axisKey : null,
      pickCount: picked.itemId === itemId ? picked.n : 0,
      label: variant?.label || choiceLabel(axes, choice),
      select: (axisKey, valueId) => {
        const next = reconcileSelection(axes, variants, { ...choice, [axisKey]: valueId }, defaultVariantId);
        setPicked((p) => ({ itemId, raw: next, axisKey, n: (p.itemId === itemId ? p.n : 0) + 1 }));
        const text = choiceToParam(axes, next);
        setParams(
          (prev) => {
            const out = new URLSearchParams(prev);
            if (text) out.set("v", text);
            else out.delete("v");
            return out;
          },
          { replace: true, state: location.state }
        );
      }
    };
  }, [live, axes, variants, choice, defaultVariantId, itemId, setParams, location.state, picked]);
}
