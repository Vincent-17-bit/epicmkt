import { createContext, createElement, useContext, useMemo } from "react";

export const ITEM_LABELS = {
  "breadcrumbs.itemUnavailable": "Item unavailable",
  "item.availability.by_appointment": "By appointment",
  "item.back": "Item",
  "item.call": "Call",
  "item.carousel": "carousel",
  "item.chatSeller": "Chat Seller",
  "item.chooseMedia": "Choose a photo or video",
  "item.close": "Close",
  "item.closed": "Closed",
  "item.description": "Description",
  "item.disclaimer": "Contact the business to order. EpicMKT does not process orders or payments.",
  "item.gallery": "Photos and videos",
  "item.gone": "This item is no longer available",
  "item.goneHint": "It may have been sold out, removed or ended. More from this store:",
  "item.group.additional": "Additional details",
  "item.group.details": "Item details",
  "item.group.features": "Features & Specs",
  "item.group.guide": "User guide",
  "item.group.measurements": "Measurements",
  "item.highlights": "About this item",
  "item.included": "What's included",
  "item.loadFailed": "We could not load this item. Check your connection and try again.",
  "item.lowStock": "Low stock",
  "item.mediaPosition": "{kind} {n} of {total}",
  "item.moreDetails": "See more product details",
  "item.next": "Next",
  "item.onlyLeft": "Only {n} left",
  "item.open": "Open",
  "item.options": "Options",
  "item.packSize": "Pack size",
  "item.photo": "Photo",
  "item.prev": "Previous",
  "item.readLess": "Read less",
  "item.readMore": "Read more",
  "item.reportPrice": "Report wrong price",
  "item.retry": "Try again",
  "item.sale": "Sale",
  "item.save": "You save",
  "item.share": "Share",
  "item.showAll": "Show all",
  "item.showLess": "Show fewer",
  "item.slide": "slide",
  "item.soldBy": "Sold by",
  "item.specs": "Specifications",
  "item.terms": "Terms and notes",
  "item.verified": "Verified",
  "item.video": "Video",
  "item.visitStore": "Visit Store",
  "item.was": "Was",
  "item.zoom": "Zoom photo",
  "offer.chip": "Offer",
  "offer.more": "more",
  "video.error": "This video could not be loaded.",
  "video.pauseStage": "Pause video",
  "video.playStage": "Play video",
  "video.soundOff": "Turn sound off",
  "video.soundOn": "Turn sound on"
};

const LabelsContext = createContext(null);

export function ItemLabelsProvider({ labels, children }) {
  const value = useMemo(() => (labels ? { ...ITEM_LABELS, ...labels } : null), [labels]);
  return createElement(LabelsContext.Provider, { value }, children);
}

export function useItemT() {
  const table = useContext(LabelsContext) ?? ITEM_LABELS;
  return (key) => table[key] ?? key;
}
