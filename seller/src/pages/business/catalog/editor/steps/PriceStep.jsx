import PriceSection from "../PriceSection.jsx";

export default function PriceStep({ form, patch, errors, focusOn }) {
  return <PriceSection form={form} patch={patch} errors={errors} focusOn={focusOn} />;
}
