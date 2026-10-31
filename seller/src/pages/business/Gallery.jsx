import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GALLERY_CAPTION_MAX, canPair, limitsFor } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { mediaUrl } from "../../api/shape.js";
import Dialog from "../../components/Dialog.jsx";
import { errorText } from "../../lib/errors.js";
import { showToast } from "../../state/toast.js";
import ui from "../../styles/ui.module.css";
import styles from "./gallery.module.css";

export const UNDO_MS = 8000;
const ACCEPT = "image/jpeg,image/png,image/webp";

// A before and after pair is one tile holding two photos, "before" first.
export const groupTiles = (photos) => {
  const tiles = [];
  const byPair = new Map();
  for (const p of photos) {
    if (p.pairId && byPair.has(p.pairId)) {
      byPair.get(p.pairId).photos.push(p);
      continue;
    }
    const tile = { key: p.pairId ?? p.id, photos: [p] };
    if (p.pairId) byPair.set(p.pairId, tile);
    tiles.push(tile);
  }
  for (const t of tiles) t.photos.sort((a, b) => (a.pairRole === "after") - (b.pairRole === "after"));
  return tiles;
};

function Caption({ tile, disabled, onSave }) {
  const first = tile.photos[0];
  const [value, setValue] = useState(first.caption ?? "");
  return (
    <input
      className={`${ui.input} ${styles.caption}`}
      value={value}
      maxLength={GALLERY_CAPTION_MAX}
      disabled={disabled}
      placeholder={disabled ? "" : "Add a caption"}
      aria-label="Caption"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() !== (first.caption ?? "") && onSave(tile, value)}
    />
  );
}

function PairDialog({ open, busy, onClose, onSubmit }) {
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [caption, setCaption] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title="Add a before and after">
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); onSubmit({ before, after, caption }); }}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="pair-before">Before photo</label>
          <input id="pair-before" className={ui.input} type="file" accept={ACCEPT} onChange={(e) => setBefore(e.target.files?.[0] ?? null)} />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="pair-after">After photo</label>
          <input id="pair-after" className={ui.input} type="file" accept={ACCEPT} onChange={(e) => setAfter(e.target.files?.[0] ?? null)} />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="pair-caption">Caption (optional)</label>
          <input id="pair-caption" className={ui.input} maxLength={GALLERY_CAPTION_MAX} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <p className={ui.muted}>A pair uses two of your gallery photos.</p>
        <button type="submit" className={ui.btn} disabled={!before || !after || busy}>{busy ? "Uploading" : "Add pair"}</button>
      </form>
    </Dialog>
  );
}

