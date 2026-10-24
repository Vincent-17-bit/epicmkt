import { Link } from "react-router-dom";
import { StoreTile } from "@epicmkt/ui";
import { logContactEvent } from "../api/index.js";
import { t } from "../i18n/index.js";

const renderLink = ({ href, children, ...rest }) => (
  <Link to={href} {...rest}>
    {children}
  </Link>
);

const onContact = (business, type) => logContactEvent({ businessId: business.id, type });

export const storeTileLabels = () => ({
  from: t("store.from"),
  open: t("store.open"),
  closed: t("store.closed"),
  featured: t("home.featuredStore"),
  verified: t("home.verifiedStore")
});

/** The compact store card (two thirds picture, details, contact strip) wired to the router and contact tracking. */
export default function StoreTileCard({ business }) {
  return (
    <StoreTile
      business={business}
      href={`/b/${business.slug}`}
      renderLink={renderLink}
      onContact={onContact}
      labels={storeTileLabels()}
      promoLabels={{ flash: t("flash.promo"), offer: t("flash.offer") }}
    />
  );
}
