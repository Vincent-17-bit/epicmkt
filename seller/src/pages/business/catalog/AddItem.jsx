import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as api from "../../../api/index.js";
import TypePicker from "./editor/steps/TypePicker.jsx";
import { useProductTypes } from "./editor/steps/useProductTypes.js";
import { pickerAvailable, recentTypeIds, requestType } from "./AddItem.data.js";
import styles from "./AddItem.module.css";

const CATALOG = "/business/catalog";

// Step 1 of adding an item: "What are you adding?". It only picks the type and hands over to the editor
// (the Quick form after the pick is B03; many at once is B18; import is B21).
export default function AddItem() {
  const navigate = useNavigate();
  const location = useLocation();
  const { business, categoryId, types, departments, loading, error, retry } = useProductTypes();
  const catalog = useQuery({ queryKey: ["catalog", "items"], queryFn: api.getCatalog });
  const from = location.state?.from ?? "";

  if (!pickerAvailable()) return <Navigate to={`${CATALOG}/new`} replace state={location.state} />;
  if (business?.status === "suspended") return <Navigate to="/business/notifications" replace />;

  // The picker never blocks adding an item: with no type, the editor opens exactly as it always did.
  const go = (state) => navigate(`${CATALOG}/new`, { state: { from, ...state } });
  const pick = (t) => go({ productTypeId: t.id });
  const other = ({ name }) => go({ productTypeId: null, ...(name ? { typeRequestName: name } : {}) });

  return (
    <main className={styles.page}>
      <Link className={styles.back} to={`${CATALOG}${from}`}>Back to your listings</Link>
      <h1 className={styles.title}>What are you adding?</h1>
      {loading ? (
        <p role="status">Loading</p>
      ) : error ? (
        <div role="alert" className={styles.problem}>
          <p>We could not load the list of types.</p>
          <div className={styles.row}>
            <button type="button" className={styles.primary} onClick={retry}>Try again</button>
            <button type="button" className={styles.ghost} onClick={() => other({})}>Add item without a type</button>
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
