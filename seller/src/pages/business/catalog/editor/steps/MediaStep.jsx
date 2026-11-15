import MediaSlot from "../MediaSlot.jsx";
import { SectionCard } from "../parts.jsx";
import Media3dSection from "./Media3dSection.jsx";

export default function MediaStep({ media, busy, itemId = null, form }) {
  return (
    <SectionCard id="media" title="Media" why="Items with clear photos get far more taps and messages.">
      <div data-area="media"><MediaSlot media={media} disabled={busy} /></div>
      <div data-area="media3d"><Media3dSection itemId={itemId} options={form?.options} /></div>
    </SectionCard>
  );
}
