import { useEffect, useRef, useState } from "react";
import styles from "./media3d.module.css";

const defaultLoad = async (url) => (await import("@epicmkt/ui/view3d/model")).createModelEngine({ url });

/** A small preview of a .glb that turns with the finger or mouse. The 3D library is only fetched when a preview is shown. */
export default function ModelPreview({ url, load = defaultLoad, onEngine }) {
  const box = useRef(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let cancelled = false;
    let engine = null;
    setState("loading");
    (async () => {
      try {
        engine = await load(url);
        if (cancelled) { engine.destroy(); return; }
        await engine.mount(box.current);
        if (cancelled) return;
        engine.setAutoRotate(true);
        setState("ready");
        onEngine?.(engine);
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => { cancelled = true; onEngine?.(null); engine?.destroy(); };
  }, [url, load]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.preview}>
      <div ref={box} className={styles.previewBox} role="img" aria-label="Preview of the 3D model. Drag to turn it." />
      {state === "loading" && <p className={styles.previewNote} role="status">Loading the preview…</p>}
      {state === "failed" && <p className={styles.previewNote} role="status">The preview is not available on this device. The model can still be uploaded.</p>}
    </div>
  );
}