export default function Gallery() {
  const qc = useQueryClient();
  const sub = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription });
  const photos = useQuery({ queryKey: ["gallery"], queryFn: api.listGallery });
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [removed, setRemoved] = useState(null); // { ids, tile } waiting out the undo time
  const pending = useRef(null);

  const business = sub.data?.business;
  const premium = business?.planKey === "premium";
  const readOnly = business?.status === "suspended";
  const limit = limitsFor(business?.planKey, sub.data?.limits).galleryPhotos;
  const all = photos.data ?? [];
  const hiddenIds = new Set(removed?.ids ?? []);
  const visible = all.filter((p) => !hiddenIds.has(p.id));
  const tiles = useMemo(() => groupTiles(visible), [visible]);
  const used = visible.filter((p) => p.adminState === "ok").length;
  const remaining = Math.max(0, limit - used);
  const refresh = () => qc.invalidateQueries({ queryKey: ["gallery"] });

  const finishRemoval = async (r) => {
    if (!r) return;
    pending.current = null;
    setRemoved(null);
    try { await api.purgeGalleryPhotos(r.ids); } catch { /* the photo stays hidden; deleting again retries */ }
    refresh();
  };
  // Leaving the page ends the undo time: the photos are removed for good.
  useEffect(() => () => { if (pending.current) api.purgeGalleryPhotos(pending.current.ids).catch(() => {}); }, []);
  useEffect(() => {
    if (!removed) return undefined;
    const t = setTimeout(() => finishRemoval(removed), UNDO_MS);
    return () => clearTimeout(t);
  }, [removed]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e) => showToast(errorText(e));

  const upload = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const take = list.slice(0, remaining);
    if (list.length > take.length) showToast(errorText({ code: "limit_reached", message: "limit_reached:gallery_photos" }));
    for (let i = 0; i < take.length; i += 1) {
      setBusy(`Uploading ${i + 1} of ${take.length}`);
      try {
        await api.addGalleryPhoto({ file: take[i] });
      } catch (e) {
        fail(e);
        break;
      }
    }
    setBusy(null);
    refresh();
  };

  const addPair = async ({ before, after, caption }) => {
    const pairId = crypto.randomUUID();
    let first = null;
    setBusy("Uploading pair");
    try {
      first = await api.addGalleryPhoto({ file: before, caption, pairId, pairRole: "before" });
      await api.addGalleryPhoto({ file: after, caption, pairId, pairRole: "after" });
      setPairOpen(false);
    } catch (e) {
      // Never leave half a pair behind.
      if (first) {
        try { await api.deleteGalleryPhotos([first.id]); await api.purgeGalleryPhotos([first.id]); } catch { /* ignore */ }
      }
      fail(e);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const move = async (from, to) => {
    if (readOnly || to < 0 || to >= tiles.length) return;
    const next = [...tiles];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    const ids = next.flatMap((x) => x.photos.map((p) => p.id));
    qc.setQueryData(["gallery"], ids.map((id, i) => ({ ...all.find((p) => p.id === id), sort: i })).concat(all.filter((p) => !ids.includes(p.id))));
    try { await api.reorderGallery(ids); } catch (e) { fail(e); }
    refresh();
  };

  const saveCaption = async (tile, value) => {
    try { await api.updateGalleryCaption(tile.photos.map((p) => p.id), value); } catch (e) { fail(e); }
    refresh();
  };

  const remove = async (tile) => {
    if (removed) await finishRemoval(removed);
    const ids = tile.photos.map((p) => p.id);
    try {
      await api.deleteGalleryPhotos(ids);
    } catch (e) {
      fail(e);
      return;
    }
    const r = { ids, label: ids.length > 1 ? "Pair deleted" : "Photo deleted" };
    pending.current = r;
    setRemoved(r);
  };

  const undo = async () => {
    const r = removed;
    pending.current = null;
    setRemoved(null);
    try { await api.restoreGalleryPhotos(r.ids); } catch (e) { fail(e); }
    refresh();
  };

  if (sub.isPending || photos.isPending) return <div className={ui.page}><p className={ui.muted}>Loading your gallery…</p></div>;

  return (
    <div className={ui.page}>
      <header className={`${ui.pageHead} ${styles.head}`}>
        <h1>Gallery</h1>
        {!readOnly && (
          <div className={styles.actions}>
            <input ref={fileRef} className={ui.srOnly} type="file" accept={ACCEPT} multiple tabIndex={-1} aria-label="Choose photos" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <button type="button" className={ui.btn} disabled={remaining === 0 || Boolean(busy)} onClick={() => fileRef.current?.click()}>{busy ?? "Add photos"}</button>
            {canPair(business?.categoryId) && <button type="button" className={`${ui.btn} ${ui.btnGhost}`} disabled={remaining < 2 || Boolean(busy)} onClick={() => setPairOpen(true)}>Add before and after</button>}
          </div>
        )}
      </header>

      <p className={ui.muted} data-testid="gallery-usage">{used} of {limit} gallery photos used</p>
      {readOnly && <div className={`${ui.banner} ${ui.tone_warning}`}><p>Your account is suspended, so the gallery is read only.</p></div>}
      {remaining === 0 && !readOnly && (
        <div className={`${ui.banner} ${ui.tone_info}`}>
          <p>{premium ? "You have used all your gallery photos. Delete one to add another." : `You have used all ${limit} gallery photos. Premium gives you more.`}</p>
        </div>
      )}
      {removed && (
        <div className={styles.undo} role="status">
          <span>{removed.label}</span>
          <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={undo}>Undo</button>
        </div>
      )}

      {!tiles.length ? (
        <section className={ui.card}>
          <h2>No gallery photos yet</h2>
          <p className={ui.muted}>Show your shop, your work and your team. Customers see these on your page.</p>
          {!readOnly && <button type="button" className={ui.btn} onClick={() => fileRef.current?.click()}>Add your first photos</button>}
        </section>
      ) : (
        <ul className={styles.grid}>
          {tiles.map((tile, i) => {
            const first = tile.photos[0];
            const flagged = first.adminState !== "ok";
            return (
              <li key={tile.key} className={styles.tile}>
                <div className={styles.images}>
                  {tile.photos.map((p) => (
                    <figure key={p.id} className={styles.figure}>
                      <img className={styles.img} src={mediaUrl(p.path)} alt={p.caption ?? ""} loading="lazy" />
                      {p.pairRole && <span className={`${ui.pill} ${styles.role}`}>{p.pairRole === "before" ? "Before" : "After"}</span>}
                    </figure>
                  ))}
                </div>
                {flagged && (
                  <p className={ui.error}>
                    {first.adminState === "removed" ? "Removed by EpicMKT" : "Hidden by EpicMKT"}
                    {first.adminReason ? `: ${first.adminReason}` : ""}. It does not count towards your limit.
                  </p>
                )}
                {!flagged && <Caption key={`${tile.key}-${first.caption}`} tile={tile} disabled={readOnly} onSave={saveCaption} />}
                {!readOnly && (
                  <div className={styles.tools}>
                    <span>
                      <button type="button" className={`${ui.btn} ${ui.btnGhost}`} aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, i - 1)}>Earlier</button>
                      <button type="button" className={`${ui.btn} ${ui.btnGhost}`} aria-label="Move later" disabled={i === tiles.length - 1} onClick={() => move(i, i + 1)}>Later</button>
                    </span>
                    <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={() => remove(tile)}>Delete</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <PairDialog open={pairOpen} busy={Boolean(busy)} onClose={() => setPairOpen(false)} onSubmit={addPair} />
    </div>
  );
}
