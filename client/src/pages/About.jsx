import { Link } from "react-router-dom";
import { faTableCells } from "@fortawesome/free-solid-svg-icons";
import InfoPage from "../components/InfoPage.jsx";
import { Button } from "@epicmkt/ui";
import { usePageTitle } from "../hooks/usePageTitle.js";

export default function About() {
  usePageTitle("About");
  return (
    <InfoPage
      title="About EpicMKT"
      intro="EpicMKT is a directory of local businesses in Kenya, built so you can find what you need nearby and reach the business in one tap."
    >
      <p>
        Search for barbershops, water refill points, chemists, agrovets, small gyms and more. Every listing has buttons to call, message on
        WhatsApp or get directions.
      </p>
      <p>
        EpicMKT does not take orders or payments. You deal directly with the business, and we simply help you find and reach them.
      </p>
      <p>
        Businesses pay a monthly fee to be listed on a Standard or Premium plan. Premium businesses are marked Featured and appear first in
        results. A Verified badge shows businesses whose details have been checked.
      </p>
      <div>
        <Button as={Link} to="/#categories" icon={faTableCells}>
          Browse categories
        </Button>
      </div>
    </InfoPage>
  );
}
