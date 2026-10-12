import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { faArrowDown, faArrowUp, faImages, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { GALLERY_CAPTION_MAX, moderation, promoErrorMessage } from "@epicmkt/shared";
import { promo } from "../../api/promo/index.js";
import { Button, Chip, Dialog, EmptyState, Field, Meter, ModerationNote, UpgradePrompt, inputClass } from "../../components/ui.jsx";
import { toast } from "../../components/toast.js";
import { IMAGE_ACCEPT, imageErrorMessage, processImage } from "../../lib/imagePipeline.js";
import { useUsage, useWorkspace } from "../../lib/workspace.js";
import styles from "./gallery.module.css";

const groupTiles = (photos) => {
  const tiles = [];
  const byPair = new Map();
  for (const p of photos) {
    if (p.pair_id && byPair.has(p.pair_id)) {
      byPair.get(p.pair_id).photos.push(p);
      continue;
    }
    const tile = { key: p.pair_id ?? p.id, photos: [p] };
    if (p.pair_id) byPair.set(p.pair_id, tile);
    tiles.push(tile);
  }
  for (const t of tiles) t.photos.sort((a, b) => (a.pair_role === "after") - (b.pair_role === "after"));
  return tiles;
};

const flatten = (tiles) => tiles.flatMap((t) => t.photos.map((p) => p.id));

function Caption({ tile, disabled, onSave }) {
  const first = tile.photos[0];
  const [value, setValue] = useState(first.caption ?? "");
  return (
    <input
      className={styles.caption}
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

function PairDialog({ open, onClose, onSubmit, busy }) {
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [caption, setCaption] = useState("");
  const close = () => {
    setBefore(null);
    setAfter(null);
    setCaption("");
    onClose();
  };
  return (
    <Dialog
      open={open}
      title="Add a before and after"
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!before || !after || busy} onClick={async () => { await onSubmit({ before, after, caption }); close(); }}>{busy ? "Uploading" : "Add pair"}</Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.pairRow}>
          <Field label="Before photo">{(p) => <input {...p} className={inputClass} type="file" accept={IMAGE_ACCEPT} onChange={(e) => setBefore(e.target.files?.[0] ?? null)} />}</Field>
          <Field label="After photo">{(p) => <input {...p} className={inputClass} type="file" accept={IMAGE_ACCEPT} onChange={(e) => setAfter(e.target.files?.[0] ?? null)} />}</Field>
        </div>
        <Field label="Caption (optional)">{(p) => <input {...p} className={inputClass} maxLength={GALLERY_CAPTION_MAX} value={caption} onChange={(e) => setCaption(e.target.value)} />}</Field>
        <p className={styles.note}>A pair uses two of your gallery photos.</p>
      </div>
    </Dialog>
  );
}

export default function GalleryPage() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const usage = useUsage();
  const photos = useQuery({ queryKey: ["gallery"], queryFn: () => promo.listGallery() });
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const tiles = useMemo(() => groupTiles(photos.data ?? []), [photos.data]);
  const used = usage.data?.galleryPhotos ?? 0;
  const remaining = Math.max(0, ws.limits.galleryPhotos - used);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["gallery"] });
    qc.invalidateQueries({ queryKey: ["usage"] });
  };
  const fail = (e) => toast(imageErrorMessage(e) ?? promoErrorMessage(e, ws.plan, ws.global));

  const addOne = async (file, extra = {}) => {
    const img = await processImage(file);
    return promo.addGalleryPhoto({ blob: img.blob, width: img.width, height: img.height, ...extra });
  };

  const upload = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const take = list.slice(0, remaining);
    if (list.length > take.length) toast(promoErrorMessage({ code: "limit_reached:gallery_photos" }, ws.plan, ws.global));
    for (let i = 0; i < take.length; i++) {
      setBusy(`Uploading ${i + 1} of ${take.length}`);
      try {
        await addOne(take[i]);
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
    setBusy("Uploading pair");
    let first = null;
    try {
      first = await addOne(before, { caption, pairId, pairRole: "before" });
      await addOne(after, { caption, pairId, pairRole: "after" });
    } catch (e) {
      if (first) {
        await promo.softDeleteGallery([first.id]).catch(() => {});
        await promo.purgeGallery([{ id: first.id, path: first.path }]).catch(() => {});
      }
      fail(e);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const reorder = useMutation({
    mutationFn: (ids) => promo.reorderGallery(ids),
    onError: fail,
    onSettled: () => qc.invalidateQueries({ queryKey: ["gallery"] }),
  });

  const move = async (from, to) => {
    if (ws.readOnly || from === to || to < 0 || to >= tiles.length) return;
    await qc.cancelQueries({ queryKey: ["gallery"] });
    const next = [...tiles];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    const ids = flatten(next);
    qc.setQueryData(["gallery"], ids.map((id, i) => ({ ...(photos.data.find((p) => p.id === id)), sort: i })));
    reorder.mutate(ids);
  };

  const caption = useMutation({
    mutationFn: ({ tile, value }) => Promise.all(tile.photos.map((p) => promo.updateGalleryPhoto(p.id, { caption: value }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gallery"] }),
    onError: fail,
  });

  const remove = async (tile) => {
    const ids = tile.photos.map((p) => p.id);
    try {
      await promo.softDeleteGallery(ids);
    } catch (e) {
      fail(e);
      return;
    }
    qc.setQueryData(["gallery"], (rows) => rows.filter((p) => !ids.includes(p.id)));
    qc.invalidateQueries({ queryKey: ["usage"] });
    toast(tile.photos.length > 1 ? "Pair deleted" : "Photo deleted", {
      actionLabel: "Undo",
      ms: 8000,
      onAction: async () => {
        try {
          await promo.restoreGallery(ids);
        } catch (e) {
          fail(e);
        }
        refresh();
      },
      onExpire: () => promo.purgeGallery(tile.photos.map((p) => ({ id: p.id, path: p.path }))).catch(() => {}),
    });
  };

  if (ws.isPending) return null;

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Gallery</h1>
        {!ws.readOnly && (
          <div className={styles.actions}>
            <input ref={fileRef} className="sr-only" type="file" accept={IMAGE_ACCEPT} multiple tabIndex={-1} aria-label="Choose photos" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <Button variant="primary" icon={faPlus} disabled={remaining === 0 || Boolean(busy)} onClick={() => fileRef.current?.click()}>{busy ?? "Add photos"}</Button>
            {ws.pairs && <Button icon={faImages} disabled={remaining < 2 || Boolean(busy)} onClick={() => setPairOpen(true)}>Add before and after</Button>}
          </div>
        )}
      </div>

      <Meter label="Gallery photos" used={used} limit={ws.limits.galleryPhotos} />

      {remaining === 0 && !ws.readOnly && !ws.premium && <UpgradePrompt>You have used all {ws.limits.galleryPhotos} gallery photos. Premium gives you 20.</UpgradePrompt>}
      {remaining === 0 && !ws.readOnly && ws.premium && <p className={styles.note}>You have used all your gallery photos. Delete one to add another.</p>}

      {!tiles.length ? (
        <EmptyState title="No gallery photos yet" action={!ws.readOnly && <Button icon={faPlus} onClick={() => fileRef.current?.click()}>Add your first photos</Button>}>
          Show your shop, your work and your team. Customers see these on your page.
        </EmptyState>
      ) : (
        <ul className={styles.grid}>
          {tiles.map((tile, i) => {
            const mod = moderation(tile.photos[0]);
            return (
              <li
                key={tile.key}
                className={`${styles.tile} ${tile.photos.length > 1 ? styles.pair : ""} ${dragOver === i && dragFrom !== i ? styles.over : ""} ${dragFrom === i ? styles.dragging : ""}`}
                draggable={!ws.readOnly}
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => { e.preventDefault(); move(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
              >
                <div className={styles.images}>
                  {tile.photos.map((p) => (
                    <figure key={p.id} className={styles.figure}>
                      <img className={styles.img} src={p.url} alt={p.caption ?? ""} loading="lazy" draggable={false} />
                      {p.pair_role && <span className={styles.role}><Chip tone="solid">{p.pair_role === "before" ? "Before" : "After"}</Chip></span>}
                    </figure>
                  ))}
                </div>
                <ModerationNote row={tile.photos[0]} />
                {mod.state === "ok" || ws.readOnly ? <Caption key={`${tile.key}-${tile.photos[0].caption}`} tile={tile} disabled={ws.readOnly || mod.state !== "ok"} onSave={(t, value) => caption.mutate({ tile: t, value })} /> : null}
                {!ws.readOnly && (
                  <div className={styles.tools}>
                    <div>
                      <Button size="sm" variant="ghost" icon={faArrowUp} aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, i - 1)} />
                      <Button size="sm" variant="ghost" icon={faArrowDown} aria-label="Move later" disabled={i === tiles.length - 1} onClick={() => move(i, i + 1)} />
                    </div>
                    <Button size="sm" variant="danger" icon={faTrash} onClick={() => remove(tile)}>Delete</Button>
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
