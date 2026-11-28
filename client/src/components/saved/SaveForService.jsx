import { SaveButton } from "@epicmkt/ui";
import { useSaveAction } from "./useSave.js";

// The heart for one row of a shop's item list (the shared Services list passes each row here through renderSave).
export default function SaveForService({ svc, business }) {
  const item = {
    id: svc.id,
    name: svc.name,
    imageUrl: svc.imageUrl,
    kind: svc.kind,
    quantityMode: svc.quantityMode,
    availability: svc.availability,
    businessId: business.id,
    businessSlug: business.slug,
    business: { id: business.id, slug: business.slug, name: business.name, categoryId: business.categoryId },
    pricing: Number.isFinite(svc.priceKes) ? { regularPrice: svc.priceKes, salePrice: svc.priceKes, savings: 0, discountPercent: 0 } : null
  };
  const action = useSaveAction(item);
  if (!action) return null;
  return <SaveButton saved={action.saved} onToggle={action.onToggle} label={action.label} size={20} />;
}
