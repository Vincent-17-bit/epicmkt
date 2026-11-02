const SHOP_REASONS = {
  expired: { text: "Your subscription has expired, so your shop and every item in it are hidden.", fix: { kind: "link", to: "/business/subscription", label: "Go to subscription" } },
  paused: { text: "You paused your listing, so no item is showing to customers.", fix: { kind: "link", to: "/business/subscription", label: "Open subscription" } },
  pending: { text: "Your listing is waiting for approval, so no item is showing yet.", fix: null },
  suspended: { text: "Your listing was suspended by EpicMKT, so no item is showing.", fix: null },
};

export const reasonFor = (item, shop, { suspended = false } = {}) => {
  if (item.removed) return { showing: false, code: "removed", text: "EpicMKT removed this item, so customers cannot see it.", fix: null };
  if (item.visibility === "hidden_admin") {
    const why = item.adminHideReason ? `: ${item.adminHideReason}` : "";
    return { showing: false, code: "hidden_admin", text: `EpicMKT hid this item${why}. You cannot change this.`, fix: null };
  }
  if (suspended || shop?.status === "suspended") return { showing: false, code: "suspended", ...SHOP_REASONS.suspended };
  if (shop && !shop.live) {
    const hit = SHOP_REASONS[shop.status] ?? SHOP_REASONS.expired;
    return { showing: false, code: shop.status === "live" ? "expired" : shop.status, ...hit };
  }
  if (item.visibility === "draft") return { showing: false, code: "draft", text: "This item is a draft, so customers cannot see it yet.", fix: { kind: "show", label: "Show" } };
  if (item.visibility === "hidden_me") return { showing: false, code: "hidden", text: "You hid this item, so customers cannot see it.", fix: { kind: "show", label: "Show" } };
  if (item.soldOut) return { showing: false, code: "out_of_stock", text: "This item is out of stock, so customers do not see it.", fix: { kind: "restock", label: "Back in stock" } };
  return { showing: true, code: "showing", text: "Customers can see this item on your page.", fix: null };
};
