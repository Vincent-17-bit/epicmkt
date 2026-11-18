import PriceSection from "../PriceSection.jsx";
import DeliveryEditor from "../DeliveryEditor.jsx";
import { SectionCard } from "../parts.jsx";
import { emptyPage } from "../page.js";

export default function PriceStep({ form, patch, errors, focusOn, goTo }) {
  const page = form.page ?? emptyPage();
  return (
    <>
      <PriceSection form={form} patch={patch} errors={errors} focusOn={focusOn} goTo={goTo} />
      <SectionCard id="delivery" title="Delivery for this item" why="Buyers decide faster when they know how and when the item reaches them.">
        <DeliveryEditor value={page.delivery} onChange={(delivery) => patch("page", { ...page, delivery })} errors={errors.delivery} />
      </SectionCard>
    </>
  );
}
