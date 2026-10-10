import { useEffect, useId, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faChevronUp, faChevronDown, faChevronRight, faCopy, faTrash, faImage, faCheck, faCircleExclamation, faSpinner, faMinus } from "@fortawesome/free-solid-svg-icons";
import { AVAILABILITY, LEGACY_AVAILABILITY, DEFAULT_UNITS, LIMITS, applyStockRules, isStockDriven, availabilityLabel, pricePreview, priceNeeds } from "@epicmkt/shared";
import { NumberInput, SelectInput, TextInput, Toggle } from "../ui/ui.jsx";
import { ItemFields } from "./ItemFields.jsx";
import styles from "./catalog.module.css";

export function RowStatus({ row, onRetry }) {
  if (row.status === "saving" || (row.status === "dirty")) {
    return <span className={styles.status} data-state="saving" role="img" aria-label="Saving"><FontAwesomeIcon icon={faSpinner} spin /><span className={styles.statusText}>Saving…</span></span>;
  }
  if (row.status === "error") {
    return (
      <button type="button" className={`${styles.status} ${styles.statusError}`} data-state="error" onClick={onRetry} aria-label={`Not saved: ${row.message || "error"}. Try again`} title={row.message}>
        <FontAwesomeIcon icon={faCircleExclamation} /><span className={styles.statusText}>Retry</span>
      </button>
    );
  }
  if (row.status === "draft") {
    return <span className={styles.status} data-state="draft" role="img" aria-label={row.message || "Not saved yet"} title={row.message || "Add a name to save"}><FontAwesomeIcon icon={faMinus} /><span className={styles.statusText}>Not saved</span></span>;
  }
  return <span className={`${styles.status} ${styles.statusOk}`} data-state="saved" role="img" aria-label="Saved"><FontAwesomeIcon icon={faCheck} /><span className={styles.statusText}>Saved</span></span>;
}

const availabilityOptions = (item) =>
  [...AVAILABILITY, ...(item.availability === "unavailable" ? LEGACY_AVAILABILITY : [])].map((a) => ({ value: a.value, label: a.label }));

