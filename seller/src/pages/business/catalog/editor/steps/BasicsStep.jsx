import BasicsSection from "../BasicsSection.jsx";

export default function BasicsStep({ form, patch, errors, category, sections, focusOn }) {
  return <BasicsSection form={form} patch={patch} errors={errors} category={category} sections={sections} focusOn={focusOn} />;
}
