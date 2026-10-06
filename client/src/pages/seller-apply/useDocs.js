import { useCallback, useEffect, useRef, useState } from "react";
import { checkFileCount, prepareFile } from "../../shared/fileSecurity.js";
import { removeDraftFile, saveDraftFile } from "./draftStore.js";

const previewOf = (file) => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null);

export function useDocs() {
  const [files, setFiles] = useState({});
  const ref = useRef(files);
  ref.current = files;

  const patch = useCallback((slot, entry) => {
    setFiles((cur) => {
      const next = { ...cur };
      if (entry) next[slot] = entry;
      else delete next[slot];
      return next;
    });
  }, []);

  const drop = useCallback((slot) => {
    const old = ref.current[slot];
    if (old?.preview) URL.revokeObjectURL(old.preview);
    patch(slot, null);
    removeDraftFile(slot);
  }, [patch]);

  const add = useCallback(
    async (slot, raw) => {
      const had = ref.current[slot]?.file;
      const total = Object.values(ref.current).filter((f) => f.file).length + (had ? 0 : 1);
      const limit = checkFileCount(total);
      if (!limit.ok) return patch(slot, { ...ref.current[slot], error: limit.message });
      patch(slot, { ...ref.current[slot], status: "working", error: "" });
      const out = await prepareFile(raw);
      if (!out.ok) {
        return patch(slot, had ? { ...ref.current[slot], status: "ready", error: out.message } : { status: "ready", error: out.message });
      }
      if (ref.current[slot]?.preview) URL.revokeObjectURL(ref.current[slot].preview);
      patch(slot, { file: out.file, preview: previewOf(out.file), status: "ready", error: "" });
      saveDraftFile(slot, out.file);
    },
    [patch]
  );

  const restore = useCallback((entries) => {
    const next = {};
    entries.forEach(([slot, file]) => {
      next[slot] = { file, preview: previewOf(file), status: "ready", error: "" };
    });
    setFiles(next);
  }, []);

  const reset = useCallback(() => {
    Object.values(ref.current).forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles({});
  }, []);

  useEffect(() => () => Object.values(ref.current).forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  return { files, add, remove: drop, restore, reset };
}
