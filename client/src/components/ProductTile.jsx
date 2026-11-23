import { Link } from "react-router-dom";
import { ProductTile as Tile } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import FlashChip from "./FlashChip.jsx";
import { useSaveAction } from "./saved/useSave.js";

const renderLink = ({ href, children, ...rest }) => (
  <Link to={href} {...rest}>
    {children}
  </Link>
);

const labels = {
  was: null,
  verified: null,
  featured: null,
  closed: null,
  lowStock: null,
  onlyLeft: null
};

// The page an item opens on: its own page under its store, not a sheet over the store.
export const itemPagePath = (item) => `/b/${item.business?.slug ?? item.businessSlug}/i/${encodeURIComponent(item.id)}`;

/** The site's one product card. Search results pass the extras they show (facts, colours, delivery, a button); see @epicmkt/ui ProductTile. */
export default function ProductTile({ item, href, save = true, ...extra }) {
  // The Save heart: on every buyer card, unless a caller opts out (save={false}) or the item does not say which shop it belongs to.
  const action = useSaveAction(save ? item : null);
  return (
    <Tile
      action={action ?? undefined}
      {...extra}
      item={item}
      href={href ?? itemPagePath(item)}
      renderLink={renderLink}
      labels={{ ...labels, was: t("item.was"), from: t("item.from"), options: t("item.options"), optionsOne: t("item.optionsOne"), optionsMany: t("item.optionsMany"), verified: t("home.verifiedStore"), featured: t("home.featuredStore"), closed: t("item.closed"), open: t("item.openNow"), colours: t("item.colours"), videos: t("item.hasVideo"), lowStock: t("item.lowStock"), onlyLeft: t("item.onlyLeft"), offerChip: { offer: t("offer.chip"), more: t("offer.more") } }}
      renderFlash={(chipClass) => <FlashChip endsAt={item.flash.sale.endsAt} className={chipClass} />}
    />
  );
}
