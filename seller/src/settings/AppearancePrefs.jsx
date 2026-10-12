import { useSettings } from "../state/settings.js";
import { Row, Section, Segmented, Switch } from "./controls.jsx";

export default function AppearancePrefs() {
  const a = useSettings((s) => s.settings.appearance);
  const update = useSettings((s) => s.update);
  const set = (patch) => update({ appearance: patch });
  return (
    <Section id="appearance" title="Appearance" intro="These apply right away across the whole portal, and follow you to your other devices.">
      <Row label="Theme">
        <Segmented label="Theme" value={a.theme} onChange={(v) => set({ theme: v })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} />
      </Row>
      <Row label="Text size">
        <Segmented label="Text size" value={a.text_size} onChange={(v) => set({ text_size: v })} options={[{ value: "normal", label: "Normal" }, { value: "large", label: "Large" }, { value: "xlarge", label: "Extra large" }]} />
      </Row>
      <Row label="Density" hint="Compact fits more on screen.">
        <Segmented label="Density" value={a.density} onChange={(v) => set({ density: v })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
      </Row>
      <Row label="Reduce motion" hint="Turns off animations and transitions.">
        <Switch checked={a.reduce_motion} label="Reduce motion" onChange={(v) => set({ reduce_motion: v })} />
      </Row>
      <Row label="Remember my catalog view" hint="Keeps your last card layout in My listings.">
        <Switch checked={a.remember_card_view} label="Remember my catalog view" onChange={(v) => set({ remember_card_view: v })} />
      </Row>
    </Section>
  );
}
