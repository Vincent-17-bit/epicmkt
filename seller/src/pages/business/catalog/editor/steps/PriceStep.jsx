import PriceSection from "../PriceSection.jsx";

export default function PriceStep({ form, patch, errors, focusOn, goTo }) {
  return <PriceSection form={form} patch={patch} errors={errors} focusOn={focusOn} goTo={goTo} />;
}
