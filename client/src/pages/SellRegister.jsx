import { Link } from "react-router-dom";
import { faArrowLeft, faEnvelope, faStore } from "@fortawesome/free-solid-svg-icons";
import StatusPage from "../components/StatusPage.jsx";
import Button from "../components/Button.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";

export default function SellRegister() {
  usePageTitle("Register your business");
  return (
    <StatusPage
      icon={faStore}
      title="Registration opens soon"
      message="Seller sign-up is on its way. Want to be listed first? Get in touch and we will add your business as soon as registration opens."
    >
      <Button as={Link} to="/contact" icon={faEnvelope}>
        Contact us
      </Button>
      <Button as={Link} to="/sell" variant="secondary" icon={faArrowLeft}>
        Back to plans
      </Button>
    </StatusPage>
  );
}
