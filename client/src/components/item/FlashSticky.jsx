import FlashStickyBar from "../FlashStickyBar.jsx";

// The sticky price bar that appears once the flash banner has scrolled out of view.
export default function FlashSticky({ ctx }) {
  const { item, shown, hold, bannerInView } = ctx;
  if (!item?.flash || hold || !shown) return null;
  return <FlashStickyBar endsAt={item.flash.sale.endsAt} price={shown.salePrice} visible={!bannerInView} />;
}