export function ItemRow({ row, index, total, catalog, expanded, onToggle, mobile, focusRequest, onMove }) {
  const { item, errors } = row;
  const { ctx, sections, units } = catalog;
  const panelId = useId();
  const nameRef = useRef(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const needs = priceNeeds(item.priceType);
  const driven = isStockDriven(item);
  const unitList = [...new Set([...DEFAULT_UNITS, ...units])];
  const set = (patch) => catalog.change(row.id, patch);
  const label = item.name.trim() || "new row";

  // Focus the name once it exists. On phones the card opens first, so this also runs when `expanded` flips.
  useEffect(() => {
    if (focusRequest?.id === row.id && nameRef.current) {
      nameRef.current.focus();
      catalog.setFocusRequest(null);
    }
  }, [focusRequest?.n, expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const pricePlaceholder = item.priceType === "free" ? "Free" : item.priceType === "contact" ? "On request" : item.priceType === "range" ? "Lowest" : item.priceType === "from" ? "From" : "Price";

  const nameCell = (
    <div className={styles.cell}>
      <input
        ref={nameRef}
        className={styles.cellInput}
        type="text"
        data-nav
        data-field="name"
        aria-label="Name"
        placeholder="Item name"
        autoComplete="off"
        maxLength={LIMITS.name + 20}
        value={item.name}
        aria-invalid={errors.name ? true : undefined}
        onChange={(e) => set({ name: e.target.value })}
      />
      {errors.name && <span role="alert" className={styles.cellError}>{errors.name}</span>}
      {item.hiddenByAdmin && <span className={styles.adminHidden}>Hidden by admin</span>}
    </div>
  );
  const priceCell = (
    <div className={styles.cell}>
      <NumberInput className={styles.cellInput} value={needs.price ? item.price : null} disabled={!needs.price} data-nav aria-label="Price in KSh" placeholder={pricePlaceholder} aria-invalid={errors.price ? true : undefined} onChange={(price) => set({ price })} />
      {errors.price && <span role="alert" className={styles.cellError}>{errors.price}</span>}
    </div>
  );
  const unitCell = (
    <div className={styles.cell}>
      <input className={styles.cellInput} type="text" list={`units-${row.id}`} data-nav aria-label="Unit" placeholder={needs.unit ? "per item" : ""} disabled={!needs.unit} maxLength={LIMITS.unit} value={needs.unit ? item.unit : ""} aria-invalid={errors.unit ? true : undefined} onChange={(e) => set({ unit: e.target.value })} />
      <datalist id={`units-${row.id}`}>{unitList.map((u) => <option key={u} value={u} />)}</datalist>
      {errors.unit && <span role="alert" className={styles.cellError}>{errors.unit}</span>}
    </div>
  );
  const availabilityCell = (
    <div className={styles.cell}>
      <SelectInput className={styles.cellInput} aria-label="Availability" data-nav title={driven ? "Set by your stock count" : undefined} disabled={driven} value={driven ? applyStockRules(item) : item.availability} options={availabilityOptions(item)} onChange={(availability) => set({ availability })} />
    </div>
  );
  const visibleCell = <Toggle checked={item.visible} label={`Visible to shoppers: ${label}`} onChange={(visible) => set({ visible })} />;

  const duplicateBtn = <button type="button" className={styles.rowBtn} aria-label={`Duplicate ${label}`} title="Duplicate" onClick={() => catalog.duplicate(row.id)}><FontAwesomeIcon icon={faCopy} /></button>;
  const deleteBtn = <button type="button" className={`${styles.rowBtn} ${styles.rowBtnDanger}`} aria-label={`Delete ${label}`} title="Delete" onClick={() => catalog.remove(row.id)}><FontAwesomeIcon icon={faTrash} /></button>;
  const moveButtons = (
    <span className={styles.moveBtns}>
      <button type="button" className={styles.miniBtn} aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(row.id, index - 1)}><FontAwesomeIcon icon={faChevronUp} /></button>
      <button type="button" className={styles.miniBtn} aria-label={`Move ${label} down`} disabled={index === total - 1} onClick={() => onMove(row.id, index + 1)}><FontAwesomeIcon icon={faChevronDown} /></button>
    </span>
  );
  const handle = (
    <button type="button" ref={setActivatorNodeRef} className={styles.handle} aria-label={`Reorder ${label}. Press space, then use arrow keys.`} {...attributes} {...listeners}>
      <FontAwesomeIcon icon={faGripVertical} />
    </button>
  );
  const panel = expanded && (
    <div id={panelId} role="region" aria-label={`More details for ${label}`} className={styles.panel}>
      <ItemFields item={item} errors={errors} columns ctx={{ category: ctx.category, sections, units, addSection: catalog.addSection }} onChange={set} />
    </div>
  );
  const message = row.status === "error" && row.message ? <p className={styles.rowMessage} role="alert">{row.message}</p> : null;

  if (mobile) {
    return (
      <div ref={setNodeRef} style={style} className={`${styles.card} ${isDragging ? styles.dragging : ""}`} data-row={row.id}>
        <div className={styles.cardHead}>
          {handle}
          <button type="button" className={styles.cardToggle} aria-expanded={expanded} aria-controls={expanded ? panelId : undefined} onClick={onToggle}>
            <span className={styles.cardTitle}>{item.name.trim() || <em>New item</em>}</span>
            <span className={styles.cardSub}>{pricePreview(item) || "No price yet"} · {availabilityLabel(driven ? applyStockRules(item) : item.availability)}{item.visible ? "" : " · Hidden"}</span>
          </button>
          <RowStatus row={row} onRetry={() => catalog.retry(row.id)} />
          <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} className={styles.cardChevron} aria-hidden="true" />
        </div>
        {message}
        {expanded && (
          <div className={styles.cardBody}>
            <div className={styles.cardGrid}>
              <label className={styles.cardField}>Name{nameCell}</label>
              <label className={styles.cardField}>Price (KSh){priceCell}</label>
              <label className={styles.cardField}>Unit{unitCell}</label>
              <label className={styles.cardField}>Availability{availabilityCell}</label>
              <div className={styles.cardField}>Visible to shoppers {visibleCell}</div>
            </div>
            {panel}
            <div className={styles.cardActions}>{moveButtons}{duplicateBtn}{deleteBtn}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} role="rowgroup" className={`${styles.rowGroup} ${isDragging ? styles.dragging : ""}`} data-row={row.id}>
      <div role="row" className={`${styles.row} ${styles.gridCols}`}>
        <div role="cell" className={styles.handleCell}>{handle}{moveButtons}</div>
        <div role="cell" className={styles.thumb} title="Photos are added in a later step" aria-hidden="true"><FontAwesomeIcon icon={faImage} /></div>
        <div role="cell">{nameCell}</div>
        <div role="cell">{priceCell}</div>
        <div role="cell">{unitCell}</div>
        <div role="cell">{availabilityCell}</div>
        <div role="cell" className={styles.center}>{visibleCell}</div>
        <div role="cell" className={styles.center}><RowStatus row={row} onRetry={() => catalog.retry(row.id)} /></div>
        <div role="cell" className={styles.center}>
          <button type="button" className={styles.rowBtn} aria-expanded={expanded} aria-controls={expanded ? panelId : undefined} aria-label={`${expanded ? "Hide" : "Show"} more fields for ${label}`} title="More fields" onClick={onToggle}>
            <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} />
          </button>
        </div>
        <div role="cell" className={styles.center}>{duplicateBtn}</div>
        <div role="cell" className={styles.center}>{deleteBtn}</div>
      </div>
      {message}
      {panel}
    </div>
  );
}
