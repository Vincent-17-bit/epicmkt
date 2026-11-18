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
  const frames = rows.filter((r) => r.role === "spin-frame").sort((a, b) => a.sort - b.sort);
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const scopeIds = scope ? [scope] : [];
  const issues = (q.data?.issues ?? []).filter((i) => (i.scope ?? "") === scope);

  const has = (q.data?.media3d ?? []).length > 0;
  if (!itemId) {
    return (
      <details className={styles.more}>
        <summary><span>3D model and photo spin <span className={styles.tag}>Optional extra</span></span></summary>
        <div className={styles.moreBody}>
          <p className={styles.hint}>Let buyers turn the item all the way round. Most items do not need this: good photos are enough.</p>
          <p className={styles.hint}>Save the item first (Save as draft is fine), then come back here to add a 3D model or a photo spin.</p>
        </div>
      </details>
    );
  }
  return (
    <details className={styles.more} open={has || undefined}>
      <summary><span id={`${uid}-t`}>3D model and photo spin <span className={styles.tag}>{has ? "Added" : "Optional extra"}</span></span></summary>
    <div className={styles.moreBody} role="group" aria-labelledby={`${uid}-t`}>
      <p className={styles.hint}>A 3D model or a photo spin lets shoppers look at the item from every side, on the item page under the photos (“View in 3D”). Both are optional: most items only need good photos.</p>
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
      <ModelUpload key={`m-${scope}`} itemId={itemId} scopeIds={scopeIds} hasSpin={frames.length > 0} model={rows.find((r) => r.role === "model-glb") ?? null} poster={rows.find((r) => r.role === "poster") ?? null} onChanged={refresh} />
      <SpinBuilder key={`s-${scope}`} itemId={itemId} scopeIds={scopeIds} frames={frames} poster={rows.find((r) => r.role === "poster") ?? null} onChanged={refresh} />
    </div>
    </details>
  );
}
