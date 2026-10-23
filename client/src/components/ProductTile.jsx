import { Link } from "react-router-dom";
import { ProductTile as Tile } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import FlashChip from "./FlashChip.jsx";

const renderLink = ({ href, children, ...rest }) => (
  <Link to={href} {...rest}>
    {children}
  </Link>
);

const labels = {
  was: null,
  verified: null,
  featured: null,
  availability: (key) => t(`item.availability.${key}`)
};

// The page an item opens on: its own page under its store, not a sheet over the store.
export const itemPagePath = (item) => `/b/${item.business?.slug ?? item.businessSlug}/i/${encodeURIComponent(item.id)}`;

export default function ProductTile({ item }) {
  return (
    <Tile
      item={item}
      href={itemPagePath(item)}
      renderLink={renderLink}
      labels={{ ...labels, was: t("item.was"), verified: t("home.verifiedStore"), featured: t("home.featuredStore") }}
      renderFlash={(chipClass) => <FlashChip endsAt={item.flash.sale.endsAt} className={chipClass} />}
    />
  );
}
