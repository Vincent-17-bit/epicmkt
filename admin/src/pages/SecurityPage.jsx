import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider.jsx";
import Icon from "../components/Icon.jsx";
import { describeDevice } from "../lib/device.js";
import { formatEatStamp, relativeAgo } from "../lib/eat.js";

export default function SecurityPage() {
  const { listSessions, signOutOthers, sessionId } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const sessions = useQuery({ queryKey: ["admin-sessions"], queryFn: listSessions, refetchOnWindowFocus: true });
  const signOutOthersMutation = useMutation({
    mutationFn: signOutOthers,
    onSuccess: () => {
      setConfirming(false);
      return queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
  });

  const rows = sessions.data ?? [];
  const others = rows.filter((row) => row.id !== sessionId && !(sessionId == null && row === rows[0]));

  return (
    <div className="page-shell">
      <section className="card" aria-labelledby="mfa-title">
        <h2 id="mfa-title">Two-step sign-in</h2>
        <p className="card__row"><Icon name="check" className="ok" /> Authenticator app is on. It is required for every admin account.</p>
      </section>

      <section className="card" aria-labelledby="sessions-title">
        <div className="card__head">
          <h2 id="sessions-title">Where you are signed in</h2>
          {confirming ? (
            <div className="confirm" role="group" aria-label="Confirm sign out of other devices">
              <span>Sign out {others.length} other {others.length === 1 ? "device" : "devices"}?</span>
              <button type="button" className="button button--danger" onClick={() => signOutOthersMutation.mutate()} disabled={signOutOthersMutation.isPending}>{signOutOthersMutation.isPending ? "Signing out…" : "Yes, sign them out"}</button>
              <button type="button" className="button" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="button" onClick={() => setConfirming(true)} disabled={sessions.isLoading || others.length === 0}>Sign out other devices</button>
          )}
        </div>
        <p className="form__error" role="alert">{signOutOthersMutation.isError ? signOutOthersMutation.error.message : ""}</p>

        {sessions.isLoading ? <p role="status" className="muted">Loading your sessions…</p> : null}
        {sessions.isError ? <p className="form__error" role="alert">We could not load your sessions. <button type="button" className="link-button" onClick={() => sessions.refetch()}>Try again</button></p> : null}
        {sessions.isSuccess && rows.length === 0 ? <p className="muted">No sessions to show.</p> : null}

        <ul className="session-list">
          {rows.map((row, index) => {
            const current = sessionId ? row.id === sessionId : index === 0;
            return (
              <li key={row.id} className="session">
                <div>
                  <p className="session__device">{describeDevice(row.userAgent)} {current ? <span className="role-pill">This device</span> : null}</p>
                  <p className="session__meta">{row.ip ? `${row.ip} · ` : ""}Signed in {formatEatStamp(new Date(row.createdAt))}</p>
                </div>
                <p className="session__active">{current ? "Active now" : relativeAgo(new Date(row.lastActiveAt))}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
