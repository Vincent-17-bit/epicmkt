import FlashStickyBar from "../FlashStickyBar.jsx";
import { shownForQty } from "../../lib/lineFor.js";

// The sticky price bar that appears once the flash banner has scrolled out of view.
export default function FlashSticky({ ctx }) {
  const { item, shown: base, line, hold, bannerInView } = ctx;
  if (!item?.flash || hold || !base) return null;
  const shown = shownForQty(base, line);
  return <FlashStickyBar endsAt={item.flash.sale.endsAt} price={shown.salePrice} visible={!bannerInView} />;
}
