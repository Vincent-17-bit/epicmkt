import { ItemOptions } from "@epicmkt/ui";
import OptionsPicker from "./OptionsPicker.jsx";

// Options slot: the picker. An item with option axes (colour, size, storage, style...) gets the grouped picker, driven by
// ctx.option (see hooks/useOptionSelection.js). An item with only the old single list of variants gets that list from ui, exactly as
// before, and an item with neither shows nothing.
export default function Options({ ctx, slot }) {
  if (!slot?.item) return null;
  if (ctx?.option) return <OptionsPicker item={slot.item} option={ctx.option} />;
  return <ItemOptions {...slot} />;
}
