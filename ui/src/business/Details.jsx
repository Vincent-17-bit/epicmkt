import BusinessSection from "./BusinessSection.jsx";
import "./Details.module.css";

export default function Details({ title, children }) {
  return (
    <BusinessSection title={title} id="details">
      {children}
    </BusinessSection>
  );
}
