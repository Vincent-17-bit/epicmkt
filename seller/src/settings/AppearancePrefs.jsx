import { useSettings } from "../state/settings.js";
import { Row, Section, Segmented } from "./controls.jsx";

export default function AppearancePrefs() {
  const a = useSettings((s) => s.settings.appearance);
  const update = useSettings((s) => s.update);
  const set = (patch) => update({ appearance: patch });
  return (
    <Section id="appearance" title="Appearance" intro="These apply right away and follow you to your other devices.">
      <Row label="Theme">
        <Segmented label="Theme" value={a.theme} onChange={(v) => set({ theme: v })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} />
      </Row>
      <Row label="Text size">
        <Segmented label="Text size" value={a.text_size} onChange={(v) => set({ text_size: v })} options={[{ value: "normal", label: "Normal" }, { value: "large", label: "Large" }, { value: "xlarge", label: "Extra large" }]} />
      </Row>
    </Section>
  );
}
