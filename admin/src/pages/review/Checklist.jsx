import { slotLabel } from "./helpers.js";

const MARK = { done: "✓", todo: "○", alert: "!" };

export const buildChecklist = (app, flags, duplicates) => {
  const docs = new Map(app.documents.map((d) => [d.slot, d]));
  const docItem = (slot, label) => {
    const doc = docs.get(slot);
    return { label, state: doc?.verified ? "done" : "todo", note: doc ? null : "Not uploaded" };
  };

  const items = [docItem("owner_id_front", "Owner ID, front verified")];
  if (docs.has("owner_id_back")) items.push(docItem("owner_id_back", "Owner ID, back verified"));
  items.push(docItem("sbp", "Single Business Permit verified"));
  items.push({
    label: "Permit has not expired",
    state: app.sbpExpiry && new Date(app.sbpExpiry) >= new Date(new Date().toDateString()) ? "done" : "alert",
  });
  items.push(docItem("signboard", "Signboard photo verified"));
  if (app.registered) {
    items.push(docItem("br_cert", "Registration certificate verified"));
    items.push(docItem("kra_pin_cert", "KRA PIN certificate verified"));
  }
  for (const doc of app.documents.filter((d) => d.slot.startsWith("cat_"))) {
    items.push(docItem(doc.slot, `${slotLabel(doc.slot)} verified`));
  }
  items.push({ label: "No duplicate matches", state: duplicates.length ? "alert" : "done", note: duplicates.length ? `${duplicates.length} found` : null });
  const open = flags.filter((f) => f.status !== "confirmed").length;
  items.push({ label: "No open red flags", state: open ? "alert" : "done", note: open ? `${open} open` : null });
  return items;
};

export default function Checklist({ app, flags, duplicates }) {
  const items = buildChecklist(app, flags, duplicates);
  const done = items.filter((i) => i.state === "done").length;

  return (
    <section className="panel">
      <div className="panel__header">
        <h3>Verification checklist</h3>
        <span className="muted">{done} of {items.length}</span>
      </div>
      <ul className="checklist">
        {items.map((item) => (
          <li key={item.label} className={`checklist__item checklist__item--${item.state}`}>
            <span className="checklist__mark" aria-hidden="true">{MARK[item.state]}</span>
            <span>{item.label}</span>
            {item.note ? <span className="muted">{item.note}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
