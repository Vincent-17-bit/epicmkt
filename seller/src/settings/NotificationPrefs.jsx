import { NOTIFICATION_EVENTS, isClock } from "@epicmkt/shared";
import { useSettings } from "../state/settings.js";
import Tip from "../onboarding/Tip.jsx";
import { Row, Section, Switch } from "./controls.jsx";
import styles from "./settings.module.css";

const CHANNELS = [
  { key: "in_app", label: "In-app" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" }
];

export default function NotificationPrefs() {
  const prefs = useSettings((s) => s.settings.notifications);
  const update = useSettings((s) => s.update);
  const quiet = prefs.quiet_hours;

  const setChannel = (event, channel, value) => update({ notifications: { events: { [event]: { [channel]: value } } } });
  const setQuiet = (patch) => update({ notifications: { quiet_hours: patch } });
  const setTime = (key, value) => {
    if (!isClock(value)) return;
    const other = key === "start" ? quiet.end : quiet.start;
    if (value === other) return;
    setQuiet({ [key]: value });
  };

  return (
    <Section id="notifications" title="Notifications" intro="Choose how you hear about each event. Critical events always reach you in the app.">
      <Tip id="settings-quiet-hours">Quiet hours hold back non-critical text messages overnight. Expiry, payment and admin messages always come straight through.</Tip>
      <div className={styles.matrix} role="group" aria-label="Notification channels per event">
        <div className={styles.matrixHead} aria-hidden="true">
          <span>Event</span>
          {CHANNELS.map((c) => <span key={c.key}>{c.label}</span>)}
        </div>
        {NOTIFICATION_EVENTS.map((e) => {
          const v = prefs.events[e.key];
          return (
            <div key={e.key} className={styles.matrixRow} role="group" aria-label={e.label}>
              <p className={styles.eventName}>
                {e.label}
                <small>{e.hint}{e.critical ? " Critical." : ""}</small>
              </p>
              {CHANNELS.map((c) => {
                const locked = c.key === "in_app" && e.critical;
                return (
                  <span key={c.key} className={styles.cell}>
                    <span className={styles.cellLabel} aria-hidden="true">{c.label}</span>
                    <Switch checked={v[c.key]} disabled={locked} label={`${e.label}: ${c.label}`} onChange={(next) => setChannel(e.key, c.key, next)} />
                    {locked && <span className={styles.cellNote}>Required</span>}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      <Row label="Quiet hours" hint="Holds back non-critical SMS overnight and sends it when quiet hours end. Critical and transactional messages are always sent straight away. Times are Nairobi time.">
        <Switch checked={quiet.enabled} label="Quiet hours" onChange={(next) => setQuiet({ enabled: next })} />
      </Row>
      {quiet.enabled && (
        <div className={styles.timeRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="quiet-start">From</label>
            <input id="quiet-start" className={styles.time} type="time" step="900" value={quiet.start} onChange={(e) => setTime("start", e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="quiet-end">Until</label>
            <input id="quiet-end" className={styles.time} type="time" step="900" value={quiet.end} onChange={(e) => setTime("end", e.target.value)} />
          </div>
        </div>
      )}
    </Section>
  );
}
