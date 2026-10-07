import { Link } from "react-router-dom";
import { BusinessCard as UiBusinessCard } from "@epicmkt/ui";
import { logContactEvent } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";

const RouterLink = ({ href, ...rest }) => <Link to={href} {...rest} />;
const onContact = (business, type) => logContactEvent({ businessId: business.id, type });

export default function BusinessCard({ business }) {
  return <UiBusinessCard business={business} icon={categoryIcon(business.categoryIcon)} linkAs={RouterLink} onContact={onContact} />;
}
