import { useEffect, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { useMediaQuery } from "../ui/ui.jsx";
import { ItemRow } from "./ItemRow.jsx";
import styles from "./catalog.module.css";

export function ItemTable({ catalog }) {
  const { rows, focusRequest } = catalog;
  const mobile = useMediaQuery("(max-width: 759px)");
  const [expanded, setExpanded] = useState(() => new Set());
  const [announce, setAnnounce] = useState("");
  const tableRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // A freshly added row opens on phones so its name field can take focus.
  useEffect(() => {
    if (mobile && focusRequest) setExpanded((s) => new Set(s).add(focusRequest.id));
  }, [focusRequest?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const nameOf = (id) => rows.find((r) => r.id === id)?.item.name.trim() || "row";
  const position = (id) => rows.findIndex((r) => r.id === id) + 1;

  const move = (id, to) => {
    catalog.moveRow(id, to);
    setAnnounce(`Moved ${nameOf(id)} to position ${to + 1} of ${rows.length}.`);
  };

  const onKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.matches("input[data-nav], select[data-nav]") || el.type === "checkbox" || el.type === "date") return;
    const all = [...tableRef.current.querySelectorAll("[data-nav]:not([disabled])")];
    const next = all[all.indexOf(el) + 1];
    e.preventDefault();
    if (next) { next.focus(); next.select?.(); }
  };

  const announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}. Position ${position(active.id)} of ${rows.length}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over position ${position(over.id)} of ${rows.length}.` : ""),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${nameOf(active.id)} at position ${position(over.id)} of ${rows.length}.` : `${nameOf(active.id)} was dropped where it started.`),
    onDragCancel: ({ active }) => `Reordering cancelled. ${nameOf(active.id)} is back at position ${position(active.id)}.`,
  };

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    catalog.moveRow(active.id, rows.findIndex((r) => r.id === over.id));
  };

  return (
    <div className={styles.tableWrap}>
      <div role="status" aria-live="polite" className="sr-only">{announce}</div>
      <div ref={tableRef} onKeyDown={onKeyDown} role={mobile ? "list" : "table"} aria-label="Your items" className={mobile ? styles.cards : styles.table}>
        {!mobile && (
          <div role="row" className={`${styles.headRow} ${styles.gridCols}`}>
            <div role="columnheader"><span className="sr-only">Reorder</span></div>
            <div role="columnheader"><span className="sr-only">Photo</span></div>
            <div role="columnheader">Name</div>
            <div role="columnheader">Price (KSh)</div>
            <div role="columnheader">Unit</div>
            <div role="columnheader">Availability</div>
            <div role="columnheader" className={styles.center}>Visible</div>
            <div role="columnheader" className={styles.center}>Saved</div>
            <div role="columnheader" className={styles.center}><span className="sr-only">More fields</span></div>
            <div role="columnheader" className={styles.center}><span className="sr-only">Duplicate</span></div>
            <div role="columnheader" className={styles.center}><span className="sr-only">Delete</span></div>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: { draggable: "To pick up a row, press space. Use the arrow keys to move it, space to drop it, or escape to cancel." } }}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {rows.map((row, i) => (
              <ItemRow key={row.id} row={row} index={i} total={rows.length} catalog={catalog} mobile={mobile} expanded={expanded.has(row.id)} onToggle={() => toggle(row.id)} focusRequest={focusRequest} onMove={move} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className={styles.addBar}>
        <button type="button" className={styles.addRow} onClick={() => catalog.addRow()}>
          <FontAwesomeIcon icon={faPlus} /> Add row
        </button>
      </div>
    </div>
  );
}
