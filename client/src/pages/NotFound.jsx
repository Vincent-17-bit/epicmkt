import { Link } from "react-router-dom";
import { faMagnifyingGlass, faHouse } from "@fortawesome/free-solid-svg-icons";
import StatusPage from "../components/StatusPage.jsx";
import { Button } from "@epicmkt/ui";
import { usePageTitle } from "../hooks/usePageTitle.js";

export default function NotFound() {
  usePageTitle("Page not found");
  return (
    <StatusPage
      icon={faMagnifyingGlass}
      title="Page not found"
      message="The page you are looking for does not exist or has moved."
    >
      <Button as={Link} to="/" icon={faHouse}>
        Back to home
      </Button>
    </StatusPage>
  );
}
