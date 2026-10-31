import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WEEK_DAYS, getUserTimeZone, isOvernight, safeShopZone, shopTimeNote, statusOf, validateWeeklyHours } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { now } from "../../lib/clock.js";
import { errorText } from "../../lib/errors.js";
import ui from "../../styles/ui.module.css";
import styles from "./hours.module.css";

const DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const DEFAULT_SLOT = { start: "08:00", end: "18:00" };
// start = end is refused (the app reads it as neither zero hours nor a full day), so a full day is 00:00 to 23:59.
const FULL_DAY = { start: "00:00", end: "23:59" };

const is24h = (r) => r.open && r.start === FULL_DAY.start && r.end === FULL_DAY.end;

/** Stored hours ({ mon: ["08:00", "18:00"] }, missing day = closed) to one editable row per day. A closed day remembers usual times for when it is opened again. */
const toRows = (hours) =>
  Object.fromEntries(WEEK_DAYS.map((day) => {
    const slot = hours?.[day];
    const open = Array.isArray(slot) && slot.length === 2;
    return [day, { open, start: open ? slot[0] : DEFAULT_SLOT.start, end: open ? slot[1] : DEFAULT_SLOT.end }];
  }));

/** Editable rows back to stored hours: open days only. */
const toHours = (rows) => Object.fromEntries(WEEK_DAYS.filter((d) => rows[d].open).map((d) => [d, [rows[d].start, rows[d].end]]));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function Hours() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  // Only for the preview: the shop's time zone and upcoming exceptions. Without them the preview uses Nairobi and no exceptions.
  const shop = useQuery({ queryKey: ["shop-preview"], queryFn: api.getShopPreview, retry: false });
  const [rows, setRows] = useState(null);
  const [saved, setSaved] = useState({});
  const [problems, setProblems] = useState([]); // [{ day?, text }]
  const [badDays, setBadDays] = useState([]);
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // The first answer fills the form once. Later refreshes never overwrite what the seller is typing; a save refills it from what was stored.
  useEffect(() => {
    if (rows === null && me.data) {
      const hours = me.data.business?.hours ?? {};
      setRows(toRows(hours));
      setSaved(hours);
    }
  }, [me.data, rows]);

  const locked = me.data?.business?.status === "suspended";
  const shopZone = safeShopZone(shop.data?.shop?.timezone);
  const viewerZone = getUserTimeZone();
  const draft = rows ? toHours(rows) : {};
  const dirty = rows !== null && !same(draft, saved);
  const check = useMemo(() => validateWeeklyHours(draft), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(
    () => (check.ok ? statusOf(check.value, shop.data?.shop?.exceptions ?? [], now(), shopZone, viewerZone) : null),
    [check, shop.data, shopZone, viewerZone],
  );

  const change = (day, patch) => {
    setDone("");
    setRows((r) => ({ ...r, [day]: { ...r[day], ...patch } }));
  };
  const toggle24 = (day) => change(day, is24h(rows[day]) ? { open: true, ...DEFAULT_SLOT } : { open: true, ...FULL_DAY });
  const copyToWeekdays = (day) => {
    setDone("");
    setRows((r) => ({ ...r, ...Object.fromEntries(WEEKDAYS.map((d) => [d, { ...r[day] }])) }));
    setNotice(`Copied ${DAY_NAMES[day]} to Monday to Friday. Press Save hours to keep it.`);
  };

  const save = async (e) => {
    e.preventDefault();
    setDone("");
    setNotice("");
    if (!check.ok) {
      setProblems(check.errors.map((x) => ({ day: x.day, text: `${x.day ? `${DAY_NAMES[x.day] ?? x.day}: ` : ""}${errorText({ code: x.error })}` })));
      setBadDays(check.errors.map((x) => x.day).filter(Boolean));
      return;
    }
    setProblems([]);
    setBadDays([]);
    setBusy(true);
    try {
      const stored = await api.setHours(check.value);
      await Promise.all([qc.invalidateQueries({ queryKey: ["subscription"] }), qc.invalidateQueries({ queryKey: ["shop-preview"] })]);
      setSaved(stored ?? check.value);
      setRows(toRows(stored ?? check.value));
      setDone("Your opening hours are saved. Customers see them on your shop page.");
    } catch (err) {
      setProblems([{ text: errorText(err) }]);
    } finally {
      setBusy(false);
    }
  };

  const empty = rows !== null && Object.keys(saved).length === 0;

  return (
    <div className={ui.page}>
      <div className={styles.head}>
        <div className={ui.pageHead}>
          <h1>Opening hours</h1>
        </div>
        <p className={ui.muted}>
          Your usual week. Customers see these on your shop page. For a holiday or an early close, <Link className={ui.link} to="/business/exceptions">add an exception</Link> instead.
        </p>
      </div>

      {locked && (
        <div className={`${ui.banner} ${ui.tone_danger}`} role="status" data-testid="hours-locked">
          <h2>Your account is suspended</h2>
          <p>You cannot change your opening hours until EpicMKT lifts the suspension.</p>
        </div>
      )}

      {me.isLoading || (me.data && rows === null) ? (
        <p role="status">Loading</p>
      ) : me.error ? (
        <p className={ui.error} role="alert">We could not load your opening hours. Check your connection and refresh.</p>
      ) : (
        <form onSubmit={save} noValidate aria-label="Opening hours">
          <fieldset className={styles.form} disabled={locked || busy}>
            {empty && (
              <div className={styles.empty} data-testid="empty">
                <p><strong>You have not set your opening hours yet.</strong> Customers see &ldquo;Opening hours not set&rdquo; until you do. Switch on the days you open and choose your times.</p>
              </div>
            )}

            <p className={styles.hint} data-testid="shop-time-hint">{shopTimeNote(now(), { shopZone, viewerZone })} Type the times as they are on the shop&apos;s clock.</p>

            <div className={styles.week}>
              {WEEK_DAYS.map((day) => {
                const r = rows[day];
                const bad = badDays.includes(day) || undefined;
                const nameId = `hours-${day}-name`;
                const openId = `hours-${day}-open`;
                return (
                  <div key={day} role="group" aria-labelledby={nameId} className={styles.day} data-open={r.open || undefined} data-testid={`day-${day}`}>
                    <div className={styles.dayHead}>
                      <h2 id={nameId} className={styles.dayName}>{DAY_NAMES[day]}</h2>
                      <label className={styles.switch}>
                        <input type="checkbox" role="switch" checked={r.open} aria-labelledby={`${nameId} ${openId}`} onChange={(e) => change(day, { open: e.target.checked })} />
                        <span id={openId}>Open</span>
                      </label>
                    </div>
                    <div className={styles.dayBody}>
                      {r.open ? (
                        <>
                          <div className={styles.times}>
                            <div className={ui.field}>
                              <label className={ui.label} htmlFor={`hours-${day}-start`}>Opens</label>
                              <input id={`hours-${day}-start`} type="time" className={ui.input} value={r.start} aria-invalid={bad} onChange={(e) => change(day, { start: e.target.value })} />
                            </div>
                            <div className={ui.field}>
                              <label className={ui.label} htmlFor={`hours-${day}-end`}>Closes</label>
                              <input id={`hours-${day}-end`} type="time" className={ui.input} value={r.end} aria-invalid={bad} onChange={(e) => change(day, { end: e.target.value })} />
                            </div>
                          </div>
                          {r.start && r.end && r.start !== r.end && isOvernight([r.start, r.end]) && (
                            <p className={styles.note} data-testid={`overnight-${day}`}>Closes at {r.end} the next day.</p>
                          )}
                        </>
                      ) : (
                        <p className={styles.closed}>Closed</p>
                      )}
                      <div className={styles.actions}>
                        <button type="button" className={styles.chip} aria-pressed={is24h(r)} aria-label={`${DAY_NAMES[day]}: open 24 hours`} onClick={() => toggle24(day)}>Open 24 hours</button>
                        <button type="button" className={styles.chip} aria-label={`Copy ${DAY_NAMES[day]} to all weekdays`} onClick={() => copyToWeekdays(day)}>Copy to all weekdays</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <section className={styles.preview} aria-label="What customers will see" data-open={preview ? String(preview.isOpen) : undefined} data-testid="hours-preview">
              <p className={styles.previewLabel}>What customers will see right now</p>
              {preview ? (
                <>
                  <p className={styles.previewHead}>{preview.headline}</p>
                  <p data-testid="hours-preview-line">{preview.isOpen ? preview.closes : preview.line}</p>
                </>
              ) : (
                <p>Fix the times marked above to see this.</p>
              )}
            </section>

            {problems.length > 0 && (
              <div className={`${ui.banner} ${ui.tone_danger}`} role="alert" data-testid="hours-error">
                <h2>Your opening hours were not saved</h2>
                {problems.length === 1 ? (
                  <p>{problems[0].text}</p>
                ) : (
                  <ul className={styles.problems}>{problems.map((p, i) => <li key={i}>{p.text}</li>)}</ul>
                )}
              </div>
            )}
            {done && !dirty && (
              <div className={`${ui.banner} ${ui.tone_ok}`} role="status" data-testid="hours-saved"><p>{done}</p></div>
            )}
            <p className={styles.hint} role="status" data-testid="hours-notice">{notice}</p>

            <div className={styles.formActions}>
              <button type="submit" className={ui.btn} disabled={busy || locked}>{busy ? "Saving" : "Save hours"}</button>
              {dirty && !busy && <span className={styles.hint} data-testid="hours-dirty">You have unsaved changes.</span>}
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
