import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { conditionsText, formatDistance, offerClaimMessage, offerHeadline, offerLabel, offerSavings, offerSteps, whatsappLink } from "@epicmkt/shared";
import { offerValidity } from "./itemView.js";
import { offerHref } from "./offers.js";
import { t } from "../i18n/index.js";

/**
 * Every offer on the site is drawn by the same ticket (@epicmkt/ui OfferDeal). This turns one offer view from the API into the
 * ticket's data, so the pages only choose what to add around it:
 *  - product page: pass `item` and `price`; the ticket gets what the deal is worth on that product, how to get it, and a WhatsApp claim.
 *  - offers page: pass `store: true`; the ticket gets the shop's name, logo and distance, and a link to the offer.
 */
export function dealOf(view, { item = null, price = null, store = false, headingLevel } = {}) {
  const { offer, business, remainingMs, products = [], availableNow = true, appliesToLabel } = view;
  const others = item ? products.filter((p) => p.id !== item.id) : products;
  const conditions = conditionsText(offer);
  if (appliesToLabel) conditions.unshift(appliesToLabel);
  const deal = {
    id: offer.id,
    kind: offer.kind,
    label: offerLabel(offer),
    title: offer.title || offerHeadline(offer),
    headline: offerHeadline(offer),
    description: offer.description,
    code: offer.code,
    terms: offer.terms,
    remainingMs,
    conditions,
    availableNow,
    products: others,
    validity: item ? offerValidity(offer, item.business?.timezone || undefined) : null,
    headingLevel
  };

  if (item) {
    deal.savings = offerSavings(offer, { price, companions: others });
    deal.steps = offerSteps(offer, { products });
    const whatsapp = item.business?.whatsapp;
    if (whatsapp) deal.action = { href: whatsappLink(whatsapp, offerClaimMessage(offer, item.name)), external: true, icon: faWhatsapp, label: t("offer.claim") };
  }

  if (store && business) {
    deal.store = {
      name: business.name,
      logo: business.logo,
      verified: Boolean(business.verified),
      distanceText: Number.isFinite(business.distanceKm) ? formatDistance(business.distanceKm) : null
    };
    deal.action = { as: Link, to: offerHref(view), label: t("offers.view"), trailingIcon: faArrowRight };
  }
  return deal;
}

/** The words on the ticket and its bar, in the site's language. */
export const offerLabels = () => ({
  title: t("offers.title"),
  code: t("offer.code"),
  copy: t("offer.copy"),
  copied: t("offer.copied"),
  endsIn: t("offer.endsIn"),
  noEnd: t("offer.noEnd"),
  onlyNow: t("offer.onlyNow"),
  openProduct: t("offer.openProduct"),
  claimNow: t("offer.claimNow"),
  valid: t("offer.valid"),
  how: t("offer.how"),
  youSave: t("offer.youSave"),
  verified: t("flash.verified")
});
