import { NOTIFICATION_EVENTS } from "@epicmkt/shared";
import { useSettings } from "../state/settings.js";
import { Section, Switch } from "./controls.jsx";
import styles from "./settings.module.css";

const CHANNELS = [
  { key: "in_app", label: "In-app" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" }
];

export default function NotificationPrefs() {
  const prefs = useSettings((s) => s.settings.notifications);
  const update = useSettings((s) => s.update);

  const setChannel = (event, channel, value) => update({ notifications: { events: { [event]: { [channel]: value } } } });

  return (
    <Section id="notifications" title="Notifications" intro="Choose how you hear about each event. Critical events always reach you in the app.">
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
    </Section>
  );
}
