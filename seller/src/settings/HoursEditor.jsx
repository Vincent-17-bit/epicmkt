import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, HoursTable } from "@epicmkt/ui";
import { WEEK_DAYS, hoursRowsFor, isFullDay, isOvernight, safeShopZone, shopTimeNote, shopZoneLabel, validateWeeklyHours } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import { showToast } from "../state/toast.js";
import { Disclosure, Section, Select, Switch } from "./controls.jsx";
import styles from "./settings.module.css";

const UNDO_MS = 8000;
const NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const VIEWER_ZONES = ["America/New_York", "Europe/London", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"];
const FALLBACK_SLOT = { start: "09:00", end: "17:00", full: false };

const fromHours = (hours) =>
  Object.fromEntries(WEEK_DAYS.map((d) => {
    const iv = hours?.[d];
    return [d, iv ? { open: true, start: iv[0], end: iv[1], full: isFullDay(iv) } : { open: false, ...FALLBACK_SLOT }];
  }));

const toHours = (draft) =>
  Object.fromEntries(WEEK_DAYS.filter((d) => draft[d].open).map((d) => [d, draft[d].full ? ["00:00", "23:59"] : [draft[d].start, draft[d].end]]));

export default function HoursEditor() {
  const qc = useQueryClient();
  const shop = useQuery({ queryKey: ["shop-preview"], queryFn: api.getShopPreview, retry: false }).data?.shop;
  const [edited, setEdited] = useState(null);
  const [viewer, setViewer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [undo, setUndo] = useState(null);
  const [at, setAt] = useState(() => new Date());
  const timer = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setAt(new Date()), 30000);
    return () => { clearInterval(id); clearTimeout(timer.current); };
  }, []);

  if (!shop) return null;

  const draft = edited ?? fromHours(shop.hours);
  const dirty = edited !== null && JSON.stringify(toHours(edited)) !== JSON.stringify(validateWeeklyHours(shop.hours ?? {}).value ?? {});
  const zone = safeShopZone(shop.timezone);
  const viewerZone = viewer || zone;
  const checked = validateWeeklyHours(toHours(draft));
  const previewHours = checked.ok ? checked.value : shop.hours ?? {};
  const rows = hoursRowsFor(previewHours, shop.exceptions ?? [], at, zone, viewerZone);
  const zoneOptions = [{ value: zone, label: `Your shop (${shopZoneLabel(at, zone)})` }, ...VIEWER_ZONES.filter((z) => z !== zone).map((z) => ({ value: z, label: `${z.split("/")[1].replaceAll("_", " ")} (${shopZoneLabel(at, z)})` }))];

  const edit = (day, patch) => { setError(""); setStatus(""); setEdited({ ...draft, [day]: { ...draft[day], ...patch } }); };
  const copyFrom = (days) => {
    setError("");
    setStatus("");
    setEdited(Object.fromEntries(WEEK_DAYS.map((k) => [k, days.includes(k) ? { ...draft.mon } : draft[k]])));
  };
  const allDay = () => { setError(""); setStatus(""); setEdited(Object.fromEntries(WEEK_DAYS.map((k) => [k, { ...draft[k], open: true, full: true }]))); };
  const discard = () => { setError(""); setStatus(""); setEdited(null); };

  const persist = async (hours, previous) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await api.saveWeeklyHours(hours);
      await qc.invalidateQueries({ queryKey: ["shop-preview"] });
      setEdited(null);
      clearTimeout(timer.current);
      if (previous) {
        setUndo(previous);
        timer.current = setTimeout(() => setUndo(null), UNDO_MS);
        setStatus("Opening hours saved.");
      } else {
        setUndo(null);
        setStatus("Previous opening hours restored.");
      }
      showToast(previous ? "Opening hours saved" : "Opening hours restored");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!checked.ok) {
      const { day, error: code } = checked.errors[0];
      return setError(`${day ? `${NAMES[day]}: ` : ""}${errorText({ code })}`);
    }
    persist(checked.value, validateWeeklyHours(shop.hours ?? {}).value ?? {});
  };

  return (
    <Section id="hours" title="Opening hours">
      <div className={styles.actions}>
        <Button size="sm" variant="secondary" onClick={() => copyFrom(["tue", "wed", "thu", "fri"])} disabled={busy}>Copy Monday to weekdays</Button>
        <Button size="sm" variant="secondary" onClick={() => copyFrom(WEEK_DAYS.slice(1))} disabled={busy}>Copy Monday to all days</Button>
        <Button size="sm" variant="secondary" onClick={allDay} disabled={busy}>Open 24 hours every day</Button>
      </div>
      <div className={styles.hoursList}>
        {WEEK_DAYS.map((day) => {
          const d = draft[day];
          const next = d.open && !d.full && isOvernight([d.start, d.end]) && d.start !== d.end;
          return (
            <div key={day} className={styles.hoursRow} role="group" aria-labelledby={`hours-${day}`}>
              <Switch checked={d.open} onChange={(open) => edit(day, { open })} label={`Open on ${NAMES[day]}`} disabled={busy} />
              <span className={styles.dayName} id={`hours-${day}`}>{NAMES[day]}</span>
              <div className={styles.hoursTimes}>
                {d.open && !d.full && (
                  <>
                    <label>
                      <span className={styles.srOnly}>{NAMES[day]} opens</span>
                      <input type="time" className={styles.time} value={d.start} onChange={(e) => edit(day, { start: e.target.value })} disabled={busy} />
                    </label>
                    <span className={styles.muted} aria-hidden="true">to</span>
                    <label>
                      <span className={styles.srOnly}>{NAMES[day]} closes</span>
                      <input type="time" className={styles.time} value={d.end} onChange={(e) => edit(day, { end: e.target.value })} disabled={busy} />
                    </label>
                    {next && <span className={styles.muted}>closes next day</span>}
                  </>
                )}
              </div>
              {d.open ? (
                <label className={`${styles.hoursFull} ${styles.hoursFlag}`}>
                  <input type="checkbox" checked={d.full} onChange={(e) => edit(day, { full: e.target.checked })} disabled={busy} />
                  <span>24 hours</span>
                </label>
              ) : <span className={`${styles.muted} ${styles.hoursFlag}`}>Closed</span>}
            </div>
          );
        })}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.saveBar}>
        <p className={styles.note} role="status" aria-live="polite">{status || (dirty ? "You have unsaved changes." : "")}</p>
        <div className={styles.actions}>
          <Button size="sm" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save opening hours"}</Button>
          {dirty && !busy && <button type="button" className={styles.linkBtn} onClick={discard}>Discard changes</button>}
          {undo && !dirty && !busy && <button type="button" className={styles.linkBtn} onClick={() => persist(undo, null)}>Undo</button>}
        </div>
      </div>
      <Disclosure title="How customers see it">
        <Select value={viewerZone} onChange={setViewer} options={zoneOptions} label="Customer's time zone" />
        <div className={styles.preview}>
          <strong>{shopTimeNote(at, { shopZone: zone, viewerZone })}</strong>
          <HoursTable rows={rows} />
        </div>
      </Disclosure>
    </Section>
  );
}
