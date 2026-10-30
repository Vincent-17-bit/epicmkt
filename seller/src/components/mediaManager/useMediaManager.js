import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coverNote, limitNote, mediaSummary, mediaUsage, moveAnnouncement, moveMedia, mediaLabel } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { mediaUrl } from "../../api/shape.js";
import { errorText } from "../../lib/errors.js";
import { inspectFile } from "../../lib/mediaIntake.js";
import { posterFromUrl } from "../../lib/videoPoster.js";
import { createPool } from "../../lib/uploadPool.js";

const CONCURRENCY = 3;
let seq = 0;
const nextKey = () => `m${++seq}`;

const savedTile = (m) => ({
  key: `saved:${m.path}`, kind: m.kind, source: "saved", status: "saved", path: m.path, url: mediaUrl(m.path),
  durationSec: m.durationSec ?? m.duration ?? null, posterUrl: null, file: null, progress: null, error: "", removing: false,
});

const labelAt = (tiles, index) => mediaLabel(tiles[index].kind, index + 1);

export default function useMediaManager({ itemId = null, limits = null, fallbackPaths = [], seed = [] }) {
  const [tiles, setTilesState] = useState([]);
  const [loading, setLoading] = useState(Boolean(itemId));
  const [loadError, setLoadError] = useState("");
  const [problems, setProblems] = useState([]);
  const [checking, setChecking] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [focus, setFocus] = useState(null);
  const tilesRef = useRef([]);
  const idRef = useRef(itemId);
  const serverOrder = useRef([]);
  const urls = useRef(new Set());
  const tried = useRef(new Set());
  const poolRef = useRef(null);
  if (!poolRef.current) poolRef.current = createPool(CONCURRENCY);
  const limitsRef = useRef(limits);
  limitsRef.current = limits;

  const setTiles = useCallback((next) => {
    const value = typeof next === "function" ? next(tilesRef.current) : next;
    tilesRef.current = value;
    setTilesState(value);
  }, []);

  const patch = useCallback((key, changes) => {
    setTiles((list) => list.map((t) => (t.key === key ? { ...t, ...(typeof changes === "function" ? changes(t) : changes) } : t)));
  }, [setTiles]);

  const makeUrl = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }, []);

  const dropUrl = useCallback((url) => {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const pool = poolRef.current;
    const held = urls.current;
    return () => {
      pool.cancelAll();
      held.forEach((u) => URL.revokeObjectURL(u));
      held.clear();
    };
  }, []);

  const seeded = useRef(false);
  useEffect(() => {
    if (!seed.length || seeded.current) return;
    seeded.current = true;
    const made = seed.map((entry) => ({
      key: nextKey(), kind: entry.kind, source: "queued", status: "error", path: null, file: entry.file, url: makeUrl(entry.file),
      durationSec: entry.durationSec ?? null, posterUrl: null, seeded: true, progress: null, error: "This file did not upload. Try again.", removing: false,
    }));
    setTiles((current) => [...current, ...made]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    idRef.current = itemId ?? idRef.current;
    if (!itemId) return undefined;
    let live = true;
    setLoading(true);
    api.listItemMedia(itemId)
      .then((list) => {
        if (!live) return;
        const saved = list.map(savedTile);
        serverOrder.current = saved.map((t) => t.path);
        setTiles((current) => [...saved, ...current.filter((t) => t.source !== "saved")]);
        setLoadError("");
      })
      .catch(() => {
        if (!live) return;
        const saved = fallbackPaths.map((path) => savedTile({ path, kind: "image" }));
        serverOrder.current = saved.map((t) => t.path);
        setTiles((current) => [...saved, ...current.filter((t) => t.source !== "saved")]);
        setLoadError("We could not load this item's videos. Photos are shown; reload to try again.");
      })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [itemId]);

  useEffect(() => {
    const todo = tiles.find((t) => t.kind === "video" && (t.source === "saved" || t.seeded) && !t.posterUrl && !tried.current.has(t.key));
    if (!todo) return undefined;
    tried.current.add(todo.key);
    let live = true;
    posterFromUrl(todo.url).then((blob) => {
      if (blob && live) patch(todo.key, { posterUrl: makeUrl(blob) });
    });
    return () => { live = false; };
  }, [tiles, patch, makeUrl]);

  const startUpload = useCallback((key) => {
    const tile = tilesRef.current.find((t) => t.key === key);
    const id = idRef.current;
    if (!tile || !id || tile.status === "uploading" || !tile.file) return;
    patch(key, { status: "uploading", error: "", progress: { fraction: null, stage: "preparing" } });
    const send = tile.kind === "video" ? api.uploadItemVideo : api.uploadItemPhoto;
    poolRef.current
      .add(key, (signal) => send(id, tile.file, { signal, durationSec: tile.durationSec, onProgress: (fraction, stage) => patch(key, { progress: { fraction, stage } }) }))
      .then(({ path }) => {
        serverOrder.current = [...serverOrder.current, path];
        patch(key, { status: "saved", path, progress: null, error: "" });
      })
      .catch((err) => patch(key, { status: "error", progress: null, error: errorText(err) }));
  }, [patch]);

  const addFiles = useCallback(async (files) => {
    const list = [...files];
    if (!list.length) return;
    setProblems([]);
    setChecking((n) => n + list.length);
    const issues = [];
    const skipped = { image: 0, video: 0 };
    for (const file of list) {
      try {
        const res = await inspectFile(file);
        if (!res.ok) {
          issues.push(`${file.name}: ${errorText({ code: res.code })}`);
          continue;
        }
        const usage = mediaUsage(tilesRef.current, limitsRef.current);
        const full = usage[res.kind === "video" ? "videos" : "photos"].full;
        if (full) {
          skipped[res.kind] += 1;
          continue;
        }
        const tile = {
          key: nextKey(), kind: res.kind, source: "queued", status: "ready", path: null, file, url: makeUrl(file),
          durationSec: res.durationSec ?? null, posterUrl: res.poster ? makeUrl(res.poster) : null, progress: null, error: "", removing: false,
        };
        setTiles((current) => [...current, tile]);
        if (idRef.current) startUpload(tile.key);
      } finally {
        setChecking((n) => n - 1);
      }
    }
    const usage = mediaUsage(tilesRef.current, limitsRef.current);
    for (const kind of ["image", "video"]) {
      if (!skipped[kind]) continue;
      const word = kind === "video" ? "video" : "photo";
      issues.push(`${skipped[kind]} ${word}${skipped[kind] === 1 ? " was" : "s were"} not added. ${limitNote(usage, kind)}`);
    }
    setProblems(issues);
    setAnnouncement(issues.length ? `${issues.length} ${issues.length === 1 ? "problem" : "problems"} adding files.` : "Added.");
  }, [makeUrl, setTiles, startUpload]);

  const focusAfterMove = (to, dir, total, key) => {
    const act = dir < 0 ? (to === 0 ? "later" : "earlier") : (to === total - 1 ? "earlier" : "later");
    setFocus({ key, act, n: Date.now() });
  };

  const moveTo = useCallback((key, to, act) => {
    const list = tilesRef.current;
    const from = list.findIndex((t) => t.key === key);
    if (from < 0 || to < 0 || to >= list.length || from === to) return;
    setAnnouncement(moveAnnouncement(list, from, to));
    setTiles(moveMedia(list, from, to));
    if (act) setFocus({ key, act, n: Date.now() });
    return list.length;
  }, [setTiles]);

  const move = useCallback((key, dir) => {
    const list = tilesRef.current;
    const from = list.findIndex((t) => t.key === key);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= list.length) return;
    setAnnouncement(moveAnnouncement(list, from, to));
    setTiles(moveMedia(list, from, to));
    focusAfterMove(to, dir, list.length, key);
  }, [setTiles]);

  const remove = useCallback(async (key) => {
    const list = tilesRef.current;
    const at = list.findIndex((t) => t.key === key);
    if (at < 0) return;
    const tile = list[at];
    const name = labelAt(list, at);
    if (tile.status === "uploading") poolRef.current.cancel(key);
    if (tile.source === "saved" || tile.path) {
      patch(key, { removing: true });
      try {
        if (tile.kind === "video") await api.removeItemVideo(tile.path);
        else await api.removeItemPhoto(tile.path);
        serverOrder.current = serverOrder.current.filter((p) => p !== tile.path);
      } catch (err) {
        patch(key, { removing: false });
        setProblems([`${name} could not be removed. ${errorText(err)}`]);
        return;
      }
    }
    dropUrl(tile.url);
    dropUrl(tile.posterUrl);
    const rest = tilesRef.current.filter((t) => t.key !== key);
    setTiles(rest);
    const near = rest[Math.min(at, rest.length - 1)];
    setFocus(near ? { key: near.key, act: "remove", n: Date.now() } : { key: null, act: "add", n: Date.now() });
    setAnnouncement(`${name} removed. ${rest.length} ${rest.length === 1 ? "item" : "items"} left.`);
  }, [dropUrl, patch, setTiles]);

  const cancel = useCallback((key) => { poolRef.current.cancel(key); }, []);
  const retry = useCallback((key) => startUpload(key), [startUpload]);

  const commit = useCallback(async (id) => {
    idRef.current = id;
    tilesRef.current.filter((t) => t.status === "ready").forEach((t) => startUpload(t.key));
    await poolRef.current.whenIdle();
    const paths = tilesRef.current.filter((t) => t.status === "saved" && t.path).map((t) => t.path);
    let orderError = "";
    const same = paths.length === serverOrder.current.length && paths.every((p, n) => p === serverOrder.current[n]);
    if (paths.length > 1 && !same) {
      try {
        await api.reorderItemMedia(id, paths);
        serverOrder.current = paths;
      } catch (err) {
        orderError = errorText(err);
      }
    }
    return { failed: tilesRef.current.filter((t) => t.status === "error").length, orderError };
  }, [startUpload]);

  const failedFiles = useCallback(
    () => tilesRef.current.filter((t) => t.status === "error" && t.file).map((t) => ({ file: t.file, kind: t.kind, durationSec: t.durationSec })),
    [],
  );

  const usage = useMemo(() => mediaUsage(tiles, limits), [tiles, limits]);
  const visible = tiles;
  const inFlight = tiles.filter((t) => t.status === "uploading").length;
  const failed = tiles.filter((t) => t.status === "error").length;
  const savedPaths = tiles.filter((t) => t.status === "saved" && t.path).map((t) => t.path);
  const orderChanged = savedPaths.length !== serverOrder.current.length || savedPaths.some((p, n) => p !== serverOrder.current[n]);
  const dirty = tiles.some((t) => t.status !== "saved") || orderChanged;

  return {
    tiles: visible, loading, loadError, problems, setProblems, checking, announcement, focus, usage, limits,
    summary: mediaSummary(usage), cover: coverNote(tiles), inFlight, failed, dirty,
    addFiles, move, moveTo, remove, cancel, retry, commit, failedFiles, whenIdle: () => poolRef.current.whenIdle(),
  };
}
