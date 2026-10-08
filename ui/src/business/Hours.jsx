import BusinessSection from "./BusinessSection.jsx";
import HoursTable from "./HoursTable.jsx";

export default function Hours({ rows }) {
  return (
    <BusinessSection title="Opening hours" id="hours">
      <HoursTable rows={rows} />
    </BusinessSection>
  );
}
