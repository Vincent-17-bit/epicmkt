import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import { pathLabel, pathOptions } from "./helpers.js";

const valid = (text) => text.trim().length >= 3 && text.trim().length <= 500;

function Composer({ app, initialPath, onDone }) {
  const queryClient = useQueryClient();
  const options = pathOptions(app);
  const [path, setPath] = useState(initialPath || options[0]?.path || "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialPath) setPath(initialPath);
  }, [initialPath]);

  const add = useMutation({
    mutationFn: () => api.addFlag(app.id, { path, message: message.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-flags", app.id] });
      queryClient.invalidateQueries({ queryKey: ["admin-timeline", app.id] });
      onDone();
    },
  });

  return (
    <form className="composer" onSubmit={(event) => { event.preventDefault(); if (valid(message)) add.mutate(); }}>
      <select value={path} onChange={(event) => setPath(event.target.value)} aria-label="Flagged item">
        {options.map((o) => <option key={o.path} value={o.path}>{o.label}</option>)}
      </select>
      <textarea
        value={message}
        rows={3}
        maxLength={500}
        placeholder="What needs fixing?"
        aria-label="Flag message"
        onChange={(event) => setMessage(event.target.value)}
        autoFocus
      />
      {add.isError ? <p className="form-error">{add.error.message}</p> : null}
      <div className="composer__actions">
        <button type="button" className="secondary-button" onClick={onDone}>Cancel</button>
        <button type="submit" className="primary-button" disabled={!valid(message) || add.isPending}>Add flag</button>
      </div>
    </form>
  );
}

function FlagRow({ app, flag }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(flag.message);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-flags", app.id] });
    queryClient.invalidateQueries({ queryKey: ["admin-timeline", app.id] });
  };

  const save = useMutation({
    mutationFn: () => api.editFlag(app.id, flag, text.trim()),
    onSuccess: () => { setEditing(false); refresh(); },
  });
  const clear = useMutation({ mutationFn: () => api.clearFlag(app.id, flag), onSuccess: refresh });

  const recheck = flag.status === "fixed";

  return (
    <li className={`flag ${recheck ? "flag--recheck" : ""}`}>
      <div className="flag__head">
        <strong>{pathLabel(app, flag.path)}</strong>
        <span className={`status-pill ${recheck ? "status-pill--live" : "status-pill--danger"}`}>
          {recheck ? "Fixed, re-check" : flag.addressed ? "Seller replied" : "Open"}
        </span>
      </div>
      {editing ? (
        <>
          <textarea value={text} rows={3} maxLength={500} aria-label="Edit flag message" onChange={(event) => setText(event.target.value)} />
          <div className="composer__actions">
            <button type="button" className="secondary-button" onClick={() => { setEditing(false); setText(flag.message); }}>Cancel</button>
            <button type="button" className="primary-button" disabled={!valid(text) || save.isPending} onClick={() => save.mutate()}>Save</button>
          </div>
        </>
      ) : (
        <>
          <p>{flag.message}</p>
          <div className="flag__actions">
            <button type="button" className="link-button" onClick={() => setEditing(true)}>{recheck ? "Edit and reopen" : "Edit"}</button>
            <button type="button" className="link-button" disabled={clear.isPending} onClick={() => clear.mutate()}>Clear</button>
          </div>
        </>
      )}
    </li>
  );
}

export default function FlagsPanel({ app, flags, composer, setComposer }) {
  const active = flags.filter((f) => f.status !== "confirmed");
  const cleared = flags.filter((f) => f.status === "confirmed");

  return (
    <section className="panel" id="review-flags">
      <div className="panel__header">
        <h3>Red flags</h3>
        {composer.open ? null : (
          <button type="button" className="secondary-button" onClick={() => setComposer({ open: true, path: "" })}>Add flag</button>
        )}
      </div>

      {composer.open ? (
        <Composer app={app} initialPath={composer.path} onDone={() => setComposer({ open: false, path: "" })} />
      ) : null}

      {active.length ? (
        <ul className="flag-list">
          {active.map((flag) => <FlagRow key={flag.id} app={app} flag={flag} />)}
        </ul>
      ) : (
        <p className="muted">{composer.open ? "" : "No open flags."}</p>
      )}

      {cleared.length ? (
        <details className="cleared">
          <summary>{cleared.length} cleared</summary>
          <ul className="flag-list">
            {cleared.map((flag) => (
              <li key={flag.id} className="flag flag--cleared">
                <strong>{pathLabel(app, flag.path)}</strong>
                <p>{flag.message}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
