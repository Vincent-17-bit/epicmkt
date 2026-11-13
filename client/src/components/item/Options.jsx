import { ItemOptions } from "@epicmkt/ui";
import OptionsPicker from "./OptionsPicker.jsx";
import SizeChartLink from "./SizeChartModal.jsx";
import styles from "./SizeChartModal.module.css";

// Options slot: the picker. An item with option axes (colour, size, storage, style...) gets the grouped picker, driven by
// ctx.option (see hooks/useOptionSelection.js). An item with only the old single list of variants gets that list from ui, exactly as
// before, and an item with neither shows nothing.
export default function Options({ ctx, slot }) {
  if (!slot?.item) return null;
  if (ctx?.option) return <OptionsPicker item={slot.item} option={ctx.option} />;
  // An item with a size guide but no option groups (a bag, a plank, a loaf sold in one size) still shows its guide: a Size chart link under the title block.
  const own = slot.item.sizeChart ? <div className={styles.standalone}><SizeChartLink chart={slot.item.sizeChart} /></div> : null;
  return <><ItemOptions {...slot} />{own}</>;
}
