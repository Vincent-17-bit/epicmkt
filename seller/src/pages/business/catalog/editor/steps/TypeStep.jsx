import { useState } from "react";
import { SectionCard } from "../parts.jsx";
import Modal from "../../Modal.jsx";
import TypePicker from "./TypePicker.jsx";
import { useProductTypes } from "./useProductTypes.js";
import { departmentOf, requestType } from "../../AddItem.data.js";
import styles from "../editor.module.css";

// The product type chosen on the Add item screen, with a way to change it. Shown only when the item went through the picker.
export default function TypeStep({ form, patch }) {
  const { categoryId, types, departments, loading, error } = useProductTypes();
  const [picking, setPicking] = useState(false);
  const [next, setNext] = useState(undefined); // undefined: nothing chosen yet; null: Other goods; otherwise a type
  const currentId = form.productTypeId ?? null;
  const current = types.find((t) => t.id === currentId) ?? null;
  const label = currentId === null ? "Other goods" : current?.name ?? "Your chosen type";

  const choose = (t) => { if ((t?.id ?? null) === currentId) { setPicking(false); return; } setNext(t); };
  const close = () => { setPicking(false); setNext(undefined); };
  const confirm = () => { patch("productTypeId", next?.id ?? null); close(); };
  const nextLabel = next === undefined ? "" : next?.name ?? "Other goods";

  return (
    <SectionCard id="type" title="Type" why="The type decides which details we ask for, so pick the one that fits best. You can change it later.">
      <p>
        <strong>{label}</strong>
        {current && departmentOf(departments, current.departmentId) ? <span> in {departmentOf(departments, current.departmentId)}</span> : null}
      </p>
      <button type="button" className={styles.btnGhost} disabled={loading || error} onClick={() => setPicking(true)}>Change type</button>
      {error && <p role="alert">We could not load the list of types.</p>}

      <Modal open={picking && next === undefined} onClose={() => { if (next === undefined) close(); }} title="Change the type" labelId="type-picker-title" sheet>
        <TypePicker autoFocus types={types} departments={departments} categoryId={categoryId} currentId={currentId} onPick={choose} onRequestType={requestType} onOther={() => choose(null)} />
      </Modal>
      <Modal
        open={picking && next !== undefined} onClose={close} title="Change the type?" labelId="type-confirm-title"
        footer={(
          <>
            <button type="button" className={styles.btnGhost} onClick={close}>Keep {label}</button>
            <button type="button" className={styles.btnPrimary} onClick={confirm}>Change to {nextLabel}</button>
          </>
        )}
      >
        <p>The details that belong to {label} will reset, such as its type-specific rows. Your name, photos, price and stock stay as they are.</p>
      </Modal>
    </SectionCard>
  );
}
