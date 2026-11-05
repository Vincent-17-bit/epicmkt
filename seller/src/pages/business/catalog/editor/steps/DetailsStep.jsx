import DetailsSection from "../DetailsSection.jsx";

export default function DetailsStep({ form, patch, errors, focusOn }) {
  return <DetailsSection form={form} patch={patch} errors={errors} focusOn={focusOn} />;
}
