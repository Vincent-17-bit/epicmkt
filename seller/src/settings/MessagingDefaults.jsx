import { useState } from "react";
import { GREETING_MAX, renderGreeting } from "@epicmkt/shared";
import { useSettings } from "../state/settings.js";
import { greetingSchema, validateField } from "../lib/settingsSchema.js";
import { CommitField, Row, Section } from "./controls.jsx";
import styles from "./settings.module.css";

const SAMPLE = { item: "Fade and beard", price: "KES 300" };

export default function MessagingDefaults() {
  const m = useSettings((s) => s.settings.messaging);
  const update = useSettings((s) => s.update);
  const [draft, setDraft] = useState(m.whatsapp_greeting);

  return (
    <Section id="messaging" title="Messaging" intro="The first line customers send you on WhatsApp.">
      <Row label="WhatsApp greeting" hint="Use {item} and {price}. No links or phone numbers." stack>
        <CommitField label="Greeting" multiline rows={3} maxLength={GREETING_MAX} counter value={m.whatsapp_greeting} validate={(v) => validateField(greetingSchema, v)} liveError onDraft={setDraft} onCommit={(v) => update({ messaging: { whatsapp_greeting: v.trim() } })} />
        <p className={styles.preview} aria-live="polite" data-testid="greeting-preview">
          <strong>Preview</strong>
          {renderGreeting(draft, SAMPLE)}
        </p>
      </Row>
    </Section>
  );
}
