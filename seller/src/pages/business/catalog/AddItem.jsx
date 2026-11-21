import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faCopy, faFileImport, faTableList, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { OTHER_TYPE_ID } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { EditorBrand } from "./editor/ItemEditor.jsx";
import TypePicker from "./editor/steps/TypePicker.jsx";
import { useProductTypes } from "./editor/steps/useProductTypes.js";
import { pickerAvailable, recentTypeIds, requestType } from "./AddItem.data.js";
import ToFinish from "./ToFinish.jsx";
import styles from "./AddItem.module.css";

const CATALOG = "/business/catalog";

const WAYS = [
  ["one", "One item, guided", "Pick what it is, then fill the few details a buyer needs.", faWandMagicSparkles],
  ["many", "Many of the same kind", "A table: one row per item, such as 20 bulbs or pens.", faTableList],
  ["import", "Import a file", "Bring a spreadsheet of items in one go.", faFileImport],
  ["copy", "Copy an item", "Start from an item you already sell.", faCopy]
];

function CopyPicker({ items, onCopy, busy }) {
  const [q, setQ] = useState("");
  const shown = (items ?? []).filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12);
  return (
    <div>
      <label htmlFor="copy-search">Find the item to copy</label>
      <input id="copy-search" type="search" className={styles.search} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {shown.length === 0 ? <p role="status">No items match.</p> : (
        <ul className={styles.copyList}>
          {shown.map((i) => <li key={i.id}><button type="button" className={styles.copyItem} disabled={busy} onClick={() => onCopy(i)}>{i.name}</button></li>)}
        </ul>
      )}
    </div>
  );
}

// Step 1 of adding an item: "What are you adding?". It only picks the type and hands over to the editor
// (the Quick form after the pick is B03; many at once is B18; import is B21).
export default function AddItem() {
  const navigate = useNavigate();
  const location = useLocation();
  const { business, categoryId, types, departments, loading, error, retry } = useProductTypes();
  const catalog = useQuery({ queryKey: ["catalog", "items"], queryFn: api.getCatalog });
  const from = location.state?.from ?? "";
  const [way, setWay] = useState("one");
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState("");

  if (!pickerAvailable()) return <Navigate to={`${CATALOG}/new`} replace state={location.state} />;
  if (business?.status === "suspended") return <Navigate to="/business/notifications" replace />;

  // The picker never blocks adding an item: a seller who finds no fitting type goes on as "Other", a real type (migration 0141) that the
  // ranking reads as no type evidence. A new item always carries a type, so "no type" is not a way through any more.
  const go = (state) => navigate(`${CATALOG}/new`, { state: { from, ...state } });
  const pick = (t) => go({ productTypeId: t.id });
  const other = ({ name }) => go({ productTypeId: OTHER_TYPE_ID, ...(name ? { typeRequestName: name } : {}) });

  const choose = (id) => {
    if (id === "many") navigate(`${CATALOG}/add/table`, { state: { from } });
    else if (id === "import") navigate(`${CATALOG}${from}`, { state: { openImport: true } });
    else setWay(id);
  };
  const copy = async (item) => {
    setCopying(true);
    setCopyError("");
    try {
      const id = await api.duplicateItem(item.id);
      navigate(`${CATALOG}/${id}/edit`, { state: { from, step: "basics", notice: { tone: "ok", text: "Copy added as a draft. Check the details, then publish when ready." } } });
    } catch {
      setCopyError("We could not copy that item. Check your plan's item limit and try again.");
      setCopying(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <EditorBrand business={business} />
        <Link className={styles.back} to={`${CATALOG}${from}`}><FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /> <span className={styles.backLong}>Back to your listings</span><span className={styles.backShort} aria-hidden="true">Listings</span></Link>
      </header>
      <div className={styles.intro}>
        <p className={styles.stepNote}>Add item · Step 1 of 2</p>
        <h1 className={styles.title}>What are you adding?</h1>
        <p className={styles.lead}>Choose how to add, then pick the kind of item. Next you add photos, the name, the price and the details.</p>
      </div>
      <ul className={styles.ways} aria-label="How do you want to add?">
        {WAYS.map(([id, title, text, icon]) => (
          <li key={id}>
            <button type="button" className={styles.way} aria-pressed={id === way} onClick={() => choose(id)}>
              <span className={styles.wayIcon} aria-hidden="true"><FontAwesomeIcon icon={icon} /></span>
              <span className={styles.wayBody}>
                <span className={styles.wayTitle}>{title}</span>
                <span className={styles.wayText}>{text}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ToFinish items={catalog.data?.items} types={types} from={from} />
      {way === "copy" ? (
        <>
          {copyError && <p role="alert" className={styles.missing}>{copyError}</p>}
          <CopyPicker items={catalog.data?.items} onCopy={copy} busy={copying} />
        </>
      ) : loading ? (
        <p role="status">Loading</p>
      ) : error ? (
        <div role="alert" className={styles.problem}>
          <p>We could not load the list of types.</p>
          <div className={styles.row}>
            <button type="button" className={styles.primary} onClick={retry}>Try again</button>
            <button type="button" className={styles.ghost} onClick={() => other({})}>Add item as Other</button>
          </div>
        </div>
      ) : (
        <TypePicker
          autoFocus types={types} departments={departments} categoryId={categoryId} recentIds={recentTypeIds(catalog.data?.items)}
          onPick={pick} onRequestType={requestType} onOther={other}
        />
      )}
    </main>
  );
}
