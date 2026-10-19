import { Link } from "react-router-dom";
import { ShopCard } from "@epicmkt/ui";
import { logContactEvent } from "../api/index.js";
import { t } from "../i18n/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";

const renderLink = ({ href, children, ...rest }) => (
  <Link to={href} {...rest}>
    {children}
  </Link>
);

const onContact = (business, type) => logContactEvent({ businessId: business.id, type });

export default function BusinessCard({ business }) {
  return (
    <ShopCard
      business={business}
      href={`/b/${business.slug}`}
      renderLink={renderLink}
      icon={categoryIcon(business.categoryIcon)}
      onContact={onContact}
      promoLabels={{ flash: t("flash.promo"), offer: t("flash.offer") }}
    />
  );
}
