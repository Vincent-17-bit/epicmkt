import { useState } from "react";
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
  const [channels, setChannels] = useState(["sms", "email", "inApp"]);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState("add");
  const [agent, setAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dayCount = Number(days);
  const forms = {
    feature: { params: { featured: featured === "yes" }, valid: true },
    extend: { params: { days: dayCount }, valid: Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 365 },
    message: { params: { channels, body: body.trim() }, valid: channels.length > 0 && body.trim().length > 0 },
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
              <label key={id} className="check">
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
            Message
            <textarea value={body} maxLength={480} onChange={(event) => setBody(event.target.value)} />
          </label>
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
