import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { PEEK_PARAM, TYPE_LABELS, parsePeek, withPeek } from "../lib/peek.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// Universal read-only drawer. It lives at the layout level and is driven only by the URL: ?peek=type:id.
export default function PeekDrawer() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const target = parsePeek(params.get(PEEK_PARAM));
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-peek", target?.type, target?.id],
    queryFn: () => api.adminPeek(target.type, target.id),
    enabled: Boolean(target),
  });

  useFocusTrap(ref, Boolean(target));

  const close = () => setParams(withPeek(params, null), { replace: true });

  useEffect(() => {
    if (!target) return undefined;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (target) ref.current?.focus();
  }, [target?.type, target?.id]);

  if (!target) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(target.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="peek" role="presentation">
      <div className="peek__scrim" onClick={close} aria-hidden="true" />
      <aside ref={ref} className="peek__panel" role="dialog" aria-modal="true" aria-labelledby="peek-title" tabIndex={-1}>
        <header className="peek__head">
          <div>
            <span className="peek__type">{TYPE_LABELS[target.type]}</span>
            <h2 id="peek-title" className="peek__title">{data?.title ?? (isLoading ? "Loading…" : TYPE_LABELS[target.type])}</h2>
            {data?.subtitle ? <p className="peek__sub">{data.subtitle}</p> : null}
          </div>
          <button type="button" className="admin-icon-button" aria-label="Close" onClick={close}>✕</button>
        </header>

        <div className="peek__body">
          {isLoading ? <p className="peek__state" role="status">Loading…</p> : null}
          {isError ? (
            <div className="peek__state" role="alert">
              Could not load this {TYPE_LABELS[target.type].toLowerCase()}.{" "}
              <button type="button" className="palette__link" onClick={() => refetch()}>Retry</button>
            </div>
          ) : null}
          {!isLoading && !isError && data === null ? <p className="peek__state">This {TYPE_LABELS[target.type].toLowerCase()} no longer exists, or you cannot view it.</p> : null}
          {data ? (
            <>
              {data.status ? <span className="peek__status">{data.status}</span> : null}
              <dl className="peek__fields">
                {data.fields.map(([label, value]) => (
                  <div key={label} className="peek__field">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>

        <footer className="peek__foot">
          <button type="button" className="primary-button" onClick={() => navigate({ pathname: data?.pageHref ?? "/admin", search: `?${withPeek(new URLSearchParams(), target.type, target.id)}` })}>
            Open page
          </button>
          <button type="button" className="secondary-button" onClick={copy}>{copied ? "Copied" : "Copy ID"}</button>
        </footer>
      </aside>
    </div>
  );
}
