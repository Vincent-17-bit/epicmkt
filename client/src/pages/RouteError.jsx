import { faTriangleExclamation, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import StatusPage from "../components/StatusPage.jsx";
import { Button } from "@epicmkt/ui";
import OfflinePage from "./OfflinePage.jsx";
import { useOnlineStatus } from "../hooks/useOnlineStatus.js";

export default function RouteError() {
  const online = useOnlineStatus();
  if (!online) return <OfflinePage />;
  return (
    <StatusPage
      icon={faTriangleExclamation}
      title="Something went wrong"
      message="We could not load this page. Please try again."
    >
      <Button icon={faRotateRight} onClick={() => window.location.reload()}>
        Reload
      </Button>
    </StatusPage>
  );
}
