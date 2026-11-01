import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";

// Says which messaging mode the server is really in. In "mock" mode nothing is sent: SMS and email are recorded as
// "simulated". By default only the mock warning shows (every page); `always` also shows a quiet "Live" badge,
// for the message log. If the mode cannot be read it renders nothing rather than guess.
export default function MessagingModeBanner({ always = false }) {
  const { data } = useQuery({
    queryKey: ["admin-messaging-mode"],
    queryFn: () => api.getMessagingMode(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  if (data?.mode === "mock") {
    return (
      <div className="banner banner--warning" role="status" data-testid="messaging-mode">
        <span><strong>Messaging is in test mode.</strong> SMS and email are not being sent. They are recorded as &ldquo;simulated&rdquo;.</span>
      </div>
    );
  }
  if (data?.mode === "live" && always) {
    return <p className="muted" role="status" data-testid="messaging-mode"><span className="status-pill status-pill--healthy">Live</span> Messages are sent for real.</p>;
  }
  return null;
}
