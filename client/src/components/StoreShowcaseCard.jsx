import { Link } from "react-router-dom";
import { StoreShowcase } from "@epicmkt/ui";
import { logContactEvent } from "../api/index.js";
import { t } from "../i18n/index.js";
import { itemPagePath } from "./ProductTile.jsx";

const renderLink = ({ href, children, ...rest }) => (
  <Link to={href} {...rest}>
    {children}
  </Link>
);

const onContact = (business, type) => logContactEvent({ businessId: business.id, type });

const labels = () => ({
  visitStore: t("store.visit"),
  comingSoon: t("store.comingSoon"),
  open: t("store.open"),
  closed: t("store.closed"),
  featured: t("home.featuredStore"),
  verified: t("home.verifiedStore"),
  soldOut: t("store.soldOut"),
  call: t("store.call"),
  whatsapp: t("store.whatsapp"),
  directions: t("store.directions")
});

/**
 * A featured store as one card: the header opens the store, each product picture opens that product's page, and
 * Call, WhatsApp and Directions sit along the bottom.
 */
export default function StoreShowcaseCard({ business, products = [], loading = false }) {
  return (
    <StoreShowcase
      business={business}
      products={products}
      loading={loading}
      href={`/b/${business.slug}`}
      itemHref={(item) => itemPagePath({ ...item, businessSlug: item.businessSlug ?? business.slug })}
      renderLink={renderLink}
      onContact={onContact}
      labels={labels()}
    />
  );
}
