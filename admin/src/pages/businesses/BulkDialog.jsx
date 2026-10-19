import { useRef, useState } from "react";
import { PROOF_ACCEPT, PROOF_MAX_FILES, checkProofBatch } from "@epicmkt/shared";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { BULK } from "./bulk.js";

const CHANNELS = [
  ["sms", "SMS"],
  ["email", "Email"],
  ["inApp", "In-app"],
];

export default function BulkDialog({ action, count, options, onClose, onSubmit }) {
  const config = BULK[action];
  const [featured, setFeatured] = useState("yes");
  const [days, setDays] = useState("7");
  const [channels, setChannels] = useState(["inApp"]);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [needsReply, setNeedsReply] = useState(false);
  const [files, setFiles] = useState([]);
  const picker = useRef(null);
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState("add");
  const [agent, setAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dayCount = Number(days);
  const forms = {
    feature: { params: { featured: featured === "yes" }, valid: true },
    extend: { params: { days: dayCount }, valid: Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 365 },
    message: {
      params: { channels, subject: subject.trim() || undefined, body: body.trim(), needsReply, files },
      valid: channels.length > 0 && (body.trim().length > 0 || (files.length > 0 && channels.includes("inApp"))),
    },
    tag: { params: { tag: tag.trim(), mode }, valid: tag.trim().length > 0 && tag.trim().length <= 30 },
    assign: { params: { agent: agent === "__none__" ? null : agent }, valid: agent !== "" },
  };
  const { params, valid } = forms[action] ?? { params: {}, valid: true };

  const submit = async (reason) => {
    setBusy(true);
    setError("");
    try {
      await onSubmit({ action, reason, params });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };

  const pick = (event) => {
    const next = [...files, ...Array.from(event.target.files ?? [])];
    event.target.value = "";
    const check = checkProofBatch(next);
    if (check.error) return setError(check.error === "attachments_limit" ? "You can attach up to 3 files." : check.error === "file_too_large" ? `${check.file} is over 8 MB.` : `${check.file} must be a JPG, PNG, WebP or PDF.`);
    setError("");
    setFiles(next);
  };

  const noun = count === 1 ? "business" : "businesses";

  return (
    <ConfirmDialog
      title={config.label}
      summary={`${config.label}: ${count} ${noun} selected. Businesses this does not apply to are skipped.`}
      confirmLabel={config.confirm ?? `${config.label} ${count}`}
      danger={config.dangerous}
      confirmWord={config.word}
      valid={valid}
      busy={busy}
      error={error}
      onConfirm={submit}
      onCancel={onClose}
    >
      {action === "feature" ? (
        <label className="field">
          Featured
          <select value={featured} onChange={(event) => setFeatured(event.target.value)}>
            <option value="yes">Feature</option>
            <option value="no">Remove feature</option>
          </select>
        </label>
      ) : null}

      {action === "extend" ? (
        <label className="field">
          Days to add to paid until (1 to 365)
          <input type="number" inputMode="numeric" min="1" max="365" value={days} onChange={(event) => setDays(event.target.value)} />
        </label>
      ) : null}

      {action === "message" ? (
        <>
          <fieldset className="field field--group">
            <legend>Channels</legend>
            {CHANNELS.map(([id, label]) => (
              <label key={id} className="filters__check">
                <input
                  type="checkbox"
                  checked={channels.includes(id)}
                  onChange={(event) => setChannels((current) => (event.target.checked ? [...current, id] : current.filter((item) => item !== id)))}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="field">
            Subject (optional)
            <input value={subject} maxLength={150} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="field">
            Message
            <textarea value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} />
          </label>
          {channels.includes("inApp") ? (
            <>
              <label className="filters__check">
                <input type="checkbox" checked={needsReply} onChange={(event) => setNeedsReply(event.target.checked)} />
                Ask the seller to reply (shows under their Questions)
              </label>
              <div className="field">
                <input ref={picker} type="file" accept={PROOF_ACCEPT} multiple hidden onChange={pick} aria-label="Attach files" />
                <Button onClick={() => picker.current?.click()} disabled={files.length >= PROOF_MAX_FILES}>Attach a file (JPG, PNG, WebP or PDF, up to 8 MB)</Button>
                {files.map((item, index) => (
                  <span key={`${item.name}-${index}`} className="modal__summary">
                    {item.name} <button type="button" className="link-button" onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`Remove ${item.name}`}>Remove</button>
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {action === "tag" ? (
        <>
          <label className="field">
            Tag
            <input value={tag} maxLength={30} onChange={(event) => setTag(event.target.value)} />
          </label>
          <label className="field">
            Action
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="add">Add tag</option>
              <option value="remove">Remove tag</option>
            </select>
          </label>
        </>
      ) : null}

      {action === "assign" ? (
        <label className="field">
          Agent
          <select value={agent} onChange={(event) => setAgent(event.target.value)}>
            <option value="">Choose an agent</option>
            <option value="__none__">Unassign</option>
            {options.agents.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      ) : null}
    </ConfirmDialog>
  );
}
