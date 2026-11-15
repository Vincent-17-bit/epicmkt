import GoesWith from "../GoesWith.jsx";
import SimilarItems from "../SimilarItems.jsx";
import StoreSelective from "../StoreSelective.jsx";
import styles from "../ItemDetail.module.css";

// The recommendations at the end of the page, after the details and the seller card: first what goes with this product ("Goes well
// with this", C19), then the same kind of product from other stores ("Similar items"). The caller keys it by the item so one
// product's results can never show under another.
export default function Recommend({ ctx }) {
  const { item, business } = ctx;
  if (!item) return null;
  return (
    <>
      <GoesWith itemId={item.id} businessId={business.id} className={styles.similar} />
      <SimilarItems itemId={item.id} businessId={business.id} name={item.name} brand={item.brand ?? ""} className={styles.similar} />
    </>
  );
}

// More from this store. Shown in the loading and gone states too, and after the description when the item is there.
export function StoreMore({ ctx }) {
  const { business, itemId, track, onSelect } = ctx;
  return (
    <StoreSelective
      businessId={business.id}
      businessSlug={business.slug}
      excludeItemId={itemId}
      onSelect={(next, index) => {
        track("store_selective_click", { targetItemId: next.id, position: index + 1 });
        onSelect(next.id);
      }}
      onSeeAll={() => track("store_selective_click", { target: "see_all" })}
    />
  );
}
