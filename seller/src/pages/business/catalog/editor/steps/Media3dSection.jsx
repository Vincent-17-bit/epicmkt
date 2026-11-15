import { useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../../../../../api/index.js";
import ModelUpload from "../../../../../components/ModelUpload.jsx";
import SpinBuilder from "../../../../../components/SpinBuilder.jsx";
import styles from "../../../../../components/media3d.module.css";

const ISSUE_TEXT = {
  view3d_missing_poster: "Add a poster picture, or this 3D view will not be shown.",
  spin_too_few_frames: "The spin needs at least 12 pictures.",
  spin_too_many_frames: "The spin has more than 72 pictures. Remove some."
};

/** Where a saved item gets a 3D model and/or a photo spin, for the whole item or for one value such as a colour. */
export default function Media3dSection({ itemId, options }) {
  const uid = useId();
  const qc = useQueryClient();
  const key = ["media3d", itemId];
  const q = useQuery({ queryKey: key, queryFn: () => api.getItemMedia3d(itemId), enabled: Boolean(itemId) });
  const [scope, setScope] = useState("");
  const values = useMemo(() => (options?.axes ?? []).flatMap((a) => (a.values ?? []).map((v) => ({ id: v.id, label: `${a.label}: ${v.label}` }))).filter((v) => v.id), [options]);
  const rows = (q.data?.media3d ?? []).filter((r) => (r.optionIds?.[0] ?? "") === scope);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const scopeIds = scope ? [scope] : [];
  const issues = (q.data?.issues ?? []).filter((i) => (i.scope ?? "") === scope);

  if (!itemId) return <p className={styles.hint}>Save the item first, then you can add a 3D view.</p>;
  return (
    <div className={styles.block} role="group" aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`} className={styles.h3}>3D view</h3>
      <p className={styles.hint}>A 3D model or a photo spin lets shoppers look at the item from every side. Both are optional.</p>
      {values.length > 0 && (
        <label className={styles.scrub}>
          <span>This 3D view is for</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="This 3D view is for">
            <option value="">The whole item</option>
            {values.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
      )}
      {q.isError && <p role="alert" className={styles.error}>We could not load the 3D files. Try again.</p>}
      {issues.map((i) => <p key={i.code} role="alert" className={styles.error}>{ISSUE_TEXT[i.code] ?? i.code}</p>)}
      <ModelUpload key={`m-${scope}`} itemId={itemId} scopeIds={scopeIds} model={rows.find((r) => r.role === "model-glb") ?? null} poster={rows.find((r) => r.role === "poster") ?? null} onChanged={refresh} />
      <SpinBuilder key={`s-${scope}`} itemId={itemId} scopeIds={scopeIds} frames={rows.filter((r) => r.role === "spin-frame").sort((a, b) => a.sort - b.sort)} poster={rows.find((r) => r.role === "poster") ?? null} onChanged={refresh} />
    </div>
  );
}
