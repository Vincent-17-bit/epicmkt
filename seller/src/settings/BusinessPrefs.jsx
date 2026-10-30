import { PARTIAL_MESSAGE_MAX } from "@epicmkt/shared";
import { useBusinessFacts } from "../lib/useBusinessFacts.js";
import { useSettings } from "../state/settings.js";
import { PLAIN_MESSAGES } from "../lib/settingsSchema.js";
import { plainTextProblem } from "@epicmkt/shared";
import { Badge, CommitField, Row, Section, Select, Switch } from "./controls.jsx";

const partialProblem = (v) => {
  const p = plainTextProblem(v, PARTIAL_MESSAGE_MAX);
  return p ? PLAIN_MESSAGES[p] : null;
};

export default function BusinessPrefs() {
  const facts = useBusinessFacts().data;
  const b = useSettings((s) => s.settings.business);
  const update = useSettings((s) => s.update);
  const premium = facts?.plan_key === "premium";
  const set = (patch) => update({ business: patch });
  const ann = b.announcement;
  const setAnn = (patch) => update({ business: { announcement: patch } });

  return (
    <Section id="business" title="Business preferences">
      <Row label="Show “Closes in N min”" hint="Shows the countdown text on your public listing shortly before you close.">
        <Switch checked={b.show_closes_chip} label="Show Closes in N min" onChange={(v) => set({ show_closes_chip: v })} />
      </Row>
      <Row label="Partial closure message" hint="Shown when only some services are unavailable." stack>
        <CommitField label="Partial closure message" value={b.partial_closure_message} maxLength={PARTIAL_MESSAGE_MAX} counter validate={partialProblem} liveError onCommit={(v) => set({ partial_closure_message: v.trim() })} />
      </Row>
      <Row label={<>Announcement banner defaults <Badge>Premium</Badge></>} hint={premium ? "Start values for new announcement banners." : "Announcement banners are part of the Premium plan."} stack>
        <Switch checked={premium && ann.enabled} disabled={!premium} label="Turn on announcement banners by default" onChange={(v) => setAnn({ enabled: v })} />
        {premium && (
          <>
            <CommitField label="Default announcement text" value={ann.text} maxLength={280} counter validate={(v) => (v.length > 280 ? "Keep it under 280 characters." : null)} liveError onCommit={(v) => setAnn({ text: v })} />
            <Select label="Show for" value={String(ann.days)} onChange={(v) => setAnn({ days: Number(v) })} options={[1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d === 1 ? "1 day" : `${d} days` }))} />
          </>
        )}
      </Row>
    </Section>
  );
}
