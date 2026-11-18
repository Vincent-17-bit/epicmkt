import { useEffect, useState } from "react";
import { items } from "../../../api/index.js";
import Shell from "./Shell.jsx";

/** The view that goes with what the buyer picked: the one for the colour (or other value) chosen, else the whole item's. */
export const viewFor = (data, choice) => {
  if (!data) return null;
  const picked = Object.values(choice ?? {}).map(String);
  const own = picked.find((id) => data.view3dByOption?.[id]);
  return (own ? data.view3dByOption[own] : data.view3d) ?? null;
};

/** "View in 3D" next to the size and colour pickers. Renders nothing for an item without a 3D view. */
export default function View3dEntry({ item, option, onFallback }) {
  const id = item?.id;
  const [data, setData] = useState(null);
  // A plain fetch (not a query hook) so the picker works wherever it is rendered, with or without a query provider.
  // The seller's preview brings its own 3D view (nothing is public yet), so nothing is fetched for it.
  const own = item?.view3dPreview ?? null;
  useEffect(() => {
    let live = true;
    setData(null);
    if (id && !own) Promise.resolve().then(() => items.getView3d?.(id)).then((d) => { if (live) setData(d ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [id, own]);
  const view = viewFor(own ?? data, option?.choice);
  if (!view) return null;
  return <Shell view={view} name={item.name} onFallback={onFallback} />;
}
