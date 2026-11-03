import { isListed } from "@epicmkt/shared";

const SHOP_TEXT = {
  paused: "Your shop is paused, so customers see none of your items.",
  suspended: "Your shop is suspended, so customers see none of your items.",
  expired: "Your subscription has ended, so customers see none of your items."
};

export const whyShown = ({ item, shop }) => {
  const reasons = [];
  if (item.removedByAdmin) reasons.push({ code: "removed", text: "Removed by an admin. It cannot be shown." });
  else if (item.hiddenByAdmin) reasons.push({ code: "admin", text: item.adminHideReason ? `Hidden by an admin: ${item.adminHideReason}` : "Hidden by an admin. You cannot change this." });
  if (!shop.live) {
    const fix = shop.status === "paused" ? { id: "resume", label: "Resume shop" } : shop.status === "expired" ? { id: "renew", label: "Renew subscription", to: "/business/subscription" } : null;
    reasons.push({ code: "shop", text: SHOP_TEXT[shop.status] ?? "Your shop is not live, so customers see none of your items.", fix });
  }
  if (item.draft) reasons.push({ code: "draft", text: "This is a draft. Customers cannot see it yet.", fix: item.removedByAdmin || item.hiddenByAdmin ? null : { id: "show", label: "Publish" } });
  else if (!item.visible && !item.hiddenByAdmin && !item.removedByAdmin) reasons.push({ code: "hidden", text: "You hid this item.", fix: { id: "show", label: "Show to customers" } });
  if (!isListed(item)) reasons.push({ code: "stock", text: "Marked out of stock. Customers do not see items that are out of stock.", fix: { id: "restock", label: "Back in stock" } });
  return { showing: reasons.length === 0, reasons };
};
