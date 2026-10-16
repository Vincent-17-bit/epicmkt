import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import DecisionPanel from "./DecisionPanel.jsx";
import { useDecisionUndo } from "../lib/useDecisionUndo.js";
import {
  SHORTCUTS,
  buildSession,
  describeError,
  describeOutcome,
  isFinalAction,
  isTypingTarget,
  nextOpen,
  progress,
  step,
} from "../lib/decisions.js";

const STATUS_LABEL = {
  submitted: "Submitted",
  under_review: "Under review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
};

function ProgressRing({ ratio, clear, label }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className={`rf-ring ${clear ? "is-clear" : ""}`} role="img" aria-label={clear ? "Inbox zero" : `Progress: ${label}`}>
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} className="rf-ring__track" />
        <circle
          cx="22"
          cy="22"
          r={r}
          className="rf-ring__bar"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform="rotate(-90 22 22)"
        />
        {clear ? <path d="M14 23l6 6 11-12" className="rf-ring__check" /> : null}
      </svg>
    </div>
  );
}

function Detail({ app, expanded, flagOpen, onFlag, onCloseFlag, flagInputRef }) {
  const [path, setPath] = useState("general");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const openFlags = (app.flags ?? []).filter((f) => f.status === "open");

  const submitFlag = async (event) => {
    event.preventDefault();
    if (message.trim().length < 3) {
      setError("Say what is wrong, in at least a few words.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onFlag({ applicationId: app.id, path, message });
      setMessage("");
      onCloseFlag();
    } catch (e) {
      setError(e?.message?.includes("not configured") ? "Flags aren't connected to the live database yet." : "Couldn't save the flag. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rf-detail" aria-label={`Application ${app.reference}`}>
      <header>
        <p className="eyebrow">{app.reference}</p>
        <h2>{app.businessName}</h2>
        <p className="rf-detail__meta">
          <span className={`status-pill status-pill--neutral`}>{STATUS_LABEL[app.status] ?? app.status}</span>
          <span className={`status-pill ${app.verificationLevel === "verified" ? "status-pill--healthy" : "status-pill--neutral"}`}>{app.verificationLevel}</span>
          <span>Submitted {app.submittedAt}</span>
        </p>
      </header>

      <dl className="rf-grid">
        <div><dt>Owner</dt><dd>{app.ownerName}</dd></div>
        <div><dt>Town</dt><dd>{app.town}</dd></div>
        <div><dt>Category</dt><dd>{app.category}</dd></div>
        <div><dt>Plan</dt><dd>{app.planName} · KES {Number(app.price).toLocaleString("en-KE")}</dd></div>
      </dl>

      {expanded ? (
        <>
          <dl className="rf-grid">
            <div><dt>Phone</dt><dd>{app.phone ?? "None given"}</dd></div>
            <div><dt>Email</dt><dd>{app.email ?? "None given"}</dd></div>
          </dl>
          <section aria-label="Documents">
            <h3>Documents</h3>
            <ul className="rf-list">
              {(app.docs ?? []).map((d) => (
                <li key={d.slot}>
                  <span>{d.slot}</span>
                  <span className={`status-pill ${d.state === "uploaded" ? "status-pill--healthy" : "status-pill--neutral"}`}>{d.state.replace("_", " ")}</span>
                </li>
              ))}
              {(app.docs ?? []).length === 0 ? <li>No documents uploaded.</li> : null}
            </ul>
          </section>
          {app.adminNote ? <p className="rf-note"><strong>Earlier note:</strong> {app.adminNote}</p> : null}
        </>
      ) : null}

      <section aria-label="Flags">
        <h3>Flags {openFlags.length ? <span className="admin-nav-item__badge">{openFlags.length}</span> : null}</h3>
        <ul className="rf-list">
          {(app.flags ?? []).map((f) => (
            <li key={f.id}>
              <span>{f.message}</span>
              <span className="status-pill status-pill--neutral">{f.status}</span>
            </li>
          ))}
          {(app.flags ?? []).length === 0 ? <li>Nothing flagged.</li> : null}
        </ul>
        {flagOpen ? (
          <form className="rf-flag" onSubmit={submitFlag}>
            <label className="dp-field">
              <span>Where is the problem?</span>
              <select value={path} onChange={(e) => setPath(e.target.value)}>
                <option value="general">General</option>
                {(app.docs ?? []).map((d) => <option key={d.slot} value={d.slot}>{d.slot}</option>)}
              </select>
            </label>
            <label className="dp-field">
              <span>What needs fixing?</span>
              <input ref={flagInputRef} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
              {error ? <em role="alert">{error}</em> : null}
            </label>
            <div className="rf-flag__actions">
              <button type="button" className="secondary-button" onClick={onCloseFlag}>Cancel</button>
              <button type="submit" className="primary-button" disabled={busy}>Add flag</button>
            </div>
          </form>
        ) : null}
      </section>
    </article>
  );
}

function ShortcutHelp({ onClose }) {
  return (
    <div className="rf-help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="rf-help__card" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard shortcuts</h3>
        <ul>
          {SHORTCUTS.map((s) => (
            <li key={s.label}>
              <span>{s.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
        <p className="dp-hint">Shortcuts pause while you type in a field.</p>
        <button type="button" className="primary-button" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

export default function ReviewFocus({ applications, onExit, startId }) {
  const queryClient = useQueryClient();
  const [session] = useState(() => buildSession(applications));
  const [decided, setDecided] = useState(() => new Set());
  const [currentId, setCurrentId] = useState(session.ids.includes(startId) ? startId : session.ids[0] ?? null);
  const [expanded, setExpanded] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [intent, setIntent] = useState(null);
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(Date.now());
  const rootRef = useRef(null);
  const flagInputRef = useRef(null);
  const intentCount = useRef(0);

  const byId = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);
  const app = currentId ? byId.get(currentId) : null;

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["admin-applications"] }), [queryClient]);

  const undo = useDecisionUndo({
    send: (request) => api.decideApplication(request),
    onCommitted: (entry) => {
      setStatus(describeOutcome(entry.request.action, entry.app, entry.result?.queued ?? []));
      refresh();
    },
    onFailed: (entry, error) => {
      setDecided((set) => {
        const next = new Set(set);
        next.delete(entry.app.id);
        return next;
      });
      setCurrentId(entry.app.id);
      setStatus(`Not sent: ${describeError(error)}`);
      refresh();
    },
    onUndone: (entry) => {
      if (isFinalAction(entry.request.action)) {
        setDecided((set) => {
          const next = new Set(set);
          next.delete(entry.app.id);
          return next;
        });
        setCurrentId(entry.app.id);
      }
      setStatus(`Undone. Nothing was sent for ${entry.app.businessName}.`);
    },
  });

  useEffect(() => {
    if (undo.pending.length === 0) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [undo.pending.length]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const prog = progress(session.ids, decided, currentId);

  const onDecide = (entry) => {
    undo.schedule({ ...entry, name: entry.app.businessName });
    if (isFinalAction(entry.action)) {
      const nextDecided = new Set(decided).add(entry.app.id);
      setDecided(nextDecided);
      setCurrentId(nextOpen(session.ids, nextDecided, entry.app.id));
      setExpanded(false);
      setFlagOpen(false);
      setStatus(`${describeOutcome(entry.action, entry.app)} Undo within a few seconds.`);
    } else {
      setStatus(`${entry.label} queued. Undo within a few seconds.`);
    }
  };

  const goTo = useCallback((direction) => {
    const next = step(session.ids, decided, currentId, direction);
    if (next) {
      setCurrentId(next);
      setExpanded(false);
      setFlagOpen(false);
    }
  }, [session.ids, decided, currentId]);

  const chooseAction = useCallback((action) => {
    intentCount.current += 1;
    setIntent({ action, n: intentCount.current });
  }, []);

  const doUndo = useCallback(() => {
    const result = undo.undoLast();
    if (result.kind === "none") setStatus("Nothing to undo.");
    if (result.kind === "locked") setStatus("That one has already been sent, so it can't be undone.");
    if (result.kind === "reverted") setStatus(`Reverting verification on ${result.entry.name}.`);
  }, [undo]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else if (flagOpen) setFlagOpen(false);
        else if (isTypingTarget(event.target)) event.target.blur();
        else onExit();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (helpOpen || !app) return;
      switch (event.key.toLowerCase()) {
        case "j": goTo(1); break;
        case "k": goTo(-1); break;
        case "o": setExpanded((v) => !v); break;
        case "f":
          event.preventDefault();
          setFlagOpen(true);
          setTimeout(() => flagInputRef.current?.focus(), 0);
          break;
        case "c": event.preventDefault(); chooseAction("request_changes"); break;
        case "a": event.preventDefault(); chooseAction("approve"); break;
        case "r": event.preventDefault(); chooseAction("reject"); break;
        case "z": doUndo(); break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app, helpOpen, flagOpen, goTo, chooseAction, doUndo, onExit]);

  // Z has to work on the clear screen too, where there is no current application.
  useEffect(() => {
    if (app) return undefined;
    const onKey = (event) => {
      if (event.key.toLowerCase() === "z" && !isTypingTarget(event.target) && !event.ctrlKey && !event.metaKey) doUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app, doUndo]);

  const addFlag = async (flag) => {
    await api.addFlag(flag);
    refresh();
    setStatus("Flag added.");
  };

  return (
    <div className="rf" role="dialog" aria-modal="true" aria-label="Review focus mode" tabIndex={-1} ref={rootRef}>
      <header className="rf-bar">
        <div className="rf-bar__progress">
          <ProgressRing ratio={prog.ratio} clear={prog.clear || session.total === 0} label={prog.label} />
          <div>
            <strong>{session.total === 0 ? "Inbox zero" : prog.clear ? "Inbox zero" : prog.label}</strong>
            <span>{session.total === 0 || prog.clear ? "Nothing left to review" : `${prog.done} decided`}</span>
          </div>
        </div>
        <div className="rf-bar__actions">
          <button type="button" className="secondary-button" onClick={() => goTo(-1)} disabled={!app}>K Previous</button>
          <button type="button" className="secondary-button" onClick={() => goTo(1)} disabled={!app}>J Next</button>
          <button type="button" className="secondary-button" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts">?</button>
          <button type="button" className="secondary-button" onClick={onExit}>Exit</button>
        </div>
      </header>

      {app ? (
        <div className="rf-body">
          <Detail
            key={`detail-${app.id}`}
            app={app}
            expanded={expanded}
            flagOpen={flagOpen}
            onFlag={addFlag}
            onCloseFlag={() => setFlagOpen(false)}
            flagInputRef={flagInputRef}
          />
          <DecisionPanel key={`panel-${app.id}`} app={app} onDecide={onDecide} intent={intent} />
        </div>
      ) : (
        <div className="rf-clear">
          <ProgressRing ratio={1} clear label="Done" />
          <h2>Inbox zero</h2>
          <p>{session.total === 0 ? "No applications are waiting for a decision." : `All ${session.total} reviewed. Nice work.`}</p>
          <button type="button" className="primary-button" onClick={onExit}>Back to the queue</button>
        </div>
      )}

      <div className="rf-toasts" aria-live="polite">
        {undo.pending.map((entry) => (
          <div key={entry.id} className="rf-toast">
            <span>{entry.label}</span>
            <span className="rf-toast__time">{Math.max(0, Math.ceil((entry.expiresAt - now) / 1000))}s</span>
            <button type="button" className="link-button" onClick={() => undo.cancel(entry.id)}>Undo <kbd>Z</kbd></button>
          </div>
        ))}
        {status && undo.pending.length === 0 ? <div className="rf-toast rf-toast--status">{status}</div> : null}
      </div>

      {helpOpen ? <ShortcutHelp onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
