import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { usePageTitle } from "../../../hooks/usePageTitle.js";
import { getApplication } from "../../../api/applications/index.js";
import Skeleton from "../../../components/Skeleton.jsx";
import Button from "../../../components/Button.jsx";
import { CodeForm, RequestForm } from "./StatusForms.jsx";
import ApplicationView from "./ApplicationView.jsx";
import AdminSimulator from "./AdminSimulator.jsx";
import styles from "./status.module.css";

const KEY = "epicmkt.status.session";

const read = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return s && new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  } catch {
    return null;
  }
};

export default function CheckStatus() {
  usePageTitle("Check my application");
  const qc = useQueryClient();
  const [session, setSession] = useState(read);
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState({});
  const [expired, setExpired] = useState(false);

  const query = useQuery({
    queryKey: ["status-app", session?.token],
    queryFn: () => getApplication(session),
    enabled: !!session,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: true
  });

  const signOut = () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
    qc.removeQueries({ queryKey: ["status-app"] });
    setSession(null);
    setDetails(null);
  };

  const onExpired = () => {
    signOut();
    setExpired(true);
  };

  useEffect(() => {
    if (query.error && (query.error.details?.error ?? query.error.message) === "session_expired") onExpired();
  }, [query.error]);

  useEffect(() => {
    if (!session) return undefined;
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    const t = setTimeout(onExpired, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [session]);

  const verified = (s) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
    setExpired(false);
    setSession(s);
  };

  let body;
  if (session) {
    if (query.isLoading) {
      body = (
        <div className={styles.skeletons} aria-busy="true" aria-label="Loading your application">
          <Skeleton height="120px" radius="12px" />
          <Skeleton height="80px" radius="12px" />
          <Skeleton height="240px" radius="12px" />
        </div>
      );
    } else if (query.isError) {
      body = (
        <div className={styles.card} role="alert">
          <h1>We could not load your application</h1>
          <p>Check your connection and try again.</p>
          <div className={styles.formActions}>
            <Button onClick={() => query.refetch()}>Retry</Button>
            <Button variant="secondary" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      );
    } else if (query.data) {
      body = (
        <ApplicationView
          app={query.data}
          session={session}
          onRefresh={() => query.refetch()}
          onExpired={onExpired}
          onSignOut={signOut}
        />
      );
    }
  } else if (details) {
    body = <CodeForm details={details} onVerified={verified} onBack={() => setDetails(null)} />;
  } else {
    body = (
      <>
        {expired && (
          <p className={styles.notice} role="status">
            Your session ended after 30 minutes. Check your application again to continue.
          </p>
        )}
        <RequestForm initial={form} onSent={(d) => { setForm({ ref: d.ref, phone: d.phone }); setDetails(d); }} />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <Link to="/become-a-seller" className={styles.back}>
        <FontAwesomeIcon icon={faArrowLeft} />
        <span>Back to the application form</span>
      </Link>
      {body}
      {import.meta.env.DEV && <AdminSimulator />}
    </div>
  );
}
