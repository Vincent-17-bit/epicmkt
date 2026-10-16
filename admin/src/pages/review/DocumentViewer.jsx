import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import { fmtSize, slotLabel } from "./helpers.js";

const isPdf = (doc) => doc.mime === "application/pdf";

function PdfLink({ link, busy, onRefresh }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = Math.max(0, Math.ceil((link.expiresAt - now) / 1000));

  return (
    <div className="viewer__pdf">
      {left > 0 ? (
        <>
          <a className="primary-button" href={link.url} target="_blank" rel="noopener noreferrer">Open PDF in new tab</a>
          <span>Link expires in {left}s</span>
        </>
      ) : (
        <>
          <span>Link expired</span>
          <button type="button" className="secondary-button" disabled={busy} onClick={onRefresh}>Get a new link</button>
        </>
      )}
    </div>
  );
}

export default function DocumentViewer({ app, flagged, onFlag, beforeView }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(null);
  const [previews, setPreviews] = useState({});
  const [links, setLinks] = useState({});
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const created = useRef([]);

  useEffect(() => () => created.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const active = app.documents.find((d) => d.id === activeId) ?? null;

  const view = async (doc) => {
    setActiveId(doc.id);
    setZoom(1);
    setTurn(0);
    setFailure(null);
    setBusy(true);
    try {
      await beforeView();
      const { url, expiresAt } = await api.getDocumentUrl(app.id, doc);
      if (isPdf(doc)) {
        setLinks((current) => ({ ...current, [doc.id]: { url, expiresAt } }));
      } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Could not load the document");
        const objectUrl = URL.createObjectURL(await response.blob());
        created.current.push(objectUrl);
        setPreviews((current) => ({ ...current, [doc.id]: objectUrl }));
      }
      queryClient.invalidateQueries({ queryKey: ["admin-timeline", app.id] });
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = useMutation({
    mutationFn: ({ doc, verified }) => api.setDocumentVerified(app.id, doc, verified),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-application", app.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-timeline", app.id] });
    },
  });

  return (
    <section className="panel">
      <div className="panel__header">
        <h3>Documents</h3>
        <span className="muted">{app.documents.filter((d) => d.verified).length} of {app.documents.length} verified</span>
      </div>

      <div className="thumbs">
        {app.documents.map((doc) => (
          <button
            key={doc.id}
            type="button"
            className={`thumb ${doc.id === activeId ? "is-active" : ""} ${flagged.has(`documents.${doc.slot}`) ? "is-flagged" : ""}`}
            onClick={() => view(doc)}
          >
            <span className="thumb__image">
              {previews[doc.id] ? <img src={previews[doc.id]} alt="" /> : <span>{isPdf(doc) ? "PDF" : "IMG"}</span>}
            </span>
            <span className="thumb__label">{slotLabel(doc.slot)}</span>
            {doc.verified ? <span className="thumb__tick" aria-label="Verified">✓</span> : null}
          </button>
        ))}
      </div>

      {active ? (
        <div className="viewer">
          <div className="viewer__bar">
            <div className="viewer__name">
              <strong>{slotLabel(active.slot)}</strong>
              <span className="muted">{active.name} · {fmtSize(active.size)}</span>
            </div>
            <div className="viewer__tools">
              {isPdf(active) ? null : (
                <>
                  <button type="button" className="tool-button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>−</button>
                  <button type="button" className="tool-button tool-button--wide" aria-label="Reset zoom" onClick={() => { setZoom(1); setTurn(0); }}>{Math.round(zoom * 100)}%</button>
                  <button type="button" className="tool-button" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>+</button>
                  <button type="button" className="tool-button" aria-label="Rotate left" onClick={() => setTurn((t) => t - 90)}>⟲</button>
                  <button type="button" className="tool-button" aria-label="Rotate right" onClick={() => setTurn((t) => t + 90)}>⟳</button>
                </>
              )}
              <button type="button" className="flag-button" onClick={() => onFlag(`documents.${active.slot}`)}>Flag</button>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={active.verified}
                  disabled={verify.isPending}
                  onChange={(event) => verify.mutate({ doc: active, verified: event.target.checked })}
                />
                <span>Verified</span>
              </label>
            </div>
          </div>

          <div className="viewer__stage">
            {failure ? <p className="viewer__message">{failure}</p> : null}
            {!failure && busy && !previews[active.id] && !links[active.id] ? <span className="skeleton" /> : null}
            {!failure && isPdf(active) && links[active.id] ? (
              <PdfLink link={links[active.id]} busy={busy} onRefresh={() => view(active)} />
            ) : null}
            {!failure && !isPdf(active) && previews[active.id] ? (
              <img
                src={previews[active.id]}
                alt={slotLabel(active.slot)}
                style={{ width: `${zoom * 100}%`, transform: `rotate(${turn}deg)` }}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <p className="muted viewer__hint">Select a document to open it. Each view is logged.</p>
      )}
    </section>
  );
}
