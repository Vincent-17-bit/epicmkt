import { Link } from "react-router-dom";
import { faWifi, faHouse, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import StatusPage from "../components/StatusPage.jsx";
import { Button } from "@epicmkt/ui";
import { usePageTitle } from "../hooks/usePageTitle.js";

export default function OfflinePage() {
  usePageTitle("Offline");
  return (
    <StatusPage
      icon={faWifi}
      title="You are offline"
      message="Check your connection and try again. Pages you have already opened stay available."
    >
      <Button icon={faRotateRight} onClick={() => window.location.reload()}>
        Try again
      </Button>
      <Button as={Link} to="/" variant="secondary" icon={faHouse}>
        Home
      </Button>
    </StatusPage>
  );
}
